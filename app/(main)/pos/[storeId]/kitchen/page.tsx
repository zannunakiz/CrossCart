import { KitchenBoard } from "@/components/pos/kitchen-board"

export const metadata = { title: "Kitchen Board — CrossCart POS" }

export default async function KitchenPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params
  return <KitchenBoard storeId={storeId} />
}
