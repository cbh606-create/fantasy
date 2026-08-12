export type EspnCookies = {
  espnS2: string
  swid: string
}

const stripWrappingQuotes = (value: string): string => {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export const normalizeEspnS2 = (value: string): string => {
  let next = stripWrappingQuotes(value)
  if (!next) return ""

  // Browser cookie tables often show percent-encoded values.
  if (next.includes("%")) {
    try {
      const decoded = decodeURIComponent(next)
      if (decoded) next = decoded
    } catch {
      // keep original
    }
  }

  return next
}

export const normalizeSwid = (value: string): string => {
  let trimmed = stripWrappingQuotes(value)
  if (!trimmed) return ""

  if (trimmed.includes("%")) {
    try {
      trimmed = decodeURIComponent(trimmed)
    } catch {
      // keep original
    }
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  return `{${trimmed}}`
}

export const normalizeEspnCookies = (input: {
  espnS2: string
  swid: string
}): EspnCookies | null => {
  const espnS2 = normalizeEspnS2(input.espnS2)
  const swid = normalizeSwid(input.swid)

  if (!espnS2 || !swid || swid === "{}") return null

  return { espnS2, swid }
}

export const readEnvEspnCookies = (): EspnCookies | null =>
  normalizeEspnCookies({
    espnS2: process.env.ESPN_S2 ?? "",
    swid: process.env.ESPN_SWID ?? "",
  })
