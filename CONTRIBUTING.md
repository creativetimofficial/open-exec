# Contributing to Open Exec

Thanks for helping. One thing to know first: **this repository is generated.** Open Exec is developed in Creative Tim's monorepo together with the other agent starters and the shared `packages/kit` and `packages/ui`, and exported here by a script. `EXPORTED_FROM` names the commit this copy came from.

What that means for a pull request:

1. Open it here as usual. We review it here.
2. When it is ready, we port it to the monorepo (keeping you as `Co-authored-by`), and the next export brings it back to this repository. We then close your PR with a link to the export that carries it.
3. Nothing is merged directly into `main` here. The export refuses to run when `main` has commits it did not make, so nothing is lost.

Changes to `packages/kit` or `packages/ui` affect every starter; we may ask to split them out.

## Develop

```bash
pnpm install
cp .env.example .env     # empty keys run the DEMO
pnpm dev
pnpm -r --include-workspace-root typecheck
pnpm -r --include-workspace-root test
```

Keep the honest status tags: a capability is `verified-live` only after a live run you can link.
