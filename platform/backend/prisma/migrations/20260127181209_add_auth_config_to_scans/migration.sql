-- AlterTable
ALTER TABLE "scans" ADD COLUMN     "authConfig" JSONB;

-- AlterTable
ALTER TABLE "scheduled_scans" ADD COLUMN     "authConfig" JSONB;
