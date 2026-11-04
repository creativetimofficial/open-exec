/** A Response whose body streams the given SSE frames, split into small chunks like a network would. */
export function sseResponse(frames: string[], init: ResponseInit = {}): Response {
  const text = frames.join("")
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < text.length; i += 17) c.enqueue(encoder.encode(text.slice(i, i + 17)))
      c.close()
    },
  })
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" }, ...init })
}

export const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`
