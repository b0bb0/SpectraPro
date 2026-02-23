-- CreateEnum
CREATE TYPE "ReconPhase" AS ENUM ('SUBDOMAINS', 'NMAP', 'FEROXBUSTER', 'AI_ANALYSIS', 'NUCLEI');

-- CreateTable
CREATE TABLE "recon_phase_runs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phase" "ReconPhase" NOT NULL,
    "status" "ReconStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "parameters" JSONB,
    "processId" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "recon_phase_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_artifacts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phaseRunId" TEXT,
    "phase" "ReconPhase" NOT NULL,
    "type" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "recon_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_selections" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "selectedPorts" JSONB,
    "selectedServiceUrls" JSONB,
    "selectedFeroxEndpoints" JSONB,
    "selectedNucleiTargets" JSONB,
    "selectedNucleiTags" JSONB,
    "scopeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "recon_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_ai_decisions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inputSummary" JSONB NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "attackSurface" JSONB NOT NULL,
    "candidateAttackPaths" JSONB NOT NULL,
    "recommendedNucleiTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whyNotTested" JSONB,
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "recon_ai_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recon_phase_runs_sessionId_phase_idx" ON "recon_phase_runs"("sessionId", "phase");

-- CreateIndex
CREATE INDEX "recon_phase_runs_status_idx" ON "recon_phase_runs"("status");

-- CreateIndex
CREATE INDEX "recon_phase_runs_tenantId_idx" ON "recon_phase_runs"("tenantId");

-- CreateIndex
CREATE INDEX "recon_artifacts_sessionId_phase_idx" ON "recon_artifacts"("sessionId", "phase");

-- CreateIndex
CREATE INDEX "recon_artifacts_tenantId_idx" ON "recon_artifacts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "recon_selections_sessionId_key" ON "recon_selections"("sessionId");

-- CreateIndex
CREATE INDEX "recon_selections_tenantId_idx" ON "recon_selections"("tenantId");

-- CreateIndex
CREATE INDEX "recon_ai_decisions_sessionId_idx" ON "recon_ai_decisions"("sessionId");

-- CreateIndex
CREATE INDEX "recon_ai_decisions_tenantId_idx" ON "recon_ai_decisions"("tenantId");

-- AddForeignKey
ALTER TABLE "recon_phase_runs" ADD CONSTRAINT "recon_phase_runs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "recon_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_phase_runs" ADD CONSTRAINT "recon_phase_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_artifacts" ADD CONSTRAINT "recon_artifacts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "recon_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_artifacts" ADD CONSTRAINT "recon_artifacts_phaseRunId_fkey" FOREIGN KEY ("phaseRunId") REFERENCES "recon_phase_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_artifacts" ADD CONSTRAINT "recon_artifacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_selections" ADD CONSTRAINT "recon_selections_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "recon_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_selections" ADD CONSTRAINT "recon_selections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_ai_decisions" ADD CONSTRAINT "recon_ai_decisions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "recon_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_ai_decisions" ADD CONSTRAINT "recon_ai_decisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
