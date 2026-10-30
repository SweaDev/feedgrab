import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, loadFixture } from '../helpers/dom';

type Expected = {
  feeds: {
    fixtureFeed: string;
    itemCount: number;
    excluded: { builtin: number; llm: number };
    parts: number;
  }[];
};

const names = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.expected.json'))
  .map((f) => f.replace('.expected.json', ''));

describe('fixture catalog', () => {
  test('has expected files', () => {
    expect(names.length).toBeGreaterThanOrEqual(11);
  });

  for (const name of names) {
    test(name, () => {
      const expected: Expected = JSON.parse(
        readFileSync(join(FIXTURES, `${name}.expected.json`), 'utf8'),
      );
      const doc = loadFixture(name);
      expect(doc.querySelectorAll('script').length).toBe(0);
      expect(doc.querySelectorAll('[data-fixture-feed]').length).toBe(expected.feeds.length);
      for (const f of expected.feeds) {
        const container = doc.querySelector(`[data-fixture-feed="${f.fixtureFeed}"]`);
        expect(container).not.toBeNull();
        const own = (sel: string) =>
          Array.from(container!.querySelectorAll(sel)).filter(
            (el) => el.closest('[data-fixture-feed]') === container,
          );
        expect(own('[data-fixture-item]').length).toBe(f.itemCount);
        expect(own('[data-fixture-excluded="builtin"]').length).toBe(f.excluded.builtin);
        expect(own('[data-fixture-excluded="llm"]').length).toBe(f.excluded.llm);
        expect(own('[data-fixture-part]').length).toBe(f.parts);
      }
    });
  }
});

test('paginated-2 repeats exactly one permalink from page 1', () => {
  const links = (n: string) =>
    new Set(
      Array.from(loadFixture(n).querySelectorAll('li.row a.title')).map((a) =>
        a.getAttribute('href'),
      ),
    );
  const p1 = links('paginated-1');
  const shared = [...links('paginated-2')].filter((h) => p1.has(h));
  expect(shared).toEqual(['/item/8']);
});
