-- AlterTable
ALTER TABLE "Automation" ADD COLUMN "sendDelayMinSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sendDelayMaxSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sendWindowStart" INTEGER,
ADD COLUMN "sendWindowEnd" INTEGER,
ADD COLUMN "sendWindowTimezone" TEXT NOT NULL DEFAULT 'Europe/Madrid';

-- AlterTable
ALTER TABLE "DmLog" ADD COLUMN "scheduledAt" TIMESTAMP(3);
