/**
 * The raw RFC 5322 message for a Gmail draft. Header values are stripped of
 * line breaks (no header injection from model output), non-ASCII subjects
 * are RFC 2047 encoded, and the body is base64 so line length never matters.
 */

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim()

function encodeHeader(value: string): string {
  const clean = oneLine(value)
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`
}

export interface RawMessage {
  from?: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}

export function rawMessage(m: RawMessage): string {
  const headers = [
    m.from ? `From: ${oneLine(m.from)}` : null,
    `To: ${m.to.map(oneLine).join(", ")}`,
    m.cc.length ? `Cc: ${m.cc.map(oneLine).join(", ")}` : null,
    `Subject: ${encodeHeader(m.subject)}`,
    m.inReplyTo ? `In-Reply-To: ${oneLine(m.inReplyTo)}` : null,
    m.references ? `References: ${oneLine(m.references)}` : null,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean)
  const body = Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64")
    .replace(/.{76}/g, "$&\r\n")
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url")
}
