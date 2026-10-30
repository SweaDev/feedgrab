import { timers } from '../env/timers';
import { validateSelector } from '../selector/match';
import type { Rule, Selector } from '../types';
import { h } from './h';
import type { Action, DraftFeed, OverlayState, RuleList } from './state';

/** What the pick buttons ask for. */
export type PickRequest = 'container' | 'item' | 'inspect' | 'exclude' | 'include';

/** Callbacks used by the panel. */
export type PanelDeps = {
  doc: Document;
  onPick(kind: PickRequest): void;
  onSave(): void;
  onCancel(): void;
};

const COUNT_DEBOUNCE_MS = 150;

function selectorEditor(
  doc: Document,
  role: 'container' | 'item',
  feed: DraftFeed,
  dispatch: (a: Action) => void,
): HTMLElement {
  const current = feed[role];
  const count = h(doc, 'span', { class: 'fd-count', 'data-fd-count': role });
  const showCount = (sel: Selector) => {
    const r = validateSelector(doc, sel);
    count.textContent = r.valid
      ? `${r.count} match${r.count === 1 ? '' : 'es'}`
      : (r.error ?? 'invalid');
    count.className = r.valid ? 'fd-count' : 'fd-count fd-error';
  };
  if (role === 'container') showCount(current);
  const type = h(
    doc,
    'select',
    { 'data-fd-action': `${role}-type` },
    h(doc, 'option', { value: 'css', selected: current.type === 'css' }, 'CSS'),
    h(doc, 'option', { value: 'xpath', selected: current.type === 'xpath' }, 'XPath'),
  );
  let timer: unknown = null;
  const input = h(doc, 'input', {
    type: 'text',
    value: current.value,
    'data-fd-action': `${role}-input`,
    'aria-label': `${role} selector`,
  });
  const read = (): Selector => ({
    type: type.value as Selector['type'],
    value: input.value.trim(),
  });
  input.addEventListener('input', () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = null;
      if (role === 'container') showCount(read());
      else count.textContent = '';
    }, COUNT_DEBOUNCE_MS);
  });
  const commit = () => {
    const sel = read();
    if (!sel.value) return;
    dispatch({
      type: role === 'container' ? 'setContainer' : 'setItem',
      id: feed.id,
      selector: sel,
    });
  };
  input.addEventListener('change', commit);
  type.addEventListener('change', commit);
  return h(
    doc,
    'div',
    null,
    h(doc, 'h3', null, role === 'container' ? 'Container' : 'Item'),
    h(doc, 'div', { class: 'fd-row' }, type, count),
    input,
  );
}

function ruleLabel(r: Rule): string {
  return r.kind === 'llm-text' ? `LLM: ${r.criteria}` : `${r.scope}: ${r.selector.value}`;
}

function rulesEditor(
  doc: Document,
  feed: DraftFeed,
  dispatch: (a: Action) => void,
  deps: PanelDeps,
): HTMLElement {
  const list = (name: RuleList) =>
    h(
      doc,
      'ul',
      { class: 'fd-rules', 'data-fd-list': name },
      feed[name].map((r) =>
        h(
          doc,
          'li',
          null,
          h(doc, 'span', null, `${name === 'include' ? 'include ' : ''}${ruleLabel(r)}`),
          h(
            doc,
            'button',
            {
              type: 'button',
              'data-fd-action': 'remove-rule',
              'data-fd-list': name,
              'data-fd-rule-id': r.id ?? '',
              onclick: () =>
                r.id && dispatch({ type: 'removeRule', id: feed.id, list: name, ruleId: r.id }),
            },
            '×',
          ),
        ),
      ),
    );
  const exInput = h(doc, 'input', {
    type: 'text',
    placeholder: '.promoted',
    'data-fd-action': 'exclude-input',
  });
  const exScope = h(
    doc,
    'select',
    { 'data-fd-action': 'exclude-scope' },
    h(doc, 'option', { value: 'item' }, 'item'),
    h(doc, 'option', { value: 'part' }, 'part'),
  );
  const llmInput = h(doc, 'input', {
    type: 'text',
    placeholder: 'sponsored posts',
    'data-fd-action': 'llm-input',
  });
  const incInput = h(doc, 'input', {
    type: 'text',
    placeholder: '.friend',
    'data-fd-action': 'include-input',
  });
  const add = (list: RuleList, rule: Rule) =>
    dispatch({ type: 'addRule', id: feed.id, list, rule });
  const css = (value: string): Selector => ({ type: 'css', value });
  return h(
    doc,
    'div',
    null,
    h(doc, 'h3', null, 'Rules'),
    list('exclude'),
    list('include'),
    h(doc, 'div', { class: 'fd-row' }, exInput, exScope),
    h(
      doc,
      'div',
      { class: 'fd-row' },
      h(
        doc,
        'button',
        {
          type: 'button',
          'data-fd-action': 'add-exclude',
          onclick: () =>
            exInput.value.trim() &&
            add('exclude', {
              kind: 'selector',
              selector: css(exInput.value.trim()),
              scope: exScope.value as 'item' | 'part',
            }),
        },
        'Add exclude',
      ),
      h(
        doc,
        'button',
        { type: 'button', 'data-fd-action': 'pick-exclude', onclick: () => deps.onPick('exclude') },
        'Pick',
      ),
    ),
    llmInput,
    h(
      doc,
      'button',
      {
        type: 'button',
        'data-fd-action': 'add-llm',
        onclick: () =>
          llmInput.value.trim() &&
          add('exclude', { kind: 'llm-text', criteria: llmInput.value.trim() }),
      },
      'Add LLM criteria',
    ),
    incInput,
    h(
      doc,
      'div',
      { class: 'fd-row' },
      h(
        doc,
        'button',
        {
          type: 'button',
          'data-fd-action': 'add-include',
          onclick: () =>
            incInput.value.trim() &&
            add('include', {
              kind: 'selector',
              selector: css(incInput.value.trim()),
              scope: 'item',
            }),
        },
        'Add include',
      ),
      h(
        doc,
        'button',
        { type: 'button', 'data-fd-action': 'pick-include', onclick: () => deps.onPick('include') },
        'Pick',
      ),
    ),
  );
}

/** Renders the whole panel from the state (full re-render on each change). */
export function renderPanel(
  root: HTMLElement,
  state: OverlayState,
  dispatch: (a: Action) => void,
  deps: PanelDeps,
): void {
  const { doc } = deps;
  const selected = state.proposals.find((p) => p.id === state.selectedId);
  const feeds = h(
    doc,
    'ul',
    { class: 'fd-feeds' },
    state.proposals.map((p, i) =>
      h(
        doc,
        'li',
        {
          class: `fd-row fd-feed-row${p.id === state.selectedId ? ' fd-selected' : ''}`,
          'data-fd-id': p.id,
        },
        h(doc, 'input', {
          type: 'checkbox',
          checked: p.accepted,
          'data-fd-action': 'toggle-accept',
          'data-fd-id': p.id,
          'aria-label': `accept feed ${i + 1}`,
          onchange: () => dispatch({ type: 'toggleAccept', id: p.id }),
        }),
        h(
          doc,
          'button',
          {
            type: 'button',
            'data-fd-action': 'select',
            'data-fd-id': p.id,
            onclick: () => dispatch({ type: 'select', id: p.id }),
          },
          `Feed ${i + 1}`,
        ),
        h(doc, 'span', { class: 'fd-count' }, `${p.source} · ${Math.round(p.confidence * 100)}%`),
        h(
          doc,
          'button',
          {
            type: 'button',
            'data-fd-action': 'remove-feed',
            'data-fd-id': p.id,
            onclick: () => dispatch({ type: 'removeFeed', id: p.id }),
          },
          '×',
        ),
      ),
    ),
  );
  const path = h(doc, 'input', {
    type: 'text',
    value: state.pathPattern,
    'data-fd-action': 'path-pattern',
    'aria-label': 'path pattern',
    onchange: (e: Event) =>
      dispatch({
        type: 'setPathPattern',
        pathPattern: (e.target as HTMLInputElement).value.trim() || '/**',
      }),
  });
  const children: (Node | null)[] = [
    h(doc, 'h2', null, 'Feed Detector'),
    feeds,
    h(
      doc,
      'div',
      { class: 'fd-row' },
      h(
        doc,
        'button',
        { type: 'button', 'data-fd-action': 'inspect', onclick: () => deps.onPick('inspect') },
        'Inspect',
      ),
      state.mode !== 'idle'
        ? h(
            doc,
            'span',
            { class: 'fd-count', 'data-fd-mode': state.mode },
            `picking (${state.mode})… Esc to stop`,
          )
        : null,
    ),
    selected
      ? h(
          doc,
          'div',
          { class: 'fd-editor', 'data-fd-editor': selected.id },
          selectorEditor(doc, 'container', selected, dispatch),
          h(
            doc,
            'button',
            {
              type: 'button',
              'data-fd-action': 'pick-container',
              onclick: () => deps.onPick('container'),
            },
            'Pick container',
          ),
          selectorEditor(doc, 'item', selected, dispatch),
          h(
            doc,
            'button',
            { type: 'button', 'data-fd-action': 'pick-item', onclick: () => deps.onPick('item') },
            'Pick item',
          ),
          rulesEditor(doc, selected, dispatch, deps),
        )
      : null,
    h(doc, 'h3', null, 'Path pattern'),
    path,
    h(
      doc,
      'div',
      { class: 'fd-row' },
      h(
        doc,
        'button',
        {
          type: 'button',
          class: 'fd-primary',
          'data-fd-action': 'save',
          onclick: () => deps.onSave(),
        },
        'Save',
      ),
      h(
        doc,
        'button',
        { type: 'button', 'data-fd-action': 'cancel', onclick: () => deps.onCancel() },
        'Cancel',
      ),
    ),
  ];
  root.replaceChildren(...children.filter((c): c is Node => c !== null));
}
