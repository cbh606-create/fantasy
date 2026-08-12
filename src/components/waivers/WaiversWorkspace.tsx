"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { SeasonModuleNav } from "@/components/SeasonModuleNav"
import { WeakCategoriesPanel } from "@/components/trade/WeakCategoriesPanel"
import { Banner } from "@/components/ui/Banner"
import { AddDropBuilder } from "@/components/waivers/AddDropBuilder"
import { AvailablePoolTable } from "@/components/waivers/AvailablePoolTable"
import { RecommendedPickups } from "@/components/waivers/RecommendedPickups"
import { WaiverAssumeModal } from "@/components/waivers/WaiverAssumeModal"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
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
}

export const WaiversWorkspace = ({ leagueId }: WaiversWorkspaceProps) => {
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
  const [isClaiming, setIsClaiming] = useState(false)

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    const [leagueResponse, poolResponse] = await Promise.all([
      fetch(`/api/season-leagues/${leagueId}`, { signal }),
      fetch(`/api/waivers/pool?seasonLeagueId=${leagueId}`, { signal }),
    ])

    if (!leagueResponse.ok || !poolResponse.ok) {
      throw new Error("Unable to load waivers workspace")
    }

    const league = (await leagueResponse.json()) as { state: SeasonLeagueState }
    const pool = (await poolResponse.json()) as WaiversPoolResponse

    setState(league.state)
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

  const handleSelectAdd = (playerId: string) => {
    setSelectedAddId(playerId)
    setSelectedDropId(null)
    setPreview(null)
    setPreviewError("")
    setClaimError("")
    setSuccessMessage("")
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
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-mute)]" role="status">
          Loading waivers…
        </p>
      </main>
    )
  }

  if (!state || !poolData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
        <p className="text-[var(--color-sale)]" role="alert">
          {error || "Unable to load waivers workspace"}
        </p>
      </main>
    )
  }

  const addPlayerName = selectedAddId
    ? poolData.playersById[selectedAddId]?.name ??
      state.players.find((player) => player.id === selectedAddId)?.name ??
      "Selected player"
    : "Selected player"

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3">
          <Link
            className="w-fit font-medium text-sm text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
            href="/waivers"
          >
            ← All waiver leagues
          </Link>
          <SeasonModuleNav current="waivers" leagueId={leagueId} />
        </div>
        <header className="mb-8">
          <p className="text-sm text-[var(--color-mute)]">
            {state.season} season · waivers · rank #{poolData.youWaiverRank}
          </p>
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

        <WeakCategoriesPanel needs={poolData.youNeeds} surplus={[]} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-8">
            <section>
              <h2 className="mb-3 text-lg font-semibold">Recommended pickups</h2>
              <RecommendedPickups
                onSelectAdd={handleSelectAdd}
                playersById={poolData.playersById}
                recommendations={poolData.recommendations}
                selectedAddId={selectedAddId}
              />
            </section>
            <section>
              <h2 className="mb-3 text-lg font-semibold">Available pool</h2>
              <AvailablePoolTable
                available={poolData.available}
                onSelectAdd={handleSelectAdd}
                selectedAddId={selectedAddId}
              />
            </section>
          </div>

          <AddDropBuilder
            addPlayerId={selectedAddId}
            dropPlayerId={selectedDropId}
            isClaiming={isClaiming}
            isPreviewing={isPreviewing}
            onConfirm={handleConfirm}
            onDropChange={(playerId) => {
              setSelectedDropId(playerId)
              setPreview(null)
              setPreviewError("")
            }}
            onPreview={() => void handlePreview()}
            preview={preview}
            previewError={previewError}
            state={state}
            youWaiverRank={poolData.youWaiverRank}
          />
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
