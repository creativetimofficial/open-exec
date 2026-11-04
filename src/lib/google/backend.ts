import { parseHTML } from "linkedom"

import type { Backend, CalendarEvent, MailSummary, MailThread, ThreadMessage } from "@/lib/backend"
import { googleJson } from "@/lib/google/api"
import { rawMessage } from "@/lib/mime"

/** Gmail and Google Calendar over their REST APIs, for the connected account. */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
const CALENDAR = "https://www.googleapis.com/calendar/v3"
const BODY_LIMIT = 6000

interface Header {
  name: string
  value: string
}

interface Part {
  mimeType?: string
  headers?: Header[]
  body?: { data?: string }
  parts?: Part[]
}

interface GmailMessage {
  id: string
  threadId: string
  snippet?: string
  labelIds?: string[]
  payload?: Part
}

interface GcalEvent {
  id: string
  status?: string
  summary?: string
  location?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  organizer?: { email?: string }
  attendees?: { email?: string }[]
}

const header = (part: Part | undefined, name: string) => part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8")

function findPart(part: Part | undefined, mimeType: string): Part | undefined {
  if (!part) return undefined
  if (part.mimeType === mimeType && part.body?.data) return part
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType)
    if (found) return found
  }
  return undefined
}

/** The readable text of a message: its text/plain part, or its HTML flattened to text. */
export function messageText(payload: Part | undefined): string {
  const plain = findPart(payload, "text/plain")
  if (plain?.body?.data) return decode(plain.body.data)
  const html = findPart(payload, "text/html")
  if (html?.body?.data) {
    const document = parseHTML(`<!doctype html><html><body>${decode(html.body.data)}</body></html>`).document as unknown as Document
    for (const el of Array.from(document.querySelectorAll("script, style"))) el.remove()
    return (document.body?.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  }
  return ""
}

function summary(m: GmailMessage): MailSummary {
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m.payload, "From"),
    to: header(m.payload, "To"),
    subject: header(m.payload, "Subject") || "(no subject)",
    date: header(m.payload, "Date"),
    snippet: m.snippet ?? "",
    unread: m.labelIds?.includes("UNREAD") ?? false,
  }
}

function threadMessage(m: GmailMessage): ThreadMessage {
  const text = messageText(m.payload)
  return {
    id: m.id,
    from: header(m.payload, "From"),
    replyTo: header(m.payload, "Reply-To") || undefined,
    to: header(m.payload, "To"),
    cc: header(m.payload, "Cc") || undefined,
    subject: header(m.payload, "Subject") || "(no subject)",
    date: header(m.payload, "Date"),
    messageId: header(m.payload, "Message-ID") || header(m.payload, "Message-Id") || undefined,
    references: header(m.payload, "References") || undefined,
    body: text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT)}\n[…truncated]` : text,
  }
}

function event(e: GcalEvent): CalendarEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime)
  return {
    id: e.id,
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    allDay,
    location: e.location,
    organizer: e.organizer?.email,
    attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    link: e.htmlLink,
  }
}

export function googleBackend(account: string, fetchImpl: typeof fetch = fetch): Backend {
  const get = <T>(url: string) => googleJson<T>(url, {}, fetchImpl)
  const post = <T>(url: string, body: unknown) => googleJson<T>(url, { method: "POST", body: JSON.stringify(body) }, fetchImpl)
  let timeZone: string | null = null

  return {
    kind: "google",
    account,

    async timeZone() {
      timeZone ??= (await get<{ value: string }>(`${CALENDAR}/users/me/settings/timezone`)).value
      return timeZone
    },

    async searchMail(query, max) {
      const params = new URLSearchParams({ q: query, maxResults: String(max) })
      const list = await get<{ messages?: { id: string }[] }>(`${GMAIL}/messages?${params}`)
      const meta = new URLSearchParams({ format: "metadata" })
      for (const h of ["From", "To", "Subject", "Date"]) meta.append("metadataHeaders", h)
      const messages = await Promise.all((list.messages ?? []).map((m) => get<GmailMessage>(`${GMAIL}/messages/${encodeURIComponent(m.id)}?${meta}`)))
      return messages.map(summary)
    },

    async readThread(threadId) {
      const t = await get<{ id: string; messages?: GmailMessage[] }>(`${GMAIL}/threads/${encodeURIComponent(threadId)}?format=full`)
      const messages = (t.messages ?? []).map(threadMessage)
      return { id: t.id, subject: messages[0]?.subject ?? "(no subject)", messages } satisfies MailThread
    },

    async createDraft(d) {
      const raw = rawMessage({ to: d.to, cc: d.cc, subject: d.subject, body: d.body, inReplyTo: d.inReplyTo, references: d.references })
      const draft = await post<{ id: string; message?: { id: string } }>(`${GMAIL}/drafts`, { message: { raw, ...(d.threadId ? { threadId: d.threadId } : {}) } })
      return { id: draft.id, link: "https://mail.google.com/mail/u/0/#drafts" }
    },

    async listEvents(timeMin, timeMax, max) {
      const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: String(max) })
      const res = await get<{ items?: GcalEvent[] }>(`${CALENDAR}/calendars/primary/events?${params}`)
      return (res.items ?? []).filter((e) => e.status !== "cancelled").map(event)
    },

    async busy(timeMin, timeMax) {
      const res = await post<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(`${CALENDAR}/freeBusy`, {
        timeMin,
        timeMax,
        items: [{ id: "primary" }],
      })
      return res.calendars?.primary?.busy ?? []
    },

    async createEvent(e) {
      const created = await post<GcalEvent>(`${CALENDAR}/calendars/primary/events?sendUpdates=none`, {
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: { dateTime: e.start, timeZone: e.timeZone },
        end: { dateTime: e.end, timeZone: e.timeZone },
        attendees: e.attendees.map((email) => ({ email })),
      })
      return { id: created.id, link: created.htmlLink ?? "https://calendar.google.com/" }
    },
  }
}
