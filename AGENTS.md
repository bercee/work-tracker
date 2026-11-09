# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `bercee/work-tracker`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commit quality gate

Before creating any commit, run `npm run check` and resolve every failure. Create commits only after the full check passes; the pre-commit hook enforces this gate.

## Comments

Comments explain why, not what. Don't narrate changes or reference tasks. Record architectural decisions in `docs/adr/` and domain terms in `GLOSSARY.md`.
