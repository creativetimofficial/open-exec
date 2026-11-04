import type { AppInfo } from "./agent"
import { isDemo, settings, type Settings } from "./config"
import { searchProviders } from "./search"

/**
 * What a deployment can do, for the UI: runtime, model route, search
 * providers (and how far each is proven), and the lite-vs-Hermes matrix the
 * starter supplies. Reports what is configured, never a secret.
 */

export type Support = "yes" | "no" | "off-by-default" | "not-in-ui-yet"

export interface CapabilityRow {
  capability: string
  lite: Support
  hermes: Support
  note?: string
}

function modelRoute(s: Settings): "companyfabric" | "openai" | "custom" {
  if (s.model.isCompanyFabric) return "companyfabric"
  if (s.model.baseUrl.startsWith("https://api.openai.com")) return "openai"
  return "custom"
}

export function baseCapabilities(app: AppInfo, matrix: CapabilityRow[], s: Settings = settings()) {
  return {
    runtime: s.runtime,
    demo: isDemo(s),
    model: { route: modelRoute(s), model: s.model.model, keyConfigured: Boolean(s.model.apiKey) },
    hermes: { configured: Boolean(s.hermes.url && s.hermes.apiKey) },
    search: {
      active: s.search.provider,
      providers: searchProviders(app, s).map((p) => ({
        id: p.id,
        label: p.label,
        verification: p.verification,
        unavailableReason: p.unavailableReason(),
      })),
    },
    matrix,
  }
}

export type BaseCapabilities = ReturnType<typeof baseCapabilities>
