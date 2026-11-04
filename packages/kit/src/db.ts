import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { settings } from "./config"
import type { Source } from "./events"

/**
 * Local state in one SQLite file (Node's built-in node:sqlite, no native
 * module to compile): threads, messages, runs, the tool audit log and
 * approvals. A starter adds its own tables with registerSchema(). Ids are
 * minted here, on the server.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  hermes_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  runtime TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS tool_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  agent_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  initiator TEXT NOT NULL,
  input_json TEXT NOT NULL,
  policy TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'denied', 'running', 'succeeded', 'failed')),
  summary TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  agent_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  input_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id, id);
CREATE INDEX IF NOT EXISTS threads_agent ON threads(agent_id, updated_at);
CREATE INDEX IF NOT EXISTS audit_run ON tool_audit(run_id, id);
`

export type Db = DatabaseSync

const g = globalThis as typeof globalThis & { __agentKitDb?: DatabaseSync; __agentKitSchemas?: string[] }
const extraSchemas = (g.__agentKitSchemas ??= [])

/** A starter's own tables, created on whichever database is (or will be) open. */
export function registerSchema(sql: string) {
  if (extraSchemas.includes(sql)) return
  extraSchemas.push(sql)
  g.__agentKitDb?.exec(sql)
}

export function openDb(path?: string): DatabaseSync {
  const file = path ?? join(settings().dataDir, "agent.sqlite")
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true })
  const conn = new DatabaseSync(file)
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
  conn.exec(SCHEMA)
  for (const sql of extraSchemas) conn.exec(sql)
  return conn
}

export function getDb(): DatabaseSync {
  g.__agentKitDb ??= openDb()
  return g.__agentKitDb
}

/** Tests swap in an in-memory database. */
export function useDb(conn: DatabaseSync) {
  g.__agentKitDb = conn
}

export const now = () => new Date().toISOString()

// ─── Threads and messages ────────────────────────────────────────────────────

export interface ThreadRow {
  id: string
  agent_id: string
  title: string
  hermes_session_id: string | null
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: number
  role: "user" | "assistant"
  content: string
  sources: Source[]
  created_at: string
}

export function createThread(title: string, agentId: string): ThreadRow {
  const row: ThreadRow = {
    id: crypto.randomUUID(),
    agent_id: agentId,
    title: title.slice(0, 120) || "New conversation",
    hermes_session_id: null,
    created_at: now(),
    updated_at: now(),
  }
  getDb()
    .prepare("INSERT INTO threads (id, agent_id, title, hermes_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.id, row.agent_id, row.title, null, row.created_at, row.updated_at)
  return row
}

export function getThread(id: string): ThreadRow | undefined {
  return getDb().prepare("SELECT * FROM threads WHERE id = ?").get(id) as unknown as ThreadRow | undefined
}

export function listThreads(agentId?: string, limit = 50): ThreadRow[] {
  const db = getDb()
  return (
    agentId
      ? db.prepare("SELECT * FROM threads WHERE agent_id = ? ORDER BY updated_at DESC LIMIT ?").all(agentId, limit)
      : db.prepare("SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?").all(limit)
  ) as unknown as ThreadRow[]
}

export function deleteThread(id: string) {
  getDb().prepare("DELETE FROM threads WHERE id = ?").run(id)
}

export function setHermesSession(threadId: string, sessionId: string) {
  getDb().prepare("UPDATE threads SET hermes_session_id = ? WHERE id = ?").run(sessionId, threadId)
}

export function addMessage(threadId: string, role: "user" | "assistant", content: string, sources: Source[] = []) {
  const at = now()
  getDb()
    .prepare("INSERT INTO messages (thread_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(threadId, role, content, JSON.stringify(sources), at)
  getDb().prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(at, threadId)
}

export function listMessages(threadId: string): MessageRow[] {
  const rows = getDb()
    .prepare("SELECT id, role, content, sources_json, created_at FROM messages WHERE thread_id = ? ORDER BY id")
    .all(threadId) as unknown as Array<Omit<MessageRow, "sources"> & { sources_json: string }>
  return rows.map(({ sources_json, ...m }) => ({ ...m, sources: JSON.parse(sources_json) as Source[] }))
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export function startRun(threadId: string, agentId: string, runtime: string): string {
  const id = crypto.randomUUID()
  getDb()
    .prepare("INSERT INTO runs (id, thread_id, agent_id, runtime, status, created_at) VALUES (?, ?, ?, ?, 'running', ?)")
    .run(id, threadId, agentId, runtime, now())
  return id
}

export function finishRun(
  id: string,
  status: "completed" | "failed" | "cancelled",
  usage: { inputTokens: number; outputTokens: number; costUsd?: number },
  error?: string
) {
  getDb()
    .prepare(
      "UPDATE runs SET status = ?, error = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, finished_at = ? WHERE id = ?"
    )
    .run(status, error ?? null, usage.inputTokens, usage.outputTokens, usage.costUsd ?? null, now(), id)
}

// ─── Tool audit ──────────────────────────────────────────────────────────────

export interface AuditRow {
  id: number
  run_id: string | null
  agent_id: string
  call_id: string
  tool: string
  initiator: string
  input_json: string
  policy: string
  status: "requested" | "denied" | "running" | "succeeded" | "failed"
  summary: string | null
  error: string | null
  created_at: string
  finished_at: string | null
}

/** Written BEFORE the tool runs, so an action that crashes the process is still on record. */
export function auditRequested(entry: {
  runId: string | null
  agentId: string
  callId: string
  tool: string
  initiator: string
  input: unknown
  policy: string
}): number {
  const result = getDb()
    .prepare(
      "INSERT INTO tool_audit (run_id, agent_id, call_id, tool, initiator, input_json, policy, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?)"
    )
    .run(entry.runId, entry.agentId, entry.callId, entry.tool, entry.initiator, JSON.stringify(entry.input ?? null), entry.policy, now())
  return Number(result.lastInsertRowid)
}

export function auditUpdate(id: number, status: AuditRow["status"], detail: { summary?: string; error?: string } = {}) {
  const finished = status === "running" ? null : now()
  getDb()
    .prepare("UPDATE tool_audit SET status = ?, summary = ?, error = ?, finished_at = ? WHERE id = ?")
    .run(status, detail.summary ?? null, detail.error ?? null, finished, id)
}

export function listAudit(limit = 200): AuditRow[] {
  return getDb().prepare("SELECT * FROM tool_audit ORDER BY id DESC LIMIT ?").all(limit) as unknown as AuditRow[]
}

// ─── Approvals ───────────────────────────────────────────────────────────────

export interface ApprovalRow {
  id: string
  run_id: string | null
  agent_id: string
  call_id: string
  tool: string
  input_json: string
  status: "pending" | "approved" | "denied" | "expired"
  created_at: string
  expires_at: string
  decided_at: string | null
}

export function createApproval(entry: {
  runId: string | null
  agentId: string
  callId: string
  tool: string
  input: unknown
  timeoutSeconds: number
}): ApprovalRow {
  const row: ApprovalRow = {
    id: crypto.randomUUID(),
    run_id: entry.runId,
    agent_id: entry.agentId,
    call_id: entry.callId,
    tool: entry.tool,
    input_json: JSON.stringify(entry.input ?? null),
    status: "pending",
    created_at: now(),
    expires_at: new Date(Date.now() + entry.timeoutSeconds * 1000).toISOString(),
    decided_at: null,
  }
  getDb()
    .prepare(
      "INSERT INTO approvals (id, run_id, agent_id, call_id, tool, input_json, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
    )
    .run(row.id, row.run_id, row.agent_id, row.call_id, row.tool, row.input_json, row.created_at, row.expires_at)
  return row
}

export function getApproval(id: string): ApprovalRow | undefined {
  return getDb().prepare("SELECT * FROM approvals WHERE id = ?").get(id) as unknown as ApprovalRow | undefined
}

export function listPendingApprovals(): ApprovalRow[] {
  return getDb()
    .prepare("SELECT * FROM approvals WHERE status = 'pending' AND expires_at > ? ORDER BY created_at")
    .all(now()) as unknown as ApprovalRow[]
}

/** First decision wins: a second click, or a decision after expiry, changes nothing. */
export function decideApproval(id: string, decision: "approved" | "denied" | "expired"): boolean {
  const result = getDb()
    .prepare("UPDATE approvals SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'")
    .run(decision, now(), id)
  return Number(result.changes) === 1
}
