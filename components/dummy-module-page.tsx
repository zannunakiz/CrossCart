"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { useTranslation, type TranslationKey } from "@/lib/i18n"

export default function DummyPage({
  titleKey = "pos.title",
  descriptionKey = "pos.description",
}: {
  titleKey?: TranslationKey
  descriptionKey?: TranslationKey
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-xs">
      <div className="max-w-xl space-y-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.backToOverview")}
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{t(titleKey)}</h2>
        <p className="text-sm text-muted-foreground">{t(descriptionKey)}</p>
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          {t("common.mockupActive")}
        </div>
      </div>
    </div>
  )
}
