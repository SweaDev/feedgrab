# NOTES-01 — implementation decisions log
- T01: Biome 2.6 formats Markdown; `**/*.md` is excluded in `biome.json` so formatting never shifts the spec line references — PLAN L28 forbids spec edits.
- T01: Installed majors: ai 7, zod 4, typescript 7, @biomejs/biome 2.6, happy-dom 21, @playwright/test 1.64. Peer ranges use `>=<major>`.
- T01: `tsconfig.json` adds `resolveJsonModule` (needed for the package.json import in T30) and `skipLibCheck` (third-party d.ts noise) — not listed in PLAN L154-158 but harmless.
