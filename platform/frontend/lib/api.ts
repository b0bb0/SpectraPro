/**
 * API Client Utilities
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:5001' : '');

if (!API_URL && typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  console.warn(
    '[SpectraPro] NEXT_PUBLIC_API_URL is not set. API calls will use relative URLs — this only works behind a reverse proxy that forwards /api/* to the backend.'
  );
}

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasMore?: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
}

async function fetchAPI<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Important for cookies
  };

  try {
    const response = await fetch(url, config);
    const data: APIResponse<T> = await response.json();

    if (!response.ok || !data.success) {
      throw new APIError(
        data.error?.message || 'Request failed',
        response.status,
        data.error?.code
      );
    }

    return data.data as T;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // Development: Show raw errors for debugging
      console.error('Raw API error:', error);
      if (error instanceof APIError) {
        throw error;
      }
      throw error;
    } else {
      // Production: Show sanitized errors
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError('Network error', 0);
    }
  }
}

/**
 * SWR fetcher — pass as the fetcher to useSWR for automatic caching/revalidation
 * Usage: useSWR('/api/scans', swrFetcher)
 */
export const swrFetcher = <T = any>(endpoint: string) => fetchAPI<T>(endpoint);

async function fetchAPIWithMeta<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T; meta: APIResponse['meta'] }> {
  const url = `${API_URL}${endpoint}`;

  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Important for cookies
  };

  try {
    const response = await fetch(url, config);
    const result: APIResponse<T> = await response.json();

    if (!response.ok || !result.success) {
      throw new APIError(
        result.error?.message || 'Request failed',
        response.status,
        result.error?.code
      );
    }

    return {
      data: result.data as T,
      meta: result.meta,
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // Development: Show raw errors for debugging
      console.error('Raw API error (with meta):', error);
      if (error instanceof APIError) {
        throw error;
      }
      throw error;
    } else {
      // Production: Show sanitized errors
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError('Network error', 0);
    }
  }
}

// Auth API
export const authAPI = {
  async login(email: string, password: string) {
    return fetchAPI<{
      token: string;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        tenant: {
          id: string;
          name: string;
          slug: string;
        };
      };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async logout() {
    return fetchAPI('/api/auth/logout', {
      method: 'POST',
    });
  },

  async me() {
    return fetchAPI<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      tenant: {
        id: string;
        name: string;
        slug: string;
        plan: string;
      };
    }>('/api/auth/me');
  },

  async refreshToken() {
    return fetchAPI<{ token: string }>('/api/auth/refresh', {
      method: 'POST',
    });
  },

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantName: string;
  }) {
    return fetchAPI<{
      token: string;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        tenant: {
          id: string;
          name: string;
          slug: string;
        };
      };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Dashboard API
export const dashboardAPI = {
  async getMetrics(timeRange: string = '30d') {
    return fetchAPI(`/api/dashboard/metrics?range=${timeRange}`);
  },

  async getRiskTrend(timeRange: string = '30d') {
    return fetchAPI(`/api/dashboard/risk-trend?range=${timeRange}`);
  },

  async getSeverityDistribution() {
    return fetchAPI('/api/dashboard/severity-distribution');
  },

  async getAssetsByCategory() {
    return fetchAPI('/api/dashboard/assets-by-category');
  },

  async getTopVulnerabilities(limit: number = 10) {
    return fetchAPI(`/api/dashboard/top-vulnerabilities?limit=${limit}`);
  },

  async getRecentScans(limit: number = 5) {
    return fetchAPI(`/api/dashboard/recent-scans?limit=${limit}`);
  },
};

// Assets API
export const assetsAPI = {
  async list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    environment?: string;
    criticality?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPIWithMeta(`/api/assets?${query}`);
  },

  async get(id: string) {
    return fetchAPI(`/api/assets/${id}`);
  },

  async create(data: any) {
    return fetchAPI('/api/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchAPI(`/api/assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchAPI(`/api/assets/${id}`, {
      method: 'DELETE',
    });
  },

  async getVulnerabilities(id: string) {
    return fetchAPI(`/api/assets/${id}/vulnerabilities`);
  },

  async getScans(id: string) {
    return fetchAPI(`/api/assets/${id}/scans`);
  },

  async getHierarchy(id: string) {
    return fetchAPI(`/api/assets/${id}/hierarchy`);
  },

  async getStats() {
    return fetchAPI('/api/assets/stats');
  },

  async bulkCreate(assets: any[], source?: string) {
    return fetchAPI('/api/assets/bulk', {
      method: 'POST',
      body: JSON.stringify({ assets, source }),
    });
  },

  async promoteFromExposure(subdomain: string, parentDomain?: string) {
    return fetchAPI('/api/assets/promote', {
      method: 'POST',
      body: JSON.stringify({ subdomain, parentDomain }),
    });
  },
};

// Vulnerabilities API
export const vulnerabilitiesAPI = {
  async list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    severity?: string;
    status?: string;
    assetId?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPIWithMeta(`/api/vulnerabilities?${query}`);
  },

  async get(id: string) {
    return fetchAPI(`/api/vulnerabilities/${id}`);
  },

  async create(data: any) {
    return fetchAPI('/api/vulnerabilities', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchAPI(`/api/vulnerabilities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchAPI(`/api/vulnerabilities/${id}`, {
      method: 'DELETE',
    });
  },

  async analyze(id: string) {
    return fetchAPI(`/api/vulnerabilities/${id}/analyze`, {
      method: 'POST',
    });
  },
};

// Scans API
export const scansAPI = {
  async list(params?: {
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/scans?${query}`);
  },

  async getAll() {
    return fetchAPI<any[]>('/api/scans');
  },

  async get(id: string) {
    return fetchAPI(`/api/scans/${id}`);
  },

  async getById(id: string) {
    return fetchAPI<any>(`/api/scans/${id}`);
  },

  async create(data: {
    assetId: string;
    name: string;
    type: string;
    scheduledFor: string;
  }) {
    return fetchAPI<any>('/api/scans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async start(data: {
    target: string;
    scanLevel: 'light' | 'normal' | 'extreme';
  }) {
    return fetchAPI<{
      scanId: string;
      status: string;
      message: string;
    }>('/api/scans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async bulkScan(data: {
    targets: string[];
    scanLevel: 'light' | 'normal' | 'extreme';
    maxConcurrent?: number;
  }) {
    return fetchAPI<{
      batchId: string;
      totalTargets: number;
      maxConcurrent: number;
      message: string;
      status: string;
    }>('/api/scans/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async kill(id: string) {
    return fetchAPI<{
      scanId: string;
      killedProcesses: number;
      status: string;
    }>(`/api/scans/${id}/kill`, {
      method: 'POST',
    });
  },
};

export const integrationsAPI = {
  async list() {
    return fetchAPI<any[]>('/api/integrations');
  },

  async create(data: {
    name: string;
    provider?: string;
    type: 'HTTP_JSON' | 'SHODAN';
    endpointUrl: string;
    query?: string;
    authType: 'NONE' | 'BEARER' | 'API_KEY';
    authValue?: string;
    customHeaderName?: string;
  }) {
    return fetchAPI<any>('/api/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: { name?: string; authValue?: string; query?: string }) {
    return fetchAPI<any>(`/api/integrations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchAPI(`/api/integrations/${id}`, {
      method: 'DELETE',
    });
  },

  async sync(id: string) {
    return fetchAPI<{ recordsSynced: number }>(`/api/integrations/${id}/sync`, {
      method: 'POST',
    });
  },

  async records(id: string, limit: number = 100) {
    return fetchAPI<any[]>(`/api/integrations/${id}/records?limit=${limit}`);
  },

  async assessShodanTarget(target: string) {
    return fetchAPI<{
      target: string;
      overallRiskScore: number;
      executiveSummary: string;
      keyFindings: string[];
      recommendedActions: string[];
      exposures: Array<{
        relevanceScore: number;
        riskScore: number;
        severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
        reason: string;
        ip: string | null;
        port: number | null;
        service: string | null;
        organization: string | null;
        hostnames: string[];
        matchedValues: string[];
        matchReason: 'exact_ip' | 'exact_domain' | 'subdomain_domain';
        timestamp: string | null;
        raw: Record<string, any>;
      }>;
    }>('/api/integrations/shodan/assess', {
      method: 'POST',
      body: JSON.stringify({ target }),
    });
  },

  async assessNmapTarget(target: string) {
    return fetchAPI<{
      target: string;
      overallRiskScore: number;
      executiveSummary: string;
      keyFindings: string[];
      recommendedActions: string[];
      ports: Array<{
        riskScore: number;
        severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
        reason: string;
        port: number;
        protocol: string;
        state: string;
        service: string | null;
        product: string | null;
        version: string | null;
      }>;
    }>('/api/integrations/nmap/assess', {
      method: 'POST',
      body: JSON.stringify({ target }),
    });
  },
};

// Users API
export const usersAPI = {
  async list() {
    return fetchAPI<any[]>('/api/users');
  },

  async getStats() {
    return fetchAPI<{
      total: number;
      active: number;
      inactive: number;
      byRole: Record<string, number>;
    }>('/api/users/stats');
  },

  async get(id: string) {
    return fetchAPI<any>(`/api/users/${id}`);
  },

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  }) {
    return fetchAPI('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: {
    firstName?: string;
    lastName?: string;
    role?: 'ADMIN' | 'ANALYST' | 'VIEWER';
    isActive?: boolean;
  }) {
    return fetchAPI(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchAPI(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  async changePassword(id: string, password: string) {
    return fetchAPI(`/api/users/${id}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },
};

// Audit Log API
export const auditAPI = {
  async list(params?: {
    page?: number;
    limit?: number;
    action?: string;
    resource?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI<{
      logs: any[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/audit?${query}`);
  },

  async getStats(days?: number) {
    const query = days ? `?days=${days}` : '';
    return fetchAPI<{
      totalActions: number;
      actionsByType: Record<string, number>;
      topUsers: Array<{ userId: string; email: string; count: number }>;
      recentActivity: number;
    }>(`/api/audit/stats${query}`);
  },

  async exportCSV(params?: {
    action?: string;
    resource?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    const response = await fetch(`${API_URL}/api/audit/export?${query}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};

// Attack Surface Graph API
export const graphAPI = {
  async getGraph() {
    return fetchAPI<{
      nodes: Array<{
        id: string;
        label: string;
        type: string;
        group: string;
        value: number;
        color: string;
        metadata: any;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label: string;
        color: string;
        width: number;
        metadata: any;
      }>;
      stats: {
        totalAssets: number;
        totalVulnerabilities: number;
        criticalPaths: number;
        riskScore: number;
      };
    }>('/api/graph');
  },

  async getThreatPaths() {
    return fetchAPI<{
      paths: Array<{
        assets: string[];
        vulnerabilities: string[];
        severity: string;
        riskScore: number;
      }>;
    }>('/api/graph/threat-paths');
  },

  async getTargetAssets() {
    return fetchAPI<Array<{
      id: string;
      name: string;
      type: string;
      vulnCount: number;
      criticalCount: number;
      highCount: number;
    }>>('/api/graph/targets');
  },

  async getRadialGraph(assetId: string) {
    return fetchAPI<{
      nodes: Array<{
        id: string;
        label: string;
        type: string;
        group: string;
        value: number;
        color: string;
        metadata: any;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label: string;
        color: string;
        width: number;
        metadata: any;
      }>;
      stats: {
        totalAssets: number;
        totalVulnerabilities: number;
        criticalPaths: number;
        riskScore: number;
      };
    }>(`/api/graph/radial/${assetId}`);
  },
};

// Exposure API
export const exposureAPI = {
  async enumerate(domain: string) {
    return fetchAPI<{
      scanId: string;
      status: string;
      message: string;
    }>('/api/exposure/enumerate', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    });
  },

  async listScans(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return fetchAPI<any[]>(`/api/exposure/scans${query}`);
  },

  async getScan(scanId: string) {
    return fetchAPI<any>(`/api/exposure/scans/${scanId}`);
  },

  async deleteScan(scanId: string) {
    return fetchAPI(`/api/exposure/scans/${scanId}`, {
      method: 'DELETE',
    });
  },

  async killScan(scanId: string) {
    return fetchAPI<{ status: string; killedProcesses: number }>(`/api/exposure/scans/${scanId}/kill`, {
      method: 'POST',
    });
  },

  async checkSublist3r() {
    return fetchAPI<{
      installed: boolean;
      message: string;
    }>('/api/exposure/check-sublist3r');
  },
};

// Templates API
export const templatesAPI = {
  async list(params?: {
    status?: 'ACTIVE' | 'INACTIVE' | 'VALIDATING' | 'FAILED';
    category?: string;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI<any[]>(`/api/templates?${query}`);
  },

  async get(id: string) {
    return fetchAPI<any>(`/api/templates/${id}`);
  },

  async create(data: {
    name: string;
    description?: string;
    content: string;
    fileName: string;
  }) {
    return fetchAPI<any>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async validate(content: string) {
    return fetchAPI<{
      isValid: boolean;
      metadata?: any;
    }>('/api/templates/validate', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  async updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    return fetchAPI<any>(`/api/templates/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async delete(id: string) {
    return fetchAPI(`/api/templates/${id}`, {
      method: 'DELETE',
    });
  },
};

// Scheduled Scans API
export const scheduledScansAPI = {
  async list(params?: {
    status?: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'DISABLED';
    isActive?: boolean;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI<any[]>(`/api/scheduled-scans?${query}`);
  },

  async get(id: string) {
    return fetchAPI<any>(`/api/scheduled-scans/${id}`);
  },

  async create(data: {
    name: string;
    description?: string;
    scanType?: 'NUCLEI' | 'NMAP' | 'MANUAL';
    scanProfile?: 'LIGHT' | 'BALANCED' | 'AGGRESSIVE' | 'EXTREME';
    severity?: string[];
    frequency: 'ONCE' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
    cronExpression?: string;
    timezone?: string;
    startDate?: string;
    endDate?: string;
    assetIds?: string[];
    targetUrls?: string[];
    notifyOnCompletion?: boolean;
    notifyOnFailure?: boolean;
    notifyEmails?: string[];
  }) {
    return fetchAPI<any>('/api/scheduled-scans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchAPI<any>(`/api/scheduled-scans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async pause(id: string) {
    return fetchAPI<any>(`/api/scheduled-scans/${id}/pause`, {
      method: 'PATCH',
    });
  },

  async resume(id: string) {
    return fetchAPI<any>(`/api/scheduled-scans/${id}/resume`, {
      method: 'PATCH',
    });
  },

  async delete(id: string) {
    return fetchAPI(`/api/scheduled-scans/${id}`, {
      method: 'DELETE',
    });
  },

  async execute(id: string) {
    return fetchAPI<any>(`/api/scheduled-scans/${id}/execute`, {
      method: 'POST',
    });
  },

  async getExecutions(id: string, params?: { limit?: number; offset?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI<any>(`/api/scheduled-scans/${id}/executions?${query}`);
  },
};

// Reconnaissance API
export const reconAPI = {
  async initialize(data: {
    target: string;
    scanId: string;
    assetId: string;
  }) {
    return fetchAPI<any>('/api/recon/initialize', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getSession(sessionId: string) {
    return fetchAPI<any>(`/api/recon/${sessionId}`);
  },

  async getSessionsByScan(scanId: string) {
    return fetchAPI<any>(`/api/recon/scan/${scanId}`);
  },

  async getSessionsByAsset(assetId: string) {
    return fetchAPI<any>(`/api/recon/asset/${assetId}`);
  },

  async getAssetsStatus() {
    return fetchAPI<Record<string, {
      latestSessionId: string;
      latestStatus: string;
      lastScannedAt: string;
      sessionCount: number;
      completedPhases: number;
      totalPhases: number;
      hasRunning: boolean;
    }>>(`/api/recon/assets/status`);
  },

  async getPhaseRuns(sessionId: string) {
    return fetchAPI<any>(`/api/recon/${sessionId}/phase-runs`);
  },

  async getSelection(sessionId: string) {
    return fetchAPI<any>(`/api/recon/${sessionId}/selection`);
  },

  async saveSelection(data: {
    sessionId: string;
    selectedPorts?: any;
    selectedServiceUrls?: any;
    selectedFeroxEndpoints?: any;
    selectedNucleiTargets?: any;
    selectedNucleiTags?: any;
    scopeNotes?: string;
  }) {
    return fetchAPI<any>('/api/recon/selection', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAIAnalysis(sessionId: string) {
    return fetchAPI<any>(`/api/recon/${sessionId}/ai-analysis`);
  },

  async getArtifacts(sessionId: string) {
    return fetchAPI<any>(`/api/recon/artifacts?sessionId=${sessionId}`);
  },

  async getFindings(sessionId: string, stage?: string) {
    const query = stage ? `?stage=${stage}` : '';
    return fetchAPI<any>(`/api/recon/${sessionId}/findings${query}`);
  },

  async getScreenshots(sessionId: string) {
    return fetchAPI<any>(`/api/recon/${sessionId}/screenshots`);
  },

  getScreenshotUrl(artifactId: string) {
    return `${API_URL}/api/recon/screenshot/${artifactId}`;
  },

  async analyzeEndpoints(sessionId: string) {
    return fetchAPI<any>(`/api/recon/${sessionId}/analyze-endpoints`, {
      method: 'POST',
    });
  },

  async runPhase(data: {
    sessionId: string;
    phase: string;
    parameters?: any;
  }) {
    return fetchAPI<any>('/api/recon/run', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async cancelPhase(data: {
    sessionId: string;
    phase: string;
  }) {
    return fetchAPI<any>('/api/recon/cancel', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Reports API
export const reportsAPI = {
  async generateExecutivePDF() {
    const response = await fetch(`${API_URL}/api/reports/pdf/executive`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || 'Failed to generate report');
    }

    // Get filename from Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch ? filenameMatch[1] : `executive-summary-${Date.now()}.pdf`;

    // Download the file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return { success: true, filename };
  },

  async generateDetailedPDF(options?: {
    assetIds?: string[];
    severities?: string[];
    dateFrom?: string;
    dateTo?: string;
  }) {
    const response = await fetch(`${API_URL}/api/reports/pdf/detailed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(options || {}),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || 'Failed to generate report');
    }

    // Get filename from Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch ? filenameMatch[1] : `detailed-report-${Date.now()}.pdf`;

    // Download the file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return { success: true, filename };
  },
};

// Source Scanner API
export const sourceScannerAPI = {
  async startScan(data: {
    url: string;
    depth?: number;
    maxPages?: number;
    includeInline?: boolean;
    customPrompt?: string;
  }) {
    return fetchAPI<{ scanId: string; status: string }>('/api/source-scanner/scan', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getScan(scanId: string) {
    return fetchAPI<any>(`/api/source-scanner/scan/${scanId}`);
  },

  async listScans() {
    return fetchAPI<any[]>('/api/source-scanner/scans');
  },
};
