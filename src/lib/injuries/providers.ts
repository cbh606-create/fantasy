import depthChartFixture from "../../../data/fixtures/nba-depth-chart.json"
import injuryEventsFixture from "../../../data/fixtures/injury-events.json"
import type {
  DepthChartFixture,
  InjuryEvent,
  InjuryEventsFixture,
} from "./types"

export type DepthChartProvider = {
  backups: (teamAbbr: string, injuredPlayerId: string) => string[]
}

export type InjuryEventProvider = {
  list: () => InjuryEvent[]
}

const depthChart = depthChartFixture as DepthChartFixture
const injuryEvents = injuryEventsFixture as InjuryEventsFixture

export const fixtureDepthChartProvider: DepthChartProvider = {
  backups: (teamAbbr, injuredPlayerId) => {
    const team = depthChart.teams.find((entry) => entry.teamAbbr === teamAbbr)
    if (!team) {
      return []
    }

    for (const slot of team.slots) {
      const injuredIndex = slot.playerIds.indexOf(injuredPlayerId)
      if (injuredIndex === -1) {
        continue
      }

      return slot.playerIds.slice(injuredIndex + 1)
    }

    return []
  },
}

export const fixtureInjuryEventProvider: InjuryEventProvider = {
  list: () => injuryEvents.events,
}
