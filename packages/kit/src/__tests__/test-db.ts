import { z } from "zod"

import { DEFAULT_LIMITS, type AgentProfile } from "../agent"
import { openDb, useDb } from "../db"
import { createBroker } from "../tools/broker"
import type { ToolDefinition } from "../tools/types"
import { webTools } from "../tools/web"

/** A fresh in-memory database for each test. */
export function freshDb() {
  useDb(openDb(":memory:"))
}

export const app = { id: "kit-test", version: "0.0.0" }

/** Saved notes, standing in for a tool with a side effect. */
export const saved: { title: string }[] = []

const noteSave: ToolDefinition<{ title: string; body: string }> = {
  id: "note.save",
  name: "note_save",
  description: "Save a note.",
  input: z.object({ title: z.string().min(3), body: z.string().min(5) }),
  sideEffect: true,
  async execute({ title }) {
    saved.push({ title })
    return { content: `Saved ${title}.`, summary: `Saved ${title}` }
  },
}

export const broker = createBroker([...webTools(app), noteSave as ToolDefinition<unknown>])

export const researcher: AgentProfile = {
  id: "researcher",
  name: "Researcher",
  instructions: "Research things.",
  tools: { "search.web": "allow", "page.read": "allow", "note.save": "approve" },
  limits: DEFAULT_LIMITS,
}

export const writer: AgentProfile = {
  id: "writer",
  name: "Writer",
  instructions: "Write things.",
  tools: { "note.save": "allow" },
  limits: DEFAULT_LIMITS,
}
