import { z } from "zod"

/**
 * The deployment's settings, read once from the environment. Nothing here is
 * ever sent to the browser except through capabilities(), which reports
 * what is configured, never the values.
 */

const DEFAULT_BASE_URL = "https://api.companyfabric.com/v1"

const schema = z.object({
  RUNTIME: z.enum(["lite", "hermes"]).optional(),
  OPENAI_BASE_URL: z.string().url().default(DEFAULT_BASE_URL),
  OPENAI_API_KEY: z.string().optional(),
  MODEL: z.string().default("companyfabric/auto"),
  HERMES_URL: z.string().url().optional(),
  HERMES_API_KEY: z.string().optional(),
  SEARCH_PROVIDER: z.enum(["parallel", "exa", "companyfabric"]).default("parallel"),
  PARALLEL_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  COMPANYFABRIC_SEARCH_ENABLED: z.enum(["true", "false"]).default("false"),
  TOOL_TOKEN: z.string().optional(),
  DATA_DIR: z.string().default("./data"),
})

export type Settings = ReturnType<typeof loadSettings>

export function loadSettings(env: Record<string, string | undefined> = process.env) {
  const blankless = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""))
  const parsed = schema.parse(blankless)
  // Hermes when it is configured, lite otherwise: a fresh clone with no
  // Hermes container still runs.
  const runtime = parsed.RUNTIME ?? (parsed.HERMES_URL ? "hermes" : "lite")
  return {
    runtime,
    model: {
      baseUrl: parsed.OPENAI_BASE_URL.replace(/\/+$/, ""),
      apiKey: parsed.OPENAI_API_KEY,
      model: parsed.MODEL,
      isCompanyFabric: parsed.OPENAI_BASE_URL.startsWith(DEFAULT_BASE_URL),
    },
    hermes: { url: parsed.HERMES_URL?.replace(/\/+$/, ""), apiKey: parsed.HERMES_API_KEY },
    search: {
      provider: parsed.SEARCH_PROVIDER,
      parallelApiKey: parsed.PARALLEL_API_KEY,
      exaApiKey: parsed.EXA_API_KEY,
      companyFabricEnabled: parsed.COMPANYFABRIC_SEARCH_ENABLED === "true",
    },
    toolToken: parsed.TOOL_TOKEN,
    dataDir: parsed.DATA_DIR,
  } as const
}

let cached: Settings | null = null

export function settings(): Settings {
  cached ??= loadSettings()
  return cached
}

/**
 * Demo mode: the lite runtime with no model key. Runs are scripted from
 * fixtures and every screen says DEMO, so a fresh clone shows the whole flow
 * without anyone mistaking it for a live answer.
 */
export function isDemo(s: Settings = settings()): boolean {
  return s.runtime === "lite" && !s.model.apiKey
}
