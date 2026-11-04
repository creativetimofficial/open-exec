import type { AgentProfile, AppInfo } from "@agent-starters/kit/agent"
import { createBroker } from "@agent-starters/kit/tools/broker"
import { webTools } from "@agent-starters/kit/tools/web"

import { assistant } from "../../assistant.config"
import { assistantTools } from "@/lib/tools"

export const app: AppInfo = { id: "open-exec", version: "0.1.0" }

/** Every tool this app can run; assistant.config.ts decides which the assistant may use. */
export const broker = createBroker([...assistantTools, ...webTools(app)])

/** The profile for a turn starting now: scheduling needs the exact time, not just the date. */
export function assistantProfile(at = new Date()): AgentProfile {
  return { ...assistant, instructions: `${assistant.instructions}\nThe current time is ${at.toISOString()}; calendar tools report the user's time zone.` }
}

export { assistant }
