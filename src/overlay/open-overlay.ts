import { inspectFromElement } from '../detect/inspect';
import { hasLayout } from '../env/dom';
import { timers } from '../env/timers';
import { FeedgrabError } from '../errors';
import { openFeed } from '../feed/unified-feed';
import { resolveContainers, resolveItems } from '../selector/evaluate';
import { cssEscape } from '../selector/generate';
import { stableClasses } from '../signature/classes';
import type { FeedDescriptor, LlmBackend, SiteProfile, UnifiedFeed } from '../types';
import { type FrameOptions, framePanel } from './frame';
import { createHighlighter, type HighlightEntry } from './highlighter';
import { mountHost } from './host';
import { type PickRequest, renderPanel } from './panel';
import { pickElement } from './picker';
import { scrollToTop } from './scroll';
import { type Action, initState, type OverlayState, reduce, toProfile } from './state';
import type { OverlayTheme } from './theme';

/** Options for `openOverlay`. */
export type OverlayOptions = {
  url?: string;
  existing?: SiteProfile;
  theme?: OverlayTheme;
  customCss?: string;
  llm?: LlmBackend;
  builtinExclusions?: boolean;
  signal?: AbortSignal;
  /** Panel header text (default "Feeds"). */
  title?: FrameOptions['title'];
  /** Where the panel starts, e.g. where `onMove` last reported it. */
  position?: FrameOptions['position'];
  /** Called after the user drags the panel (or moves it with the arrow keys). */
  onMove?: FrameOptions['onMove'];
};

const PREVIEW_DEBOUNCE_MS = 200;
/** How long the first item of a feed stays outlined after "Feed N" scrolls to it. */
const FLASH_MS = 1500;

function relativeSelector(el: Element): string {
  return [el.tagName.toLowerCase(), ...stableClasses(el).map((c) => `.${cssEscape(c)}`)].join('');
}

/**
 * Shows the confirm/edit overlay (rendered pages only) and resolves with the confirmed
 * `SiteProfile`. Rejects with `OVERLAY_CANCELLED` (Cancel, Escape, `signal`) or
 * `OVERLAY_NO_LAYOUT`. Never changes feed nodes; always cleans up.
 * @example const profile = await openOverlay(document, await detectFeeds(document));
 */
export async function openOverlay(
  doc: Document,
  proposals: FeedDescriptor[],
  opts: OverlayOptions = {},
): Promise<SiteProfile> {
  if (!hasLayout(doc)) {
    throw new FeedgrabError('OVERLAY_NO_LAYOUT', 'The overlay needs a rendered page');
  }
  const url = opts.url ?? doc.URL;
  const mounted = mountHost(doc, { theme: opts.theme, customCss: opts.customCss });
  const highlighter = createHighlighter(doc, mounted.layer);
  const frame = framePanel(mounted.panel, {
    ...(opts.title !== undefined && { title: opts.title }),
    ...(opts.position && { position: opts.position }),
    ...(opts.onMove && { onMove: opts.onMove }),
  });
  let flash: Element | null = null;
  let flashTimer: unknown = null;
  let state: OverlayState = initState(proposals, { url, existing: opts.existing });
  let preview: UnifiedFeed | null = null;
  let previewTimer: unknown = null;
  let pickAbort: AbortController | null = null;

  return new Promise<SiteProfile>((resolve, reject) => {
    let settled = false;

    const highlight = () => {
      const entries: HighlightEntry[] = [];
      for (const [i, p] of state.proposals.entries()) {
        try {
          for (const c of resolveContainers(doc, p)) {
            entries.push({ el: c, kind: 'feed', label: `Feed ${i + 1}${p.accepted ? ' ✓' : ''}` });
          }
        } catch {}
      }
      for (const item of preview?.items() ?? []) {
        entries.push({ el: item.element, kind: item.status === 'kept' ? 'item' : item.status });
        for (const part of item.parts) entries.push({ el: part.element, kind: 'part' });
      }
      if (flash?.isConnected) entries.push({ el: flash, kind: 'hover' });
      highlighter.set(entries);
    };

    const refreshPreview = () => {
      previewTimer = null;
      preview?.dispose();
      preview = null;
      const selected = state.proposals.find((p) => p.id === state.selectedId);
      if (selected && !settled) {
        const { accepted: _, ...descriptor } = selected;
        const profile: SiteProfile = {
          version: 1,
          hostname: '',
          pathPattern: '/**',
          feeds: [descriptor],
        };
        try {
          const feed = openFeed(doc, profile, {
            live: true,
            ...(opts.llm ? { llm: opts.llm } : {}),
            ...(opts.builtinExclusions !== undefined
              ? { builtinExclusions: opts.builtinExclusions }
              : {}),
          });
          feed.on('item:added', highlight);
          feed.on('item:updated', highlight);
          feed.on('item:removed', highlight);
          preview = feed;
        } catch {}
      }
      highlight();
    };

    const schedulePreview = () => {
      if (previewTimer !== null) timers.clearTimeout(previewTimer);
      previewTimer = timers.setTimeout(refreshPreview, PREVIEW_DEBOUNCE_MS);
    };

    const render = () =>
      renderPanel(frame.body, state, dispatch, { doc, onPick, onSave, onCancel, onShow });

    /** Scrolls a feed's first item (else its container) to the top and outlines it briefly. */
    function onShow(id: string) {
      const p = state.proposals.find((x) => x.id === id);
      if (!p || settled) return;
      try {
        const [container] = resolveContainers(doc, p);
        if (!container) return;
        const first = resolveItems(container, p)[0] ?? container;
        scrollToTop(first, mounted.host);
        flash = first;
        if (flashTimer !== null) timers.clearTimeout(flashTimer);
        flashTimer = timers.setTimeout(() => {
          flashTimer = null;
          flash = null;
          if (!settled) highlight();
        }, FLASH_MS);
        highlight();
      } catch {
        // invalid selector: nothing to show
      }
    }

    function dispatch(action: Action) {
      if (settled) return;
      state = reduce(state, action);
      render();
      if (action.type !== 'setMode') schedulePreview();
    }

    async function onPick(kind: PickRequest) {
      pickAbort?.abort();
      const ac = new globalThis.AbortController();
      pickAbort = ac;
      const selected = state.proposals.find((p) => p.id === state.selectedId);
      dispatch({ type: 'setMode', mode: kind === 'inspect' ? 'pick-item' : `pick-${kind}` });
      try {
        const el = await pickElement(doc, {
          signal: ac.signal,
          onHover: (h) => {
            highlight();
            if (h) highlighter.set([{ el: h, kind: 'hover' }]);
          },
        });
        if (kind === 'inspect' || !selected) {
          dispatch({ type: 'addFeedFromDescriptor', descriptor: inspectFromElement(el) });
        } else if (kind === 'container' || kind === 'item') {
          const d = inspectFromElement(kind === 'container' ? (el.firstElementChild ?? el) : el);
          dispatch({ type: 'setContainer', id: selected.id, selector: d.container });
          dispatch({ type: 'setItem', id: selected.id, selector: d.item });
        } else {
          const list = kind === 'exclude' ? 'exclude' : 'include';
          const rule = {
            kind: 'selector',
            selector: { type: 'css', value: relativeSelector(el) },
            scope: 'item',
          } as const;
          dispatch({ type: 'addRule', id: selected.id, list, rule });
        }
      } catch {
        // cancelled or no repeating ancestor: keep the state
      } finally {
        if (pickAbort === ac) pickAbort = null;
        dispatch({ type: 'setMode', mode: 'idle' });
      }
    }

    const cleanup = () => {
      settled = true;
      pickAbort?.abort();
      if (previewTimer !== null) timers.clearTimeout(previewTimer);
      if (flashTimer !== null) timers.clearTimeout(flashTimer);
      frame.destroy();
      preview?.dispose();
      preview = null;
      highlighter.destroy();
      mounted.root.removeEventListener('keydown', onKey, true);
      opts.signal?.removeEventListener('abort', onCancel);
      mounted.unmount();
    };

    function onSave() {
      if (settled) return;
      const profile = toProfile(state, url);
      cleanup();
      resolve(profile);
    }

    function onCancel() {
      if (settled) return;
      cleanup();
      reject(new FeedgrabError('OVERLAY_CANCELLED', 'The overlay was cancelled'));
    }

    function onKey(e: Event) {
      if ((e as KeyboardEvent).key === 'Escape' && !pickAbort) onCancel();
    }

    if (opts.signal?.aborted) {
      onCancel();
      return;
    }
    opts.signal?.addEventListener('abort', onCancel);
    mounted.root.addEventListener('keydown', onKey, true);
    render();
    refreshPreview();
  });
}
