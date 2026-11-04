import type { AppInfo } from "../agent"
import { settings, type Settings } from "../config"
import { companyFabricProvider } from "./companyfabric"
import { exaProvider } from "./exa"
import { parallelProvider } from "./parallel"
import type { SearchProvider } from "./types"

export function searchProviders(app: AppInfo, s: Settings = settings()): SearchProvider[] {
  return [
    parallelProvider(s.search.parallelApiKey, app),
    exaProvider(s.search.exaApiKey),
    companyFabricProvider({
      enabled: s.search.companyFabricEnabled,
      baseUrl: s.model.baseUrl,
      apiKey: s.model.apiKey,
      isCompanyFabric: s.model.isCompanyFabric,
    }),
  ]
}

/** The provider SEARCH_PROVIDER names, refusing one that cannot run here rather than silently using another. */
export function activeSearchProvider(app: AppInfo, s: Settings = settings()): SearchProvider {
  const provider = searchProviders(app, s).find((p) => p.id === s.search.provider)!
  const reason = provider.unavailableReason()
  if (reason) throw new Error(`SEARCH_PROVIDER=${provider.id} cannot be used: ${reason}`)
  return provider
}
