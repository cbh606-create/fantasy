-- CreateTable
CREATE TABLE "SeasonLeague" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerkUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "espnLeagueId" TEXT,
    "season" INTEGER NOT NULL,
    "perspectiveTeamIndex" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "stateJson" TEXT NOT NULL,
    "localLineupJson" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SeasonLeague_clerkUserId_idx" ON "SeasonLeague"("clerkUserId");
