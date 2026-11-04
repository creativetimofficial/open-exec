import { NextResponse, type NextRequest } from "next/server"

/**
 * Optional password for the whole UI and API (HTTP Basic, any username), set
 * with APP_PASSWORD. Once Google is connected, anyone who can open this app
 * can read the mailbox, so set it whenever the app is reachable beyond your
 * own machine. /api/mcp is excluded: it has its own bearer token (TOOL_TOKEN).
 */

function sameSecret(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD
  if (!password) return NextResponse.next()
  const header = request.headers.get("authorization") ?? ""
  if (header.startsWith("Basic ")) {
    let decoded = ""
    try {
      decoded = atob(header.slice(6))
    } catch {
      // not base64: treated as a wrong password
    }
    const given = decoded.slice(decoded.indexOf(":") + 1)
    if (decoded.includes(":") && sameSecret(given, password)) return NextResponse.next()
  }
  return new NextResponse("Authentication required.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Open Exec", charset="UTF-8"' } })
}

export const config = {
  matcher: ["/((?!api/mcp).*)"],
}
