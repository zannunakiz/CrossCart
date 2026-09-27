import { PosCategories } from "@/components/pos/pos-categories"
export const metadata = { title: "Categories — CrossCart POS" }
export default async function CategoriesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  return <PosCategories storeId={storeId} />
}
