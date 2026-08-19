"use client"

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useActiveSeasonLeague } from "@/components/season/ActiveSeasonLeagueProvider"
import { FieldHelpTip } from "@/components/ui/FieldHelpTip"
import {
  espnLinkStatusLabel,
  espnLinkStatusTone,
  type EspnLinkStatus,
} from "@/lib/espn/linkStatus"

type SeasonLeagueListItem = {
  id: string
  name: string
  season: number
  source: "espn" | "manual" | "mixed"
  updatedAt: string
}

type VerifyPayload = {
  ok?: boolean
  leagueName?: string
  teamName?: string
  playerCount?: number
  message?: string
  errorCode?: string
}

export default function RosterListPage() {
  const { activeId, leagues: activeSeasonLeagues } = useActiveSeasonLeague()
  const [leagues, setLeagues] = useState<SeasonLeagueListItem[]>([])
  const [name, setName] = useState("")
  const [espnName, setEspnName] = useState("")
  const [leagueId, setLeagueId] = useState("120853513")
  const [teamId, setTeamId] = useState("9")
  const [season, setSeason] = useState("2026")
  const [espnS2, setEspnS2] = useState("")
  const [swid, setSwid] = useState("")
  const [espnConnected, setEspnConnected] = useState(false)
  const [espnLinkStatus, setEspnLinkStatus] = useState<EspnLinkStatus>("none")
  const [verifiedSummary, setVerifiedSummary] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [connectMessage, setConnectMessage] = useState("")
  const [connectTone, setConnectTone] = useState<"mute" | "ok" | "bad">("mute")
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isSavingEspn, setIsSavingEspn] = useState(false)
  const [isStartingEspnConnect, setIsStartingEspnConnect] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const activeLeague = activeSeasonLeagues.find(
    (league) => league.id === activeId,
  )

  const parseLeagueParams = useCallback(() => {
    const parsedTeamId = Number.parseInt(teamId, 10)
    const parsedSeason = Number.parseInt(season, 10)

    if (
      !leagueId.trim() ||
      !Number.isInteger(parsedTeamId) ||
      !Number.isInteger(parsedSeason)
    ) {
      return null
    }

    return {
      leagueId: leagueId.trim(),
      teamId: parsedTeamId,
      season: parsedSeason,
    }
  }, [leagueId, season, teamId])

  const verifyEspnAccess = useCallback(async (): Promise<{
    ok: boolean
    authFailed: boolean
    message: string
    summary: string
  }> => {
    const params = parseLeagueParams()
    if (!params) {
      return {
        ok: false,
        authFailed: false,
        message:
          "Cookies are saved. Fill League ID / Team ID / Season to verify ESPN access.",
        summary: "",
      }
    }

    const verifyResponse = await fetch("/api/espn/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    })
    const verifyPayload = (await verifyResponse.json()) as VerifyPayload
    const authFailed =
      verifyPayload.errorCode === "ESPN_AUTH" ||
      verifyResponse.status === 401 ||
      verifyResponse.status === 403

    if (!verifyResponse.ok || !verifyPayload.ok) {
      return {
        ok: false,
        authFailed,
        message:
          verifyPayload.message ??
          "ESPN rejected these cookies for this league. Paste fresh espn_s2 / SWID.",
        summary: "",
      }
    }

    const summary = [
      verifyPayload.leagueName,
      verifyPayload.teamName,
      verifyPayload.playerCount != null
        ? `${verifyPayload.playerCount} players`
        : null,
    ]
      .filter(Boolean)
      .join(" · ")

    return {
      ok: true,
      authFailed: false,
      message: summary ? `ESPN OK — ${summary}` : "ESPN OK",
      summary,
    }
  }, [parseLeagueParams])

  useEffect(() => {
    const controller = new AbortController()

    const loadPage = async () => {
      try {
        const [leaguesResponse, credentialsResponse] = await Promise.all([
          fetch("/api/season-leagues", { signal: controller.signal }),
          fetch("/api/espn/credentials", { signal: controller.signal }),
        ])

        if (leaguesResponse.status === 401 || credentialsResponse.status === 401) {
          setConnectTone("bad")
          setConnectMessage(
            "앱 로그인이 필요합니다. 상단에서 Sign in 한 뒤 ESPN 쿠키를 저장하세요.",
          )
          setEspnLinkStatus("none")
          return
        }

        if (!leaguesResponse.ok) throw new Error("Unable to load season leagues")
        setLeagues((await leaguesResponse.json()) as SeasonLeagueListItem[])

        if (credentialsResponse.ok) {
          const credentials = (await credentialsResponse.json()) as {
            connected?: boolean
            status?: "none" | "saved"
          }
          const connected = Boolean(credentials.connected)
          setEspnConnected(connected)

          if (!connected) {
            setEspnLinkStatus("none")
            return
          }

          setEspnLinkStatus("checking")
          const verified = await verifyEspnAccess()
          if (controller.signal.aborted) return

          if (verified.ok) {
            setEspnLinkStatus("verified")
            setVerifiedSummary(verified.summary)
            setConnectTone("ok")
            setConnectMessage(verified.message)
            return
          }

          if (verified.authFailed) {
            setEspnLinkStatus("expired")
            setConnectTone("bad")
            setConnectMessage(verified.message)
            return
          }

          setEspnLinkStatus("saved")
          setConnectTone("mute")
          setConnectMessage(verified.message)
        }
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return
        }
        setEspnLinkStatus((current) =>
          current === "checking" ? "saved" : current,
        )
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load season leagues",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadPage()

    return () => controller.abort()
    // Mount-only: re-check happens on Save / Import / Verify button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleVerifyEspn = async () => {
    if (!espnConnected) return
    setError("")
    setConnectMessage("")
    setEspnLinkStatus("checking")
    setConnectTone("mute")
    setConnectMessage("Checking ESPN…")

    try {
      const verified = await verifyEspnAccess()
      if (verified.ok) {
        setEspnLinkStatus("verified")
        setVerifiedSummary(verified.summary)
        setConnectTone("ok")
        setConnectMessage(verified.message)
        return
      }
      setEspnLinkStatus(verified.authFailed ? "expired" : "saved")
      setVerifiedSummary("")
      setConnectTone("bad")
      setConnectMessage(verified.message)
    } catch (requestError) {
      setEspnLinkStatus("saved")
      setConnectTone("bad")
      setConnectMessage(
        requestError instanceof Error
          ? requestError.message
          : "Unable to verify ESPN",
      )
    }
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return

    setError("")
    setSuccessMessage("")
    setIsCreating(true)

    try {
      const response = await fetch("/api/season-leagues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), manual: true }),
      })
      if (!response.ok) throw new Error("Unable to create season league")

      const league = (await response.json()) as SeasonLeagueListItem
      window.location.assign(`/roster/${league.id}`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create season league",
      )
    } finally {
      setIsCreating(false)
    }
  }

  const importEspnLeague = async (): Promise<string> => {
    const params = parseLeagueParams()
    if (!params) {
      throw new Error("Enter leagueId, teamId, and season")
    }

    const response = await fetch("/api/espn/season-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: espnName.trim() || undefined,
        leagueId: params.leagueId,
        teamId: params.teamId,
        season: params.season,
      }),
    })

    const payload = (await response.json()) as {
      id?: string
      error?: string
      errorCode?: string
      message?: string
    }

    if (!response.ok) {
      if (payload.errorCode === "ESPN_AUTH") {
        setEspnLinkStatus("expired")
        throw new Error(
          payload.message ??
            "ESPN auth failed — reconnect with fresh espn_s2 / SWID cookies",
        )
      }
      if (payload.message) throw new Error(payload.message)
      throw new Error(
        payload.errorCode ?? payload.error ?? "Unable to import ESPN league",
      )
    }

    if (!payload.id) throw new Error("Unable to import ESPN league")
    return payload.id
  }

  const handleConnectEspn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccessMessage("")
    setConnectMessage("")
    setConnectTone("mute")
    setVerifiedSummary("")

    if (!espnS2.trim() || !swid.trim()) {
      setConnectTone("bad")
      setConnectMessage("espn_s2와 SWID를 둘 다 붙여넣은 뒤 다시 Save를 눌러주세요.")
      return
    }

    setIsSavingEspn(true)
    setEspnLinkStatus("checking")
    setConnectTone("mute")
    setConnectMessage("Saving cookies…")

    try {
      const response = await fetch("/api/espn/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ espnS2, swid }),
      })

      if (response.status === 401) {
        throw new Error("로그인이 필요합니다. 먼저 앱에 로그인한 뒤 다시 시도하세요.")
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string
          message?: string
        } | null
        if (payload?.error === "validation") {
          throw new Error(
            "쿠키 형식이 올바르지 않습니다. Value만 다시 복사해 붙여넣으세요.",
          )
        }
        throw new Error(
          payload?.message ?? `쿠키 저장 실패 (HTTP ${response.status})`,
        )
      }

      setEspnConnected(true)
      setEspnS2("")
      setSwid("")
      setEspnLinkStatus("saved")
      setConnectMessage("Cookies saved. Checking league access…")

      const verified = await verifyEspnAccess()
      if (!verified.ok) {
        if (verified.authFailed) {
          setEspnLinkStatus("expired")
        } else {
          setEspnLinkStatus("saved")
        }
        setConnectTone("bad")
        setConnectMessage(verified.message)
        return
      }

      setEspnLinkStatus("verified")
      setVerifiedSummary(verified.summary)
      setConnectTone("ok")
      setConnectMessage(`${verified.message} · importing roster…`)

      const importedId = await importEspnLeague()
      setConnectMessage("Opening roster…")
      window.location.assign(`/roster/${importedId}`)
    } catch (requestError) {
      setConnectTone("bad")
      setConnectMessage(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save ESPN cookies",
      )
    } finally {
      setIsSavingEspn(false)
    }
  }

  const handleStartEspnConnect = async () => {
    setError("")
    setSuccessMessage("")
    setConnectMessage("")
    setConnectTone("mute")
    setIsStartingEspnConnect(true)

    try {
      const response = await fetch("/api/espn/connect/start", { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as {
        statusPagePath?: string
      }

      if (response.status === 401) {
        throw new Error("Sign in to the app before connecting ESPN.")
      }
      if (response.status === 409) {
        throw new Error(
          "An ESPN connection is already in progress. Open its waiting page or wait for it to time out.",
        )
      }
      if (!response.ok || !payload.statusPagePath) {
        throw new Error("Unable to start the ESPN connection.")
      }

      window.location.assign(payload.statusPagePath)
    } catch (requestError) {
      setConnectTone("bad")
      setConnectMessage(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start the ESPN connection.",
      )
      setIsStartingEspnConnect(false)
    }
  }

  const handleDisconnectEspn = async () => {
    setError("")
    setSuccessMessage("")
    setIsSavingEspn(true)

    try {
      const response = await fetch("/api/espn/credentials", {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Unable to disconnect ESPN")
      setEspnConnected(false)
      setEspnLinkStatus("none")
      setVerifiedSummary("")
      setConnectMessage("")
      setConnectTone("mute")
      setSuccessMessage("ESPN disconnected")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to disconnect ESPN",
      )
    } finally {
      setIsSavingEspn(false)
    }
  }

  const handleImportEspn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccessMessage("")

    if (!espnConnected) {
      setError("Save ESPN cookies above first, then import your league.")
      return
    }

    if (espnLinkStatus === "expired") {
      setError(
        "Your ESPN connection expired. Reconnect with ESPN above, then try importing again.",
      )
      return
    }

    if (isSavingEspn) {
      setError("Still saving ESPN cookies — wait a moment, then try again.")
      return
    }

    setIsImporting(true)

    try {
      setEspnLinkStatus("checking")
      const verified = await verifyEspnAccess()
      if (!verified.ok) {
        setEspnLinkStatus(verified.authFailed ? "expired" : "saved")
        setVerifiedSummary("")
        throw new Error(verified.message)
      }
      setEspnLinkStatus("verified")
      setVerifiedSummary(verified.summary)

      const importedId = await importEspnLeague()
      window.location.assign(`/roster/${importedId}`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to import ESPN league",
      )
      setEspnLinkStatus((current) =>
        current === "checking" ? "saved" : current,
      )
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="text-sm text-[var(--color-mute)]">Season analysis</p>
          <h1 className="mt-1 font-[family-name:var(--font-bebas-neue)] text-5xl tracking-tight uppercase sm:text-7xl">
            Rosters
          </h1>
          {activeLeague ? (
            <Link
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-ink)] underline underline-offset-4 transition-colors hover:text-[var(--color-info)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
              href={`/roster/${activeLeague.id}`}
            >
              Open {activeLeague.name}
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
          {isLoading ? (
            <p className="mt-8 text-[var(--color-mute)]" role="status">
              Loading season leagues…
            </p>
          ) : leagues.length ? (
            <ul className="mt-8 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]">
              {leagues.map((league) => (
                <li key={league.id}>
                  <Link
                    className="flex items-center justify-between gap-4 py-5 transition-colors hover:text-[var(--color-info)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
                    href={`/roster/${league.id}`}
                  >
                    <span>
                      <span className="block text-lg font-medium">
                        {league.name}
                      </span>
                      <span className="mt-1 block text-sm text-[var(--color-mute)]">
                        {league.season} · {league.source}
                      </span>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-[var(--color-mute)]">
              No season leagues yet. Connect ESPN, then import your league.
            </p>
          )}
        </div>

        <div className="space-y-6">
          <aside className="h-fit rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              ESPN connect
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Connect your account</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">
              We open a short-lived browser session for you to sign in to ESPN,
              then capture the espn_s2 and SWID session cookies. We store them
              on our server only for league sync. Treat this like granting read
              access to your ESPN league.
            </p>
            <button
              className="mt-5 w-full rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isStartingEspnConnect}
              onClick={() => void handleStartEspnConnect()}
              type="button"
            >
              {isStartingEspnConnect ? "Opening ESPN…" : "Connect with ESPN"}
            </button>
            {connectMessage ? (
              <p
                className={`mt-3 text-sm ${
                  connectTone === "ok"
                    ? "text-[var(--color-info)]"
                    : connectTone === "bad"
                      ? "text-[var(--color-sale)]"
                      : "text-[var(--color-mute)]"
                }`}
                role="status"
              >
                {connectMessage}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-medium">
              Status:{" "}
              <span
                className={
                  espnLinkStatusTone(espnLinkStatus) === "ok"
                    ? "text-[var(--color-info)]"
                    : espnLinkStatusTone(espnLinkStatus) === "bad"
                      ? "text-[var(--color-sale)]"
                      : "text-[var(--color-mute)]"
                }
              >
                {espnLinkStatusLabel(espnLinkStatus)}
              </span>
            </p>
            {verifiedSummary && espnLinkStatus === "verified" ? (
              <p className="mt-1 text-xs text-[var(--color-mute)]">
                {verifiedSummary}
              </p>
            ) : null}
            {espnLinkStatus === "expired" ? (
              <div
                className="mt-3 rounded-xl border border-[var(--color-sale)]/30 bg-red-50 p-3"
                role="alert"
              >
                <p className="text-sm text-[var(--color-sale)]">
                  Your ESPN connection expired. Reconnect through the ESPN login
                  window, then try importing again.
                </p>
                <button
                  className="mt-3 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isStartingEspnConnect}
                  onClick={() => void handleStartEspnConnect()}
                  type="button"
                >
                  {isStartingEspnConnect ? "Opening ESPN…" : "Reconnect with ESPN"}
                </button>
              </div>
            ) : null}
            <details className="mt-4 rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-[var(--color-ink)]">
                Paste cookies instead
              </summary>
              <details className="mt-3 rounded-xl border border-[var(--color-hairline)] px-3 py-2">
                <summary className="cursor-pointer font-medium text-[var(--color-ink)]">
                  How to copy espn_s2 and SWID
                </summary>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[0.8125rem] leading-5 text-[var(--color-mute)]">
                  <li>
                    Chrome/Edge에서{" "}
                    <a
                      className="underline underline-offset-2 hover:text-[var(--color-ink)]"
                      href="https://fantasy.espn.com"
                      rel="noreferrer"
                      target="_blank"
                    >
                      fantasy.espn.com
                    </a>
                    에 로그인합니다.
                  </li>
                  <li>본인 팀 페이지를 연 뒤 F12(또는 우클릭 → 검사)로 DevTools를 엽니다.</li>
                  <li>
                    상단 <span className="text-[var(--color-ink)]">Application</span>
                    (애플리케이션) 탭 → 왼쪽 Storage → Cookies →{" "}
                    <span className="text-[var(--color-ink)]">https://fantasy.espn.com</span>
                    을 선택합니다.
                  </li>
                  <li>
                    목록에서 <span className="text-[var(--color-ink)]">espn_s2</span>,{" "}
                    <span className="text-[var(--color-ink)]">SWID</span>를 찾아 Value를
                    더블클릭 → 복사합니다.
                  </li>
                  <li>아래에 붙여넣고 Save합니다. 쿠키가 만료되면 같은 방법으로 다시 연결하세요.</li>
                </ol>
              </details>
              <form className="mt-5 space-y-3" onSubmit={handleConnectEspn}>
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium" htmlFor="espn-s2">
                  espn_s2
                </label>
                <FieldHelpTip label="espn_s2">
                  <p className="font-medium">espn_s2 찾는 법</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-3.5 text-[var(--color-mute)]">
                    <li>fantasy.espn.com 로그인</li>
                    <li>F12 → Application → Cookies → fantasy.espn.com</li>
                    <li>
                      Name이 <span className="text-[var(--color-ink)]">espn_s2</span>인
                      행의 Value 복사
                    </li>
                    <li>아주 긴 문자열(보통 AE로 시작). 앞뒤 따옴표/공백 없이 붙여넣기</li>
                  </ol>
                </FieldHelpTip>
              </div>
              <input
                autoComplete="off"
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5 font-mono text-xs"
                id="espn-s2"
                onChange={(event) => setEspnS2(event.target.value)}
                placeholder="Paste espn_s2 cookie"
                spellCheck={false}
                type="text"
                value={espnS2}
              />
              <p className="text-[0.7rem] text-[var(--color-mute)]">
                pasted length: {espnS2.trim().length}
              </p>
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium" htmlFor="espn-swid">
                  SWID
                </label>
                <FieldHelpTip label="SWID">
                  <p className="font-medium">SWID 찾는 법</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-3.5 text-[var(--color-mute)]">
                    <li>같은 Cookies 목록에서 Name이 SWID인 행을 찾습니다</li>
                    <li>
                      Value는{" "}
                      <span className="text-[var(--color-ink)]">
                        {"{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"}
                      </span>{" "}
                      형태입니다
                    </li>
                    <li>중괄호 {"{}"} 포함해서 복사해도 되고, 없이 복사해도 됩니다</li>
                  </ol>
                </FieldHelpTip>
              </div>
              <input
                autoComplete="off"
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5 font-mono text-xs"
                id="espn-swid"
                onChange={(event) => setSwid(event.target.value)}
                placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                spellCheck={false}
                type="text"
                value={swid}
              />
              <p className="text-[0.7rem] text-[var(--color-mute)]">
                pasted length: {swid.trim().length}
              </p>
              <button
                className="w-full rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSavingEspn}
                type="submit"
              >
                {isSavingEspn
                  ? "Saving & verifying…"
                  : espnConnected
                    ? "Update cookies & verify"
                    : "Save cookies & verify"}
              </button>
                <p className="text-[0.75rem] text-[var(--color-mute)]">
                  쿠키 저장 후 ESPN 검증이 되면 로스터로 이동합니다. 페이지를 열 때도
                  저장된 쿠키를 다시 검증합니다.
                </p>
              </form>
            </details>
            {espnConnected ? (
              <div className="mt-3 space-y-2">
                <button
                  className="w-full rounded-full border border-[var(--color-hairline)] bg-white px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSavingEspn || espnLinkStatus === "checking"}
                  onClick={() => void handleVerifyEspn()}
                  type="button"
                >
                  {espnLinkStatus === "checking"
                    ? "Checking ESPN…"
                    : "Verify connection"}
                </button>
                <button
                  className="w-full text-sm font-medium text-[var(--color-mute)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                  disabled={isSavingEspn}
                  onClick={() => void handleDisconnectEspn()}
                  type="button"
                >
                  Disconnect ESPN
                </button>
              </div>
            ) : null}
          </aside>

          <aside className="relative z-10 h-fit rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              ESPN import
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Import private league</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">
              Uses your connected ESPN cookies. League ID / Team ID are in the
              ESPN team URL.
            </p>
            <form className="mt-5 space-y-3" onSubmit={handleImportEspn}>
              <label className="block text-sm font-medium" htmlFor="espn-league-id">
                League ID
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-league-id"
                onChange={(event) => setLeagueId(event.target.value)}
                required
                value={leagueId}
              />
              <label className="block text-sm font-medium" htmlFor="espn-team-id">
                Team ID
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-team-id"
                inputMode="numeric"
                onChange={(event) => setTeamId(event.target.value)}
                required
                value={teamId}
              />
              <label className="block text-sm font-medium" htmlFor="espn-season">
                Season
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-season"
                inputMode="numeric"
                onChange={(event) => setSeason(event.target.value)}
                required
                value={season}
              />
              <label className="block text-sm font-medium" htmlFor="espn-name">
                Display name (optional)
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="espn-name"
                onChange={(event) => setEspnName(event.target.value)}
                placeholder="My 2026 league"
                value={espnName}
              />
              <button
                className="w-full rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isImporting}
                type="submit"
              >
                {isImporting ? "Importing…" : "Import ESPN league"}
              </button>
              {!espnConnected ? (
                <p className="text-[0.75rem] text-[var(--color-mute)]">
                  Save cookies in Connect your account first, then click import.
                </p>
              ) : espnLinkStatus === "expired" ? (
                <p className="text-[0.75rem] text-[var(--color-sale)]">
                  Reconnect with fresh cookies above before importing.
                </p>
              ) : null}
            </form>
          </aside>

          <aside className="h-fit rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              Manual league
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Start from a fixture roster
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-mute)]">
              Create a 12-team, 14-slot season league you can edit locally.
            </p>
            <form className="mt-5 space-y-3" onSubmit={handleCreate}>
              <label className="block text-sm font-medium" htmlFor="league-name">
                League name
              </label>
              <input
                className="w-full rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2.5"
                id="league-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="My 2026 roster"
                required
                value={name}
              />
              <button
                className="w-full rounded-full border border-[var(--color-hairline)] bg-white px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isCreating}
                type="submit"
              >
                {isCreating ? "Creating…" : "Create manual league"}
              </button>
            </form>
          </aside>

          {successMessage ? (
            <p className="text-sm text-[var(--color-info)]" role="status">
              {successMessage}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--color-sale)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
