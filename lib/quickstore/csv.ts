/**
 * QuickStore — comma separated export.
 *
 * Pure and client-safe (the only DOM touch is the one `downloadCsv` link), kept
 * separate from `history.ts` so both the range export and the single-receipt
 * export write the very same file format.
 *
 * The output is what Excel on Windows wants to open straight from the download
 * folder: comma separated, CRLF line endings and a UTF-8 BOM (without it accented
 * item names come out as "Kopi Ã©clair"). Values are quoted only when a comma,
 * quote or newline forces it, and a leading `=`, `+`, `-` or `@` is neutralised
 * so an item name can never become a formula in the spreadsheet.
 */

/** One line of the sheet. Money stays the raw numeric string Postgres returned. */
export type CsvRow = readonly (string | number)[]

/** Excel opens a BOM-prefixed file as UTF-8 instead of the ANSI codepage. */
const BOM = "\uFEFF"

/** Quote a cell only when it needs it; disarm formula-looking text. */
export function csvCell(value: string | number): string {
  const text = String(value ?? "")
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  if (!/[",\r\n]/.test(safe)) return safe
  return `"${safe.replace(/"/g, '""')}"`
}

/** The whole sheet as text, without the BOM. */
export function csvText(rows: readonly CsvRow[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
}

/**
 * Save the rows as `filename` in the browser.
 *
 * The object URL is revoked on the same tick: the download has already been
 * handed to the browser by then, and leaving it alive would leak the blob.
 */
export function downloadCsv(filename: string, rows: readonly CsvRow[]): void {
  const blob = new Blob([`${BOM}${csvText(rows)}`], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}