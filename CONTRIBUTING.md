# Contributing

Thanks for contributing to CodeVideo Studio.

## Development setup

```bash
pnpm install
pnpm dev
```

Run verification before opening a pull request:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Guidelines

- Keep changes small and focused.
- Use TypeScript strict mode; avoid `any` in shared packages.
- Add tests for new pure logic in `packages/*`.
- Never commit API keys, tokens, `.env` files, or generated credentials.
- Document architectural changes in `docs/architecture.md`.
