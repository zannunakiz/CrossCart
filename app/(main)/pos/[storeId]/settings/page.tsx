import { PosSettings } from "@/components/pos/pos-settings"
export const metadata = { title: "Settings — CrossCart POS" }
export default async function SettingsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  return <PosSettings storeId={storeId} />
}
