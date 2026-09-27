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

          {/* Content area keeps the same layout whether the sidebar is open or closed */}
          <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </QuickStoreHeaderProvider>
    </MainSidebarProvider>
  )
}

