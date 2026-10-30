import { normalizeRule } from '../profile/normalize';
import { createProfile } from '../profile/profile';
import type { FeedDescriptor, Rule, Selector, SiteProfile } from '../types';

/** A proposal being edited in the overlay. */
export type DraftFeed = FeedDescriptor & { accepted: boolean };

export type OverlayMode = 'idle' | 'pick-container' | 'pick-item' | 'pick-exclude' | 'pick-include';

/** Overlay editing state. */
export type OverlayState = {
  proposals: DraftFeed[];
  selectedId?: string;
  pathPattern: string;
  mode: OverlayMode;
};

export type RuleList = 'exclude' | 'include';

/** Reducer actions. */
export type Action =
  | { type: 'select'; id: string | undefined }
  | { type: 'toggleAccept'; id: string }
  | { type: 'setContainer'; id: string; selector: Selector }
  | { type: 'setItem'; id: string; selector: Selector }
  | { type: 'addRule'; id: string; list: RuleList; rule: Rule }
  | { type: 'removeRule'; id: string; list: RuleList; ruleId: string }
  | { type: 'setPathPattern'; pathPattern: string }
  | { type: 'setMode'; mode: OverlayMode }
  | { type: 'addFeedFromDescriptor'; descriptor: FeedDescriptor }
  | { type: 'removeFeed'; id: string };

/** Initial state: the existing profile's feeds pre-accepted, then the new proposals. */
export function initState(
  proposals: FeedDescriptor[],
  opts: { url: string; existing?: SiteProfile },
): OverlayState {
  const drafts: DraftFeed[] = (opts.existing?.feeds ?? []).map((d) => ({ ...d, accepted: true }));
  for (const p of proposals) {
    if (!drafts.some((d) => d.id === p.id)) drafts.push({ ...p, accepted: false });
  }
  const state: OverlayState = {
    proposals: drafts,
    pathPattern: opts.existing?.pathPattern ?? new globalThis.URL(opts.url).pathname,
    mode: 'idle',
  };
  if (drafts[0]) state.selectedId = drafts[0].id;
  return state;
}

function update(state: OverlayState, id: string, fn: (d: DraftFeed) => DraftFeed): OverlayState {
  return { ...state, proposals: state.proposals.map((d) => (d.id === id ? fn(d) : d)) };
}

/** Pure, immutable reducer. */
export function reduce(state: OverlayState, action: Action): OverlayState {
  switch (action.type) {
    case 'select': {
      const { selectedId: _, ...rest } = state;
      return action.id === undefined ? rest : { ...rest, selectedId: action.id };
    }
    case 'toggleAccept':
      return update(state, action.id, (d) => ({ ...d, accepted: !d.accepted }));
    case 'setContainer':
      return update(state, action.id, (d) => ({
        ...d,
        container: action.selector,
        source: 'manual',
      }));
    case 'setItem':
      return update(state, action.id, (d) => ({ ...d, item: action.selector, source: 'manual' }));
    case 'addRule': {
      const rule = normalizeRule(action.rule);
      return update(state, action.id, (d) =>
        d[action.list].some((r) => r.id === rule.id)
          ? d
          : { ...d, [action.list]: [...d[action.list], rule] },
      );
    }
    case 'removeRule':
      return update(state, action.id, (d) => ({
        ...d,
        [action.list]: d[action.list].filter((r) => normalizeRule(r).id !== action.ruleId),
      }));
    case 'setPathPattern':
      return { ...state, pathPattern: action.pathPattern };
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'addFeedFromDescriptor': {
      const draft: DraftFeed = { ...action.descriptor, accepted: true };
      const exists = state.proposals.some((d) => d.id === draft.id);
      return {
        ...state,
        proposals: exists
          ? state.proposals.map((d) => (d.id === draft.id ? draft : d))
          : [...state.proposals, draft],
        selectedId: draft.id,
        mode: 'idle',
      };
    }
    case 'removeFeed': {
      const proposals = state.proposals.filter((d) => d.id !== action.id);
      if (state.selectedId !== action.id) return { ...state, proposals };
      const { selectedId: _, ...rest } = state;
      return proposals[0]
        ? { ...rest, proposals, selectedId: proposals[0].id }
        : { ...rest, proposals };
    }
  }
}

/** The accepted feeds as a confirmed `SiteProfile`. */
export function toProfile(state: OverlayState, url: string): SiteProfile {
  const feeds = state.proposals
    .filter((d) => d.accepted)
    .map(({ accepted: _, ...d }) => ({ ...d, confirmed: true }));
  return createProfile({ url, pathPattern: state.pathPattern, feeds });
}
