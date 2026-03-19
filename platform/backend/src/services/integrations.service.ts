import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { IntegrationAuthType, IntegrationSyncStatus, IntegrationType } from '@prisma/client';

interface CreateIntegrationInput {
  name: string;
  provider?: string;
  type: IntegrationType;
  endpointUrl: string;
  query?: string;
  authType: IntegrationAuthType;
  authValue?: string;
  customHeaderName?: string;
  tenantId: string;
  userId: string;
}

class IntegrationsService {
  async list(tenantId: string) {
    return prisma.tool_integrations.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            records: true,
          },
        },
      },
    });
  }

  async create(input: CreateIntegrationInput) {
    const created = await prisma.tool_integrations.create({
      data: {
        name: input.name,
        provider: input.provider,
        type: input.type,
      endpointUrl: input.endpointUrl,
      query: input.query || null,
        authType: input.authType,
        authValue: input.authValue || null,
        customHeaderName: input.customHeaderName || null,
        tenantId: input.tenantId,
        createdById: input.userId,
      },
    });

    return created;
  }

  async update(integrationId: string, tenantId: string, input: Partial<Omit<CreateIntegrationInput, 'tenantId' | 'userId'>>) {
    const existing = await prisma.tool_integrations.findFirst({
      where: { id: integrationId, tenantId },
    });
    if (!existing) {
      throw new Error('Integration not found');
    }
    return prisma.tool_integrations.update({
      where: { id: integrationId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.provider !== undefined && { provider: input.provider }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.endpointUrl !== undefined && { endpointUrl: input.endpointUrl }),
        ...(input.query !== undefined && { query: input.query }),
        ...(input.authType !== undefined && { authType: input.authType }),
        ...(input.authValue !== undefined && { authValue: input.authValue }),
        ...(input.customHeaderName !== undefined && { customHeaderName: input.customHeaderName }),
      },
    });
  }

  async delete(integrationId: string, tenantId: string) {
    const existing = await prisma.tool_integrations.findFirst({
      where: { id: integrationId, tenantId },
    });
    if (!existing) {
      throw new Error('Integration not found');
    }
    await prisma.tool_integrations.delete({ where: { id: integrationId } });
  }

  async getRecords(integrationId: string, tenantId: string, limit = 100) {
    return prisma.integration_records.findMany({
      where: {
        integrationId,
        tenantId,
      },
      orderBy: { fetchedAt: 'desc' },
      take: limit,
    });
  }

  async sync(integrationId: string, tenantId: string): Promise<{ recordsSynced: number }> {
    const integration = await prisma.tool_integrations.findFirst({
      where: {
        id: integrationId,
        tenantId,
      },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (integration.authType === 'BEARER' && integration.authValue) {
      headers.Authorization = `Bearer ${integration.authValue}`;
    } else if (integration.authType === 'API_KEY' && integration.authValue) {
      headers[integration.customHeaderName || 'x-api-key'] = integration.authValue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      let payload: any;
      if (integration.type === IntegrationType.SHODAN) {
        if (!integration.authValue) {
          throw new Error('Shodan API key is required');
        }
        if (!integration.query) {
          throw new Error('Shodan query is required');
        }
        try {
          // Match shodan-python stream.custom(query=..., raw=False, timeout=...)
          const streamRecords = await this.fetchShodanCustomStream(
            integration.authValue,
            integration.query,
            10000,
            200
          );
          payload = { matches: streamRecords };
        } catch (streamError: any) {
          logger.warn(`[INTEGRATIONS] Shodan stream failed, falling back to search API: ${streamError.message}`);

          // Fallback for plans without Streaming API access
          const shodanUrl = new URL('https://api.shodan.io/shodan/host/search');
          shodanUrl.searchParams.set('key', integration.authValue);
          shodanUrl.searchParams.set('query', integration.query);
          shodanUrl.searchParams.set('minify', 'true');
          shodanUrl.searchParams.set('page', '1');

          const response = await fetch(shodanUrl.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Shodan API returned ${response.status}`);
          }
          payload = await response.json();
        }
      } else {
        const response = await fetch(integration.endpointUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Tool endpoint returned ${response.status}`);
        }
        payload = await response.json();
      }
      const rawRecords = this.extractRecords(payload);
      const records = rawRecords.slice(0, 500);

      await prisma.$transaction(async (tx) => {
        await tx.integration_records.deleteMany({
          where: { integrationId: integration.id },
        });

        if (records.length > 0) {
          await tx.integration_records.createMany({
            data: records.map((item: any) => {
              const normalized = this.normalizeItem(item);
              return {
                integrationId: integration.id,
                tenantId,
                externalId: normalized.externalId,
                title: normalized.title,
                severity: normalized.severity,
                status: normalized.status,
                data: normalized.data,
              };
            }),
          });
        }

        await tx.tool_integrations.update({
          where: { id: integration.id },
          data: {
            lastSyncedAt: new Date(),
            lastSyncStatus: IntegrationSyncStatus.SUCCESS,
            lastSyncError: null,
          },
        });
      });

      return { recordsSynced: records.length };
    } catch (error: any) {
      logger.error(`[INTEGRATIONS] Sync failed for ${integrationId}: ${error.message}`);

      await prisma.tool_integrations.update({
        where: { id: integration.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncStatus: IntegrationSyncStatus.FAILED,
          lastSyncError: error.message,
        },
      });

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractRecords(payload: unknown): any[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, any>;
      if (Array.isArray(obj.matches)) return obj.matches;
      if (Array.isArray(obj.items)) return obj.items;
      if (Array.isArray(obj.data)) return obj.data;
      return [obj];
    }

    return [{ value: payload }];
  }

  private async fetchShodanCustomStream(
    apiKey: string,
    query: string,
    timeoutMs: number,
    maxRecords: number
  ): Promise<any[]> {
    const streamUrl = new URL('https://stream.shodan.io/shodan/custom');
    streamUrl.searchParams.set('key', apiKey);
    streamUrl.searchParams.set('query', query);
    // Same behavior as shodan-python when timeout is set
    streamUrl.searchParams.set('heartbeat', 'false');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(streamUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `Shodan stream returned ${response.status}`;
        try {
          const err = await response.json();
          if (err?.error) errorMessage = err.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        return [];
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffered = '';
      const records: any[] = [];

      while (records.length < maxRecords) {
        const { value, done } = await reader.read();
        if (done) break;

        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue; // ignore heartbeat
          try {
            records.push(JSON.parse(trimmed));
          } catch {
            // ignore malformed stream lines
          }
          if (records.length >= maxRecords) break;
        }
      }

      return records;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeItem(item: any): {
    externalId: string | null;
    title: string | null;
    severity: string | null;
    status: string | null;
    data: any;
  } {
    const data = item && typeof item === 'object' ? item : { value: item };
    return {
      externalId: this.asString(data.id) || this.asString(data.externalId) || this.asString(data.key),
      title: this.asString(data.title) || this.asString(data.name) || this.asString(data.summary),
      severity: this.asString(data.severity) || this.asString(data.priority) || this.asString(data.level),
      status: this.asString(data.status) || this.asString(data.state),
      data,
    };
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }
}

export const integrationsService = new IntegrationsService();
