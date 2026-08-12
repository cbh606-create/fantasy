"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/Button"
import { Chip } from "@/components/ui/Chip"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId, CategorySetting } from "@/lib/domain/types"

const PICK_SLOTS = Array.from({ length: 12 }, (_, index) => index + 1)
const MIN_WEIGHT = 0.5
const MAX_WEIGHT = 2
const WEIGHT_STEP = 0.5

const CATEGORY_LABELS: Record<CategoryId, string> = {
  FG_PCT: "FG%",
  FT_PCT: "FT%",
  TPM: "3PM",
  REB: "REB",
  AST: "AST",
  STL: "STL",
  BLK: "BLK",
  TO: "TO",
  PTS: "PTS",
}

type LeagueResponse = {
  id?: string
  message?: string
}

type Strategy = "punt" | "focus"

export const LeagueSetupForm = () => {
  const router = useRouter()
  const [leagueName, setLeagueName] = useState("My League")
  const [espnLeagueId, setEspnLeagueId] = useState("")
  const [season, setSeason] = useState(new Date().getFullYear())
  const [pickSlot, setPickSlot] = useState(1)
  const [categories, setCategories] = useState<CategorySetting[]>(
    defaultCategorySettings,
  )
  const [puntCategoryIds, setPuntCategoryIds] = useState<CategoryId[]>([])
  const [focusCategoryIds, setFocusCategoryIds] = useState<CategoryId[]>([])
  const [pendingAction, setPendingAction] = useState<"espn" | "manual" | null>(
    null,
  )
  const [error, setError] = useState("")

  const handleCategoryToggle = (categoryId: CategoryId) => {
    setCategories((currentCategories) =>
      currentCategories.map((category) =>
        category.id === categoryId
          ? { ...category, enabled: !category.enabled }
          : category,
      ),
    )
  }

  const handleWeightChange = (categoryId: CategoryId, change: number) => {
    setCategories((currentCategories) =>
      currentCategories.map((category) => {
        if (category.id !== categoryId) return category

        const weight = Math.min(
          MAX_WEIGHT,
          Math.max(MIN_WEIGHT, category.weight + change),
        )
        return { ...category, weight }
      }),
    )
  }

  const handleStrategyToggle = (
    strategy: Strategy,
    categoryId: CategoryId,
  ) => {
    if (strategy === "punt") {
      setPuntCategoryIds((currentIds) =>
        currentIds.includes(categoryId)
          ? currentIds.filter((id) => id !== categoryId)
          : [...currentIds, categoryId],
      )
      setFocusCategoryIds((currentIds) =>
        currentIds.filter((id) => id !== categoryId),
      )
      return
    }

    setFocusCategoryIds((currentIds) =>
      currentIds.includes(categoryId)
        ? currentIds.filter((id) => id !== categoryId)
        : [...currentIds, categoryId],
    )
    setPuntCategoryIds((currentIds) =>
      currentIds.filter((id) => id !== categoryId),
    )
  }

  const createLeague = async (
    endpoint: string,
    body: Record<string, unknown>,
  ) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const rawText = await response.text()
    let result: LeagueResponse & {
      error?: string
      errorCode?: string
      message?: string
    } = {}

    if (rawText) {
      try {
        result = JSON.parse(rawText) as typeof result
      } catch {
        throw new Error(
          `Server returned a non-JSON response (${response.status}). Try again or use Enter manually.`,
        )
      }
    }

    if (!response.ok || !result.id) {
      const detail =
        result.message ||
        result.errorCode ||
        result.error ||
        (response.status ? `HTTP ${response.status}` : "")
      throw new Error(detail || "Unable to create your league")
    }

    router.push(`/leagues/${result.id}/draft`)
  }

  const handleEspnImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setPendingAction("espn")

    try {
      await createLeague("/api/espn/import", {
        name: leagueName,
        leagueId: espnLeagueId,
        season,
      })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to import your ESPN league",
      )
    } finally {
      setPendingAction(null)
    }
  }

  const handleManualEntry = async () => {
    setError("")
    setPendingAction("manual")

    try {
      await createLeague("/api/leagues", {
        name: leagueName,
        manualInput: {
          userPickSlot: pickSlot,
          categories,
          puntCategoryIds,
          focusCategoryIds,
          rounds: 13,
          playerPoolSource: "proj_2026_27",
        },
      })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create your league",
      )
    } finally {
      setPendingAction(null)
    }
  }

  const isPending = pendingAction !== null

  return (
    <form className="space-y-12" onSubmit={handleEspnImport}>
      <section className="grid gap-6 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          <span>League name</span>
          <input
            className="h-12 w-full rounded-full bg-[var(--color-soft-cloud)] px-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
            onChange={(event) => setLeagueName(event.target.value)}
            required
            value={leagueName}
          />
        </label>
        <div className="rounded-3xl bg-[var(--color-soft-cloud)] px-6 py-4">
          <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
            League format
          </p>
          <p className="mt-1 font-medium">12-team snake · 13 rounds</p>
        </div>
      </section>

      <fieldset>
        <legend className="text-xl font-semibold">Your pick slot</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {PICK_SLOTS.map((slot) => (
            <Chip
              aria-label={`Pick slot ${slot}`}
              key={slot}
              onClick={() => setPickSlot(slot)}
              variant={pickSlot === slot ? "active" : "default"}
            >
              {slot}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-semibold">Scoring categories</legend>
        <p className="mt-1 text-sm text-[var(--color-mute)]">
          Turn categories on or off, then tune their importance.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const label = CATEGORY_LABELS[category.id]

            return (
              <div
                className="flex items-center justify-between rounded-3xl border border-[var(--color-hairline)] p-3"
                key={category.id}
              >
                <Chip
                  aria-label={`${category.enabled ? "Disable" : "Enable"} ${label}`}
                  onClick={() => handleCategoryToggle(category.id)}
                  variant={category.enabled ? "active" : "default"}
                >
                  {label}
                </Chip>
                <div className="flex items-center gap-2">
                  <button
                    aria-label={`Decrease ${label} weight`}
                    className="size-8 rounded-full bg-[var(--color-soft-cloud)] disabled:opacity-40"
                    disabled={
                      !category.enabled || category.weight === MIN_WEIGHT
                    }
                    onClick={() =>
                      handleWeightChange(category.id, -WEIGHT_STEP)
                    }
                    type="button"
                  >
                    −
                  </button>
                  <span
                    className="w-16 text-center text-sm tabular-nums"
                    aria-live="polite"
                  >
                    {label} weight {category.weight}
                  </span>
                  <button
                    aria-label={`Increase ${label} weight`}
                    className="size-8 rounded-full bg-[var(--color-soft-cloud)] disabled:opacity-40"
                    disabled={
                      !category.enabled || category.weight === MAX_WEIGHT
                    }
                    onClick={() =>
                      handleWeightChange(category.id, WEIGHT_STEP)
                    }
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </fieldset>

      {(["punt", "focus"] as const).map((strategy) => (
        <fieldset key={strategy}>
          <legend className="text-xl font-semibold capitalize">
            {strategy} categories
          </legend>
          <p className="mt-1 text-sm text-[var(--color-mute)]">
            {strategy === "punt"
              ? "Deprioritize categories you plan to concede."
              : "Boost categories you want to dominate."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) => {
              const selectedIds =
                strategy === "punt" ? puntCategoryIds : focusCategoryIds
              const label = CATEGORY_LABELS[category.id]

              return (
                <Chip
                  aria-label={`${strategy === "punt" ? "Punt" : "Focus"} ${label}`}
                  disabled={!category.enabled}
                  key={category.id}
                  onClick={() =>
                    handleStrategyToggle(strategy, category.id)
                  }
                  variant={
                    selectedIds.includes(category.id) ? "active" : "default"
                  }
                >
                  {label}
                </Chip>
              )
            })}
          </div>
        </fieldset>
      ))}

      <section className="rounded-[2rem] bg-[var(--color-soft-cloud)] p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            <span>ESPN league ID</span>
            <input
              className="h-12 w-full rounded-full bg-white px-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
              inputMode="numeric"
              onChange={(event) => setEspnLeagueId(event.target.value)}
              placeholder="e.g. 12345678"
              required
              value={espnLeagueId}
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span>Season</span>
            <input
              className="h-12 w-full rounded-full bg-white px-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
              min="2000"
              onChange={(event) => setSeason(Number(event.target.value))}
              required
              type="number"
              value={season}
            />
          </label>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            className="w-full sm:w-auto"
            disabled={isPending}
            type="submit"
          >
            {pendingAction === "espn" ? "Importing…" : "Import from ESPN"}
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isPending}
            onClick={handleManualEntry}
            variant="secondary"
          >
            {pendingAction === "manual" ? "Creating…" : "Enter manually"}
          </Button>
        </div>
        {error ? (
          <p
            aria-label="Setup error"
            className="mt-4 text-sm text-[var(--color-sale)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>
    </form>
  )
}
