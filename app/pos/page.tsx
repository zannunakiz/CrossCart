import { PosComingSoon } from "@/components/pos-coming-soon"

/**
 * `/pos` is parked: it lives OUTSIDE the `(main)` route group on purpose so it
 * renders without the admin navbar/sidebar shell. The Modern POS module is not
 * implemented yet — this screen only points visitors back to the dashboard.
 */
export const metadata = {
  title: "Modern POS — Coming Soon | CrossCart",
  description: "The Modern POS module is coming soon.",
}

export default function POSPage() {
  return <PosComingSoon />
}
