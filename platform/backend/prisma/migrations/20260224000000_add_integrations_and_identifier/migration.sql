-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('HTTP_JSON', 'SHODAN');

-- CreateEnum
CREATE TYPE "IntegrationAuthType" AS ENUM ('NONE', 'BEARER', 'API_KEY');

-- CreateEnum
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('NEVER', 'SUCCESS', 'FAILED');

-- AlterEnum
ALTER TYPE "VulnerabilityStatus" ADD VALUE 'CONTROLLED';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "identifier" TEXT;

-- CreateTable
CREATE TABLE "tool_integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "type" "IntegrationType" NOT NULL DEFAULT 'HTTP_JSON',
    "endpointUrl" TEXT NOT NULL,
    "query" TEXT,
    "authType" "IntegrationAuthType" NOT NULL DEFAULT 'NONE',
    "authValue" TEXT,
    "customHeaderName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" "IntegrationSyncStatus" NOT NULL DEFAULT 'NEVER',
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "tool_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_records" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT,
    "severity" TEXT,
    "status" TEXT,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_integrations_tenantId_idx" ON "tool_integrations"("tenantId");

-- CreateIndex
CREATE INDEX "tool_integrations_isActive_idx" ON "tool_integrations"("isActive");

-- CreateIndex
CREATE INDEX "tool_integrations_type_idx" ON "tool_integrations"("type");

-- CreateIndex
CREATE INDEX "integration_records_integrationId_fetchedAt_idx" ON "integration_records"("integrationId", "fetchedAt");

-- CreateIndex
CREATE INDEX "integration_records_tenantId_fetchedAt_idx" ON "integration_records"("tenantId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_records_integrationId_externalId_key" ON "integration_records"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "assets_identifier_idx" ON "assets"("identifier");

-- AddForeignKey
ALTER TABLE "tool_integrations" ADD CONSTRAINT "tool_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_integrations" ADD CONSTRAINT "tool_integrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "tool_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
