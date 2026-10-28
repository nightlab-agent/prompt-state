# Catalog

| File | Read when |
|---|---|
| `CLAUDE.md` | First, always. |
| `README.md` | You are a user installing it, or checking what it does not do. |
| `hooks/register.tsx` | You are changing which event moves which state, or what is drawn. |
| `hooks/register.test.tsx` | You changed the module: the test command in `tests/release.sh` runs it. |
| `types/index.d.ts` | You changed what is stored: the state contract `validate` checks. |
| `tests/release.sh` | You are releasing: validate, test, version check; exit non-zero on any failing; `nightlab-release.json` names it. |
| `CHANGELOG.md` | You are cutting a version: what changed and why. |
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json` | You are changing how the plugin loads or which module it runs. |
| `01-context/purpose.md` | You wonder who this is for and what would kill it. |
| `04-memory/STATE.md`, `04-memory/log/` | You need what is true now, or history. |
