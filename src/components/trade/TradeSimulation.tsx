"use client"

import { useState } from "react"
import { SideRankColumn } from "@/components/trade/SideRankColumn"
import { SimulationRoster } from "@/components/trade/SimulationRoster"
import { TradePackageStats } from "@/components/trade/TradePackageStats"
import type { StatBasis } from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"
import { fairFills, formatFairFill, shapeLimits, TRADE_SHAPES, type SimShape } from "@/lib/trade/fairFill"
import { formatAdvantageLine } from "@/lib/trade/offerCopy"
import { evenValueGap } from "@/lib/trade/score"
import { simulateTrade, standingReports } from "@/lib/trade/simulateTrade"
import { buildPlayerValueMap } from "@/lib/trade/value"

type TradeSimulationProps = {
  state: SeasonLeagueState
  basis?: StatBasis
}

type PlayerOption = {
  id: string
  name: string
}

const toggleId = (ids: string[], id: string, max: number) => {
  if (ids.includes(id)) return ids.filter((existing) => existing !== id)
  if (ids.length >= max) return ids

  return [...ids, id]
}

const advantageLine = (
  yourName: string,
  theirName: string,
  sendIds: string[],
  receiveIds: string[],
  values: Map<string, number>,
) => {
  const give = sendIds.reduce((sum, id) => sum + (values.get(id) ?? 0), 0)
  const get = receiveIds.reduce((sum, id) => sum + (values.get(id) ?? 0), 0)
  const gap = evenValueGap(
    {
      shape: "2:2",
      counterpartyTeamIndex: 0,
      youPlayerIds: sendIds,
      themPlayerIds: receiveIds,
    },
    values,
  )

  return formatAdvantageLine(get > give ? yourName : theirName, gap)
}

export const TradeSimulation = ({ state, basis = "total" }: TradeSimulationProps) => {
  const [shape, setShape] = useState<SimShape>("2:2")
  const [teamIndex, setTeamIndex] = useState<number | null>(null)
  const [receiveIds, setReceiveIds] = useState<string[]>([])
  const [sendIds, setSendIds] = useState<string[]>([])
  const [dropId, setDropId] = useState<string | null>(null)
  const limits = shapeLimits(shape)
  const values = buildPlayerValueMap(state)

  const playerName = (playerId: string) =>
    state.players.find((player) => player.id === playerId)?.name ?? playerId
  const playersOf = (team: SeasonLeagueState["teams"][number] | undefined): PlayerOption[] =>
    (team?.entries ?? []).flatMap((entry) =>
      entry.slot !== "IL" && entry.playerId
        ? [{
          id: entry.playerId,
          name: playerName(entry.playerId),
          value: values.get(entry.playerId) ?? 0,
        }]
        : [],
    )

  const yourTeam = state.teams.find((team) => team.teamIndex === state.perspectiveTeamIndex)
  const otherTeams = state.teams.filter(
    (team) => team.teamIndex !== state.perspectiveTeamIndex,
  )
  const counterparty = otherTeams.find((team) => team.teamIndex === teamIndex)
  const yourPlayers = playersOf(yourTeam)
  const theirPlayers = playersOf(counterparty)
  const hasOpenSlot = (yourTeam?.entries ?? []).some(
    (entry) => entry.playerId === null && entry.slot !== "IL",
  )

  const needsDrop = (receiveCount: number, sendCount: number) =>
    receiveCount > sendCount && !hasOpenSlot
  const keepDrop = (nextReceive: string[], nextSend: string[]) =>
    dropId !== null
      && !nextSend.includes(dropId)
      && needsDrop(nextReceive.length, nextSend.length)
      ? dropId
      : null

  const dropRequired = needsDrop(receiveIds.length, sendIds.length)
  const dropOptions = yourPlayers.filter((player) => !sendIds.includes(player.id))
  const fills = teamIndex === null
    ? []
    : fairFills(shape, sendIds, receiveIds, yourPlayers, theirPlayers, values)
  const recommendation = formatFairFill(fills.map((player) => player.name))

  const handleShape = (next: SimShape) => {
    const nextLimits = shapeLimits(next)
    const nextSend = sendIds.slice(0, nextLimits.send)
    const nextReceive = receiveIds.slice(0, nextLimits.receive)
    setShape(next)
    setSendIds(nextSend)
    setReceiveIds(nextReceive)
    setDropId(keepDrop(nextReceive, nextSend))
  }
  const handleTeamSelect = (nextTeamIndex: number) => {
    setTeamIndex(nextTeamIndex)
    setReceiveIds([])
    setDropId(keepDrop([], sendIds))
  }
  const handleReceiveSelect = (playerId: string) => {
    const nextReceive = toggleId(receiveIds, playerId, limits.receive)
    setReceiveIds(nextReceive)
    setDropId(keepDrop(nextReceive, sendIds))
  }
  const handleSendSelect = (playerId: string) => {
    const nextSend = toggleId(sendIds, playerId, limits.send)
    setSendIds(nextSend)
    setDropId(keepDrop(receiveIds, nextSend))
  }
  const handleDropSelect = (playerId: string) => {
    setDropId(playerId === dropId ? null : playerId)
  }

  const receiveShort = limits.receive - receiveIds.length
  const sendShort = limits.send - sendIds.length
  const oneShort = receiveShort + sendShort === 1 && receiveShort >= 0 && sendShort >= 0
  const selectionPrompt = (() => {
    if (teamIndex === null) return null
    if (oneShort) {
      return recommendation ?? (receiveShort === 1 ? "Choose who to receive." : "Choose who to send.")
    }
    if (receiveIds.length === 0) return "Choose who to receive."
    if (sendIds.length === 0) return "Choose who to send."
    if (receiveShort > 0) return "Choose who to receive."
    if (sendShort > 0) return "Choose who to send."
    if (dropRequired && dropOptions.length === 0) return "Your roster cannot fit the extra player."
    if (dropRequired && dropId === null) return "Choose who to drop."
    return null
  })()
  const completedTrade = teamIndex !== null && selectionPrompt === null
    ? simulateTrade(state, {
      counterpartyTeamIndex: teamIndex,
      youPlayerIds: sendIds,
      themPlayerIds: receiveIds,
      yourDropPlayerId: dropId ?? undefined,
      basis,
    })
    : null
  const readyTrade = completedTrade?.status === "ready" ? completedTrade : null

  const standingColumns = () => {
    if (teamIndex === null) return null
    const standing = standingReports(state, teamIndex, basis)
    if (!standing) return null

    return (
      <div className="grid grid-cols-2 gap-3">
        <SideRankColumn report={standing.you} teamCount={state.teams.length} title={yourTeam?.name ?? "You"} />
        <SideRankColumn report={standing.them} teamCount={state.teams.length} title={counterparty?.name ?? "Them"} />
      </div>
    )
  }

  const renderResult = () => {
    if (teamIndex === null) return <p>Choose another team.</p>
    if (selectionPrompt) {
      return (
        <div className="flex flex-col gap-3">
          <p>{selectionPrompt}</p>
          {standingColumns()}
        </div>
      )
    }

    const result = completedTrade
    if (!result) return null
    if (result.status === "unfit") {
      return (
        <div className="flex flex-col gap-3">
          <p>{result.sentence}</p>
          {standingColumns()}
        </div>
      )
    }

    const valueLine = sendIds.length === receiveIds.length
      ? advantageLine(
        yourTeam?.name ?? "You",
        counterparty?.name ?? "Them",
        sendIds,
        receiveIds,
        values,
      )
      : result.valueLine

    return (
      <div className="flex flex-col gap-3">
        <p className="w-fit rounded-full border border-[var(--color-hairline)] px-3 py-1 text-sm font-semibold">
          {valueLine}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <SideRankColumn report={result.you} teamCount={state.teams.length} title={yourTeam?.name ?? "You"} />
          <SideRankColumn report={result.them} teamCount={state.teams.length} title={counterparty?.name ?? "Them"} />
        </div>
        {result.yourDroppedPlayerId ? (
          <p>{`Drops ${playerName(result.yourDroppedPlayerId)} to open a roster spot`}</p>
        ) : null}
        {result.replacementPlayerId ? (
          <p>
            {result.replacementTeamIndex === state.perspectiveTeamIndex
              ? `Ranks include ${playerName(result.replacementPlayerId)}, the top waiver add.`
              : `Their ranks include ${playerName(result.replacementPlayerId)}, the top waiver add.`}
          </p>
        ) : null}
        {result.theirDroppedPlayerId ? (
          <p>{`They drop ${playerName(result.theirDroppedPlayerId)} to open a roster spot`}</p>
        ) : null}
        {result.ruleSentence ? <p>{result.ruleSentence}</p> : null}
      </div>
    )
  }

  const yourRoster = (
    <SimulationRoster
      dropId={dropId}
      droppableIds={dropRequired && sendIds.length > 0 ? dropOptions.map((player) => player.id) : []}
      label={yourTeam?.name ?? "You"}
      onDrop={handleDropSelect}
      onPress={handleSendSelect}
      players={yourPlayers}
      pressedIds={sendIds}
    />
  )
  const theirRoster = (
    <SimulationRoster
      label={counterparty?.name ?? "Other team"}
      onPress={handleReceiveSelect}
      onTeamChange={handleTeamSelect}
      players={theirPlayers}
      pressedIds={receiveIds}
      teamIndex={teamIndex}
      teamOptions={otherTeams.map((team) => ({ teamIndex: team.teamIndex, name: team.name }))}
    />
  )

  return (
    <div className="flex flex-col gap-3">
      <div aria-label="Trade shape" className="flex flex-wrap gap-2" role="group">
        {TRADE_SHAPES.map((option) => (
          <button
            aria-pressed={shape === option}
            className={`shrink-0 rounded border px-3 py-1 text-sm ${shape === option ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-[var(--color-hairline)]"}`}
            key={option}
            onClick={() => handleShape(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-4">
        <div className="grid grid-cols-2 items-start gap-3">
          {yourRoster}
          {theirRoster}
        </div>
        <div className="min-w-0">
          {renderResult()}
        </div>
      </div>
      {readyTrade && teamIndex !== null ? (
        <TradePackageStats
          basis={basis}
          state={state}
          suggestion={{
            counterpartyTeamIndex: teamIndex,
            givePlayerIds: sendIds,
            getPlayerIds: receiveIds,
            droppedPlayerId: readyTrade.yourDroppedPlayerId ?? readyTrade.theirDroppedPlayerId,
            addedPlayerId: readyTrade.replacementTeamIndex === state.perspectiveTeamIndex
              ? readyTrade.replacementPlayerId
              : undefined,
          }}
        />
      ) : null}
    </div>
  )
}
