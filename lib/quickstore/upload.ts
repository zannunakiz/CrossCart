/**
 * QuickStore — payment QR upload rules.
 *
 * One source of truth for the 2 MB ceiling and its wording, shared by the
 * browser (which refuses the file before a request is ever sent) and by the
 * `uploadStoreQr` Server Action (which re-checks, because a body can be posted
 * without going through the UI at all).
 *
 * Why the browser checks first: a Server Action body is capped by Next.js
 * (`serverActions.bodySizeLimit`, see `next.config.mjs`) *before* any code of
 * ours runs, and that framework error names the internal limit. Validating here
 * keeps an oversized file from ever leaving the browser, so the user gets our
 * "max 2 MB" sentence instead of the framework's.
 *
 * Pure module — no server imports, safe in a Client Component.
 */
import type { ServerMessage } from '@/lib/i18n'

/** The ceiling the upload widget advertises ("max 2 MB"). */
export const MAX_UPLOAD_MB = 2
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1_000_000

/** Why a picked file was refused. */
export type QrFileProblem = 'too_large' | 'not_image'

/**
 * The English message per problem — the exact text the Server Action answers
 * with, so it is already in the `serverText` dictionary (`lib/i18n.ts`): the
 * toast reads the same whichever side refused the file, in either language.
 */
export const QR_FILE_PROBLEM_MESSAGE: Record<QrFileProblem, ServerMessage> = {
  too_large: `Image must be ${MAX_UPLOAD_MB} MB or smaller`,
  not_image: 'Only image files are allowed',
}

/**
 * The first thing wrong with `file`, or `null` when it may be uploaded. Size is
 * checked first: it is the only problem that can break the request itself.
 */
export function qrFileProblem(file: File): QrFileProblem | null {
  if (file.size > MAX_UPLOAD_BYTES) return 'too_large'
  if (file.type && !file.type.startsWith('image/')) return 'not_image'
  return null
}