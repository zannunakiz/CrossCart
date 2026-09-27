"use client"

import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/i18n"

export function AcceptInvite({ token }: { token: string }) {
  const lang = useLanguage(); const router = useRouter(); const id = lang === "ID"; const [state, setState] = useState<"loading" | "success" | "error">("loading"); const [message, setMessage] = useState("")
  useEffect(() => { let active = true; void fetch(`/api/pos/invites/${encodeURIComponent(token)}/accept`, { method: "POST" }).then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error); if (active) setState("success") }).catch((error: unknown) => { if (active) { setState("error"); setMessage(error instanceof Error ? error.message : "INVITE_FAILED") } }); return () => { active = false } }, [token])
  return <main className="mx-auto grid min-h-[60vh] max-w-md place-items-center"><section className="w-full rounded-xl border bg-card p-6 text-center">{state === "loading" && <><Loader2 className="mx-auto size-8 animate-spin text-primary"/><h1 className="mt-4 text-lg font-semibold">{id ? "Memproses undangan…" : "Accepting invite…"}</h1></>}{state === "success" && <><CheckCircle2 className="mx-auto size-9 text-emerald-500"/><h1 className="mt-4 text-lg font-semibold">{id ? "Anda sudah bergabung" : "You have joined"}</h1><p className="mt-2 text-sm text-muted-foreground">{id ? "Akses POS sudah aktif untuk akun ini." : "POS access is now active for this account."}</p><Button className="mt-5" onClick={() => router.push("/pos")}>{id ? "Buka POS" : "Open POS"}</Button></>}{state === "error" && <><TriangleAlert className="mx-auto size-9 text-destructive"/><h1 className="mt-4 text-lg font-semibold">{id ? "Undangan tidak dapat digunakan" : "Invite cannot be used"}</h1><p className="mt-2 text-sm text-muted-foreground">{message === "EMAIL_MISMATCH" ? (id ? "Gunakan akun dengan email yang diundang." : "Use the account with the invited email.") : (id ? "Undangan mungkin telah kedaluwarsa atau pernah digunakan." : "The invite may have expired or already been used.")}</p><Button variant="outline" className="mt-5" onClick={() => router.push("/pos")}>{id ? "Kembali" : "Back"}</Button></>}</section></main>
}
