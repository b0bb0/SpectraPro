-- CreateEnum
CREATE TYPE "AIDecisionOutcome" AS ENUM ('ACCEPTED', 'REJECTED', 'OVERRIDDEN', 'FALLBACK_USED');

-- CreateEnum
CREATE TYPE "AIDecisionType" AS ENUM ('TEMPLATE_SELECTION', 'RISK_ASSESSMENT', 'VALIDATION_PRIORITY', 'IMPACT_ANALYSIS', 'REMEDIATION_ADVICE');

-- CreateEnum
CREATE TYPE "AssetCriticality" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AssetEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'TEST');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('DOMAIN', 'IP', 'APPLICATION', 'API', 'CLOUD_RESOURCE', 'NETWORK_DEVICE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT');

-- CreateEnum
CREATE TYPE "EndpointMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ExposureScanStatus" AS ENUM ('PENDING', 'ENUMERATING', 'DETECTING', 'CAPTURING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrchestrationPhase" AS ENUM ('PREFLIGHT', 'DISCOVERY', 'TARGETED_SCAN', 'DEEP_SCAN', 'PROCESSING', 'COMPLETED', 'FAILED', 'PASSIVE_SIGNALS', 'BASELINE_HYGIENE', 'CORRELATION');

-- CreateEnum
CREATE TYPE "ROEStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'HTML', 'JSON', 'CSV');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('EXECUTIVE', 'TECHNICAL', 'COMPLIANCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ScanControlAction" AS ENUM ('PAUSE', 'RESUME', 'STOP', 'SKIP_PHASE');

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('DISCOVERY_ONLY', 'BASELINE', 'TARGETED', 'VALIDATION', 'FULL_ASSESSMENT');

-- CreateEnum
CREATE TYPE "ScanProfile" AS ENUM ('FAST', 'BALANCED', 'DEEP');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('NUCLEI', 'NESSUS', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('ONCE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ScheduledScanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('CVE', 'MISCONFIGURATION', 'EXPOSED_PANEL', 'EXPOSED_SERVICE', 'DEFAULT_CREDENTIALS', 'INFORMATION_DISCLOSURE', 'INJECTION', 'XSS', 'AUTHENTICATION', 'AUTHORIZATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'VALIDATING', 'FAILED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "VulnerabilityStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'MITIGATED', 'ACCEPTED', 'FALSE_POSITIVE', 'REOPENED');

-- CreateTable
CREATE TABLE "ai_decision_ledger" (
    "id" TEXT NOT NULL,
    "decisionType" "AIDecisionType" NOT NULL,
    "phase" "OrchestrationPhase" NOT NULL,
    "discoveryContextHash" TEXT,
    "endpointMapHash" TEXT,
    "assetCriticality" "AssetCriticality",
    "inputSummary" JSONB,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "decisionJson" JSONB NOT NULL,
    "selectedTemplates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidenceScore" DOUBLE PRECISION,
    "rationale" TEXT,
    "outcome" "AIDecisionOutcome" NOT NULL,
    "validationErrors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templatesValidated" INTEGER NOT NULL DEFAULT 0,
    "templatesRejected" INTEGER NOT NULL DEFAULT 0,
    "fallbackTriggered" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "templatesExecuted" INTEGER,
    "findingsGenerated" INTEGER,
    "executionTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ai_decision_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "environment" "AssetEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "criticality" "AssetCriticality" NOT NULL DEFAULT 'MEDIUM',
    "ipAddress" TEXT,
    "hostname" TEXT,
    "url" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "owner" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastScanAt" TIMESTAMP(3),
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vulnCount" INTEGER NOT NULL DEFAULT 0,
    "criticalVulnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "highVulnCount" INTEGER NOT NULL DEFAULT 0,
    "infoVulnCount" INTEGER NOT NULL DEFAULT 0,
    "ipAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lowVulnCount" INTEGER NOT NULL DEFAULT 0,
    "mediumVulnCount" INTEGER NOT NULL DEFAULT 0,
    "parentAssetId" TEXT,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalAssets" INTEGER NOT NULL DEFAULT 0,
    "totalVulns" INTEGER NOT NULL DEFAULT 0,
    "openVulns" INTEGER NOT NULL DEFAULT 0,
    "criticalVulns" INTEGER NOT NULL DEFAULT 0,
    "highVulns" INTEGER NOT NULL DEFAULT 0,
    "mediumVulns" INTEGER NOT NULL DEFAULT 0,
    "lowVulns" INTEGER NOT NULL DEFAULT 0,
    "avgRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newVulns" INTEGER NOT NULL DEFAULT 0,
    "mitigatedVulns" INTEGER NOT NULL DEFAULT 0,
    "scansCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoint_maps" (
    "id" TEXT NOT NULL,
    "discoveredFrom" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL,
    "fullUrl" TEXT NOT NULL,
    "method" "EndpointMethod" NOT NULL DEFAULT 'GET',
    "queryParameters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "formParameters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jsonKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "headers" JSONB,
    "isApi" BOOLEAN NOT NULL DEFAULT false,
    "hasAuth" BOOLEAN NOT NULL DEFAULT false,
    "hasFileUpload" BOOLEAN NOT NULL DEFAULT false,
    "contentType" TEXT,
    "statusCode" INTEGER,
    "responseTime" INTEGER,
    "responseSize" INTEGER,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,
    "assetId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "endpoint_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exposure_scans" (
    "id" TEXT NOT NULL,
    "rootDomain" TEXT NOT NULL,
    "status" "ExposureScanStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentPhase" TEXT,
    "totalSubdomains" INTEGER NOT NULL DEFAULT 0,
    "activeSubdomains" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "exposure_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nuclei_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "author" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "category" "TemplateCategory" NOT NULL DEFAULT 'CUSTOM',
    "status" "TemplateStatus" NOT NULL DEFAULT 'VALIDATING',
    "tags" TEXT[],
    "reference" TEXT[],
    "cveId" TEXT,
    "cweId" TEXT,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3),
    "validationError" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "nuclei_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "filters" JSONB,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules_of_engagement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ROEStatus" NOT NULL DEFAULT 'DRAFT',
    "scopeDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopeIPs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopeUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedTargets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedMethods" "ScanMethod"[] DEFAULT ARRAY['BASELINE']::"ScanMethod"[],
    "validationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "validationRequiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "validationMaxAttempts" INTEGER NOT NULL DEFAULT 3,
    "validationTimeout" INTEGER NOT NULL DEFAULT 300,
    "maxRequestsPerSecond" INTEGER NOT NULL DEFAULT 150,
    "maxConcurrentScans" INTEGER NOT NULL DEFAULT 3,
    "allowedStartTime" TEXT,
    "allowedEndTime" TEXT,
    "allowedDaysOfWeek" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "rules_of_engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_controls" (
    "id" TEXT NOT NULL,
    "action" "ScanControlAction" NOT NULL,
    "reason" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedById" TEXT NOT NULL,
    "phaseBefore" "OrchestrationPhase",
    "phaseAfter" "OrchestrationPhase",
    "progressBefore" INTEGER,
    "progressAfter" INTEGER,
    "scanId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "scan_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ScanType" NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT[],
    "vulnFound" INTEGER NOT NULL DEFAULT 0,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "highCount" INTEGER NOT NULL DEFAULT 0,
    "mediumCount" INTEGER NOT NULL DEFAULT 0,
    "lowCount" INTEGER NOT NULL DEFAULT 0,
    "infoCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "scannerVersion" TEXT,
    "templateVersion" TEXT,
    "errorMessage" TEXT,
    "rawOutput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT,
    "currentPhase" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "templatesRun" INTEGER NOT NULL DEFAULT 0,
    "templatesTotal" INTEGER NOT NULL DEFAULT 0,
    "assetContext" JSONB,
    "orchestrationPhase" "OrchestrationPhase" DEFAULT 'PREFLIGHT',
    "overallRiskScore" DOUBLE PRECISION DEFAULT 0,
    "phaseExecutions" JSONB,
    "scanProfile" "ScanProfile" DEFAULT 'BALANCED',
    "deepScanAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "killRequested" BOOLEAN NOT NULL DEFAULT false,
    "killRequestedAt" TIMESTAMP(3),
    "killRequestedById" TEXT,
    "roeId" TEXT,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_scan_executions" (
    "id" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "scanId" TEXT,
    "vulnFound" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledScanId" TEXT NOT NULL,

    CONSTRAINT "scheduled_scan_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_scans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scanType" "ScanType" NOT NULL DEFAULT 'NUCLEI',
    "scanProfile" "ScanProfile" DEFAULT 'BALANCED',
    "severity" TEXT[] DEFAULT ARRAY['critical', 'high', 'medium', 'low']::TEXT[],
    "frequency" "ScheduleFrequency" NOT NULL DEFAULT 'DAILY',
    "cronExpression" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "assetIds" TEXT[],
    "targetUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ScheduledScanStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "notifyOnCompletion" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "scheduled_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdomains" (
    "id" TEXT NOT NULL,
    "exposureScanId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "protocol" TEXT,
    "ipAddress" TEXT,
    "statusCode" INTEGER,
    "responseTime" INTEGER,
    "screenshotUrl" TEXT,
    "screenshotCapturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "subdomains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerabilities" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "cvssScore" DOUBLE PRECISION,
    "cvssVector" TEXT,
    "cveId" TEXT,
    "cweId" TEXT,
    "category" TEXT,
    "tags" TEXT[],
    "status" "VulnerabilityStatus" NOT NULL DEFAULT 'OPEN',
    "statusReason" TEXT,
    "recommendation" TEXT,
    "remediationSteps" TEXT,
    "effort" TEXT,
    "detectionMethod" TEXT,
    "templateId" TEXT,
    "matcher" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mitigatedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "scanId" TEXT,
    "createdById" TEXT NOT NULL,
    "aiAnalysis" TEXT,
    "aiRecommendations" JSONB,
    "analysisVersion" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "riskScore" DOUBLE PRECISION,
    "curlCommand" TEXT,
    "rawResponse" TEXT,
    "targetUrl" TEXT,
    "affectedParameter" TEXT,
    "deduplicationKey" TEXT,
    "normalizedEndpoint" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_history" (
    "id" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT NOT NULL,

    CONSTRAINT "vulnerability_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_decision_ledger_createdAt_idx" ON "ai_decision_ledger"("createdAt");

-- CreateIndex
CREATE INDEX "ai_decision_ledger_decisionType_idx" ON "ai_decision_ledger"("decisionType");

-- CreateIndex
CREATE INDEX "ai_decision_ledger_outcome_idx" ON "ai_decision_ledger"("outcome");

-- CreateIndex
CREATE INDEX "ai_decision_ledger_scanId_idx" ON "ai_decision_ledger"("scanId");

-- CreateIndex
CREATE INDEX "ai_decision_ledger_tenantId_idx" ON "ai_decision_ledger"("tenantId");

-- CreateIndex
CREATE INDEX "assets_criticality_idx" ON "assets"("criticality");

-- CreateIndex
CREATE INDEX "assets_environment_idx" ON "assets"("environment");

-- CreateIndex
CREATE INDEX "assets_parentAssetId_idx" ON "assets"("parentAssetId");

-- CreateIndex
CREATE INDEX "assets_riskScore_idx" ON "assets"("riskScore");

-- CreateIndex
CREATE INDEX "assets_tenantId_idx" ON "assets"("tenantId");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_date_key" ON "daily_metrics"("date");

-- CreateIndex
CREATE INDEX "daily_metrics_date_idx" ON "daily_metrics"("date");

-- CreateIndex
CREATE INDEX "endpoint_maps_assetId_idx" ON "endpoint_maps"("assetId");

-- CreateIndex
CREATE INDEX "endpoint_maps_isApi_idx" ON "endpoint_maps"("isApi");

-- CreateIndex
CREATE INDEX "endpoint_maps_scanId_idx" ON "endpoint_maps"("scanId");

-- CreateIndex
CREATE INDEX "endpoint_maps_tenantId_idx" ON "endpoint_maps"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "endpoint_maps_scanId_fullUrl_method_key" ON "endpoint_maps"("scanId", "fullUrl", "method");

-- CreateIndex
CREATE INDEX "evidence_vulnerabilityId_idx" ON "evidence"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "exposure_scans_createdAt_idx" ON "exposure_scans"("createdAt");

-- CreateIndex
CREATE INDEX "exposure_scans_rootDomain_idx" ON "exposure_scans"("rootDomain");

-- CreateIndex
CREATE INDEX "exposure_scans_status_idx" ON "exposure_scans"("status");

-- CreateIndex
CREATE INDEX "exposure_scans_tenantId_idx" ON "exposure_scans"("tenantId");

-- CreateIndex
CREATE INDEX "nuclei_templates_category_idx" ON "nuclei_templates"("category");

-- CreateIndex
CREATE INDEX "nuclei_templates_severity_idx" ON "nuclei_templates"("severity");

-- CreateIndex
CREATE INDEX "nuclei_templates_status_idx" ON "nuclei_templates"("status");

-- CreateIndex
CREATE INDEX "nuclei_templates_tenantId_idx" ON "nuclei_templates"("tenantId");

-- CreateIndex
CREATE INDEX "nuclei_templates_uploadedById_idx" ON "nuclei_templates"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "nuclei_templates_tenantId_fileName_key" ON "nuclei_templates"("tenantId", "fileName");

-- CreateIndex
CREATE INDEX "reports_generatedAt_idx" ON "reports"("generatedAt");

-- CreateIndex
CREATE INDEX "reports_tenantId_idx" ON "reports"("tenantId");

-- CreateIndex
CREATE INDEX "rules_of_engagement_status_idx" ON "rules_of_engagement"("status");

-- CreateIndex
CREATE INDEX "rules_of_engagement_tenantId_idx" ON "rules_of_engagement"("tenantId");

-- CreateIndex
CREATE INDEX "rules_of_engagement_validFrom_validUntil_idx" ON "rules_of_engagement"("validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "scan_controls_executedAt_idx" ON "scan_controls"("executedAt");

-- CreateIndex
CREATE INDEX "scan_controls_scanId_idx" ON "scan_controls"("scanId");

-- CreateIndex
CREATE INDEX "scan_controls_tenantId_idx" ON "scan_controls"("tenantId");

-- CreateIndex
CREATE INDEX "scans_createdAt_idx" ON "scans"("createdAt");

-- CreateIndex
CREATE INDEX "scans_roeId_idx" ON "scans"("roeId");

-- CreateIndex
CREATE INDEX "scans_status_idx" ON "scans"("status");

-- CreateIndex
CREATE INDEX "scans_tenantId_idx" ON "scans"("tenantId");

-- CreateIndex
CREATE INDEX "scheduled_scan_executions_executedAt_idx" ON "scheduled_scan_executions"("executedAt");

-- CreateIndex
CREATE INDEX "scheduled_scan_executions_scheduledScanId_idx" ON "scheduled_scan_executions"("scheduledScanId");

-- CreateIndex
CREATE INDEX "scheduled_scan_executions_status_idx" ON "scheduled_scan_executions"("status");

-- CreateIndex
CREATE INDEX "scheduled_scans_createdById_idx" ON "scheduled_scans"("createdById");

-- CreateIndex
CREATE INDEX "scheduled_scans_isActive_idx" ON "scheduled_scans"("isActive");

-- CreateIndex
CREATE INDEX "scheduled_scans_nextRunAt_idx" ON "scheduled_scans"("nextRunAt");

-- CreateIndex
CREATE INDEX "scheduled_scans_status_idx" ON "scheduled_scans"("status");

-- CreateIndex
CREATE INDEX "scheduled_scans_tenantId_idx" ON "scheduled_scans"("tenantId");

-- CreateIndex
CREATE INDEX "subdomains_exposureScanId_idx" ON "subdomains"("exposureScanId");

-- CreateIndex
CREATE INDEX "subdomains_isActive_idx" ON "subdomains"("isActive");

-- CreateIndex
CREATE INDEX "subdomains_subdomain_idx" ON "subdomains"("subdomain");

-- CreateIndex
CREATE INDEX "subdomains_tenantId_idx" ON "subdomains"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "vulnerabilities_assetId_idx" ON "vulnerabilities"("assetId");

-- CreateIndex
CREATE INDEX "vulnerabilities_cveId_idx" ON "vulnerabilities"("cveId");

-- CreateIndex
CREATE INDEX "vulnerabilities_deduplicationKey_idx" ON "vulnerabilities"("deduplicationKey");

-- CreateIndex
CREATE INDEX "vulnerabilities_firstSeen_idx" ON "vulnerabilities"("firstSeen");

-- CreateIndex
CREATE INDEX "vulnerabilities_severity_idx" ON "vulnerabilities"("severity");

-- CreateIndex
CREATE INDEX "vulnerabilities_status_idx" ON "vulnerabilities"("status");

-- CreateIndex
CREATE INDEX "vulnerabilities_tenantId_idx" ON "vulnerabilities"("tenantId");

-- CreateIndex
CREATE INDEX "vulnerability_history_vulnerabilityId_idx" ON "vulnerability_history"("vulnerabilityId");

-- AddForeignKey
ALTER TABLE "ai_decision_ledger" ADD CONSTRAINT "ai_decision_ledger_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decision_ledger" ADD CONSTRAINT "ai_decision_ledger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_maps" ADD CONSTRAINT "endpoint_maps_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_maps" ADD CONSTRAINT "endpoint_maps_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_maps" ADD CONSTRAINT "endpoint_maps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exposure_scans" ADD CONSTRAINT "exposure_scans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nuclei_templates" ADD CONSTRAINT "nuclei_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nuclei_templates" ADD CONSTRAINT "nuclei_templates_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules_of_engagement" ADD CONSTRAINT "rules_of_engagement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules_of_engagement" ADD CONSTRAINT "rules_of_engagement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules_of_engagement" ADD CONSTRAINT "rules_of_engagement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_controls" ADD CONSTRAINT "scan_controls_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_controls" ADD CONSTRAINT "scan_controls_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_controls" ADD CONSTRAINT "scan_controls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_killRequestedById_fkey" FOREIGN KEY ("killRequestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_roeId_fkey" FOREIGN KEY ("roeId") REFERENCES "rules_of_engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_scan_executions" ADD CONSTRAINT "scheduled_scan_executions_scheduledScanId_fkey" FOREIGN KEY ("scheduledScanId") REFERENCES "scheduled_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_scans" ADD CONSTRAINT "scheduled_scans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_scans" ADD CONSTRAINT "scheduled_scans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subdomains" ADD CONSTRAINT "subdomains_exposureScanId_fkey" FOREIGN KEY ("exposureScanId") REFERENCES "exposure_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subdomains" ADD CONSTRAINT "subdomains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_history" ADD CONSTRAINT "vulnerability_history_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

