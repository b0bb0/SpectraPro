/**
 * Template Service
 * Manages custom Nuclei templates for vulnerability scanning
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { TemplateStatus, TemplateCategory, Severity } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

interface TemplateMetadata {
  id: string;
  name: string;
  author?: string;
  severity?: string;
  description?: string;
  tags?: string[];
  reference?: string[];
  classification?: {
    'cve-id'?: string[];
    'cwe-id'?: string[];
  };
}

interface CreateTemplateOptions {
  name: string;
  description?: string;
  content: string;
  fileName: string;
  tenantId: string;
  uploadedById: string;
}

export class TemplateService {
  private templatesDir: string;

  constructor() {
    this.templatesDir = path.join(process.cwd(), '..', '..', 'data', 'custom-templates');
    this.ensureTemplatesDir();
  }

  /**
   * Ensure templates directory exists
   */
  private ensureTemplatesDir() {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(options: CreateTemplateOptions) {
    const { name, description, content, fileName, tenantId, uploadedById } = options;

    try {
      // Validate YAML syntax
      const validation = await this.validateTemplate(content);

      if (!validation.isValid) {
        throw new Error(`Template validation failed: ${validation.error}`);
      }

      // Parse template metadata
      const metadata = validation.metadata;

      // Save template file to disk
      const tenantDir = path.join(this.templatesDir, tenantId);
      if (!fs.existsSync(tenantDir)) {
        fs.mkdirSync(tenantDir, { recursive: true });
      }

      const filePath = path.join(tenantDir, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');

      // Save to database
      const template = await prisma.nucleiTemplate.create({
        data: {
          name: metadata.name || name,
          description: metadata.description || description,
          content,
          fileName,
          author: metadata.author || 'Unknown',
          severity: this.mapSeverity(metadata.severity),
          category: this.inferCategory(metadata),
          status: 'ACTIVE',
          tags: metadata.tags || [],
          reference: metadata.reference || [],
          cveId: metadata.classification?.['cve-id']?.[0],
          cweId: metadata.classification?.['cwe-id']?.[0],
          isValid: true,
          validatedAt: new Date(),
          tenantId,
          uploadedById,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      logger.info(`[TEMPLATE] Created template: ${template.name} (${template.id})`);

      return template;
    } catch (error: any) {
      logger.error(`[TEMPLATE] Failed to create template: ${error.message}`);

      // Try to save with error status
      try {
        const template = await prisma.nucleiTemplate.create({
          data: {
            name,
            description,
            content,
            fileName,
            author: 'Unknown',
            severity: 'INFO',
            category: 'CUSTOM',
            status: 'FAILED',
            isValid: false,
            validationError: error.message,
            tenantId,
            uploadedById,
          },
        });

        return template;
      } catch (dbError: any) {
        logger.error(`[TEMPLATE] Failed to save invalid template: ${dbError.message}`);
        throw error;
      }
    }
  }

  /**
   * Validate template YAML
   */
  async validateTemplate(content: string): Promise<{
    isValid: boolean;
    error?: string;
    metadata?: TemplateMetadata;
  }> {
    try {
      // Parse YAML
      const parsed: any = yaml.load(content);

      if (!parsed || typeof parsed !== 'object') {
        return {
          isValid: false,
          error: 'Invalid YAML structure',
        };
      }

      // Check required fields
      if (!parsed.id) {
        return {
          isValid: false,
          error: 'Missing required field: id',
        };
      }

      if (!parsed.info) {
        return {
          isValid: false,
          error: 'Missing required field: info',
        };
      }

      if (!parsed.info.name) {
        return {
          isValid: false,
          error: 'Missing required field: info.name',
        };
      }

      // Extract metadata
      const metadata: TemplateMetadata = {
        id: parsed.id,
        name: parsed.info.name,
        author: Array.isArray(parsed.info.author) ? parsed.info.author.join(', ') : parsed.info.author,
        severity: parsed.info.severity,
        description: parsed.info.description,
        tags: parsed.info.tags,
        reference: parsed.info.reference,
        classification: parsed.info.classification,
      };

      return {
        isValid: true,
        metadata,
      };
    } catch (error: any) {
      return {
        isValid: false,
        error: `YAML parse error: ${error.message}`,
      };
    }
  }

  /**
   * Map severity string to Prisma enum
   */
  private mapSeverity(severity?: string): Severity {
    if (!severity) return 'INFO';

    const normalized = severity.toUpperCase();
    switch (normalized) {
      case 'CRITICAL':
        return 'CRITICAL';
      case 'HIGH':
        return 'HIGH';
      case 'MEDIUM':
        return 'MEDIUM';
      case 'LOW':
        return 'LOW';
      case 'INFO':
        return 'INFO';
      default:
        return 'INFO';
    }
  }

  /**
   * Infer template category from metadata
   */
  private inferCategory(metadata: TemplateMetadata): TemplateCategory {
    // Check for CVE
    if (metadata.classification?.['cve-id']) {
      return 'CVE';
    }

    // Check tags
    const tags = metadata.tags || [];
    const tagsLower = tags.map(t => t.toLowerCase());

    if (tagsLower.some(t => t.includes('panel') || t.includes('login'))) {
      return 'EXPOSED_PANEL';
    }

    if (tagsLower.some(t => t.includes('default') || t.includes('credentials'))) {
      return 'DEFAULT_CREDENTIALS';
    }

    if (tagsLower.some(t => t.includes('injection') || t.includes('sqli') || t.includes('rce'))) {
      return 'INJECTION';
    }

    if (tagsLower.some(t => t.includes('xss'))) {
      return 'XSS';
    }

    if (tagsLower.some(t => t.includes('config') || t.includes('misconfiguration'))) {
      return 'MISCONFIGURATION';
    }

    if (tagsLower.some(t => t.includes('auth'))) {
      return 'AUTHENTICATION';
    }

    if (tagsLower.some(t => t.includes('disclosure') || t.includes('exposure'))) {
      return 'INFORMATION_DISCLOSURE';
    }

    return 'CUSTOM';
  }

  /**
   * Get all templates for a tenant
   */
  async getTemplates(tenantId: string, filters?: {
    status?: TemplateStatus;
    category?: TemplateCategory;
    severity?: Severity;
  }) {
    return prisma.nucleiTemplate.findMany({
      where: {
        tenantId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.category && { category: filters.category }),
        ...(filters?.severity && { severity: filters.severity }),
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: string, tenantId: string) {
    return prisma.nucleiTemplate.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Update template status
   */
  async updateTemplateStatus(id: string, tenantId: string, status: TemplateStatus) {
    return prisma.nucleiTemplate.update({
      where: {
        id,
        tenantId,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string, tenantId: string) {
    const template = await prisma.nucleiTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // Delete file from disk
    const filePath = path.join(this.templatesDir, tenantId, template.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await prisma.nucleiTemplate.delete({
      where: { id },
    });

    logger.info(`[TEMPLATE] Deleted template: ${template.name} (${id})`);
  }

  /**
   * Increment usage count
   */
  async incrementUsage(id: string) {
    return prisma.nucleiTemplate.update({
      where: { id },
      data: {
        usageCount: {
          increment: 1,
        },
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Get template content for scanning
   */
  async getTemplateContent(id: string, tenantId: string): Promise<string> {
    const template = await this.getTemplateById(id, tenantId);

    if (!template) {
      throw new Error('Template not found');
    }

    if (template.status !== 'ACTIVE') {
      throw new Error('Template is not active');
    }

    return template.content;
  }

  /**
   * Get all active template file paths for a tenant
   */
  async getActiveTemplatePaths(tenantId: string): Promise<string[]> {
    const templates = await prisma.nucleiTemplate.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
    });

    return templates.map(t => path.join(this.templatesDir, tenantId, t.fileName));
  }
}

export const templateService = new TemplateService();
