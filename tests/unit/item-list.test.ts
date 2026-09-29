/**
 * Unit tests — the Items table list state (search / filter / sort / paging).
 * Pure query-string logic shared by the client and the Server Action.
 */
import {
  ITEM_DEFAULT_DIR,
  ITEM_DEFAULT_PAGE_SIZE,
  ITEM_DEFAULT_SORT,
  ITEM_LIST_PARAM_KEYS,
  ITEM_MAX_PAGE_SIZE,
  hasItemListParams,
  itemListApiParams,
  itemListUrlParams,
  parseItemListQuery,
  withItemListUrlParams,
} from "@/lib/quickstore/item-list"

const parse = (query: string) => parseItemListQuery(new URLSearchParams(query))

describe("parseItemListQuery", () => {
  test("an empty query string yields the documented defaults", () => {
    expect(parse("")).toEqual({
      q: "",
      availability: "all",
      sort: ITEM_DEFAULT_SORT,
      dir: ITEM_DEFAULT_DIR,
      page: 1,
      pageSize: ITEM_DEFAULT_PAGE_SIZE,
    })
    expect(ITEM_DEFAULT_SORT).toBe("newest")
    expect(ITEM_DEFAULT_DIR).toBe("desc")
  })

  test("search text is trimmed", () => {
    expect(parse("q=%20apple%20").q).toBe("apple")
  })

  test("unknown sort / dir / availability values fall back safely", () => {
    const query = parse("sort=drop-table;--&dir=sideways&availability=maybe")
    expect(query.sort).toBe("newest")
    expect(query.dir).toBe("desc") // only "asc" is ever honoured
    expect(query.availability).toBe("all")
  })

  test("valid sort / dir / availability are accepted", () => {
    const query = parse("sort=price&dir=asc&availability=unavailable")
    expect(query.sort).toBe("price")
    expect(query.dir).toBe("asc")
    expect(query.availability).toBe("unavailable")
  })

  test("page is clamped to >= 1 and garbage becomes page 1", () => {
    expect(parse("page=5").page).toBe(5)
    expect(parse("page=0").page).toBe(1)
    expect(parse("page=-3").page).toBe(1)
    expect(parse("page=abc").page).toBe(1)
    expect(parse("page=2.9").page).toBe(2)
  })

  test("limit only accepts the offered sizes; anything else collapses to the max", () => {
    expect(parse("limit=10").pageSize).toBe(10)
    expect(parse("limit=25").pageSize).toBe(25)
    expect(parse("limit=50").pageSize).toBe(50)
    expect(parse("limit=7").pageSize).toBe(ITEM_MAX_PAGE_SIZE)
    expect(parse("limit=99999").pageSize).toBe(ITEM_MAX_PAGE_SIZE)
    expect(parse("limit=abc").pageSize).toBe(ITEM_MAX_PAGE_SIZE)
    expect(parse("limit=").pageSize).toBe(ITEM_DEFAULT_PAGE_SIZE)
    expect(ITEM_MAX_PAGE_SIZE).toBe(50)
  })
})

describe("params round-trip", () => {
  test("api params always carry page + limit, only non-default keys otherwise", () => {
    const params = itemListApiParams(parse(""))
    expect(params.get("page")).toBe("1")
    expect(params.get("limit")).toBe("10")
    expect(params.get("q")).toBeNull()
    expect(params.get("sort")).toBeNull()

    const full = itemListApiParams(parse("q=tea&availability=available&sort=name&dir=asc&page=3&limit=25"))
    expect(full.get("q")).toBe("tea")
    expect(full.get("availability")).toBe("available")
    expect(full.get("sort")).toBe("name")
    expect(full.get("dir")).toBe("asc")
    expect(full.get("page")).toBe("3")
    expect(full.get("limit")).toBe("25")
  })

  test("url params drop the defaults so a clean table is a clean URL", () => {
    const params = itemListUrlParams(parse(""))
    expect([...params.keys()]).toEqual([]) // nothing but defaults → empty string
    const some = itemListUrlParams(parse("q=tea&page=2"))
    expect(some.get("q")).toBe("tea")
    expect(some.get("page")).toBe("2")
    expect(some.get("limit")).toBeNull() // default size is dropped
  })

  test("a query survives parse → url → parse unchanged", () => {
    const original = parse("q=%20tea%20&availability=available&sort=price&dir=asc&page=4&limit=50")
    const roundTripped = parseItemListQuery(itemListUrlParams(original))
    expect(roundTripped).toEqual(original)
  })
})

describe("hasItemListParams / withItemListUrlParams", () => {
  test("detects this module's keys and ignores foreign ones", () => {
    expect(hasItemListParams(new URLSearchParams(""))).toBe(false)
    expect(hasItemListParams(new URLSearchParams("tab=items"))).toBe(false)
    expect(hasItemListParams(new URLSearchParams("tab=items&q=x"))).toBe(true)
    for (const key of ITEM_LIST_PARAM_KEYS) {
      expect(hasItemListParams(new URLSearchParams(`${key}=1`))).toBe(true)
    }
  })

  test("rewrites only its own keys and keeps the rest (tab survives)", () => {
    const current = new URLSearchParams("tab=items&q=old&limit=50&sort=name")
    const merged = withItemListUrlParams(current, parse("q=new&page=3"))
    expect(merged.get("tab")).toBe("items") // untouched
    expect(merged.get("q")).toBe("new") // rewritten
    expect(merged.get("page")).toBe("3")
    expect(merged.get("sort")).toBeNull() // old item key removed (back to default)
    expect(merged.get("limit")).toBeNull() // default page size is not carried in the URL
  })
})
