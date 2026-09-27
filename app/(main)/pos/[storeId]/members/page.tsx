import { PosMembers } from "@/components/pos/pos-members"
export const metadata = { title: "Members — CrossCart POS" }
export default async function MembersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  return <PosMembers storeId={storeId} />
}
