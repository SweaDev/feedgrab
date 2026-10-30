# Test fixtures

Synthetic HTML pages written for this repo (no real-site snapshots, no `<script>`).
Ground truth is encoded in attributes that the library never reads (the selector
generator's `STABLE_ATTRS` excludes them):

| Attribute | Meaning |
|---|---|
| `data-fixture-feed="<name>"` | A feed container. |
| `data-fixture-item` | A true item of the enclosing feed. |
| `data-fixture-excluded="builtin\|user\|llm"` | The item should be excluded, and by which kind of rule. |
| `data-fixture-part` | A sub-element of an item that should be reported as a part. |
| `data-fixture-skeleton` | A placeholder (skeleton loader) item; not emitted until filled. |

Each page has `<name>.expected.json`:

```json
{ "feeds": [{ "fixtureFeed": "<name>", "itemCount": 12, "excluded": { "builtin": 2, "llm": 1 }, "parts": 1 }] }
```

`infinite-chunk-*.html` are fragments (5 items each, ids continuing from the base page) that tests
append with `appendFragment`. `paginated-2.html` repeats exactly one permalink from page 1
(`/item/8`), so ingesting both pages yields 15 unique items.

`tests/unit/fixtures.test.ts` keeps the attributes and the JSON files consistent.
