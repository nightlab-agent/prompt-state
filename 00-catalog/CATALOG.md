# Catalog

| File | Read when |
|---|---|
| `CLAUDE.md` | First, always. |
| `README.md` | You are a user installing it, or checking what it does not do. |
| `hooks/register.tsx` | You are changing which event moves which state, what skill loads are noted, or what the hint line, the notice under the prompt or `/skills-used` show. |
| `hooks/register.test.tsx`, `hooks/skills.test.tsx` | You changed the module: the test command in `tests/release.sh` runs both (the phase; the skill half). |
| `types/index.d.ts` | You changed what is stored: the state contract `validate` checks. |
| `tests/release.sh`, `tests/typecheck.sh`, `tests/checklist.py` | You are releasing: validate, test, type check, plugin directory checklist, version check; exit non-zero on any failing. `nightlab-release.json` names the release command for the maintainer's release tooling. |
| `CHANGELOG.md` | You are cutting a version: what changed and why. |
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json` | You are changing how the plugin loads or which module it runs. |
| `01-context/purpose.md` | You wonder who this is for and what request it answers. |
| `04-memory/STATE.md`, `04-memory/log/` | You need what is true now, or history. |
