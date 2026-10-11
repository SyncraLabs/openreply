-- CreateTable
CREATE TABLE "SequenceChoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SequenceChoice_workspaceId_idx" ON "SequenceChoice"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceChoice_automationId_userId_key" ON "SequenceChoice"("automationId", "userId");

-- AddForeignKey
ALTER TABLE "SequenceChoice" ADD CONSTRAINT "SequenceChoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceChoice" ADD CONSTRAINT "SequenceChoice_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

