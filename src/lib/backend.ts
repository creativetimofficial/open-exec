import { isDemo } from "@agent-starters/kit/config"

import { googleBackend } from "@/lib/google/backend"
import { googleAccount, GoogleNotConnected } from "@/lib/google/oauth"
import { sampleBackend } from "@/lib/sample"
import { execSettings } from "@/lib/settings"

/**
 * Where mail and calendar come from: the connected Google account, or the
 * built-in sample mailbox (demo mode, or DEMO_DATA=true). Tools only see this
 * interface, so a sample run exercises exactly the same tools and policies.
 */

export interface MailSummary {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  unread: boolean
}

export interface ThreadMessage {
  id: string
  from: string
  replyTo?: string
  to: string
  cc?: string
  subject: string
  date: string
  /** RFC 5322 Message-ID and References, for threading a reply. */
  messageId?: string
  references?: string
  body: string
}

export interface MailThread {
  id: string
  subject: string
  messages: ThreadMessage[]
}

export interface DraftInput {
  threadId?: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}

export interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  allDay: boolean
  location?: string
  organizer?: string
  attendees: string[]
  link?: string
}

export interface EventInput {
  summary: string
  start: string
  end: string
  timeZone: string
  description?: string
  location?: string
  attendees: string[]
}

export interface Busy {
  start: string
  end: string
}

export interface Backend {
  kind: "google" | "sample"
  /** The mailbox owner's address. */
  account: string
  timeZone(): Promise<string>
  searchMail(query: string, max: number): Promise<MailSummary[]>
  readThread(threadId: string): Promise<MailThread>
  createDraft(draft: DraftInput): Promise<{ id: string; link: string }>
  listEvents(timeMin: string, timeMax: string, max: number): Promise<CalendarEvent[]>
  busy(timeMin: string, timeMax: string): Promise<Busy[]>
  createEvent(event: EventInput): Promise<{ id: string; link: string }>
}

export function activeBackend(): Backend {
  // The scripted demo always runs on sample data, even with Google connected.
  if (isDemo()) return sampleBackend
  const account = googleAccount()
  if (account) return googleBackend(account.email)
  if (execSettings().demoData) return sampleBackend
  throw new GoogleNotConnected("Google is not connected. Connect it under Setup, or set DEMO_DATA=true to try the sample mailbox.")
}
