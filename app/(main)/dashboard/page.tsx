import { PrimaryNav } from "@/components/dashboard/primary-nav"
import { T } from "@/components/t"

export const metadata = {
  title: "Dashboard — CrossCart",
  description: "Choose where you want to start.",
}

export default function DashboardPage() {
  return (
    /* `flex-1` fills the content area exactly (see `(main)/layout.tsx`), so the
       two cards sit centred with no extra scroll height. */
    <div className="flex flex-1 flex-col justify-center">
      <div className="mx-auto w-full max-w-3xl space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <T k="dash.title" />
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <T k="dash.subtitle" />
          </p>
        </div>

        <PrimaryNav />
      </div>
    </div>
  )
}