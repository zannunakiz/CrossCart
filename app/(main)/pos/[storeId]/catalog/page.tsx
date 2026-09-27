import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posStores } from "@/lib/db/schema"
import { getPosPermissions } from "@/lib/pos/server"
import { PosCatalog } from "@/components/pos/pos-catalog"

export const metadata = { title: "Catalog — CrossCart POS" }

export default async function CatalogPage({ params }: { params: Promise<{ storeId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/")
  const { storeId } = await params
  const [store] = await db.select({ currency: posStores.currency }).from(posStores).where(eq(posStores.id, storeId)).limit(1)
  const perms = await getPosPermissions(session.user.id, storeId)
  const canWrite = perms.includes("catalog:write")
  return <PosCatalog storeId={storeId} currency={store?.currency ?? "IDR"} canWrite={canWrite} />
}
