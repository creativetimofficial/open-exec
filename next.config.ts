import { fileURLToPath } from "node:url"

import type { NextConfig } from "next"

// The repository root: the vendored kit and UI live under packages/.
const workspaceRoot = fileURLToPath(new URL(".", import.meta.url))

const config: NextConfig = {
  // The kit and the shared UI ship TypeScript source.
  transpilePackages: ["@agent-starters/kit", "@agent-starters/ui"],
  // Loaded at runtime rather than bundled (it has an optional native canvas
  // dependency); listed in this app's dependencies so it resolves from here.
  serverExternalPackages: ["linkedom"],
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
}

export default config
