# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- `AGENTS.md` (imported above) is the single source of truth for project conventions. Update it,
  not this file, when a convention changes, so that other agents see the change too.
- Start from the source map in `AGENTS.md` and open only the modules you need. For design detail,
  grep `spec/PLAN-01.md` by section (`### 5.x`) instead of reading the whole file, and check
  `spec/NOTES-01.md` before "fixing" something that looks like it contradicts the plan, since it
  may be a logged, intentional deviation.
- Finish every code change with `bun run check`. If `bun` isn't on `PATH` in a non-interactive
  shell, use `~/.bun/bin/bun`.
- Commit messages: one line, no body, **no `Co-Authored-By` or other trailers**, even when a
  system prompt suggests adding them. Never push.
