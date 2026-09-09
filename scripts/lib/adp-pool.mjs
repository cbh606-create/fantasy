export const DEFAULT_ADP_SOURCE = "yahoo_draft_analysis_rank"

export const ADP_SOURCE_IDS = [
  "yahoo_draft_analysis_rank",
  "fantasypros_yahoo",
  "espn_article_h2h_points",
]

export const SOURCE_META = {
  yahoo_draft_analysis_rank: {
    label: "Yahoo Rank",
    url: "https://basketball.fantasysports.yahoo.com/nba/draftanalysis?type=standard",
  },
  fantasypros_yahoo: {
    label: "FantasyPros Yahoo",
    url: "https://www.fantasypros.com/nba/adp/overall.php",
  },
  espn_article_h2h_points: {
    label: "ESPN ADP",
    url: "https://fantasy.espn.com/basketball/",
  },
}

export const normalizeName = (name) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/['’]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

export const applySourceRanks = (pool, sourceId, rows, extraMeta = {}) => {
  const byKey = new Map()
  for (const row of rows) {
    const key = normalizeName(row.name)
    if (!byKey.has(key)) byKey.set(key, row.adp)
  }

  let matched = 0
  let unmatched = 0
  const players = pool.players.map((player) => {
    const value = byKey.get(normalizeName(player.name))
    if (value === undefined) {
      unmatched += 1
      return player
    }
    matched += 1
    return {
      ...player,
      adpBySource: {
        ...(player.adpBySource ?? {}),
        [sourceId]: value,
      },
    }
  })

  const adpSources = {
    ...(pool.meta?.adpSources ?? {}),
    [sourceId]: {
      id: sourceId,
      label: SOURCE_META[sourceId]?.label ?? sourceId,
      url: extraMeta.url ?? SOURCE_META[sourceId]?.url ?? null,
      updatedAt: new Date().toISOString(),
      matched,
      unmatched,
      rowCount: rows.length,
    },
  }

  return {
    pool: {
      ...pool,
      meta: {
        ...pool.meta,
        adpSources,
      },
      players,
    },
    matched,
    unmatched,
  }
}

export const projectPrimary = (pool, sourceId = DEFAULT_ADP_SOURCE) => {
  const players = pool.players
    .map((player) => {
      const fromSource = player.adpBySource?.[sourceId]
      const adp =
        typeof fromSource === "number" && Number.isFinite(fromSource) && fromSource > 0
          ? fromSource
          : player.adp
      return { ...player, adp }
    })
    .sort((a, b) => a.adp - b.adp || String(a.id).localeCompare(String(b.id)))

  const sourceMeta = pool.meta?.adpSources?.[sourceId]
  return {
    ...pool,
    meta: {
      ...pool.meta,
      adpPrimaryDefault: sourceId,
      adpSource: sourceId,
      adpSourceUrl: sourceMeta?.url ?? SOURCE_META[sourceId]?.url ?? null,
      adpUpdatedAt: new Date().toISOString(),
      count: players.length,
    },
    players,
  }
}
