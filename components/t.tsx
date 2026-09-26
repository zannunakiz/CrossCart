'use client'

import { useTranslation, type TranslationKey } from '@/lib/i18n'

/**
 * Renders a translated string. Used from server components (which cannot call
 * hooks) while keeping the language reactive on the client.
 */
export function T({
  k,
  vars,
}: {
  k: TranslationKey
  vars?: Record<string, string | number>
}) {
  const { t } = useTranslation()

  return <>{t(k, vars)}</>
}
