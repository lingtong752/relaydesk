# Contributing

Thanks for contributing to RelayDesk.

## Before you start

1. Read the product baseline in `docs/prd/PRODUCT_REQUIREMENTS.zh-CN.md`
2. Review the current roadmap in `docs/project-management/ROADMAP.zh-CN.md`
3. Check the active backlog in `docs/project-management/BACKLOG.zh-CN.md`

## Development flow

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Run `npm run dev:api`
4. Run `npm run dev:web`
5. Before opening a PR, run `npm run check`

## Pull request expectations

- Keep changes focused and small when possible
- Update docs when behavior, architecture, or data model changes
- Add or update tests for meaningful logic changes
- Do not commit secrets, local `.env` files, or generated artifacts
- If a feature is incomplete, document the gap clearly in the PR

## Commit guidance

- Prefer clear, descriptive commit messages
- Keep refactors separate from behavior changes when possible

## When to update docs

You should update docs if you change:

- API contracts
- MongoDB collections or fields
- Major product flows
- Roadmap or milestone status
- Contributor workflow
