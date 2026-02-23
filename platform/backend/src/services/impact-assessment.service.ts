/**
 * Post-Exploitation Impact Validation Service
 * Minimal, high-signal impact assessment without full post-exploitation
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

export class ImpactAssessmentService {
  /**
   * Assess vulnerability impact
   */
  async assessImpact(
    vulnerabilityId: string,
    exploitAttemptId: string | null,
    assessedById: string,
    tenantId: string
  ): Promise<string> {
    const vulnerability = await prisma.vulnerabilities.findFirst({
      where: { id: vulnerabilityId, tenantId },
      include: {
        assets: true,
        exploitation_attempts: {
          where: exploitAttemptId ? { id: exploitAttemptId } : {},
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!vulnerability) {
      throw new Error('Vulnerability not found');
    }

    // Analyze impact based on vulnerability type and context
    const assessment = await this.analyzeImpact(vulnerability);

    // Store assessment
    const assessmentId = randomUUID();
    await prisma.impact_assessments.create({
      data: {
        id: assessmentId,
        vulnerabilityId,
        exploitAttemptId,
        privilegeEscalation: assessment.privilegeEscalation,
        privilegeContext: assessment.privilegeContext,
        authBypassed: assessment.authBypassed,
        authBoundaryDescription: assessment.authBoundaryDescription,
        lateralMovementPossible: assessment.lateralMovementPossible,
        lateralMovementDescription: assessment.lateralMovementDescription,
        dataSensitivityLevel: assessment.dataSensitivityLevel,
        dataSchemaExposed: assessment.dataSchemaExposed,
        overallImpactLevel: assessment.overallImpactLevel,
        impactSummary: assessment.impactSummary,
        assessedById,
        tenantId,
      },
    });

    logger.info(`Impact assessment ${assessmentId} created for vulnerability ${vulnerabilityId}`);
    return assessmentId;
  }

  /**
   * Analyze vulnerability impact
   */
  private async analyzeImpact(vulnerability: any): Promise<any> {
    const category = vulnerability.category?.toLowerCase() || '';
    const severity = vulnerability.severity;
    const exploitAttempts = vulnerability.exploitation_attempts || [];
    const successfulExploit = exploitAttempts.find((a: any) => a.success);

    let assessment: any = {
      privilegeEscalation: false,
      privilegeContext: null,
      authBypassed: false,
      authBoundaryDescription: null,
      lateralMovementPossible: false,
      lateralMovementDescription: null,
      dataSensitivityLevel: 'NONE',
      dataSchemaExposed: [],
      overallImpactLevel: 'LOW',
      impactSummary: '',
    };

    // SQL Injection Impact
    if (category.includes('injection') || category.includes('sql')) {
      assessment.dataSensitivityLevel = severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
      assessment.dataSchemaExposed = ['users', 'credentials', 'application_data'];
      assessment.authBypassed = true;
      assessment.authBoundaryDescription = 'SQL injection can bypass authentication via query manipulation';
      assessment.lateralMovementPossible = true;
      assessment.lateralMovementDescription = 'Database access may enable lateral movement to other application components';
      assessment.overallImpactLevel = 'CRITICAL';
      assessment.impactSummary = 'SQL injection allows full database read/write access, authentication bypass, and potential system compromise';
    }

    // XSS Impact
    else if (category.includes('xss') || vulnerability.title.toLowerCase().includes('xss')) {
      assessment.authBypassed = true;
      assessment.authBoundaryDescription = 'XSS can steal session tokens and bypass authentication';
      assessment.dataSensitivityLevel = 'MEDIUM';
      assessment.overallImpactLevel = 'HIGH';
      assessment.impactSummary = 'Cross-site scripting enables session hijacking and account takeover';
    }

    // Authentication Bypass
    else if (category.includes('auth') || vulnerability.title.toLowerCase().includes('auth')) {
      assessment.authBypassed = true;
      assessment.authBoundaryDescription = 'Direct authentication bypass vulnerability';
      assessment.lateralMovementPossible = true;
      assessment.lateralMovementDescription = 'Unauthorized access may enable exploration of internal systems';
      assessment.overallImpactLevel = 'CRITICAL';
      assessment.impactSummary = 'Authentication bypass allows complete account takeover';
    }

    // IDOR Impact
    else if (category.includes('idor') || category.includes('authorization')) {
      assessment.authBypassed = false;
      assessment.authBoundaryDescription = 'Authorization boundary broken - cross-user data access';
      assessment.dataSensitivityLevel = 'HIGH';
      assessment.lateralMovementPossible = true;
      assessment.lateralMovementDescription = 'Access to other users\' data enables tenant isolation breach';
      assessment.overallImpactLevel = 'HIGH';
      assessment.impactSummary = 'Insecure direct object reference allows cross-user data access';
    }

    // RCE Impact
    else if (category.includes('rce') || vulnerability.title.toLowerCase().includes('command')) {
      assessment.privilegeEscalation = true;
      assessment.privilegeContext = 'Remote code execution with application server privileges';
      assessment.authBypassed = true;
      assessment.lateralMovementPossible = true;
      assessment.lateralMovementDescription = 'Server access enables network pivoting and internal reconnaissance';
      assessment.dataSensitivityLevel = 'CRITICAL';
      assessment.overallImpactLevel = 'CRITICAL';
      assessment.impactSummary = 'Remote code execution enables full system compromise';
    }

    // Default for other vulnerabilities
    else {
      assessment.overallImpactLevel = severity === 'CRITICAL' ? 'CRITICAL' : severity === 'HIGH' ? 'HIGH' : 'MEDIUM';
      assessment.impactSummary = `${vulnerability.title} presents ${severity.toLowerCase()} severity risk to the asset`;
    }

    return assessment;
  }

  /**
   * Get impact assessment
   */
  async getImpactAssessment(vulnerabilityId: string, tenantId: string) {
    return await prisma.impact_assessments.findFirst({
      where: { vulnerabilityId, tenantId },
      include: {
        vulnerabilities: {
          include: { assets: true },
        },
        users: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Get all assessments with high/critical impact
   */
  async getHighImpactAssessments(tenantId: string) {
    return await prisma.impact_assessments.findMany({
      where: {
        tenantId,
        overallImpactLevel: { in: ['HIGH', 'CRITICAL'] },
      },
      include: {
        vulnerabilities: {
          include: { assets: true },
        },
      },
      orderBy: { assessedAt: 'desc' },
    });
  }
}
