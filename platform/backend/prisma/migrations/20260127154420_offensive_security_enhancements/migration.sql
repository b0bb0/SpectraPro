-- CreateEnum
CREATE TYPE "ReconStage" AS ENUM ('PASSIVE', 'ACTIVE', 'CONTENT_DISCOVERY', 'TECH_STACK');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExploitState" AS ENUM ('NOT_TESTED', 'TESTABLE', 'EXPLOITED', 'BLOCKED_ROE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExploitTechnique" AS ENUM ('SQLI_BOOLEAN', 'SQLI_TIME', 'SQLI_UNION', 'SQLI_ERROR', 'XSS_DOM_PROOF', 'XSS_STORED_PROOF', 'RCE_SAFE_COMMAND', 'IDOR_PROOF', 'AUTH_BYPASS_PROOF', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ImpactLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TestExecutionStatus" AS ENUM ('EXECUTED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "recon_sessions" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "passiveStatus" "ReconStatus" NOT NULL DEFAULT 'QUEUED',
    "activeStatus" "ReconStatus" NOT NULL DEFAULT 'QUEUED',
    "contentStatus" "ReconStatus" NOT NULL DEFAULT 'QUEUED',
    "techStackStatus" "ReconStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "recon_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_findings" (
    "id" TEXT NOT NULL,
    "reconSessionId" TEXT NOT NULL,
    "stage" "ReconStage" NOT NULL,
    "findingType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "recon_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_test_results" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "vulnerabilityId" TEXT,
    "testName" TEXT NOT NULL,
    "testCategory" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "executionStatus" "TestExecutionStatus" NOT NULL,
    "skipReason" TEXT,
    "aiDecisionId" TEXT,
    "result" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "scan_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exploitation_attempts" (
    "id" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "state" "ExploitState" NOT NULL DEFAULT 'NOT_TESTED',
    "technique" "ExploitTechnique" NOT NULL,
    "payload" TEXT,
    "roeChecked" BOOLEAN NOT NULL DEFAULT false,
    "roeApproved" BOOLEAN NOT NULL DEFAULT false,
    "roeBlockReason" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "aiRationale" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "exploitation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exploitation_proofs" (
    "id" TEXT NOT NULL,
    "exploitAttemptId" TEXT NOT NULL,
    "proofType" TEXT NOT NULL,
    "proofData" JSONB NOT NULL,
    "screenshot" TEXT,
    "request" TEXT,
    "response" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "exploitation_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_assessments" (
    "id" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "exploitAttemptId" TEXT,
    "privilegeEscalation" BOOLEAN NOT NULL DEFAULT false,
    "privilegeContext" TEXT,
    "authBypassed" BOOLEAN NOT NULL DEFAULT false,
    "authBoundaryDescription" TEXT,
    "lateralMovementPossible" BOOLEAN NOT NULL DEFAULT false,
    "lateralMovementDescription" TEXT,
    "dataSensitivityLevel" "ImpactLevel" NOT NULL DEFAULT 'NONE',
    "dataSchemaExposed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "overallImpactLevel" "ImpactLevel" NOT NULL,
    "impactSummary" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessedById" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "impact_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attack_chains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "reconSessionId" TEXT,
    "vulnerabilityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exploitAttemptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "impactSummary" TEXT,
    "chainCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "attack_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attack_chain_steps" (
    "id" TEXT NOT NULL,
    "attackChainId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "stepDescription" TEXT NOT NULL,
    "referenceId" TEXT,
    "stepData" JSONB,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "attack_chain_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_timeline" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDescription" TEXT NOT NULL,
    "eventData" JSONB,
    "severity" "Severity",
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "asset_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_intelligence" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changeDescription" TEXT NOT NULL,
    "riskDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "change_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_kill_switch" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "global_kill_switch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recon_sessions_scanId_idx" ON "recon_sessions"("scanId");

-- CreateIndex
CREATE INDEX "recon_sessions_assetId_idx" ON "recon_sessions"("assetId");

-- CreateIndex
CREATE INDEX "recon_sessions_tenantId_idx" ON "recon_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "recon_findings_reconSessionId_idx" ON "recon_findings"("reconSessionId");

-- CreateIndex
CREATE INDEX "recon_findings_stage_idx" ON "recon_findings"("stage");

-- CreateIndex
CREATE INDEX "recon_findings_tenantId_idx" ON "recon_findings"("tenantId");

-- CreateIndex
CREATE INDEX "scan_test_results_scanId_idx" ON "scan_test_results"("scanId");

-- CreateIndex
CREATE INDEX "scan_test_results_vulnerabilityId_idx" ON "scan_test_results"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "scan_test_results_executionStatus_idx" ON "scan_test_results"("executionStatus");

-- CreateIndex
CREATE INDEX "scan_test_results_layer_idx" ON "scan_test_results"("layer");

-- CreateIndex
CREATE INDEX "scan_test_results_tenantId_idx" ON "scan_test_results"("tenantId");

-- CreateIndex
CREATE INDEX "exploitation_attempts_vulnerabilityId_idx" ON "exploitation_attempts"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "exploitation_attempts_state_idx" ON "exploitation_attempts"("state");

-- CreateIndex
CREATE INDEX "exploitation_attempts_tenantId_idx" ON "exploitation_attempts"("tenantId");

-- CreateIndex
CREATE INDEX "exploitation_proofs_exploitAttemptId_idx" ON "exploitation_proofs"("exploitAttemptId");

-- CreateIndex
CREATE INDEX "exploitation_proofs_tenantId_idx" ON "exploitation_proofs"("tenantId");

-- CreateIndex
CREATE INDEX "impact_assessments_overallImpactLevel_idx" ON "impact_assessments"("overallImpactLevel");

-- CreateIndex
CREATE INDEX "impact_assessments_tenantId_idx" ON "impact_assessments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "impact_assessments_vulnerabilityId_key" ON "impact_assessments"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "attack_chains_scanId_idx" ON "attack_chains"("scanId");

-- CreateIndex
CREATE INDEX "attack_chains_tenantId_idx" ON "attack_chains"("tenantId");

-- CreateIndex
CREATE INDEX "attack_chain_steps_attackChainId_idx" ON "attack_chain_steps"("attackChainId");

-- CreateIndex
CREATE INDEX "asset_timeline_assetId_idx" ON "asset_timeline"("assetId");

-- CreateIndex
CREATE INDEX "asset_timeline_occurredAt_idx" ON "asset_timeline"("occurredAt");

-- CreateIndex
CREATE INDEX "asset_timeline_eventType_idx" ON "asset_timeline"("eventType");

-- CreateIndex
CREATE INDEX "asset_timeline_tenantId_idx" ON "asset_timeline"("tenantId");

-- CreateIndex
CREATE INDEX "change_intelligence_assetId_idx" ON "change_intelligence"("assetId");

-- CreateIndex
CREATE INDEX "change_intelligence_detectedAt_idx" ON "change_intelligence"("detectedAt");

-- CreateIndex
CREATE INDEX "change_intelligence_changeType_idx" ON "change_intelligence"("changeType");

-- CreateIndex
CREATE INDEX "change_intelligence_tenantId_idx" ON "change_intelligence"("tenantId");

-- CreateIndex
CREATE INDEX "global_kill_switch_tenantId_idx" ON "global_kill_switch"("tenantId");

-- AddForeignKey
ALTER TABLE "recon_sessions" ADD CONSTRAINT "recon_sessions_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_sessions" ADD CONSTRAINT "recon_sessions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_sessions" ADD CONSTRAINT "recon_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_findings" ADD CONSTRAINT "recon_findings_reconSessionId_fkey" FOREIGN KEY ("reconSessionId") REFERENCES "recon_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_findings" ADD CONSTRAINT "recon_findings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_test_results" ADD CONSTRAINT "scan_test_results_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_test_results" ADD CONSTRAINT "scan_test_results_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_test_results" ADD CONSTRAINT "scan_test_results_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploitation_attempts" ADD CONSTRAINT "exploitation_attempts_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploitation_attempts" ADD CONSTRAINT "exploitation_attempts_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploitation_attempts" ADD CONSTRAINT "exploitation_attempts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploitation_attempts" ADD CONSTRAINT "exploitation_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploitation_proofs" ADD CONSTRAINT "exploitation_proofs_exploitAttemptId_fkey" FOREIGN KEY ("exploitAttemptId") REFERENCES "exploitation_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploitation_proofs" ADD CONSTRAINT "exploitation_proofs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_assessments" ADD CONSTRAINT "impact_assessments_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_assessments" ADD CONSTRAINT "impact_assessments_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_assessments" ADD CONSTRAINT "impact_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attack_chains" ADD CONSTRAINT "attack_chains_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attack_chains" ADD CONSTRAINT "attack_chains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attack_chain_steps" ADD CONSTRAINT "attack_chain_steps_attackChainId_fkey" FOREIGN KEY ("attackChainId") REFERENCES "attack_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_timeline" ADD CONSTRAINT "asset_timeline_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_timeline" ADD CONSTRAINT "asset_timeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_intelligence" ADD CONSTRAINT "change_intelligence_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_intelligence" ADD CONSTRAINT "change_intelligence_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_intelligence" ADD CONSTRAINT "change_intelligence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_kill_switch" ADD CONSTRAINT "global_kill_switch_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_kill_switch" ADD CONSTRAINT "global_kill_switch_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_kill_switch" ADD CONSTRAINT "global_kill_switch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
