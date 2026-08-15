-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "youtube" INTEGER,
    "instagram" INTEGER,
    "tiktok" INTEGER,
    "igSyncra" INTEGER,
    "contenido" INTEGER,
    "leads" INTEGER,
    "llamadasReservadas" INTEGER,
    "llamadasHechas" INTEGER,
    "clientes" INTEGER,
    "ingresos" DECIMAL(10,2),
    "mrr" DECIMAL(10,2),
    "gastoAds" DECIMAL(10,2),
    "notas" TEXT,
    "autoFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "DailyMetric_workspaceId_date_idx" ON "DailyMetric"("workspaceId", "date");
-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_workspaceId_date_key" ON "DailyMetric"("workspaceId", "date");
-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
