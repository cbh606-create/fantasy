export type EspnCookies = {
  espnS2: string
  swid: string
}

export const normalizeSwid = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  return `{${trimmed}}`
}

export const normalizeEspnCookies = (input: {
  espnS2: string
  swid: string
}): EspnCookies | null => {
  const espnS2 = input.espnS2.trim()
  const swid = normalizeSwid(input.swid)

  if (!espnS2 || !swid || swid === "{}") return null

  return { espnS2, swid }
}

export const readEnvEspnCookies = (): EspnCookies | null =>
  normalizeEspnCookies({
    espnS2: process.env.ESPN_S2 ?? "",
    swid: process.env.ESPN_SWID ?? "",
  })
