# Contributing to StellarAid Backend

Thanks for helping build StellarAid! This guide covers local setup, scripts,
testing, and our branch/PR conventions.

## Development setup

1. Install Node.js 20+ and npm.
2. Fork and clone the repo, then install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template and fill it in:
   ```bash
   cp .env.example .env
   ```
4. Create the database schema:
   ```bash
   npm run migrate
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Script            | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Run the API with hot reload (`ts-node-dev`)         |
| `npm run build`   | Compile TypeScript to `dist/`                       |
| `npm start`       | Run the compiled server                             |
| `npm test`        | Run Jest with coverage                              |
| `npm run lint`    | Run ESLint (flat config, ESLint 9)                  |
| `npm run migrate` | Run Knex migrations to latest                       |

## Testing

- Tests live under `tests/` and run on **ts-jest** (`testEnvironment: node`).
- API tests use **supertest** against the exported `app` (no port is bound in
  tests).
- Add or update tests for any behavior change. Keep coverage from regressing.
- Run the full suite before opening a PR:
  ```bash
  npm test
  ```

## Code style

- TypeScript **strict** mode — no `any` unless justified (lint warns on it).
- Lint must pass: `npm run lint`. Prefer `_`-prefixed names for intentionally
  unused args/vars.
- Formatting follows Prettier defaults (2-space indent, single quotes,
  semicolons). Keep imports ordered and modules focused.
- Store all monetary/i128 amounts as **strings** — never parse into `number`.
- Never log secrets or raw JWTs. Never leak stack traces to clients.

## Branch & PR conventions

- Branch from `main` using a descriptive prefix:
  - `feat/…` new feature
  - `fix/…` bug fix
  - `chore/…` tooling/deps
  - `docs/…` documentation
- Write clear, imperative commit messages (e.g. `feat: add deposits endpoint`).
- Open a PR against `main`. Link the issue it closes.
- CI (build + lint + test on Node 20) must be green.
- A code owner (`@Trovic1`) review is required to merge.

## PR checklist

- [ ] Branch named with a `feat/ fix/ chore/ docs/` prefix
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm test` passes (coverage not regressed)
- [ ] Tests added/updated for the change
- [ ] Docs updated (`README.md` / `.env.example`) if behavior or config changed
- [ ] No secrets, tokens, or stack traces logged or leaked to clients
- [ ] Linked the related issue
