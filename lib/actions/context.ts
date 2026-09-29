/**
 * The session helper every Server Action starts from.
 *
 * A Server Action is reachable by a direct POST — the same assumption the route
 * handlers made — so each action re-reads the session *inside* the action and
 * then checks the caller's role and permissions. Nothing about the caller is
 * ever taken from the arguments.
 *
 * Not a `"use server"` module: it exports a plain helper and must never be
 * imported by a Client Component.
 */
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"

/** The signed-in user, or null when the request carries no valid session. */
export interface ActionSession {
  userId: string
  name: string | null
  email: string | null
}

/**
 * Reads and verifies the session cookie — the one and only source of identity
 * for every action (`401 Unauthorized` when it is missing or expired).
 *
 * The name/email are snapshotted into receipts so a sale survives account
 * deletion, which is why they travel along with the id.
 */
export async function currentSession(): Promise<ActionSession | null> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return null

  return {
    userId,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
  }
}