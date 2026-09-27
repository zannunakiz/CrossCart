import { AcceptInvite } from "@/components/pos/accept-invite"
export const metadata = { title: "Accept POS invite — CrossCart" }
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <AcceptInvite token={token} /> }
