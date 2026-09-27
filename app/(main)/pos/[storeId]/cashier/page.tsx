import { PosCashier } from "@/components/pos/pos-cashier"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posStores } from "@/lib/db/schema"

export const metadata = {
  title: "Cashier — CrossCart POS",
  description: "Point-of-sale cashier interface for fast in-store checkout.",
}

export default async function CashierPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/")
  const { storeId } = await params
  const [store] = await db
    .select({ currency: posStores.currency })
    .from(posStores)
    .where(eq(posStores.id, storeId))
    .limit(1)

  return (
    <PosCashier
      storeId={storeId}
      currency={store?.currency ?? "IDR"}
    />
  )
}
