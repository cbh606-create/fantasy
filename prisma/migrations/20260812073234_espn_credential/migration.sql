-- CreateTable
CREATE TABLE "EspnCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerkUserId" TEXT NOT NULL,
    "espnS2" TEXT NOT NULL,
    "swid" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EspnCredential_clerkUserId_key" ON "EspnCredential"("clerkUserId");
