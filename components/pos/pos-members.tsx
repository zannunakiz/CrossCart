"use client"

import { Loader2, Mail, Plus, Users, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n"

type Member = {
  id: string
  userId: string
  name: string | null
  email: string | null
  active: boolean
  roleName: string
  role: string | null
}

type Role = { id: string; name: string; systemRole: string | null }

type Invite = {
  id: string
  email: string
  status: string
  expiresAt: string
  roleName: string
}

export function PosMembers({ storeId }: { storeId: string }) {
  const lang = useLanguage()
  const id = lang === "ID"
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [roleId, setRoleId] = useState("")
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, iRes, rRes] = await Promise.all([
        fetch(`/api/pos/stores/${storeId}/members`, { cache: "no-store" }),
        fetch(`/api/pos/stores/${storeId}/invites`, { cache: "no-store" }),
        fetch(`/api/pos/stores/${storeId}/roles`, { cache: "no-store" }),
      ])
      setMembers(mRes.ok ? await mRes.json() : [])
      setInvites(iRes.ok ? await iRes.json() : [])
      const rs: Role[] = rRes.ok ? await rRes.json() : []
      setRoles(rs)
      if (rs.length && !roleId) setRoleId(rs.find((r) => r.systemRole === "cashier")?.id ?? rs[0]?.id ?? "")
    } catch {
      toast.error(id ? "Gagal memuat anggota." : "Could not load members.")
    } finally {
      setLoading(false)
    }
  }, [storeId, id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const sendInvite = async () => {
    if (!email.trim() || !roleId) return
    setInviting(true)
    try {
      const res = await fetch(`/api/pos/stores/${storeId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), roleId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(id ? `Undangan dikirim ke ${email}.` : `Invite sent to ${email}.`)
      setEmail("")
      setInviteOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (id ? "Gagal mengundang." : "Invite failed."))
    } finally {
      setInviting(false)
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      revoked: "bg-muted text-muted-foreground",
      expired: "bg-muted text-muted-foreground",
    }
    return colors[status] ?? "bg-muted text-muted-foreground"
  }

  return (
    <div className="space-y-4">
      {/* Members section */}
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between bg-muted/30 px-4 py-3 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="size-4" />
            {id ? "Anggota Aktif" : "Active Members"}
          </h2>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" />
            {id ? "Undang" : "Invite"}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {id ? "Belum ada anggota." : "No members yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">{id ? "Pengguna" : "User"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Peran" : "Role"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Status" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.name ?? m.email ?? m.userId}</p>
                    {m.name && <p className="text-xs text-muted-foreground">{m.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs">{m.roleName}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-3xs ${m.active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"} hover:bg-inherit`}>
                      {m.active ? (id ? "Aktif" : "Active") : (id ? "Nonaktif" : "Inactive")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invites section */}
      {invites.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Mail className="size-4" />
              {id ? "Undangan Terkirim" : "Pending Invites"}
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Peran" : "Role"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Status" : "Status"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Kedaluwarsa" : "Expires"}</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{inv.email}</td>
                  <td className="px-4 py-3 text-xs">{inv.roleName}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-3xs ${statusBadge(inv.status)} hover:bg-inherit`}>
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(inv.expiresAt).toLocaleDateString(lang === "ID" ? "id-ID" : "en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{id ? "Undang Anggota" : "Invite Member"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {id
                ? "Undangan akan dikirim via link. Pengguna harus sudah memiliki akun."
                : "Invite link will be generated. User must already have an account."}
            </p>
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Alamat Email" : "Email Address"} *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Peran" : "Role"} *</Label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!email.trim() || !roleId || inviting} onClick={sendInvite}>
                {inviting ? <Loader2 className="size-4 animate-spin" /> : null}
                {id ? "Kirim Undangan" : "Send Invite"}
              </Button>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>{id ? "Batal" : "Cancel"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
