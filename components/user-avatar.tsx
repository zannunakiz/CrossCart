'use client'

import { useState } from 'react'

import { cn } from '@/lib/utils'

type UserAvatarProps = {
  src?: string | null
  name?: string | null
  className?: string
}

function getInitials(value?: string | null) {
  if (!value) return ''
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

export function UserAvatar({ src, name, className }: UserAvatarProps) {
  // Track the exact URL that failed so a newly loaded URL shows again automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const showImage = Boolean(src) && failedSrc !== src

  return (
    <span
      title={name ?? undefined}
      className={cn(
        'grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-[10px] font-semibold uppercase leading-none text-muted-foreground',
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote OAuth avatars are served as-is
        <img
          src={src as string}
          alt={name ?? 'Account'}
          width={28}
          height={28}
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src ?? null)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{getInitials(name) || '?'}</span>
      )}
    </span>
  )
}
