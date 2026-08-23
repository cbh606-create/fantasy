"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSyncActiveSeasonLeague } from "@/components/season/useSyncActiveSeasonLeague"
import { DealDetail } from "@/components/trade/DealDetail"
import {
  NO_SUGGESTIONS_COPY,
  SuggestionList,
} from "@/components/trade/SuggestionList"
import { WeakCategoriesPanel } from "@/components/trade/WeakCategoriesPanel"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState } from "@/lib/season/types"
import type { TradeSuggestion } from "@/lib/trade/types"

type TradeWorkspaceProps = {
  leagueId: string
}

type TradeSuggestionsResponse = {
  suggestions: TradeSuggestion[]
  youNeeds: CategoryId[]
  youSurplus: CategoryId[]
  state: SeasonLeagueState
}

export const TradeWorkspace = ({ leagueId }: TradeWorkspaceProps) => {
  useSyncActiveSeasonLeague(leagueId)

  const [tradeData, setTradeData] = useState<TradeSuggestionsResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadWorkspace = async () => {
      try {
        const suggestionsResponse = await fetch(
          `/api/trade/suggestions?seasonLeagueId=${leagueId}`,
          { signal: controller.signal },
        )

        if (!suggestionsResponse.ok) {
          throw new Error("Unable to load trade suggestions")
        }

        const suggestions =
          (await suggestionsResponse.json()) as TradeSuggestionsResponse
        setTradeData(suggestions)
        setSelectedId(suggestions.suggestions[0]?.id ?? null)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load trade suggestions",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadWorkspace()

    return () => controller.abort()
  }, [leagueId])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-mute)]" role="status">
          Finding trade matches…
        </p>
      </main>
    )
  }

  if (!tradeData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-sale)]" role="alert">
          {error || "Unable to load trade suggestions"}
        </p>
      </main>
    )
  }

  const { state } = tradeData
  const selectedSuggestion = tradeData.suggestions.find(
    (suggestion) => suggestion.id === selectedId,
  ) ?? null

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            className="w-fit font-medium text-sm text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/trade"
          >
            ← All trade leagues
          </Link>
        </div>
        <header className="mb-8">
          <p className="text-sm text-[var(--color-mute)]">
            {state.season} season · trade finder
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
            {state.name}
          </h1>
        </header>
        <WeakCategoriesPanel
          needs={tradeData.youNeeds}
          surplus={tradeData.youSurplus}
        />
        <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr]">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Suggested deals</h2>
            <SuggestionList
              onSelect={setSelectedId}
              selectedId={selectedId}
              state={state}
              suggestions={tradeData.suggestions}
            />
          </section>
          {selectedSuggestion ? (
            <DealDetail state={state} suggestion={selectedSuggestion} />
          ) : (
            <p className="text-sm text-[var(--color-mute)]">
              {NO_SUGGESTIONS_COPY}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
