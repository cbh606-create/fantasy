"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

type ConnectStatus =
  | "pending"
  | "awaiting_login"
  | "succeeded"
  | "timed_out"
  | "failed"
  | "cancelled"

type StatusPayload = {
  status?: ConnectStatus
  errorCode?: string | null
}

type StartPayload = {
  statusPagePath?: string
}

const EspnConnectStatus = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    setStatus(null)
    setErrorCode(null)
    setMessage("")
    setIsRetrying(false)

    if (!sessionId) {
      setMessage("This connection link is missing a session ID.")
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()

    const pollStatus = async () => {
      try {
        const response = await fetch(
          `/api/espn/connect/status?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store", signal: controller.signal },
        )
        const payload = (await response.json().catch(() => ({}))) as StatusPayload

        if (!response.ok || !payload.status) {
          if (response.status === 401) {
            throw new Error("Sign in to the app, then return to this page.")
          }
          if (response.status === 404) {
            throw new Error("This connection session could not be found.")
          }
          throw new Error("Unable to check the ESPN connection.")
        }

        setStatus(payload.status)
        setErrorCode(payload.errorCode ?? null)
        setMessage("")

        if (payload.status === "pending" || payload.status === "awaiting_login") {
          timeoutId = setTimeout(() => void pollStatus(), 2000)
        }
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return
        }
        setMessage(
          requestError instanceof Error
            ? requestError.message
            : "Unable to check the ESPN connection.",
        )
        timeoutId = setTimeout(() => void pollStatus(), 2000)
      }
    }

    void pollStatus()

    return () => {
      controller.abort()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [sessionId])

  const handleRetry = async () => {
    setIsRetrying(true)
    setMessage("")

    try {
      const response = await fetch("/api/espn/connect/start", { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as StartPayload

      if (response.status === 401) {
        throw new Error("Sign in to the app before reconnecting ESPN.")
      }
      if (response.status === 409) {
        throw new Error(
          "An ESPN connection is already in progress. Open its waiting page or wait for it to time out.",
        )
      }
      if (!response.ok || !payload.statusPagePath) {
        throw new Error("Unable to start a new ESPN connection.")
      }

      router.replace(payload.statusPagePath)
    } catch (requestError) {
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start a new ESPN connection.",
      )
      setIsRetrying(false)
    }
  }

  const isWaiting = status === null || status === "pending" || status === "awaiting_login"
  const canRetry =
    !sessionId ||
    status === "timed_out" ||
    status === "failed" ||
    status === "cancelled"

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6 py-12">
      <section className="w-full max-w-xl rounded-[2rem] bg-[var(--color-soft-cloud)] p-8 sm:p-10">
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          ESPN connect
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-6xl">
          Finish signing in
        </h1>

        <div aria-live="polite" className="mt-6">
          {status === "succeeded" ? (
            <>
              <p className="text-lg font-medium text-[var(--color-info)]">
                ESPN connected successfully.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">
                Your ESPN credentials are ready. Return to Rosters to verify and
                import your league.
              </p>
              <Link
                className="mt-6 inline-flex rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
                href="/roster"
              >
                Back to Rosters
              </Link>
            </>
          ) : canRetry ? (
            <>
              <p className="text-lg font-medium text-[var(--color-sale)]">
                {status === "timed_out"
                  ? "The ESPN login window timed out."
                  : "ESPN could not be connected."}
              </p>
              {errorCode ? (
                <p className="mt-2 text-sm text-[var(--color-mute)]">
                  Error: {errorCode}
                </p>
              ) : null}
              <button
                className="mt-6 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRetrying}
                onClick={() => void handleRetry()}
                type="button"
              >
                {isRetrying ? "Starting…" : "Try again"}
              </button>
            </>
          ) : isWaiting ? (
            <>
              <p className="text-lg font-medium">
                A browser window should have opened.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">
                Log into ESPN there. This page updates automatically.
              </p>
              <p className="mt-6 text-sm text-[var(--color-mute)]" role="status">
                Waiting for ESPN login…
              </p>
            </>
          ) : null}

          {message ? (
            <p className="mt-4 text-sm text-[var(--color-sale)]" role="alert">
              {message}
            </p>
          ) : null}
        </div>

        <Link
          className="mt-8 inline-flex text-sm font-medium text-[var(--color-mute)] underline underline-offset-4 hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
          href="/roster"
        >
          Return to Rosters
        </Link>
      </section>
    </main>
  )
}

export default function EspnConnectPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
          <p className="text-[var(--color-mute)]" role="status">
            Loading ESPN connection…
          </p>
        </main>
      }
    >
      <EspnConnectStatus />
    </Suspense>
  )
}
