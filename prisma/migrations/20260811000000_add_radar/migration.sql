
-- CreateTable
CREATE TABLE "RadarAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "followers" INTEGER,
    "medianViews" INTEGER,
    "niche" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarPost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "radarAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "thumbnailUrl" TEXT,
    "mediaType" TEXT,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "outlierScore" DOUBLE PRECISION,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadarAccount_workspaceId_idx" ON "RadarAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarAccount_workspaceId_username_key" ON "RadarAccount"("workspaceId", "username");

-- CreateIndex
CREATE INDEX "RadarPost_workspaceId_idx" ON "RadarPost"("workspaceId");

-- CreateIndex
CREATE INDEX "RadarPost_radarAccountId_idx" ON "RadarPost"("radarAccountId");

-- CreateIndex
CREATE INDEX "RadarPost_outlierScore_idx" ON "RadarPost"("outlierScore");

-- CreateIndex
CREATE UNIQUE INDEX "RadarPost_radarAccountId_externalId_key" ON "RadarPost"("radarAccountId", "externalId");

-- AddForeignKey
ALTER TABLE "RadarAccount" ADD CONSTRAINT "RadarAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarPost" ADD CONSTRAINT "RadarPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarPost" ADD CONSTRAINT "RadarPost_radarAccountId_fkey" FOREIGN KEY ("radarAccountId") REFERENCES "RadarAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
