import { threadsRoute } from "@agent-starters/kit/routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return threadsRoute(request)
}
