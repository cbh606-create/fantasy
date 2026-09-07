import { applyAging } from "@/lib/projections/aging"
import { findBox } from "@/lib/projections/baseline"
import { compose } from "@/lib/projections/compose"
import { clampGames, gamesPrior } from "@/lib/projections/games"
import { allocateMinutes, rotationWidth } from "@/lib/projections/minutes"
import { primaryBucket } from "@/lib/projections/position"
import { rateFromBox } from "@/lib/projections/rates"
import { positionMeans, regressRates, regressUsg } from "@/lib/projections/regress"
import { rookiePlayingTime, rookieRates } from "@/lib/projections/rookies"
import { allocateUsage } from "@/lib/projections/usage"
import type {
  NbaPosition,
  PlayerProjection,
  Rates,
  RookiePrior,
  RosterSnapshot,
  SeasonBox
} from "@/lib/projections/types"

type PlayerPrior = {
  playerId: string
  name: string
  positions: NbaPosition[]
  rates: Rates
  priorMpg: number
  priorUsg: number
  lastGp: number
  source: PlayerProjection["source"]
}

const shootingPct = (makes: number, attempts: number) =>
  attempts === 0 ? 0 : makes / attempts

const synthesizeRookie = (playerId: string, positions: NbaPosition[]): RookiePrior => ({
  playerId,
  name: playerId,
  positions,
  age: 0,
  draftSlot: null
})

export const projectSeason = (
  boxes: SeasonBox[],
  rosters: RosterSnapshot[],
  rookies: RookiePrior[]
): PlayerProjection[] => {
  const means = positionMeans(boxes)
  const rookieById = new Map(rookies.map((rookie) => [rookie.playerId, rookie]))
  const out: PlayerProjection[] = []

  for (const roster of rosters) {
    if (roster.players.length === 0) continue

    const priors: PlayerPrior[] = roster.players.map((player) => {
      const bucket = primaryBucket(player.positions)
      const mean = means[bucket]
      const box = findBox(boxes, player.playerId)

      if (box) {
        const rates = applyAging(
          regressRates(rateFromBox(box), mean.rates, box.gp),
          box.age,
          bucket
        )
        return {
          playerId: player.playerId,
          name: box.name,
          positions: player.positions,
          rates,
          priorMpg: box.mpg,
          priorUsg: regressUsg(box.usg, mean.usg, box.gp),
          lastGp: box.gp,
          source: "model"
        }
      }

      const prior = rookieById.get(player.playerId) ?? synthesizeRookie(player.playerId, player.positions)
      const playing = rookiePlayingTime(prior.draftSlot)
      const regressionGp = prior.rates ? 15 : 0
      const rates = applyAging(
        regressRates(rookieRates(prior, mean.rates), mean.rates, regressionGp),
        prior.age,
        bucket
      )
      return {
        playerId: player.playerId,
        name: prior.name,
        positions: player.positions,
        rates,
        priorMpg: playing.mpg,
        priorUsg: playing.usg,
        lastGp: playing.gp,
        source: "rookie_prior"
      }
    })

    const rotationN = rotationWidth(boxes, roster.teamId, roster.players.length)
    const mpgById = allocateMinutes(
      priors.map((prior) => ({
        playerId: prior.playerId,
        positions: prior.positions,
        priorMpg: prior.priorMpg
      })),
      roster,
      rotationN
    )
    const { usg: usgById } = allocateUsage(
      priors.map((prior) => ({
        playerId: prior.playerId,
        positions: prior.positions,
        mpg: mpgById.get(prior.playerId) ?? 0,
        priorUsg: prior.priorUsg,
        priorMpg: prior.priorMpg
      })),
      roster
    )

    const pace = roster.pace ?? 100
    for (const prior of priors) {
      const mean = means[primaryBucket(prior.positions)]
      const mpg = mpgById.get(prior.playerId) ?? 0
      const usg = usgById.get(prior.playerId) ?? prior.priorUsg
      const composed = compose({
        rates: prior.rates,
        mpg,
        allocatedUsg: usg,
        baselineUsg: prior.priorUsg,
        pace,
        positionMeanFg: shootingPct(mean.rates.shooting.FGM, mean.rates.shooting.FGA),
        positionMeanFt: shootingPct(mean.rates.shooting.FTM, mean.rates.shooting.FTA)
      })
      out.push({
        playerId: prior.playerId,
        name: prior.name,
        season: roster.season,
        teamId: roster.teamId,
        positions: prior.positions,
        mpg,
        gp: prior.source === "rookie_prior" ? clampGames(prior.lastGp) : gamesPrior(prior.lastGp, mean.gp),
        usg,
        rates: prior.rates,
        projections: composed.projections,
        shooting: composed.shooting,
        source: prior.source,
        agingApplied: false
      })
    }
  }

  return out
}
