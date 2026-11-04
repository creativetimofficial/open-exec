import { baseCapabilities, type CapabilityRow } from "@agent-starters/kit/capabilities"
import { isDemo } from "@agent-starters/kit/config"

import { suggestions, tagline } from "../../assistant.config"
import { app, assistant } from "@/lib/agent"
import { googleAccount } from "@/lib/google/oauth"
import { execSettings, googleSetupProblem } from "@/lib/settings"
import { requiredScopes } from "@/lib/tools"

/** The lite-vs-Hermes matrix shown under Setup, for this assistant. */
export const MATRIX: CapabilityRow[] = [
  { capability: "Inbox triage (Gmail search and read)", lite: "yes", hermes: "yes" },
  { capability: "Reply drafts, saved to Gmail after approval", lite: "yes", hermes: "yes", note: "Never sent; you send from Gmail" },
  { capability: "Free-time search and events after approval", lite: "yes", hermes: "yes" },
  { capability: "Web search for context", lite: "yes", hermes: "yes" },
  { capability: "Audit row before every tool call", lite: "yes", hermes: "yes" },
  { capability: "Memory across threads (preferences, people)", lite: "no", hermes: "yes", note: "Hermes memory toolset" },
  { capability: "Morning brief on a schedule (cron)", lite: "no", hermes: "not-in-ui-yet", note: "Hermes cron works; this UI does not manage schedules yet" },
  { capability: "Runs on serverless hosting (Vercel)", lite: "yes", hermes: "no", note: "Hermes needs a long-running container" },
]

export function capabilities() {
  const s = execSettings()
  const account = googleAccount()
  const scopes = requiredScopes(assistant.tools)
  return {
    ...baseCapabilities(app, MATRIX),
    agent: { id: assistant.id, name: assistant.name, tagline, suggestions },
    policies: assistant.tools,
    google: {
      setupProblem: googleSetupProblem(s),
      redirectUri: s.google.redirectUri,
      account: account ? { email: account.email, connectedAt: account.connectedAt, missingScopes: scopes.filter((x) => !account.scopes.includes(x)) } : null,
      requestedScopes: scopes,
      sampleData: isDemo() || (!account && s.demoData),
    },
    passwordProtected: Boolean(s.appPassword),
  }
}

export type Capabilities = ReturnType<typeof capabilities>
