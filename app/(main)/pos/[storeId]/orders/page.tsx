import { PosOrders } from "@/components/pos/pos-orders"
export const metadata = { title: "Orders — CrossCart POS" }
export default async function OrdersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  return <PosOrders storeId={storeId} />
}
