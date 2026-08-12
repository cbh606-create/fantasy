"use client"

import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { FieldHelpTip } from "@/components/ui/FieldHelpTip"

type SeasonLeagueListItem = {
  id: string
  name: string
  season: number
  source: "espn" | "manual" | "mixed"
  updatedAt: string
}

export default function RosterListPage() {
  const [leagues, setLeagues] = useState<SeasonLeagueListItem[]>([])
  const [name, setName] = useState("")
  const [espnName, setEspnName] = useState("")
  const [leagueId, setLeagueId] = useState("120853513")
  const [teamId, setTeamId] = useState("9")
  const [season, setSeason] = useState("2026")
  const [espnS2, setEspnS2] = useState("")
  const [swid, setSwid] = useState("")
  const [espnConnected, setEspnConnected] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isSavingEspn, setIsSavingEspn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const loadPage = async () => {
      try {
        const [leaguesResponse, credentialsResponse] = await Promise.all([
          fetch("/api/season-leagues", { signal: controller.signal }),
          fetch("/api/espn/credentials", { signal: controller.signal }),
        ])

        if (!leaguesResponse.ok) throw new Error("Unable to load season leagues")
        setLeagues((await leaguesResponse.json()) as SeasonLeagueListItem[])

        if (credentialsResponse.ok) {
          const credentials = (await credentialsResponse.json()) as {
            connected?: boolean
          }
          setEspnConnected(Boolean(credentials.connected))
        }
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return
        }
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
  }, [])

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

  const handleConnectEspn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccessMessage("")
    setIsSavingEspn(true)

    try {
      const response = await fetch("/api/espn/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ espnS2, swid }),
      })

      if (!response.ok) {
        throw new Error("Unable to save ESPN cookies — check both values")
      }

      setEspnConnected(true)
      setEspnS2("")
      setSwid("")
      setSuccessMessage("ESPN connected for your account")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save ESPN cookies",
      )
    } finally {
      setIsSavingEspn(false)
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

    const parsedTeamId = Number.parseInt(teamId, 10)
    const parsedSeason = Number.parseInt(season, 10)

    if (
      !leagueId.trim() ||
      !Number.isInteger(parsedTeamId) ||
      !Number.isInteger(parsedSeason)
    ) {
      setError("Enter leagueId, teamId, and season")
      return
    }

    setError("")
    setSuccessMessage("")
    setIsImporting(true)

    try {
      const response = await fetch("/api/espn/season-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: espnName.trim() || undefined,
          leagueId: leagueId.trim(),
          teamId: parsedTeamId,
          season: parsedSeason,
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
          throw new Error(
            "ESPN auth failed — reconnect with fresh espn_s2 / SWID cookies",
          )
        }
        if (payload.errorCode === "ESPN_UNAVAILABLE" && payload.message) {
          throw new Error(payload.message)
        }
        if (payload.errorCode) {
          throw new Error(payload.message ?? payload.errorCode)
        }
        throw new Error(payload.error ?? "Unable to import ESPN league")
      }

      if (!payload.id) throw new Error("Unable to import ESPN league")
      window.location.assign(`/roster/${payload.id}`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to import ESPN league",
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
              ESPN blocks password login for apps. Paste your browser cookies
              once; they stay on your account only (not shown again).
            </p>
            <details className="mt-3 rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2 text-sm">
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
            <p className="mt-2 text-sm font-medium">
              Status:{" "}
              <span className={espnConnected ? "text-[var(--color-info)]" : "text-[var(--color-mute)]"}>
                {espnConnected ? "Connected" : "Not connected"}
              </span>
            </p>
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
                required={!espnConnected}
                spellCheck={false}
                type="password"
                value={espnS2}
              />
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
                required={!espnConnected}
                spellCheck={false}
                type="password"
                value={swid}
              />
              <button
                className="w-full rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSavingEspn}
                type="submit"
              >
                {isSavingEspn
                  ? "Saving…"
                  : espnConnected
                    ? "Update ESPN cookies"
                    : "Save ESPN cookies"}
              </button>
            </form>
            {espnConnected ? (
              <button
                className="mt-3 w-full text-sm font-medium text-[var(--color-mute)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                disabled={isSavingEspn}
                onClick={() => void handleDisconnectEspn()}
                type="button"
              >
                Disconnect ESPN
              </button>
            ) : null}
          </aside>

          <aside className="h-fit rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
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
                disabled={isImporting || !espnConnected}
                type="submit"
              >
                {isImporting ? "Importing…" : "Import ESPN league"}
              </button>
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
