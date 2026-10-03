"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { SeasonToolShell } from "@/components/season/SeasonToolShell"
import { useSyncActiveSeasonLeague } from "@/components/season/useSyncActiveSeasonLeague"
import { CategoryTargetToggles } from "@/components/trade/CategoryTargetToggles"
import { DealDetail } from "@/components/trade/DealDetail"
import { RosterIncludeGroups } from "@/components/trade/RosterIncludeGroups"
import {
  NO_SUGGESTIONS_COPY,
  SuggestionList,
} from "@/components/trade/SuggestionList"
import { WeakCategoriesPanel } from "@/components/trade/WeakCategoriesPanel"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState } from "@/lib/season/types"
import type { TradeSuggestion } from "@/lib/trade/types"

type TradeWorkspaceProps = {
  leagueId: string
}

type TradeSuggestionsResponse = {
  suggestions: TradeSuggestion[]
  youWeak: CategoryId[]
  youStrong: CategoryId[]
  state: SeasonLeagueState
}

export const TradeWorkspace = ({ leagueId }: TradeWorkspaceProps) => {
  useSyncActiveSeasonLeague(leagueId)

  const [tradeData, setTradeData] = useState<TradeSuggestionsResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<CategoryId[]>([])
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [generatedSuggestions, setGeneratedSuggestions] = useState<TradeSuggestion[]>([])
  const [requestedCategoryIds, setRequestedCategoryIds] = useState<CategoryId[]>([])
  const [hasGenerated, setHasGenerated] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    const loadWorkspace = async () => {
      try {
        const suggestionsResponse = await fetch(
          `/api/trade/suggestions?seasonLeagueId=${leagueId}`,
          { signal: controller.signal },
        )

        if (suggestionsResponse.status === 401) {
          throw new Error("unauthorized")
        }

        if (!suggestionsResponse.ok) {
          throw new Error("Unable to load trade suggestions")
        }

        const suggestions =
          (await suggestionsResponse.json()) as TradeSuggestionsResponse
        setTradeData(suggestions)
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
      <SeasonToolShell
        backHref="/trade"
        backLabel="← All trade leagues"
        status="Finding trade matches…"
      />
    )
  }

  if (!tradeData) {
    return (
      <SeasonToolShell
        backHref="/trade"
        backLabel="← All trade leagues"
        error={error || "Unable to load trade suggestions"}
        unauthorizedHint="Sign in to load trade suggestions for your leagues."
      />
    )
  }

  const { state } = tradeData
  const selectedSuggestion = generatedSuggestions.find(
    (suggestion) => suggestion.id === selectedId,
  ) ?? null

  const handleToggleCategory = (categoryId: CategoryId) =>
    setSelectedIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId])

  const handleExclude = (playerId: string) =>
    setExcludedIds((current) => [...current, playerId])

  const handleInclude = (playerId: string) =>
    setExcludedIds((current) => current.filter((id) => id !== playerId))

  const handleGenerate = async () => {
    const categories = ALL_CATEGORY_IDS.filter((categoryId) =>
      selectedIds.includes(categoryId))
    const params = new URLSearchParams({
      seasonLeagueId: leagueId,
      categories: categories.join(","),
      excludedPlayerIds: excludedIds.join(","),
    })

    setIsGenerating(true)
    setError("")

    try {
      const response = await fetch(`/api/trade/suggestions?${params}`)

      if (!response.ok) {
        throw new Error("Unable to load trade suggestions")
      }

      const generated = (await response.json()) as TradeSuggestionsResponse
      setGeneratedSuggestions(generated.suggestions)
      setRequestedCategoryIds(categories)
      setHasGenerated(true)
      setSelectedId(generated.suggestions[0]?.id ?? null)
    } catch {
      setError("Unable to load trade suggestions")
    } finally {
      setIsGenerating(false)
    }
  }

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
          weak={tradeData.youWeak}
          strong={tradeData.youStrong}
        />
        <CategoryTargetToggles
          onToggle={handleToggleCategory}
          selectedIds={selectedIds}
        />
        <RosterIncludeGroups
          excludedIds={excludedIds}
          onExclude={handleExclude}
          onInclude={handleInclude}
          state={state}
        />
        <button
          className="mt-6 rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          disabled={selectedIds.length === 0 || isGenerating}
          onClick={handleGenerate}
          type="button"
        >
          {isGenerating ? "Generating trade suggestions…" : "Generate trade suggestions"}
        </button>
        <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr]">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Suggested deals</h2>
            {error ? (
              <p className="mb-3 text-sm text-[var(--color-info)]" role="alert">
                {error}
              </p>
            ) : null}
            {hasGenerated ? (
              <SuggestionList
                onSelect={setSelectedId}
                selectedId={selectedId}
                state={state}
                suggestions={generatedSuggestions}
              />
            ) : (
              <p className="border-y border-[var(--color-hairline)] py-6 text-sm text-[var(--color-mute)]">
                Select a category, then generate trade suggestions.
              </p>
            )}
          </section>
          {selectedSuggestion ? (
            <DealDetail
              requestedCategoryIds={requestedCategoryIds}
              state={state}
              suggestion={selectedSuggestion}
            />
          ) : hasGenerated ? (
            <p className="text-sm text-[var(--color-mute)]">
              {NO_SUGGESTIONS_COPY}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
