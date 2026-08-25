import type { InjuryStatus } from "@/lib/injuries/types"
import { STREAMING_PROTECTED_ADP_MAX } from "@/lib/matchup/constants"
import type { SeasonPlayer } from "@/lib/season/types"

type ExpectedOutDaysInput = {
  status: InjuryStatus
  expectedOutDays?: number
}

type IlVersusNewInjuredPlayer = {
  playerId: string
  adp: number | null
  outDays: number
}

type ChooseIlVersusNewInjuredDropInput = {
  il: IlVersusNewInjuredPlayer | null
  newlyInjured: IlVersusNewInjuredPlayer | null
}

export const resolveExpectedOutDays = ({
  status,
  expectedOutDays,
}: ExpectedOutDaysInput): number => {
  if (expectedOutDays != null) return expectedOutDays
  return status === "out" ? 21 : 3
}

export const isLongTermInjuryException = (outDays: number): boolean =>
  outDays >= 14

export const isUnderperformingDropException = (_player: SeasonPlayer): boolean =>
  false

export const isAdpProtected = (adp: number | null | undefined): boolean =>
  adp != null && adp <= STREAMING_PROTECTED_ADP_MAX

export const chooseIlVersusNewInjuredDrop = ({
  il,
  newlyInjured,
}: ChooseIlVersusNewInjuredDropInput): string | null => {
  if (!il && !newlyInjured) return null
  if (!il) return newlyInjured!.playerId
  if (!newlyInjured) return il.playerId

  if (newlyInjured.outDays !== il.outDays) {
    return newlyInjured.outDays > il.outDays
      ? newlyInjured.playerId
      : il.playerId
  }

  const ilAdp = il.adp ?? Number.POSITIVE_INFINITY
  const newAdp = newlyInjured.adp ?? Number.POSITIVE_INFINITY
  return newAdp > ilAdp ? newlyInjured.playerId : il.playerId
}
