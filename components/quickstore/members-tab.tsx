"use client"

import { useCallback, useEffect, useState } from "react"
import { Crown, Loader2, Mail, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UserAvatar } from "@/components/user-avatar"
import { hasPermission } from "@/lib/quickstore/permissions"
import { serverText, useTranslation } from "@/lib/i18n"
import type { StoreRole } from "@/lib/db/schema"

interface MemberUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

interface Member {
  id: string
  storeId: string
  userId: string
  role: StoreRole
  invitedBy: string | null
  createdAt: string
  user: MemberUser
}

interface Props {
  storeId: string
  role: StoreRole
}

export function MembersTab({ storeId, role }: Props) {
  const { lang, t } = useTranslation()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const canManage = hasPermission(role, "member:invite")

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/members`)
      if (!res.ok) throw new Error()
      setMembers(await res.json())
    } catch {
      toast.error(t("Failed to load members"))
    } finally {
      setLoading(false)
    }
  }, [storeId, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMembers()
  }, [fetchMembers])

  const handleRemove = async (member: Member) => {
    if (removingId) return
    const label = member.user.name ?? member.user.email ?? ""
    const confirmed = window.confirm(t("Remove {name} from store?", { name: label }))
    if (!confirmed) return

    setRemovingId(member.id)
    try {
      const res = await fetch(
        `/api/quickstore/stores/${storeId}/members/${member.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error((await res.json()).error)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      toast.success(t("Member removed"))
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Remove failed"))
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t(members.length === 1 ? "{count} member" : "{count} members", {
            count: members.length,
          })}
        </p>
        {canManage && (
          <Button
            id="invite-member-btn"
            size="sm"
            className="gap-2"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="size-4" />
            {t("Invite Member")}
          </Button>
        )}
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card py-14 text-center">
          <Mail className="mb-3 size-8 text-muted-foreground/50" />
          <p className="font-semibold">{t("No other members")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Invite collaborators to help manage this store.")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              id={`member-row-${member.id}`}
              className="flex items-center gap-3 border border-border bg-card p-3 transition-colors hover:border-foreground"
            >
              <UserAvatar
                src={member.user.image}
                name={member.user.name ?? member.user.email ?? "?"}
                className="size-9 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {member.user.name ?? "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
              </div>
              <Badge
                variant={member.role === "master" ? "default" : "secondary"}
                className="gap-1 text-3xs"
              >
                {member.role === "master" && <Crown className="size-2.5" />}
                {member.role}
              </Badge>
              {canManage && (
                <Button
                  id={`remove-member-${member.id}`}
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleRemove(member)}
                  disabled={removingId === member.id}
                >
                  {removingId === member.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invite dialog */}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        storeId={storeId}
        onInvited={(member) => {
          setMembers((prev) => [...prev, member])
          toast.success(
            t("{name} invited as {role}", {
              name: member.user.name ?? member.user.email ?? "",
              role: member.role,
            })
          )
        }}
      />
    </div>
  )
}

// ── Invite dialog ──────────────────────────────────────────────────────────
interface InviteProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  storeId: string
  onInvited: (member: Member) => void
}

function InviteDialog({ open, onOpenChange, storeId, onInvited }: InviteProps) {
  const { lang, t } = useTranslation()
  const [email, setEmail] = useState("")
  const [memberRole, setMemberRole] = useState<StoreRole>("admin")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => { setEmail(""); setMemberRole("admin") }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return toast.error(t("Email is required"))
    if (submitting) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), memberRole }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const member = await res.json()
      onInvited(member)
      onOpenChange(false)
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Invite failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) reset() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Invite Member")}</DialogTitle>
          <DialogDescription>
            {t("Invite a registered user to collaborate on this store.")}
          </DialogDescription>
        </DialogHeader>

        <form id="invite-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t("Email Address")}</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">{t("Role")}</Label>
            <Select
              value={memberRole}
              onValueChange={(v) => setMemberRole(v as StoreRole)}
              disabled={submitting}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t("Admin — can manage items & edit store")}</SelectItem>
                <SelectItem value="master">{t("Master — full control (including delete)")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); reset() }}
            disabled={submitting}
          >
            {t("Cancel")}
          </Button>
          <Button
            id="invite-submit"
            type="submit"
            form="invite-form"
            disabled={submitting || !email.trim()}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("Send Invite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
