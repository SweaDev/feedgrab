import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { renderPanel } from '../../../src/overlay/panel';
import { type Action, initState, reduce } from '../../../src/overlay/state';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

async function setup() {
  const doc = loadFixture('social-feed');
  const proposals = await detectFeeds(doc);
  let state = initState(proposals, { url: doc.URL });
  const actions: Action[] = [];
  const root = doc.createElement('div');
  const picks: string[] = [];
  const deps = {
    doc,
    onPick: (k: string) => picks.push(k),
    onSave: () => picks.push('save'),
    onCancel: () => picks.push('cancel'),
  };
  const dispatch = (a: Action) => {
    actions.push(a);
    state = reduce(state, a);
    renderPanel(root, state, dispatch, deps);
  };
  renderPanel(root, state, dispatch, deps);
  const q = (action: string) => root.querySelector(`[data-fd-action="${action}"]`) as HTMLElement;
  return {
    doc,
    root,
    actions,
    picks,
    q,
    get state() {
      return state;
    },
  };
}

test('controls exist', async () => {
  const { q } = await setup();
  for (const a of [
    'toggle-accept',
    'select',
    'container-input',
    'container-type',
    'item-input',
    'item-type',
    'pick-container',
    'pick-item',
    'inspect',
    'exclude-input',
    'exclude-scope',
    'add-exclude',
    'llm-input',
    'add-llm',
    'include-input',
    'add-include',
    'path-pattern',
    'save',
    'cancel',
  ]) {
    expect(q(a)).not.toBeNull();
  }
  expect(
    q('container-input').getAttribute('value') ?? (q('container-input') as HTMLInputElement).value,
  ).toBe('.timeline');
});

test('typing a selector updates the count after the debounce', async () => {
  const { root, q, doc } = await setup();
  const before = domSnapshot(doc);
  const count = root.querySelector('[data-fd-count="container"]')!;
  expect(count.textContent).toBe('1 match');
  const input = q('container-input') as HTMLInputElement;
  input.value = 'article.post';
  input.dispatchEvent(new doc.defaultView!.Event('input'));
  expect(count.textContent).toBe('1 match');
  await new Promise((r) => setTimeout(r, 170));
  expect(count.textContent).toBe('12 matches');
  input.value = 'div[[';
  input.dispatchEvent(new doc.defaultView!.Event('input'));
  await new Promise((r) => setTimeout(r, 170));
  expect(count.className).toContain('fd-error');
  expect(domSnapshot(doc)).toBe(before);
});

test('toggling accept, adding rules, save and pick buttons dispatch', async () => {
  const s = await setup();
  s.q('toggle-accept').dispatchEvent(new s.doc.defaultView!.Event('change'));
  expect(s.actions[0]).toMatchObject({ type: 'toggleAccept' });
  expect(s.state.proposals[0]!.accepted).toBe(true);
  (s.q('exclude-input') as HTMLInputElement).value = '.post.promoted';
  s.q('add-exclude').click();
  expect(s.state.proposals[0]!.exclude[0]).toMatchObject({
    selector: { value: '.post.promoted' },
    scope: 'item',
  });
  expect(s.root.querySelectorAll('[data-fd-action="remove-rule"]').length).toBe(1);
  s.q('pick-item').click();
  s.q('save').click();
  expect(s.picks).toEqual(['item', 'save']);
});
