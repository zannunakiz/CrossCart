"use client"

import { signIn, signOut } from "next-auth/react"

import { Button } from "@/components/ui/button"

export function SignInButton({ className }: { className?: string }) {
  return (
    <Button className={className} onClick={() => signIn("google")}>
      Sign in with Google
    </Button>
  )
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <Button variant="outline" size="sm" className={className} onClick={() => signOut()}>
      Sign out
    </Button>
  )
}
