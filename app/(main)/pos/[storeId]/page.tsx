import { redirect } from "next/navigation"

// Redirect /pos/[storeId] → /pos/[storeId]/cashier
export default async function PosStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params
  redirect(`/pos/${storeId}/cashier`)
}
