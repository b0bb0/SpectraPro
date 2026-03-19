'use client';

import { useEffect, useMemo, useState } from 'react';
import { integrationsAPI } from '@/lib/api';
import { Plus, RefreshCw, PlugZap } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  provider?: string | null;
  type: 'HTTP_JSON' | 'SHODAN';
  endpointUrl: string;
  query?: string | null;
  authType: 'NONE' | 'BEARER' | 'API_KEY';
  isActive: boolean;
  lastSyncedAt?: string | null;
  lastSyncStatus: 'NEVER' | 'SUCCESS' | 'FAILED';
  lastSyncError?: string | null;
  _count?: { records: number };
}

interface IntegrationRecord {
  id: string;
  externalId?: string | null;
  title?: string | null;
  severity?: string | null;
  status?: string | null;
  fetchedAt: string;
  data: Record<string, any>;
}

interface ShodanAssessmentExposure {
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
}

interface ShodanAssessmentResult {
  target: string;
  overallRiskScore: number;
  executiveSummary: string;
  keyFindings: string[];
  recommendedActions: string[];
  exposures: ShodanAssessmentExposure[];
}

interface NmapAssessmentPort {
  riskScore: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  reason: string;
  port: number;
  protocol: string;
  state: string;
  service: string | null;
  product: string | null;
  version: string | null;
}

interface NmapAssessmentResult {
  target: string;
  overallRiskScore: number;
  executiveSummary: string;
  keyFindings: string[];
  recommendedActions: string[];
  ports: NmapAssessmentPort[];
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [records, setRecords] = useState<IntegrationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncingId, setSyncingId] = useState<string>('');
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState('');
  const [assessmentTarget, setAssessmentTarget] = useState('');
  const [assessment, setAssessment] = useState<ShodanAssessmentResult | null>(null);
  const [nmapTarget, setNmapTarget] = useState('');
  const [nmapAssessment, setNmapAssessment] = useState<NmapAssessmentResult | null>(null);
  const [assessingNmap, setAssessingNmap] = useState(false);

  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [type, setType] = useState<'HTTP_JSON' | 'SHODAN'>('HTTP_JSON');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [query, setQuery] = useState('');
  const [authType, setAuthType] = useState<'NONE' | 'BEARER' | 'API_KEY'>('NONE');
  const [authValue, setAuthValue] = useState('');
  const [customHeaderName, setCustomHeaderName] = useState('x-api-key');
  const [shodanSnippet, setShodanSnippet] = useState('');

  const selectedIntegration = useMemo(
    () => integrations.find((i) => i.id === selectedId),
    [integrations, selectedId]
  );

  useEffect(() => {
    if (type === 'SHODAN') {
      setAuthType('API_KEY');
      setCustomHeaderName('x-shodan-key');
      if (!provider) setProvider('Shodan');
    }
  }, [type]);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const data = await integrationsAPI.list();
      setIntegrations(data || []);

      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      } else if (selectedId && !data.some((i: Integration) => i.id === selectedId) && data.length > 0) {
        setSelectedId(data[0].id);
      }
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (integrationId: string) => {
    try {
      const data = await integrationsAPI.records(integrationId, 100);
      setRecords(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load records');
      setRecords([]);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadRecords(selectedId);
    } else {
      setRecords([]);
    }
  }, [selectedId]);

  const parseShodanSnippet = () => {
    const keyMatch = shodanSnippet.match(/Shodan\(['"]([^'"]+)['"]\)/);
    const queryMatch = shodanSnippet.match(/query\s*=\s*["']([^"']+)["']/);
    if (keyMatch?.[1]) {
      setAuthValue(keyMatch[1]);
    }
    if (queryMatch?.[1]) {
      setQuery(queryMatch[1]);
    }
    if (keyMatch?.[1] || queryMatch?.[1]) {
      setType('SHODAN');
      setAuthType('API_KEY');
      setCustomHeaderName('x-shodan-key');
      setEndpointUrl('https://api.shodan.io/shodan/host/search');
      if (!name) setName('Shodan Integration');
      if (!provider) setProvider('Shodan');
    }
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const created = await integrationsAPI.create({
        name,
        provider: provider || undefined,
        type,
        endpointUrl: type === 'SHODAN' ? 'https://api.shodan.io/shodan/host/search' : endpointUrl,
        query: type === 'SHODAN' ? query : undefined,
        authType,
        authValue: authType === 'NONE' ? undefined : authValue,
        customHeaderName: authType === 'API_KEY' ? customHeaderName : undefined,
      });

      setName('');
      setProvider('');
      setType('HTTP_JSON');
      setEndpointUrl('');
      setQuery('');
      setAuthType('NONE');
      setAuthValue('');
      setCustomHeaderName('x-api-key');
      setShodanSnippet('');

      await loadIntegrations();
      setSelectedId(created.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create integration');
    } finally {
      setCreating(false);
    }
  };

  const onSync = async (integrationId: string) => {
    setSyncingId(integrationId);
    setError('');
    try {
      await integrationsAPI.sync(integrationId);
      await loadIntegrations();
      if (selectedId === integrationId) {
        await loadRecords(integrationId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sync integration');
    } finally {
      setSyncingId('');
    }
  };

  const onAssessTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentTarget.trim()) return;
    setAssessing(true);
    setError('');
    try {
      const result = await integrationsAPI.assessShodanTarget(assessmentTarget.trim());
      setAssessment(result);
    } catch (err: any) {
      setError(err.message || 'Failed to run Shodan assessment');
      setAssessment(null);
    } finally {
      setAssessing(false);
    }
  };

  const onAssessNmap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nmapTarget.trim()) return;
    setAssessingNmap(true);
    setError('');
    try {
      const result = await integrationsAPI.assessNmapTarget(nmapTarget.trim());
      setNmapAssessment(result);
    } catch (err: any) {
      setError(err.message || 'Failed to run Nmap assessment');
      setNmapAssessment(null);
    } finally {
      setAssessingNmap(false);
    }
  };

  const severityClass = (sev: ShodanAssessmentExposure['severity']) => {
    if (sev === 'CRITICAL') return 'bg-purple-500/20 text-purple-300';
    if (sev === 'HIGH') return 'bg-red-500/20 text-red-300';
    if (sev === 'MEDIUM') return 'bg-orange-500/20 text-orange-300';
    if (sev === 'LOW') return 'bg-yellow-500/20 text-yellow-300';
    return 'bg-blue-500/20 text-blue-300';
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="text-gray-400">Add tools and sync their data into SpectraPRO.</p>
      </div>

      {error && (
        <div className="glass-panel p-4 bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Shodan Target Assessment</h2>
        <p className="text-gray-400 text-sm mb-4">
          Enter only target domain/IP. Backend fetches Shodan data, then local Ollama prioritizes relevant exposures and calculates risk score.
        </p>
        <form onSubmit={onAssessTarget} className="flex flex-col md:flex-row gap-3">
          <input
            className="input-field flex-1"
            placeholder="example.com or 1.2.3.4"
            value={assessmentTarget}
            onChange={(e) => setAssessmentTarget(e.target.value)}
            required
          />
          <button type="submit" disabled={assessing} className="btn-premium px-5 py-2 flex items-center justify-center space-x-2">
            <RefreshCw className={`w-4 h-4 ${assessing ? 'animate-spin' : ''}`} />
            <span>{assessing ? 'Assessing...' : 'Assess Exposure'}</span>
          </button>
        </form>
      </div>

      {assessment && (
        <div className="glass-panel p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Assessment Result: {assessment.target}</h3>
              <p className="text-gray-300 mt-1">{assessment.executiveSummary}</p>
            </div>
            <div className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-semibold">
              Risk Score: {assessment.overallRiskScore}/100
            </div>
          </div>

          {assessment.keyFindings.length > 0 && (
            <div>
              <h4 className="text-white font-semibold mb-2">Key Findings</h4>
              <ul className="space-y-1 text-sm text-gray-300">
                {assessment.keyFindings.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-white font-semibold mb-2">Prioritized Exposed Data</h4>
            {assessment.exposures.length === 0 ? (
              <p className="text-gray-400 text-sm">No exposed services found.</p>
            ) : (
              <div className="space-y-2">
                {assessment.exposures.slice(0, 30).map((exp, idx) => (
                  <div key={`${exp.ip}-${exp.port}-${idx}`} className="p-3 rounded-lg bg-dark-200 border border-dark-300">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${severityClass(exp.severity)}`}>{exp.severity}</span>
                      <span className="text-white font-medium">{exp.ip || 'n/a'}:{exp.port || 'n/a'}</span>
                      <span className="text-gray-400 text-sm">{exp.service || 'unknown service'}</span>
                      <span className="text-cyan-300 text-xs">Relevance {exp.relevanceScore}</span>
                      <span className="text-cyan-300 text-xs">Risk {exp.riskScore}</span>
                    </div>
                    <p className="text-sm text-gray-300">{exp.reason}</p>
                    <p className="text-xs text-cyan-300 mt-1">
                      Match: {exp.matchReason} {exp.matchedValues?.length ? `(${exp.matchedValues.join(', ')})` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Nmap Target Assessment</h2>
        <p className="text-gray-400 text-sm mb-4">
          Enter target domain/IP. Backend runs Nmap service detection and local Ollama prioritizes risk.
        </p>
        <form onSubmit={onAssessNmap} className="flex flex-col md:flex-row gap-3">
          <input
            className="input-field flex-1"
            placeholder="example.com or 1.2.3.4"
            value={nmapTarget}
            onChange={(e) => setNmapTarget(e.target.value)}
            required
          />
          <button type="submit" disabled={assessingNmap} className="btn-premium px-5 py-2 flex items-center justify-center space-x-2">
            <RefreshCw className={`w-4 h-4 ${assessingNmap ? 'animate-spin' : ''}`} />
            <span>{assessingNmap ? 'Assessing...' : 'Assess Nmap'}</span>
          </button>
        </form>
      </div>

      {nmapAssessment && (
        <div className="glass-panel p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Nmap Result: {nmapAssessment.target}</h3>
              <p className="text-gray-300 mt-1">{nmapAssessment.executiveSummary}</p>
            </div>
            <div className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-semibold">
              Risk Score: {nmapAssessment.overallRiskScore}/100
            </div>
          </div>
          <div className="space-y-2">
            {nmapAssessment.ports.slice(0, 30).map((p, idx) => (
              <div key={`${p.port}-${p.protocol}-${idx}`} className="p-3 rounded-lg bg-dark-200 border border-dark-300">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${severityClass(p.severity as any)}`}>{p.severity}</span>
                  <span className="text-white font-medium">{p.port}/{p.protocol}</span>
                  <span className="text-gray-300">{p.service || 'unknown'}</span>
                  <span className="text-cyan-300 text-xs">Risk {p.riskScore}</span>
                </div>
                <p className="text-sm text-gray-300">{p.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 lg:col-span-1">
          <h2 className="text-lg font-semibold text-white mb-4">Add Tool</h2>
          <form onSubmit={onCreate} className="space-y-3">
            <input className="input-field w-full" placeholder="Integration name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="input-field w-full" placeholder="Provider (e.g. Jira, Snyk)" value={provider} onChange={(e) => setProvider(e.target.value)} />
            <select className="input-field w-full" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="HTTP_JSON">HTTP JSON</option>
              <option value="SHODAN">Shodan</option>
            </select>
            {type === 'SHODAN' ? (
              <>
                <textarea
                  className="input-field w-full min-h-[120px]"
                  placeholder="Paste Shodan Python snippet here"
                  value={shodanSnippet}
                  onChange={(e) => setShodanSnippet(e.target.value)}
                />
                <button type="button" onClick={parseShodanSnippet} className="btn-secondary w-full py-2">
                  Parse Shodan Snippet
                </button>
                <input className="input-field w-full" placeholder="Shodan query (e.g. hostname:example.com)" value={query} onChange={(e) => setQuery(e.target.value)} required />
              </>
            ) : (
              <input className="input-field w-full" placeholder="Endpoint URL (JSON API)" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} required />
            )}
            <select className="input-field w-full" value={authType} onChange={(e) => setAuthType(e.target.value as any)}>
              <option value="NONE">No Auth</option>
              <option value="BEARER">Bearer Token</option>
              <option value="API_KEY">API Key Header</option>
            </select>
            {authType !== 'NONE' && (
              <input className="input-field w-full" placeholder={authType === 'BEARER' ? 'Bearer token' : 'API key value'} value={authValue} onChange={(e) => setAuthValue(e.target.value)} required />
            )}
            {authType === 'API_KEY' && (
              <input className="input-field w-full" placeholder="Header name" value={customHeaderName} onChange={(e) => setCustomHeaderName(e.target.value)} required />
            )}
            <button type="submit" disabled={creating} className="btn-premium w-full flex items-center justify-center space-x-2">
              {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>{creating ? 'Adding...' : 'Add Integration'}</span>
            </button>
          </form>
        </div>

        <div className="glass-panel p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Connected Tools</h2>
            <button onClick={loadIntegrations} className="btn-secondary px-3 py-2 flex items-center space-x-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {integrations.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <PlugZap className="w-12 h-12 mx-auto mb-3 opacity-60" />
              No integrations yet
            </div>
          ) : (
            <div className="space-y-3">
              {integrations.map((integration) => (
                <button
                  key={integration.id}
                  onClick={() => setSelectedId(integration.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedId === integration.id
                      ? 'border-cyan-400/60 bg-cyan-400/10'
                      : 'border-dark-300 bg-dark-200 hover:border-cyan-400/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-white">{integration.name}</p>
                    <span className={`text-xs px-2 py-1 rounded ${
                      integration.lastSyncStatus === 'SUCCESS'
                        ? 'bg-green-500/20 text-green-400'
                        : integration.lastSyncStatus === 'FAILED'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {integration.lastSyncStatus}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{integration.provider || integration.type}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Records: {integration._count?.records || 0}
                    {integration.lastSyncedAt ? ` • Last sync: ${new Date(integration.lastSyncedAt).toLocaleString()}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedIntegration && (
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedIntegration.name} Data</h2>
              <p className="text-sm text-gray-400">{selectedIntegration.endpointUrl}</p>
            </div>
            <button
              onClick={() => onSync(selectedIntegration.id)}
              disabled={syncingId === selectedIntegration.id}
              className="btn-secondary px-4 py-2 flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${syncingId === selectedIntegration.id ? 'animate-spin' : ''}`} />
              <span>{syncingId === selectedIntegration.id ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {selectedIntegration.lastSyncStatus === 'FAILED' && selectedIntegration.lastSyncError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {selectedIntegration.lastSyncError}
            </div>
          )}

          {records.length === 0 ? (
            <p className="text-gray-400">No synced records yet. Click "Sync Now".</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-gray-300">External ID</th>
                    <th className="text-left py-2 px-2 text-gray-300">Title</th>
                    <th className="text-left py-2 px-2 text-gray-300">Severity</th>
                    <th className="text-left py-2 px-2 text-gray-300">Status</th>
                    <th className="text-left py-2 px-2 text-gray-300">Fetched</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-border/40">
                      <td className="py-2 px-2 text-gray-300">{record.externalId || '-'}</td>
                      <td className="py-2 px-2 text-white">{record.title || '-'}</td>
                      <td className="py-2 px-2 text-gray-300">{record.severity || '-'}</td>
                      <td className="py-2 px-2 text-gray-300">{record.status || '-'}</td>
                      <td className="py-2 px-2 text-gray-400">{new Date(record.fetchedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
