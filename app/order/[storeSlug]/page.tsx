import { CustomerOrder } from "@/components/pos/customer-order"

export default async function CustomerOrderPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params
  return <CustomerOrder storeSlug={storeSlug} />
}
