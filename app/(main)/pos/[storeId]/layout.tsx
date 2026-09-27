import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posStores } from "@/lib/db/schema"
import { getPosPermissions } from "@/lib/pos/server"
import { PosStoreLayout } from "@/components/pos/pos-store-layout"

export default async function PosStoreRootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ storeId: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/")

  const { storeId } = await params
  const [store] = await db
    .select({
      id: posStores.id,
      name: posStores.name,
      slug: posStores.slug,
      currency: posStores.currency,
      isOpen: posStores.isOpen,
      ownerId: posStores.ownerId,
    })
    .from(posStores)
    .where(eq(posStores.id, storeId))
    .limit(1)

  if (!store) redirect("/pos")

  const permissions = await getPosPermissions(session.user.id, storeId)
  if (!permissions.length) redirect("/pos")

  const isOwner = store.ownerId === session.user.id
  const canManage = permissions.includes("store:manage")
  const canWriteCatalog = permissions.includes("catalog:write")
  const canManageMembers = permissions.includes("member:manage")
  const canReadReports = permissions.includes("report:read")
  const canReadInventory = permissions.includes("inventory:read")

  return (
    <PosStoreLayout
      store={store}
      permissions={{
        canManage,
        canWriteCatalog,
        canManageMembers,
        canReadReports,
        canReadInventory,
        isOwner,
      }}
    >
      {children}
    </PosStoreLayout>
  )
}
