import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function DummyPage({
  title = "Module",
  description = "This module is configured and ready for implementation.",
}: {
  title?: string
  description?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-xs">
      <div className="max-w-xl space-y-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back to Overview
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Feature mockup active in sidebar navigation.
        </div>
      </div>
    </div>
  )
}
