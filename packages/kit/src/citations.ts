import type { Source } from "./events"

/** [3] in an answer becomes a link to source 3, but only when source 3 exists; anything else is left as written. */
export function linkCitations(text: string, sources: Source[]): string {
  const known = new Set(sources.map((s) => s.n))
  return text.replace(/\[(\d{1,3})\](?!\()/g, (match, n: string) => (known.has(Number(n)) ? `[[${n}]](#source-${n})` : match))
}
