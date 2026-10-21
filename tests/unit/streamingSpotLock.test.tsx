// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel";
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories";
import { formatMatchupDayLabel } from "@/lib/matchup/weekCalendarLayout";
import type { MatchupBoard } from "@/lib/matchup/types";
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types";

const projections: SeasonPlayer["projections"] = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 16,
};

const shooting = { FGM: 1, FGA: 2, FTM: 1, FTA: 1 };

const streamerA: SeasonPlayer = {
  id: "fa-a",
  name: "Streamer A",
  teamAbbr: "BOS",
  positions: ["SG"],
  projectedGames: 82,
  projections,
  shooting,
};

const streamerB: SeasonPlayer = {
  id: "fa-b",
  name: "Streamer B",
  teamAbbr: "NYK",
  positions: ["PG"],
  projectedGames: 82,
  projections,
  shooting,
};

const rostered: SeasonPlayer = {
  id: "you-1",
  name: "Roster Cut",
  teamAbbr: "CHI",
  positions: ["PF"],
  projectedGames: 82,
  projections,
  shooting,
};

const board: MatchupBoard = {
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: 10,
    opp: 8,
    outcome: "W",
    winProb: 0.8,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
};

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-05",
    days: ["2025-11-03", "2025-11-04", "2025-11-05"],
  },
  games: [{ date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" }],
};

const state: SeasonLeagueState = {
  name: "Test",
  season: 2025,
  categories: ALL_CATEGORY_IDS.map((id) => ({ id, enabled: true, weight: 1 })),
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [
        { slot: "UTIL", playerId: "you-1" },
        { slot: "BE", playerId: null },
      ],
    },
    {
      teamIndex: 1,
      name: "Them",
      entries: [{ slot: "UTIL", playerId: null }],
    },
  ],
  players: [streamerA, streamerB, rostered],
  availablePlayerIds: ["fa-a", "fa-b"],
  waiverOrder: [0, 1],
  source: "manual",
};

describe("StreamingPlansPanel recorded swap lock", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a recorded today swap as static add and drop text", async () => {
    render(
      <StreamingPlansPanel
        activityOpponentPastSwaps={[]}
        activityPastSwaps={[
          {
            date: "2025-11-03",
            spotIndex: 0,
            addedPlayerId: "fa-a",
            drop: "you-1",
          },
        ]}
        board={board}
        leagueId="lock-lg"
        playersById={{ "fa-a": streamerA, "you-1": rostered }}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Streamer A").length).toBeGreaterThan(0);
    });
    const escapeRegExp = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lockedDay = escapeRegExp(formatMatchupDayLabel("2025-11-03"));
    const laterDay = escapeRegExp(formatMatchupDayLabel("2025-11-04"));
    expect(
      screen.queryAllByRole("combobox", {
        name: new RegExp(`Stream add ${lockedDay} spot 1$`),
      }),
    ).toHaveLength(0);
    expect(
      screen.queryAllByRole("combobox", {
        name: new RegExp(`Roster drop ${lockedDay} spot 1$`),
      }),
    ).toHaveLength(0);
    expect(
      screen.getAllByRole("combobox", { name: /Stream add .* spot 2$/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("combobox", {
        name: new RegExp(`Stream add ${lockedDay} spot 2$`),
      }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("combobox", {
        name: new RegExp(`Stream add ${laterDay} spot 1$`),
      }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Roster Cut").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "실제 교체" }),
    ).not.toBeInTheDocument();
  });
});
