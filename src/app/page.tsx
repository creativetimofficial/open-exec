import { ExecApp } from "@/components/exec-app"
import { capabilities } from "@/lib/capabilities"

export const dynamic = "force-dynamic"

export default function Page() {
  return <ExecApp initialCapabilities={capabilities()} />
}
