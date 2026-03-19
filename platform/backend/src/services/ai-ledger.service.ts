import {
  PrismaClient,
  AIDecisionType,
  AIDecisionOutcome,
  ai_decision_ledger,
  OrchestrationPhase,
  Prisma,
} from '@prisma/client';
import { prisma } from '../utils/prisma';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

// Use unchecked input so we can set defaults explicitly when desired
type CreateLedgerInput = Prisma.ai_decision_ledgerUncheckedCreateInput;

export class AIDecisionLedgerService {
  private readonly prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  /**
   * Generates a SHA256 hash of the input data for fingerprinting.
   */
  hashInput(data: any): string {
    const str = JSON.stringify(data);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Logs an initial AI decision.
   */
  async logDecision(params: {
    scanId: string;
    tenantId: string;
    phase: OrchestrationPhase;
    decisionType: AIDecisionType;
    modelName: string;
    modelVersion: string;
    temperature?: number;
    discoveryContext?: any;
    endpointMap?: any;
    decisionJson: any;
    confidenceScore?: number;
    rationale?: string;
    selectedTemplates?: string[];
    selectedTags?: string[];
    selectedScopes?: string[];
    assetCriticality?: string;
    inputSummary?: any;
  }): Promise<ai_decision_ledger> {
    const discoveryContextHash = params.discoveryContext ? this.hashInput(params.discoveryContext) : null;
    const endpointMapHash = params.endpointMap ? this.hashInput(params.endpointMap) : null;

    const payload: CreateLedgerInput = {
      scanId: params.scanId,
      tenantId: params.tenantId,
      phase: params.phase,
      decisionType: params.decisionType,
      modelName: params.modelName,
      modelVersion: params.modelVersion,
      temperature: params.temperature,
      discoveryContextHash,
      endpointMapHash,
      inputSummary: params.inputSummary,
      assetCriticality: params.assetCriticality as any,
      decisionJson: params.decisionJson,
      confidenceScore: params.confidenceScore,
      rationale: params.rationale,
      selectedTemplates: params.selectedTemplates ?? [],
      selectedTags: params.selectedTags ?? [],
      selectedScopes: params.selectedScopes ?? [],
      outcome: AIDecisionOutcome.ACCEPTED,
      validationErrors: [],
      templatesValidated: 0,
      templatesRejected: 0,
      fallbackTriggered: false,
      fallbackReason: null,
      templatesExecuted: null,
      findingsGenerated: null,
      executionTime: null,
    };

    return this.prisma.ai_decision_ledger.create({ data: payload });
  }

  /**
   * Validates AI output against allowed tags and scopes.
   */
  validateAIOutput(aiJson: any, allowedTags: string[], allowedScopes: string[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (aiJson?.tags && Array.isArray(aiJson.tags)) {
      const invalidTags = aiJson.tags.filter((t: string) => !allowedTags.includes(t));
      if (invalidTags.length > 0) errors.push(`Invalid tags found: ${invalidTags.join(', ')}`);
    }

    if (aiJson?.scopes && Array.isArray(aiJson.scopes)) {
      const invalidScopes = aiJson.scopes.filter((s: string) => !allowedScopes.includes(s));
      if (invalidScopes.length > 0) errors.push(`Invalid scopes found: ${invalidScopes.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  async markDecisionAccepted(
    ledgerId: string,
    results: { templatesExecuted: number; findingsGenerated: number; executionTime: number; templatesValidated?: number; templatesRejected?: number }
  ): Promise<ai_decision_ledger> {
    return this.prisma.ai_decision_ledger.update({
      where: { id: ledgerId },
      data: {
        outcome: AIDecisionOutcome.ACCEPTED,
        templatesExecuted: results.templatesExecuted,
        findingsGenerated: results.findingsGenerated,
        executionTime: results.executionTime,
        templatesValidated: results.templatesValidated ?? undefined,
        templatesRejected: results.templatesRejected ?? undefined,
      },
    });
  }

  async markDecisionRejected(ledgerId: string, errors: string[]): Promise<ai_decision_ledger> {
    return this.prisma.ai_decision_ledger.update({
      where: { id: ledgerId },
      data: {
        outcome: AIDecisionOutcome.REJECTED,
        validationErrors: errors,
      },
    });
  }

  async markFallbackTriggered(ledgerId: string, reason: string): Promise<ai_decision_ledger> {
    return this.prisma.ai_decision_ledger.update({
      where: { id: ledgerId },
      data: {
        outcome: AIDecisionOutcome.FALLBACK_USED,
        fallbackTriggered: true,
        fallbackReason: reason,
      },
    });
  }

  async getDecisionsForScan(scanId: string): Promise<ai_decision_ledger[]> {
    return this.prisma.ai_decision_ledger.findMany({
      where: { scanId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDecisionById(id: string): Promise<ai_decision_ledger | null> {
    return this.prisma.ai_decision_ledger.findUnique({ where: { id } });
  }

  async getDecisionStats(tenantId: string): Promise<{ total: number; accepted: number; rejected: number; fallback: number; acceptanceRate: number }> {
    const [total, accepted, rejected, fallback] = await Promise.all([
      this.prisma.ai_decision_ledger.count({ where: { tenantId } }),
      this.prisma.ai_decision_ledger.count({ where: { tenantId, outcome: AIDecisionOutcome.ACCEPTED } }),
      this.prisma.ai_decision_ledger.count({ where: { tenantId, outcome: AIDecisionOutcome.REJECTED } }),
      this.prisma.ai_decision_ledger.count({ where: { tenantId, outcome: AIDecisionOutcome.FALLBACK_USED } }),
    ]);

    return {
      total,
      accepted,
      rejected,
      fallback,
      acceptanceRate: total > 0 ? accepted / total : 0,
    };
  }

  async getAllDecisions(tenantId: string, limit = 50): Promise<ai_decision_ledger[]> {
    return this.prisma.ai_decision_ledger.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async overrideDecision(id: string, userId: string, tenantId: string): Promise<ai_decision_ledger> {
    const decision = await this.prisma.ai_decision_ledger.update({
      where: { id },
      data: { outcome: AIDecisionOutcome.OVERRIDDEN },
    });

    await auditService.log({
      action: 'UPDATE',
      resource: 'AIDecisionLedger',
      resourceId: id,
      details: {
        action: 'OVERRIDE',
        previousOutcome: 'ACCEPTED',
        newOutcome: 'OVERRIDDEN',
        decisionType: decision.decisionType,
        scanId: decision.scanId,
      },
      userId,
      tenantId,
    });

    logger.info(`AI decision ${id} overridden by user ${userId}`);

    return decision;
  }
}

export const aiDecisionLedgerService = new AIDecisionLedgerService();
