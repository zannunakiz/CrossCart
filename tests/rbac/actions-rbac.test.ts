/**
 * RBAC tests — the real Server Actions over a fully mocked database + session.
 *
 * Only two modules are mocked (`@/lib/db` and the session helper); everything
 * else — `getUserRole` (owner ⇒ implicit master, membership lookup, soft-delete
 * and UUID guards) and the `hasPermission` matrix — is the production code, so
 * these tests prove what actually happens when:
 *   - a visitor is not logged in,
 *   - a logged-in user is NOT a member of the store (guest),
 *   - the store does not exist / was soft-deleted / has a malformed id,
 *   - an admin tries a master-only action,
 *   - a master (non-owner) or the owner acts,
 *   - someone tinkers with a store they are not part of (cross-store).
 *
 * No real data is read or written — every query is a jest mock.
 */
jest.mock("@/lib/db", () => ({
  pool: {},
  db: {
    query: {
      stores: { findFirst: jest.fn(), findMany: jest.fn() },
      storeMembers: { findFirst: jest.fn(), findMany: jest.fn() },
      storeItems: { findFirst: jest.fn(), findMany: jest.fn() },
      users: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
  },
}))

jest.mock("@/lib/actions/context", () => ({
  currentSession: jest.fn(),
}))

import { db } from "@/lib/db"
import { currentSession } from "@/lib/actions/context"
import {
  createStore,
  deleteStore,
  getStore,
  listStores,
  updateStore,
} from "@/lib/actions/store-actions"
import {
  createStoreItem,
  deleteStoreItem,
  listStoreItems,
  updateStoreItem,
} from "@/lib/actions/item-actions"
import {
  inviteStoreMember,
  listStoreMembers,
  removeStoreMember,
  updateStoreMemberRole,
} from "@/lib/actions/member-actions"
import { checkoutSale } from "@/lib/actions/sale-actions"
import type { ActionResult } from "@/lib/actions/result"

// ─────────────────────────────────────────────────────────────────────────────
// Mock handles + fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockDb = db as unknown as {
  query: {
    stores: { findFirst: jest.Mock; findMany: jest.Mock }
    storeMembers: { findFirst: jest.Mock; findMany: jest.Mock }
    storeItems: { findFirst: jest.Mock; findMany: jest.Mock }
    users: { findFirst: jest.Mock }
  }
  insert: jest.Mock
  update: jest.Mock
  delete: jest.Mock
  select: jest.Mock
}
const mockSession = currentSession as jest.MockedFunction<typeof currentSession>

const OWNER_ID = "user-owner"
const CALLER_ID = "user-caller"
const STORE_ID = "11111111-2222-4333-8444-555555555555"
const OTHER_STORE_ID = "99999999-8888-4777-8666-555555555555"
const MEMBER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

interface Scenario {
  session: { userId: string; name: string | null; email: string | null } | null
  /** Row returned by `stores.findFirst` (null = unknown / soft-deleted). */
  store: Record<string, unknown> | null
  /** Row returned by `storeMembers.findFirst` (null = not a member). */
  membership: Record<string, unknown> | null
  /** Row returned by `storeItems.findFirst` (null = item not in this store). */
  item: Record<string, unknown> | null
  inserted: Record<string, unknown>
}

/** Chainable stand-in for drizzle's `.set().where().returning()` builder. */
type Chain = {
  set: () => Chain
  values: () => Chain
  where: () => Chain
  returning: () => Promise<unknown[]>
}
function chain(result: unknown[]): Chain {
  const builder: Chain = {
    set: () => builder,
    values: () => builder,
    where: () => builder,
    returning: async () => result,
  }
  return builder
}

/** Wire every mock for one scenario. Called at the start of each test. */
function setup(overrides: Partial<Scenario> = {}): Scenario {
  const scenario: Scenario = {
    session: { userId: CALLER_ID, name: "Caller", email: "caller@example.test" },
    store: {
      id: STORE_ID,
      userId: OWNER_ID,
      name: "Warung Enak",
      description: null,
      open: true,
      paymentQr: null,
      deletedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    membership: null,
    item: null,
    inserted: { id: "new-row" },
    ...overrides,
  }

  mockSession.mockResolvedValue(scenario.session)
  mockDb.query.stores.findFirst.mockImplementation(async () => scenario.store)
  mockDb.query.stores.findMany.mockResolvedValue([])
  mockDb.query.storeMembers.findFirst.mockImplementation(async () => scenario.membership)
  mockDb.query.storeMembers.findMany.mockResolvedValue([])
  mockDb.query.storeItems.findFirst.mockImplementation(async () => scenario.item)
  mockDb.query.storeItems.findMany.mockResolvedValue([])
  mockDb.query.users.findFirst.mockResolvedValue(null)
  mockDb.insert.mockImplementation(() => chain([scenario.inserted]))
  mockDb.update.mockImplementation(() => chain([{ ...scenario.store, updatedAt: new Date() }]))
  mockDb.delete.mockImplementation(() => chain([]))
  // `findStoreItemByName` runs a SELECT … LIMIT 1 — answer "no clash".
  mockDb.select.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: async () => [] }) }),
  }))

  return scenario
}

/** Admin membership row for the caller. */
function adminMembership(): Record<string, unknown> {
  return {
    id: MEMBER_ID,
    storeId: STORE_ID,
    userId: CALLER_ID,
    role: "admin",
    invitedBy: OWNER_ID,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  }
}

/** Master membership row (a non-owner master — invited with full rights). */
function masterMembership(): Record<string, unknown> {
  return { ...adminMembership(), role: "master" }
}


function expectFail(result: ActionResult<unknown>, status: number): void {
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.status).toBe(status)
    expect(result.error.length).toBeGreaterThan(0)
  }
}

function expectOk(result: ActionResult<unknown>): void {
  expect(result.ok).toBe(true)
}

const validCheckout = () => ({
  clientRequestId: "req-abcdef12",
  lines: [{ itemId: MEMBER_ID, quantity: 1 }],
})

const validItemInput = () => ({
  name: "Teh Dingin",
  description: "Es batu",
  price: "5000",
  available: true,
  stocks: 5,
  discountPercent: 0,
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. Not logged in → 401 everywhere, before a single row is touched
// ─────────────────────────────────────────────────────────────────────────────

describe("not logged in (no valid session cookie)", () => {
  test("every guarded action answers 401 and never reaches the database", async () => {
    setup({ session: null })

    expectFail(await getStore(STORE_ID), 401)
    expectFail(await listStores(), 401)
    expectFail(await createStore({ name: "Toko Baru" }), 401)
    expectFail(await listStoreItems(STORE_ID), 401)
    expectFail(await createStoreItem(STORE_ID, validItemInput()), 401)
    expectFail(await updateStoreItem(STORE_ID, MEMBER_ID, { name: "X" }), 401)
    expectFail(await deleteStoreItem(STORE_ID, MEMBER_ID), 401)
    expectFail(await listStoreMembers(STORE_ID), 401)
    expectFail(await inviteStoreMember(STORE_ID, "someone@example.test"), 401)
    expectFail(await updateStoreMemberRole(STORE_ID, MEMBER_ID, "admin"), 401)
    expectFail(await removeStoreMember(STORE_ID, MEMBER_ID), 401)
    expectFail(await updateStore(STORE_ID, { name: "Hacked" }), 401)
    expectFail(await deleteStore(STORE_ID), 401)
    expectFail(await checkoutSale(STORE_ID, validCheckout()), 401)

    // Identity is checked FIRST: not one read or write happened.
    expect(mockDb.query.stores.findFirst).not.toHaveBeenCalled()
    expect(mockDb.query.storeMembers.findFirst).not.toHaveBeenCalled()
    expect(mockDb.query.storeItems.findFirst).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  test("even a malformed store id is rejected as 401 (session first)", async () => {
    setup({ session: null })
    expectFail(await getStore(MALFORMED_ID), 401)
    expect(mockDb.query.stores.findFirst).not.toHaveBeenCalled()
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// 2. Logged in but NOT a member (guest on a private store) → 403 everywhere
// ─────────────────────────────────────────────────────────────────────────────

describe("guest — signed in, but not a member of the store", () => {
  test("the store page refuses to open (403, not 404: it exists)", async () => {
    setup()
    expectFail(await getStore(STORE_ID), 403)
  })

  test("every read is refused", async () => {
    setup()
    expectFail(await listStoreItems(STORE_ID), 403)
    expectFail(await listStoreMembers(STORE_ID), 403)
  })

  test("every write is refused and nothing is inserted", async () => {
    setup()
    expectFail(await createStoreItem(STORE_ID, validItemInput()), 403)
    expectFail(await updateStoreItem(STORE_ID, MEMBER_ID, { name: "X" }), 403)
    expectFail(await deleteStoreItem(STORE_ID, MEMBER_ID), 403)
    expectFail(await inviteStoreMember(STORE_ID, "someone@example.test"), 403)
    expectFail(await updateStoreMemberRole(STORE_ID, MEMBER_ID, "admin"), 403)
    expectFail(await removeStoreMember(STORE_ID, MEMBER_ID), 403)
    expectFail(await updateStore(STORE_ID, { name: "Hacked" }), 403)
    expectFail(await deleteStore(STORE_ID), 403)

    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
    // Item checks run only AFTER the permission gate — no probe leaks.
    expect(mockDb.query.storeItems.findFirst).not.toHaveBeenCalled()
  })

  test("the cashier refuses a checkout, even with a perfectly valid payload", async () => {
    setup()
    expectFail(await checkoutSale(STORE_ID, validCheckout()), 403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  test("the RBAC gate runs before payload validation (still 403, never 400)", async () => {
    setup()
    const malformed = { clientRequestId: 123, lines: [] } as unknown as Parameters<
      typeof checkoutSale
    >[1]
    expectFail(await checkoutSale(STORE_ID, malformed), 403)
    expectFail(await createStoreItem(STORE_ID, { name: "" }), 403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Missing / soft-deleted / malformed store
// ─────────────────────────────────────────────────────────────────────────────

describe("store does not exist (unknown, soft-deleted or malformed id)", () => {
  test("a malformed id never reaches Postgres (no 22P02 → no 500)", async () => {
    setup()
    expectFail(await getStore(MALFORMED_ID), 404)
    expectFail(await updateStore(MALFORMED_ID, { name: "x" }), 404)
    expectFail(await deleteStore(MALFORMED_ID), 404)
    expect(mockDb.query.stores.findFirst).not.toHaveBeenCalled()
    // The item actions rely on getUserRole's own uuid guard (→ 403 path).
    expectFail(await listStoreItems(MALFORMED_ID), 403)
    expect(mockDb.query.storeItems.findFirst).not.toHaveBeenCalled()
  })

  test("an unknown / soft-deleted store reads as 404 on the store page", async () => {
    setup({ store: null })
    expectFail(await getStore(STORE_ID), 404)
    expectFail(await deleteStore(STORE_ID), 404)
  })

  test("a soft-deleted store closes every read and write path (403)", async () => {
    setup({ store: null }) // getUserRole treats it as non-existent
    expectFail(await listStoreItems(STORE_ID), 403)
    expectFail(await createStoreItem(STORE_ID, validItemInput()), 403)
    expectFail(await inviteStoreMember(STORE_ID, "someone@example.test"), 403)
    expectFail(await checkoutSale(STORE_ID, validCheckout()), 403)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// 4. The owner is implicitly master — even without a membership row
// ─────────────────────────────────────────────────────────────────────────────

describe("owner (stores.userId = caller)", () => {
  test("sees their own store as master", async () => {
    setup({ session: { userId: OWNER_ID, name: "Owner", email: "owner@example.test" } })
    const result = await getStore(STORE_ID)
    expectOk(result)
    if (result.ok) {
      expect(result.data.role).toBe("master")
      expect(result.data.isOwner).toBe(true)
    }
  })

  test("may read and write the catalog without ever being in store_members", async () => {
    setup({
      session: { userId: OWNER_ID, name: "Owner", email: "owner@example.test" },
      membership: null,
    })
    expectOk(await listStoreItems(STORE_ID))
    expectOk(await createStoreItem(STORE_ID, validItemInput()))
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  test("may delete their own store", async () => {
    setup({ session: { userId: OWNER_ID, name: "Owner", email: "owner@example.test" } })
    expectOk(await deleteStore(STORE_ID))
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Admin — the day-to-day cashier, master-only doors stay shut
// ─────────────────────────────────────────────────────────────────────────────

describe("admin member", () => {
  test("sees the store as admin, never as owner", async () => {
    setup({ membership: adminMembership() })
    const result = await getStore(STORE_ID)
    expectOk(result)
    if (result.ok) {
      expect(result.data.role).toBe("admin")
      expect(result.data.isOwner).toBe(false)
    }
  })

  test("may manage the catalog (view / create / edit / delete)", async () => {
    setup({ membership: adminMembership() })
    expectOk(await listStoreItems(STORE_ID))
    expectOk(await createStoreItem(STORE_ID, validItemInput()))
    // Edit/delete pass the RBAC gate; the item lookup then answers 404 here
    // because the mocked store owns no such item.
    expectFail(await updateStoreItem(STORE_ID, MEMBER_ID, { name: "Renamed" }), 404)
    expectFail(await deleteStoreItem(STORE_ID, MEMBER_ID), 404)
    expect(mockDb.query.storeItems.findFirst).toHaveBeenCalled()
  })

  test("may view members but may NOT invite / re-role / remove", async () => {
    setup({ membership: adminMembership() })
    expectOk(await listStoreMembers(STORE_ID))
    expectFail(await inviteStoreMember(STORE_ID, "someone@example.test"), 403)
    expectFail(await updateStoreMemberRole(STORE_ID, MEMBER_ID, "master"), 403)
    expectFail(await removeStoreMember(STORE_ID, MEMBER_ID), 403)
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  test("may toggle open/close but may NOT rename the store or touch the QR", async () => {
    setup({ membership: adminMembership() })
    // Rename → refused with the exact missing permission.
    const rename = await updateStore(STORE_ID, { name: "Toko Baru" })
    expectFail(rename, 403)
    if (!rename.ok) expect(rename.code).toBe("store:update-details")
    // Payment credential → refused too.
    const qr = await updateStore(STORE_ID, { paymentQr: "https://example.test/qr.png" })
    expectFail(qr, 403)
    if (!qr.ok) expect(qr.code).toBe("store:update-credential")
    // Open/close is granted to admins — and actually writes.
    expectOk(await updateStore(STORE_ID, { open: false }))
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  test("a no-op payload is answered without a 403 and without a write", async () => {
    setup({ membership: adminMembership() })
    expectOk(await updateStore(STORE_ID, {})) // nothing changes → nothing to check
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  test("may NOT delete the store (not owner, no store:delete)", async () => {
    setup({ membership: adminMembership() })
    expectFail(await deleteStore(STORE_ID), 403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  test("may reach the cashier: validation runs (400), the RBAC gate does not (403)", async () => {
    setup({ membership: adminMembership() })
    const malformed = { clientRequestId: 123, lines: [] } as unknown as Parameters<
      typeof checkoutSale
    >[1]
    const result = await checkoutSale(STORE_ID, malformed)
    expectFail(result, 400)
    if (!result.ok) expect(result.code).toBe("INVALID_REQUEST")
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// 6. Master member (not the owner) — full rights, still never "the owner"
// ─────────────────────────────────────────────────────────────────────────────

describe("master member (invited, not the owner)", () => {
  test("may rename the store and change the payment credential", async () => {
    setup({ membership: masterMembership() })
    expectOk(await updateStore(STORE_ID, { name: "Toko Baru" }))
    expectOk(await updateStore(STORE_ID, { paymentQr: "https://example.test/qr.png" }))
    expect(mockDb.update).toHaveBeenCalledTimes(2)
  })

  test("may invite members — validation happens after the gate", async () => {
    setup({ membership: masterMembership() })
    const result = await inviteStoreMember(STORE_ID, "") // empty email → 400
    expectFail(result, 400) // …proving member:invite was ALLOWED
  })

  test("may re-role members — invalid role is a 400, not a 403", async () => {
    setup({ membership: masterMembership() })
    expectFail(await updateStoreMemberRole(STORE_ID, MEMBER_ID, "superuser" as never), 400)
  })

  test("may remove members — the gate opens (404/400), it never says 403", async () => {
    setup({ membership: masterMembership() })
    // The mock hands back the caller's own membership row, which every action
    // refuses to touch ("you cannot change your own membership").
    const result = await removeStoreMember(STORE_ID, MEMBER_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).not.toBe(403)
  })

  test("may delete the store even though they do not own it", async () => {
    setup({ membership: masterMembership() })
    expectOk(await deleteStore(STORE_ID))
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  test("as admin, may ring up sales: input validation (400) follows the open gate", async () => {
    setup({ membership: masterMembership() })
    const malformed = { clientRequestId: 123, lines: [] } as unknown as Parameters<
      typeof checkoutSale
    >[1]
    expectFail(await checkoutSale(STORE_ID, malformed), 400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Cross-store — you are not part of THAT store
// ─────────────────────────────────────────────────────────────────────────────

describe("cross-store access (tinkering with a store you are not part of)", () => {
  test("a member of store A gets 403 on store B, even for the same session", async () => {
    // The members table holds a row for (caller, store A) only — for store B the
    // lookup comes back empty (membership is store-scoped), so the caller is a
    // guest there and every action refuses with 403.
    setup({ membership: null })
    expectFail(await getStore(OTHER_STORE_ID), 403)
    expectFail(await listStoreItems(OTHER_STORE_ID), 403)
    expectFail(await createStoreItem(OTHER_STORE_ID, validItemInput()), 403)
    expectFail(await inviteStoreMember(OTHER_STORE_ID, "someone@example.test"), 403)
    expectFail(await checkoutSale(OTHER_STORE_ID, validCheckout()), 403)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  test("the OWNER of store A cannot delete a foreign store B", async () => {
    setup({
      session: { userId: OWNER_ID, name: "Owner", email: "owner@example.test" },
      store: {
        id: OTHER_STORE_ID,
        userId: "someone-else", // B belongs to another owner
        name: "Toko Orang",
        description: null,
        open: true,
        paymentQr: null,
        deletedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      membership: null, // OWNER_ID is no member of B
    })
    expectFail(await getStore(OTHER_STORE_ID), 403)
    expectFail(await deleteStore(OTHER_STORE_ID), 403)
    expectFail(await updateStore(OTHER_STORE_ID, { name: "Hijacked" }), 403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

const MALFORMED_ID = "not-a-uuid-aezzz"
