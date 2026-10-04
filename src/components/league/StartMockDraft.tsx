"use client"

import { SignInButton, useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/Button"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { DEFAULT_TEAMS } from "@/lib/domain/leagueSize"
import { DEFAULT_DRAFT_ROUNDS } from "@/lib/domain/snake"

type ListedLeague = {
  id?: string
  espnLeagueId?: string | null
}

type LeagueResponse = {
  id?: string
  error?: string
  message?: string
}

const MOCK_DRAFT_BODY = {
  name: "Mock Draft",
  manualInput: {
    teams: DEFAULT_TEAMS,
    userPickSlot: 1,
    categories: defaultCategorySettings(),
    puntCategoryIds: [],
    focusCategoryIds: [],
    rounds: DEFAULT_DRAFT_ROUNDS,
    playerPoolSource: "proj_2026_27",
  },
}

const parseJson = async (response: Response): Promise<unknown> => {
  const rawText = await response.text()
  if (!rawText) return null

  try {
    return JSON.parse(rawText)
  } catch {
    throw new Error(
      `Server returned a non-JSON response (${response.status}). Try again.`,
    )
  }
}

const SetupLink = () => (
  <Link
    className="text-sm text-[var(--color-mute)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
    href="/leagues/new?setup=1"
  >
    Custom setup or ESPN import
  </Link>
)

export const StartMockDraft = () => {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const [error, setError] = useState("")
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    const controller = new AbortController()

    const startMockDraft = async () => {
      setError("")
      setNeedsSignIn(false)

      try {
        const listResponse = await fetch("/api/leagues", {
          signal: controller.signal,
        })

        if (listResponse.status === 401) {
          setNeedsSignIn(true)
          return
        }

        if (listResponse.ok) {
          const leagues = (await listResponse.json()) as ListedLeague[]
          const existing = leagues.find(
            (league) => league.id && !league.espnLeagueId,
          )
          if (existing?.id) {
            router.replace(`/leagues/${existing.id}/draft`)
            return
          }
        }

        const createResponse = await fetch("/api/leagues", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(MOCK_DRAFT_BODY),
          signal: controller.signal,
        })
        const result = ((await parseJson(createResponse)) ??
          {}) as LeagueResponse

        if (createResponse.status === 401) {
          setNeedsSignIn(true)
          return
        }

        if (!createResponse.ok || !result.id) {
          throw new Error(
            result.message ||
              result.error ||
              (createResponse.status ? `HTTP ${createResponse.status}` : "") ||
              "Unable to start mock draft",
          )
        }

        router.replace(`/leagues/${result.id}/draft`)
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to start mock draft",
        )
      }
    }

    void startMockDraft()

    return () => controller.abort()
  }, [attempt, isLoaded, isSignedIn, router])

  const handleRetry = () => {
    setAttempt((current) => current + 1)
  }

  const showSignIn = isLoaded && (!isSignedIn || needsSignIn)

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-12 sm:px-12 sm:py-16 lg:px-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-mute)] uppercase">
          Draft
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-bebas-neue)] text-[clamp(4rem,10vw,8rem)] leading-[0.85] tracking-[-0.02em] uppercase">
          Mock Draft
        </h1>

        {showSignIn ? (
          <div className="mt-10 space-y-6">
            <p className="max-w-xl text-lg leading-7 text-[var(--color-mute)]">
              Sign in to start a mock draft. The board uses a 12-team snake and
              the shared player pool.
            </p>
            <SignInButton mode="modal">
              <Button type="button">Sign in to start mock draft</Button>
            </SignInButton>
            <div>
              <SetupLink />
            </div>
          </div>
        ) : (
          <div className="mt-10 space-y-6">
            {error ? (
              <>
                <p
                  aria-label="Mock draft error"
                  className="text-sm text-[var(--color-sale)]"
                  role="alert"
                >
                  {error}
                </p>
                <Button onClick={handleRetry} type="button">
                  Try again
                </Button>
              </>
            ) : (
              <p aria-live="polite" className="text-lg text-[var(--color-mute)]">
                {isLoaded ? "Starting mock draft…" : "Loading…"}
              </p>
            )}
            <div>
              <SetupLink />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
