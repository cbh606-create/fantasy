"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { SeasonToolShell } from "@/components/season/SeasonToolShell"
import { useSyncActiveSeasonLeague } from "@/components/season/useSyncActiveSeasonLeague"
import { WeakCategoriesPanel } from "@/components/trade/WeakCategoriesPanel"
import { Banner } from "@/components/ui/Banner"
import { AddDropBuilder } from "@/components/waivers/AddDropBuilder"
import { BreakoutsPanel } from "@/components/waivers/BreakoutsPanel"
import { InjuryPickupsPanel } from "@/components/waivers/InjuryPickupsPanel"
import { RecommendedPickups } from "@/components/waivers/RecommendedPickups"
import { WaiverAssumeModal } from "@/components/waivers/WaiverAssumeModal"
import type { CategoryId } from "@/lib/domain/types"
import type { StatBasis } from "@/lib/season/analysis"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { teamStanding } from "@/lib/waivers/standing"
import type { AddDropPreview, PickupRecommendation } from "@/lib/waivers/types"

type WaiversWorkspaceProps = {
  leagueId: string
}

type AvailablePlayerSummary = {
  id: string
  name: string
  teamAbbr?: string
  availability: "fa" | "waiver"
}

type WaiversPoolResponse = {
  available: AvailablePlayerSummary[]
  waiverOrder: number[]
  youWaiverRank: number
  youNeeds: CategoryId[]
  recommendations: PickupRecommendation[]
  playersById: Record<string, SeasonPlayer>
  state: SeasonLeagueState
}

export const WaiversWorkspace = ({ leagueId }: WaiversWorkspaceProps) => {
  useSyncActiveSeasonLeague(leagueId)

  const searchParams = useSearchParams()
  const [state, setState] = useState<SeasonLeagueState | null>(null)
  const [poolData, setPoolData] = useState<WaiversPoolResponse | null>(null)
  const [selectedAddId, setSelectedAddId] = useState<string | null>(null)
  const [selectedDropId, setSelectedDropId] = useState<string | null>(null)
  const [preview, setPreview] = useState<AddDropPreview | null>(null)
  const [previewError, setPreviewError] = useState("")
  const [claimError, setClaimError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isAssumeModalOpen, setIsAssumeModalOpen] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [statBasis, setStatBasis] = useState<StatBasis>("total")
  const [isClaiming, setIsClaiming] = useState(false)

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    const poolResponse = await fetch(
      `/api/waivers/pool?seasonLeagueId=${leagueId}`,
      { signal },
    )

    if (poolResponse.status === 401) {
      throw new Error("unauthorized")
    }

    if (!poolResponse.ok) {
      throw new Error("Unable to load waivers workspace")
    }

    const pool = (await poolResponse.json()) as WaiversPoolResponse

    setState(pool.state)
    setPoolData(pool)
  }, [leagueId])

  useEffect(() => {
    const controller = new AbortController()

    const bootstrap = async () => {
      try {
        await loadWorkspace(controller.signal)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load waivers workspace",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void bootstrap()

    return () => controller.abort()
  }, [loadWorkspace])

  useEffect(() => {
    const addPlayerId = searchParams.get("addPlayerId")
    if (addPlayerId) setSelectedAddId(addPlayerId)
  }, [searchParams])

  const handleSelectAdd = (playerId: string | null) => {
    setSelectedAddId(playerId)
    setSelectedDropId(null)
    setPreview(null)
    setPreviewError("")
    setClaimError("")
    setSuccessMessage("")
  }

  const handleDropChange = (playerId: string | null) => {
    setSelectedDropId(playerId)
    setPreview(null)
    setPreviewError("")
  }

  const handleBasisChange = (basis: StatBasis) => {
    setStatBasis(basis)
    setPreview(null)
    setPreviewError("")
  }

  const handlePreview = async () => {
    if (!selectedAddId) return

    setIsPreviewing(true)
    setPreviewError("")
    setClaimError("")
    setSuccessMessage("")

    try {
      const response = await fetch("/api/waivers/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seasonLeagueId: leagueId,
            addPlayerId: selectedAddId,
            dropPlayerId: selectedDropId,
            basis: statBasis,
          }),
      })

      const payload = (await response.json()) as AddDropPreview | { error: string }

      if (!response.ok) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to preview add/drop",
        )
      }

      setPreview(payload as AddDropPreview)
    } catch (requestError) {
      setPreview(null)
      setPreviewError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to preview add/drop",
      )
    } finally {
      setIsPreviewing(false)
    }
  }

  useEffect(() => {
    if (!selectedAddId || !selectedDropId) return
    void handlePreview()
  }, [selectedAddId, selectedDropId, statBasis])

  const handleClaim = async (assumeSuccess = false) => {
    if (!selectedAddId) return

    setIsClaiming(true)
    setClaimError("")
    setSuccessMessage("")

    try {
      const response = await fetch("/api/waivers/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seasonLeagueId: leagueId,
          addPlayerId: selectedAddId,
          dropPlayerId: selectedDropId,
          assumeSuccess,
        }),
      })

      const payload = (await response.json()) as { error?: string; ok?: boolean }

      if (response.status === 409 && payload.error === "assume_required") {
        setIsAssumeModalOpen(true)
        return
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to claim player")
      }

      setIsAssumeModalOpen(false)
      setSelectedAddId(null)
      setSelectedDropId(null)
      setPreview(null)
      setSuccessMessage("Claim applied locally. Open roster to review lineup.")
      await loadWorkspace()
    } catch (requestError) {
      setClaimError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to claim player",
      )
    } finally {
      setIsClaiming(false)
    }
  }

  const handleConfirm = () => {
    if (!preview) return

    if (preview.requiresAssumeSuccess) {
      setIsAssumeModalOpen(true)
      return
    }

    void handleClaim(false)
  }

  const handleAssumeConfirm = () => {
    void handleClaim(true)
  }

  if (isLoading) {
    return (
      <SeasonToolShell
        backHref="/waivers"
        backLabel="← All waiver leagues"
        status="Loading waivers…"
      />
    )
  }

  if (!state || !poolData) {
    return (
      <SeasonToolShell
        backHref="/waivers"
        backLabel="← All waiver leagues"
        error={error || "Unable to load waivers workspace"}
        unauthorizedHint="Sign in to load waivers for your leagues."
      />
    )
  }

  const addPlayerName = selectedAddId
    ? poolData.playersById[selectedAddId]?.name ??
      state.players.find((player) => player.id === selectedAddId)?.name ??
      "Selected player"
    : "Selected player"
  const standing = teamStanding(state, statBasis)
  const basisLabel = statBasis === "perGame" ? "per game" : "total"

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            className="w-fit font-medium text-sm text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/waivers"
          >
            ← All waiver leagues
          </Link>
        </div>
        <header className="mb-8">
          <p className="text-sm text-[var(--color-mute)]">
            {state.season} season · {basisLabel} · overall #{standing.overallRank} · rank sum {standing.rankSum}
          </p>
          <ul aria-label="Category ranks" className="mt-3 flex flex-wrap gap-2">
            {standing.categories.map((category) => (
              <li
                className="rounded-full border border-[var(--color-hairline)] px-2.5 py-1 text-xs font-medium"
                key={category.categoryId}
              >
                {CATEGORY_SHORT_LABELS[category.categoryId]} #{category.rank}
              </li>
            ))}
          </ul>
          <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
            {state.name}
          </h1>
        </header>

        {successMessage ? (
          <Banner className="mb-6" tone="success">
            {successMessage}
          </Banner>
        ) : null}

        {claimError ? (
          <Banner className="mb-6" tone="danger">
            {claimError}
          </Banner>
        ) : null}

        <WeakCategoriesPanel
          weak={poolData.youNeeds}
          strong={[]}
          weakLabel="Improve"
          strongLabel="Can trade"
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-8">
            <BreakoutsPanel
              leagueId={leagueId}
              onSelectAdd={handleSelectAdd}
              playersById={poolData.playersById}
              selectedAddId={selectedAddId}
            />
            <InjuryPickupsPanel
              leagueId={leagueId}
              onSelectAdd={handleSelectAdd}
              selectedAddId={selectedAddId}
            />
            <section>
              <h2 className="mb-3 text-lg font-semibold">Season needs</h2>
              <p className="mb-3 text-[0.8125rem] text-[var(--color-mute)]">
                Season-long pickups.
              </p>
              <RecommendedPickups
                onSelectAdd={handleSelectAdd}
                playersById={poolData.playersById}
                recommendations={poolData.recommendations}
                selectedAddId={selectedAddId}
              />
            </section>
          </div>

          <div className="space-y-8">
            <AddDropBuilder
              addPlayerId={selectedAddId}
              available={poolData.available}
              basis={statBasis}
              dropPlayerId={selectedDropId}
              isClaiming={isClaiming}
              isPreviewing={isPreviewing}
              onAddChange={handleSelectAdd}
              onBasisChange={handleBasisChange}
              onConfirm={handleConfirm}
              onDropChange={handleDropChange}
              onPreview={() => void handlePreview()}
              preview={preview}
              previewError={previewError}
              state={state}
              teamCount={state.teams.length}
              youWaiverRank={poolData.youWaiverRank}
            />
          </div>
        </div>
      </div>

      <WaiverAssumeModal
        addPlayerName={addPlayerName}
        isClaiming={isClaiming}
        isOpen={isAssumeModalOpen}
        onCancel={() => setIsAssumeModalOpen(false)}
        onConfirm={handleAssumeConfirm}
        youWaiverRank={poolData.youWaiverRank}
      />
    </main>
  )
}
