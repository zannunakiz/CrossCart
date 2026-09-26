/**
 * Server-side OpenRouter client configuration.
 * Never import this in client components — it exposes OPEN_ROUTER_KEY.
 *
 * Uses the native fetch API (no extra SDK dependency).
 * Docs: https://openrouter.ai/docs
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

/**
 * Reads the API key at call time (not at module load) so a missing key
 * surfaces as a clear error instead of a silently-broken client.
 */
export function getOpenRouterKey(): string {
  const apiKey = process.env.OPEN_ROUTER_KEY
  if (!apiKey) {
    throw new Error("OPEN_ROUTER_KEY is not set")
  }
  return apiKey
}

/** Auth + attribution headers for every OpenRouter request. */
export function openRouterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getOpenRouterKey()}`,
    "Content-Type": "application/json",
  }

  // Optional app attribution shown on the OpenRouter dashboard.
  const referer = process.env.NEXTAUTH_URL
  if (referer) headers["HTTP-Referer"] = referer
  headers["X-Title"] = "CrossCart"

  return headers
}

export type OpenRouterKeyInfo = {
  label: string
  limit: number | null
  limit_remaining: number | null
  usage: number
  is_free_tier: boolean
}

/**
 * Lightweight health check — GET /api/v1/key validates the key and returns
 * its credit/usage info. Throws when the key is missing, invalid or the
 * request fails, so callers can map that to their own status vocabulary.
 */
export async function pingOpenRouter(): Promise<OpenRouterKeyInfo> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
    method: "GET",
    headers: openRouterHeaders(),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`OpenRouter ping failed with status ${response.status}`)
  }

  const payload = (await response.json()) as { data: OpenRouterKeyInfo }
  return payload.data
}
