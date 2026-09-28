import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { MainNavbar } from "@/components/main-navbar"
import { MainSidebar } from "@/components/main-sidebar"
import { MainSidebarProvider } from "@/components/main-sidebar-context"
import { QuickStoreHeaderProvider } from "@/components/quickstore/store-header-context"
import { authOptions } from "@/lib/auth"

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Only authenticated users may access the dashboard shell.
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/")
  }

  return (
    <MainSidebarProvider>
      {/* QuickStore detail pages publish their store breadcrumb into the navbar. */}
      <QuickStoreHeaderProvider>
        <div className="relative flex min-h-screen flex-col bg-background text-foreground">
          {/* Navbar with sidebar toggle button on the top-left */}
          <MainNavbar />

          {/* Overlapping sidebar drawer: slides in, overlaps content, dims the rest */}
          <MainSidebar />

          {/* Content area keeps the same layout whether the sidebar is open or closed.
              It is a full-height flex column, so pages fill it with `flex-1` instead
              of guessing `100vh` math — that guess used to overflow by exactly the
              padding height and force a needless vertical scrollbar on /dashboard. */}
          <main className="flex flex-1 flex-col overflow-x-hidden p-4 sm:p-6 lg:p-8">
            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">{children}</div>
          </main>
        </div>
      </QuickStoreHeaderProvider>
    </MainSidebarProvider>
  )
}

