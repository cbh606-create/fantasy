import Link from "next/link"
import type { ReactNode } from "react"

type SeasonToolShellProps = {
  backHref: string
  backLabel: string
  eyebrow?: string
  title?: string
  status?: string
  error?: string
  unauthorizedHint?: string
  children?: ReactNode
}

const isUnauthorizedMessage = (message: string) =>
  message.toLowerCase() === "unauthorized" ||
  message.toLowerCase().includes("unauthorized")

export const SeasonToolShell = ({
  backHref,
  backLabel,
  eyebrow = "Season analysis",
  title,
  status,
  error,
  unauthorizedHint = "Sign in to load this tool for your leagues.",
  children,
}: SeasonToolShellProps) => {
  const unauthorized = Boolean(error && isUnauthorizedMessage(error))

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link
            className="w-fit font-medium text-sm text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href={backHref}
          >
            {backLabel}
          </Link>
        </div>
        <header className="mb-8">
          <p className="text-sm text-[var(--color-mute)]">{eyebrow}</p>
          <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
            {title ?? "…"}
          </h1>
        </header>
        {status ? (
          <p className="text-[var(--color-mute)]" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <div className="space-y-3">
            <p className="text-[var(--color-sale)]" role="alert">
              {unauthorized ? unauthorizedHint : error}
            </p>
            {unauthorized ? (
              <Link
                className="inline-block font-medium text-sm text-[var(--color-ink)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
                href="/sign-in"
              >
                Go to sign in
              </Link>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </main>
  )
}

export const RouteSegmentLoading = ({ label }: { label: string }) => (
  <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-[var(--color-mute)]">Season analysis</p>
      <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight text-[var(--color-mute)] uppercase sm:text-7xl">
        …
      </h1>
      <p className="mt-8 text-[var(--color-mute)]" role="status">
        {label}
      </p>
    </div>
  </main>
)
