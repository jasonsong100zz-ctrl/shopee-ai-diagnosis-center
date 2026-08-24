# Repository Agent Rules

This repository contains a Shopee operations application and a reusable e-commerce Skill library.

## Scope

- Treat `skills/` as the reusable Skill library.
- Treat the application, Supabase, Chrome extension, and Pages files outside `skills/` as product code.
- Do not mix a new-product research workflow into a recurring competitor-monitoring Skill.
- Before editing, read `docs/repository-governance.md` and the target Skill's `SKILL.md`.

## Skill changes

- Use lowercase kebab-case for Skill directory names and the YAML `name` field.
- Keep the user-facing Chinese or English display name in `agents/openai.yaml`.
- Every Skill must contain `SKILL.md` and `agents/openai.yaml`.
- Put detailed contracts in `references/`, repeatable deterministic logic in `scripts/`, and generated-output templates in `assets/`.
- Keep competitor observations, user feedback, product facts, hypotheses, and execution recommendations explicitly separated.
- Do not commit raw customer exports, product PPTs, private URLs, cookies, tokens, API keys, generated snapshots, or generated reports.

## Validation

Run `node scripts/validate-skills.mjs` for Skill changes. Run the smallest relevant Skill script with a fixture, then render an HTML result in Chrome when the output is visual.

## Git hygiene

- Preserve unrelated user changes in the working tree.
- Stage only files belonging to the requested change.
- Do not reset, checkout, or delete unrelated user work.
- Do not commit secrets or production data.
