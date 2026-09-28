"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Crown, Info, Loader2, Pencil, Trash2, UserPlus } from "lucide-react"
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
import type { StoreRole } from "@/lib/db/schema"
import { serverText, useTranslation } from "@/lib/i18n"
import { hasPermission } from "@/lib/quickstore/permissions"

interface MemberUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

/**
 * A membership row. The store owner is always present (first, `isOwner: true`)
 * even when they have no `store_members` row, and that row is untouchable.
 */
interface Member {
  id: string
  storeId: string
  userId: string
  role: StoreRole
  invitedBy: string | null
  createdAt: string
  updatedAt: string
  isOwner: boolean
  user: MemberUser
}

interface Props {
  storeId: string
  role: StoreRole
}

const memberLabel = (member: Member) => member.user.name ?? member.user.email ?? "—"

/** Short local date, e.g. "12 Mar 2026" (or "12 Mar 2026" with the ID locale). */
function formatDay(value: string, lang: string) {
  return new Date(value).toLocaleDateString(lang === "ID" ? "id-ID" : undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function MembersTab({ storeId, role }: Props) {
  const { lang, t } = useTranslation()
  const { data: session } = useSession()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [roleTarget, setRoleTarget] = useState<Member | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)

  // Each capability is gated on its own permission, so the RBAC matrix stays
  // the single source of truth — a non-master (admin) gets a read-only list.
  const canInvite = hasPermission(role, "member:invite")
  const canUpdateRole = hasPermission(role, "member:update-role")
  const canRemove = hasPermission(role, "member:remove")
  const canManage = canInvite || canUpdateRole || canRemove

  const currentUserId = session?.user?.id ?? null

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/members`)
      if (!res.ok) throw new Error()
      setMembers((await res.json()) as Member[])
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

  const handleRemove = async () => {
    const member = removeTarget
    if (!member || removing) return

    setRemoving(true)
    try {
      const res = await fetch(
        `/api/quickstore/stores/${storeId}/members/${member.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error((await res.json()).error)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      setRemoveTarget(null)
      toast.success(t("Member removed"))
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Remove failed"))
    } finally {
      setRemoving(false)
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
      {/* Toolbar — mobile first: the invite button keeps its icon-only form on
          a phone so the count and the action share one line. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t(members.length === 1 ? "{count} member" : "{count} members", {
            count: members.length,
          })}
        </p>
        {canInvite && (
          <Button
            id="invite-member-btn"
            size="sm"
            className="gap-1.5"
            onClick={() => setInviteOpen(true)}
            aria-label={t("Invite Member")}
          >
            <UserPlus className="size-4" />
            <span className="hidden sm:inline">{t("Invite Member")}</span>
          </Button>
        )}
      </div>

      {/* Non-masters keep full read access, just no controls. */}
      {!canManage && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {t("Only the store master can invite, re-role or remove members.")}
        </p>
      )}

      <div className="space-y-2">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId
          // The owner is always master; nobody edits or removes themselves.
          const editable = canManage && !member.isOwner && !isSelf
          const roleChanged =
            new Date(member.updatedAt).getTime() - new Date(member.createdAt).getTime() > 1000

          return (
            <div
              key={member.id}
              id={`member-row-${member.id}`}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <UserAvatar
                    src={member.user.image}
                    name={memberLabel(member)}
                    className="size-9 shrink-0"
                  />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {member.user.name ?? "—"}
                      </p>
                      {member.isOwner && (
                        <Badge className="gap-1 text-3xs">
                          <Crown className="size-2.5" />
                          {t("Owner")}
                        </Badge>
                      )}
                      {isSelf && !member.isOwner && (
                        <Badge variant="outline" className="text-3xs">
                          {t("You")}
                        </Badge>
                      )}
                      <Badge
                        variant={member.role === "master" ? "default" : "secondary"}
                        className="text-3xs uppercase"
                      >
                        {member.role}
                      </Badge>
                    </div>

                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>

                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {t("Joined {date}", { date: formatDay(member.createdAt, lang) })}
                      {roleChanged &&
                        ` · ${t("Role updated {date}", { date: formatDay(member.updatedAt, lang) })}`}
                    </p>
                  </div>
                </div>

                {editable && (
                  <div className="flex items-center gap-1.5 sm:shrink-0">
                    {canUpdateRole && (
                      <Button
                        id={`change-role-${member.id}`}
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 gap-1 text-xs sm:flex-none"
                        onClick={() => setRoleTarget(member)}
                      >
                        <Pencil className="size-3" />
                        {t("Change Role")}
                      </Button>
                    )}
                    {canRemove && (
                      <Button
                        id={`remove-member-${member.id}`}
                        variant="ghost"
                        size="sm"
                        className="h-7 flex-1 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive sm:flex-none"
                        onClick={() => setRemoveTarget(member)}
                      >
                        <Trash2 className="size-3" />
                        {t("Remove")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        storeId={storeId}
        onInvited={(member) => {
          setMembers((prev) => [...prev, member])
          toast.success(
            t("{name} invited as {role}", {
              name: memberLabel(member),
              role: member.role,
            })
          )
        }}
      />

      {/* Change role — master only, and only for someone else's membership. */}
      <RoleDialog
        member={roleTarget}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null)
        }}
        storeId={storeId}
        onUpdated={(updated) => {
          setMembers((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)))
          toast.success(
            t("{name} is now {role}", { name: memberLabel(updated), role: updated.role })
          )
        }}
      />

      {/* Remove confirmation — losing access should never be one tap away. */}
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(null)
        }}
      >
        <DialogContent className="max-w-[calc(100%-3rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold">{t("Remove Member")}</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? t('Remove "{name}" from this store? Their past sales stay in the history.', {
                    name: memberLabel(removeTarget),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
            >
              {t("Cancel")}
            </Button>
            <Button
              id="member-remove-confirm"
              type="button"
              variant="destructive"
              onClick={() => void handleRemove()}
              disabled={removing}
            >
              {removing && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("Remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Change-role dialog ───────────────────────────────────────────────────────
interface RoleProps {
  member: Member | null
  onOpenChange: (v: boolean) => void
  storeId: string
  onUpdated: (member: Member) => void
}

function RoleDialog({ member, onOpenChange, storeId, onUpdated }: RoleProps) {
  const { lang, t } = useTranslation()
  const [nextRole, setNextRole] = useState<StoreRole>("admin")
  const [submitting, setSubmitting] = useState(false)
  const open = member !== null

  // Seed the picker from the row that was opened (same hydration-on-open rule
  // the item dialog uses).
  useEffect(() => {
    if (!member) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNextRole(member.role)
  }, [member])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member || submitting || nextRole === member.role) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/members/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdated({ ...member, ...(await res.json()) } as Member)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Update failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v) }}>
      <DialogContent className="max-w-[calc(100%-3rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bold">{t("Change Role")}</DialogTitle>
          <DialogDescription>
            {member
              ? t("Set what {name} can do in this store.", { name: memberLabel(member) })
              : ""}
          </DialogDescription>
        </DialogHeader>

        <form id="member-role-form" onSubmit={handleSubmit} className="space-y-1.5">
          <Label htmlFor="member-role">{t("Role")}</Label>
          <Select
            value={nextRole}
            onValueChange={(value) => setNextRole(value as StoreRole)}
            disabled={submitting}
          >
            <SelectTrigger id="member-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{t("Admin — manages items & open status")}</SelectItem>
              <SelectItem value="master">
                {t("Master — full control (settings, members, credentials)")}
              </SelectItem>
            </SelectContent>
          </Select>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("Cancel")}
          </Button>
          <Button
            id="member-role-submit"
            type="submit"
            form="member-role-form"
            className="font-bold"
            disabled={submitting || !member || nextRole === member.role}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("Save Changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Invite dialog ────────────────────────────────────────────────────────────
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
      const member = (await res.json()) as Member
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
      {/* Same dialog sizing as Create New Store / Add Item. */}
      <DialogContent className="max-w-[calc(100%-3rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bold">{t("Invite Member")}</DialogTitle>
          <DialogDescription>
            {t("Invite a registered user to collaborate on this store.")}
          </DialogDescription>
        </DialogHeader>

        <form id="invite-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">
              {t("Email Address")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@example.com"
              autoComplete="email"
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
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t("Admin — manages items & open status")}</SelectItem>
                <SelectItem value="master">
                  {t("Master — full control (settings, members, credentials)")}
                </SelectItem>
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
            className="font-bold"
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

