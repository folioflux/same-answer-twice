# Contributing to same-answer-twice

Thanks for your interest in improving same-answer-twice. Bug reports, small fixes and focused improvements are welcome.

## Scope

same-answer-twice is deliberately small and generic: it runs the same question more than once and checks that the answers match. Please keep changes in that spirit. Larger ideas are best discussed in an issue first.

## Ground rules

- Be kind and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Use synthetic data only. Never commit real bank, personal or financial data, or secrets.
- Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## Development setup

You need Node.js 24 or later and pnpm (the version is pinned in `package.json`; `corepack enable` installs it).

```sh
git clone https://github.com/folioflux/same-answer-twice.git
cd same-answer-twice
pnpm install
pnpm run check
```

Useful scripts:

| Script               | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `pnpm run lint`      | ESLint                                            |
| `pnpm run format`    | Format with Prettier (`format:check` only checks) |
| `pnpm run typecheck` | TypeScript, no output                             |
| `pnpm run test`      | Vitest                                            |
| `pnpm run build`     | Compile `src/` to `dist/`                         |
| `pnpm run examples`  | Run the examples against `dist/` (build first)    |
| `pnpm run check`     | Lint, format check, typecheck, test and build     |

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change with tests. Keep pull requests small and focused.
3. Run `pnpm run check` and `pnpm run examples`.
4. Update the README and `CHANGELOG.md` when behaviour changes.
5. Open a pull request and fill in the template.

Pull requests are squash-merged once CI passes and a maintainer has reviewed them.

## Licence

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
