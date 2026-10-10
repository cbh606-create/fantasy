"use client"

import { useState } from "react"
import { RankNonagon } from "@/components/trade/RankNonagon"
import { SimulationRoster } from "@/components/trade/SimulationRoster"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import type { SeasonLeagueState } from "@/lib/season/types"
import { formatTotal } from "@/lib/trade/offerCopy"
import { simulateTrade, type SideRankReport } from "@/lib/trade/simulateTrade"

type TradeSimulationProps = {
  state: SeasonLeagueState
}

type PlayerOption = {
  id: string
  name: string
}

const MAX_PACKAGE_SIZE = 2

const toggleId = (ids: string[], id: string) => {
  if (ids.includes(id)) return ids.filter((existing) => existing !== id)
  if (ids.length >= MAX_PACKAGE_SIZE) return ids

  return [...ids, id]
}

const rankText = (rankBefore: number, rankAfter: number) =>
  `#${rankBefore} → #${rankAfter}`

type SideColumnProps = {
  title: string
  report: SideRankReport
  teamCount: number
}

const SideColumn = ({ title, report, teamCount }: SideColumnProps) => (
  <section aria-label={title} className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    <p>
      {`Overall ${rankText(report.overallBefore, report.overallAfter)} (rank sum ${report.rankSumBefore} → ${report.rankSumAfter})`}
    </p>
    <RankNonagon
      categories={report.categories.map((category) => ({
        label: CATEGORY_SHORT_LABELS[category.categoryId],
        rankBefore: category.rankBefore,
        rankAfter: category.rankAfter,
      }))}
      teamCount={teamCount}
    />
    <ul className="flex flex-col gap-1 text-sm">
      {report.categories.map((category) => (
        <li className="flex justify-between gap-2" key={category.categoryId}>
          <span>{CATEGORY_SHORT_LABELS[category.categoryId]}</span>
          <span>
            {`${formatTotal(category.categoryId, category.beforeTotal)} → ${formatTotal(category.categoryId, category.afterTotal)}`}
          </span>
          <span>{rankText(category.rankBefore, category.rankAfter)}</span>
        </li>
      ))}
    </ul>
  </section>
)

export const TradeSimulation = ({ state }: TradeSimulationProps) => {
  const [teamIndex, setTeamIndex] = useState<number | null>(null)
  const [receiveIds, setReceiveIds] = useState<string[]>([])
  const [sendIds, setSendIds] = useState<string[]>([])
  const [dropId, setDropId] = useState<string | null>(null)

  const playerName = (playerId: string) =>
    state.players.find((player) => player.id === playerId)?.name ?? playerId
  const playersOf = (team: SeasonLeagueState["teams"][number] | undefined): PlayerOption[] =>
    (team?.entries ?? []).flatMap((entry) =>
      entry.slot !== "IL" && entry.playerId
        ? [{ id: entry.playerId, name: playerName(entry.playerId) }]
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

  const handleTeamSelect = (nextTeamIndex: number) => {
    setTeamIndex(nextTeamIndex)
    setReceiveIds([])
    setDropId(keepDrop([], sendIds))
  }
  const handleReceiveSelect = (playerId: string) => {
    const nextReceive = toggleId(receiveIds, playerId)
    setReceiveIds(nextReceive)
    setDropId(keepDrop(nextReceive, sendIds))
  }
  const handleSendSelect = (playerId: string) => {
    const nextSend = toggleId(sendIds, playerId)
    setSendIds(nextSend)
    setDropId(keepDrop(receiveIds, nextSend))
  }
  const handleDropSelect = (playerId: string) => {
    setDropId(playerId === dropId ? null : playerId)
  }

  const renderResult = () => {
    if (teamIndex === null) return <p>Choose another team.</p>
    if (receiveIds.length === 0) return <p>Choose who to receive.</p>
    if (sendIds.length === 0) return <p>Choose who to send.</p>
    if (dropRequired && dropOptions.length === 0) {
      return <p>Your roster cannot fit the extra player.</p>
    }
    if (dropRequired && dropId === null) return <p>Choose who to drop.</p>

    const result = simulateTrade(state, {
      counterpartyTeamIndex: teamIndex,
      youPlayerIds: sendIds,
      themPlayerIds: receiveIds,
      yourDropPlayerId: dropId ?? undefined,
    })
    if (!result) return null
    if (result.status === "unfit") return <p>{result.sentence}</p>

    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <SideColumn report={result.you} teamCount={state.teams.length} title={yourTeam?.name ?? "You"} />
          <SideColumn report={result.them} teamCount={state.teams.length} title={counterparty?.name ?? "Them"} />
        </div>
        <p>{result.valueLine}</p>
        {result.yourDroppedPlayerId ? (
          <p>{`Drops ${playerName(result.yourDroppedPlayerId)} to open a roster spot`}</p>
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
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 overflow-hidden">
      <div className="grid min-h-0 grid-cols-2 gap-3 overflow-hidden">
        {yourRoster}
        {theirRoster}
      </div>
      <div className="min-h-0 overflow-y-auto">
        {renderResult()}
      </div>
    </div>
  )
}
