import { z } from "zod"

/**
 * This starter's own settings, beside the kit's (model, runtime, search):
 * the Google OAuth client, the key that encrypts stored Google tokens, the
 * app's public URL, sample data, and an optional password for the UI.
 */

const schema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** 32 bytes as 64 hex characters: openssl rand -hex 32 */
  TOKEN_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "TOKEN_KEY must be 64 hex characters (openssl rand -hex 32)")
    .optional(),
  DEMO_DATA: z.enum(["true", "false"]).default("false"),
  APP_PASSWORD: z.string().min(12, "APP_PASSWORD must be at least 12 characters").optional(),
})

export type ExecSettings = ReturnType<typeof loadExecSettings>

export function loadExecSettings(env: Record<string, string | undefined> = process.env) {
  const blankless = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""))
  const parsed = schema.parse(blankless)
  const appUrl = parsed.APP_URL.replace(/\/+$/, "")
  return {
    appUrl,
    google: {
      clientId: parsed.GOOGLE_CLIENT_ID,
      clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      redirectUri: `${appUrl}/api/google/callback`,
    },
    tokenKey: parsed.TOKEN_KEY ? Buffer.from(parsed.TOKEN_KEY, "hex") : undefined,
    demoData: parsed.DEMO_DATA === "true",
    appPassword: parsed.APP_PASSWORD,
  } as const
}

let cached: ExecSettings | null = null

export function execSettings(): ExecSettings {
  cached ??= loadExecSettings()
  return cached
}

/** Why Connect Google cannot work in this deployment, or null when it can. */
export function googleSetupProblem(s: ExecSettings = execSettings()): string | null {
  if (!s.google.clientId || !s.google.clientSecret) return "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README: Connect Google)."
  if (!s.tokenKey) return "Set TOKEN_KEY (openssl rand -hex 32); Google tokens are stored encrypted with it."
  return null
}
