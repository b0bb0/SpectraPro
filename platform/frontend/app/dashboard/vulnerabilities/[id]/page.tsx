'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, Sparkles, Loader2, Shield, FileText, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { vulnerabilitiesAPI } from '@/lib/api';

interface Asset {
  id: string;
  name: string;
  type: string;
  environment?: string;
  criticality?: string;
}

interface Evidence {
  id: string;
  type: string;
  description?: string;
  content?: string;
  fileUrl?: string;
  mimeType?: string;
  createdAt: string;
}

interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: string;
  cvssScore: number;
  cveId?: string;
  status: string;
  recommendation?: string;
  detectionMethod?: string;
  templateId?: string;
  targetUrl?: string;
  rawResponse?: string;
  curlCommand?: string;
  firstSeen: string;
  lastSeen: string;
  mitigatedAt?: string;
  assets: Asset;
  aiAnalysis?: string;
  aiRecommendations?: string[];
  riskScore?: number;
  analyzedAt?: string;
  tags?: string[];
  evidence?: Evidence[];
  _count?: {
    evidence: number;
  };
}

export default function VulnerabilityDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vulnerability, setVulnerability] = useState<Vulnerability | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [vulnerabilityId, setVulnerabilityId] = useState<string | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState<string | null>(null);
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo && returnTo.startsWith('/dashboard/') ? returnTo : null;

  useEffect(() => {
    // Handle params which might be a Promise in newer Next.js versions
    const resolveParams = async () => {
      const id = typeof params === 'object' && 'id' in params ? params.id : null;
      setVulnerabilityId(id);
    };
    resolveParams();
  }, [params]);

  const fetchVulnerability = async () => {
    if (!vulnerabilityId) return;

    try {
      const data = await vulnerabilitiesAPI.get(vulnerabilityId);
      setVulnerability(data);
      setError('');
    } catch (err: any) {
      console.error('Error fetching vulnerability:', err);
      setError(err.message || 'Failed to load vulnerability');
      setVulnerability(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVulnerability();
  }, [vulnerabilityId]);

  const handleAnalyze = async () => {
    if (!vulnerabilityId) return;

    setAnalyzing(true);
    try {
      await vulnerabilitiesAPI.analyze(vulnerabilityId);
      await fetchVulnerability();
    } catch (err: any) {
      console.error('Error analyzing vulnerability:', err);
      setError(err.message || 'Failed to analyze vulnerability');
    } finally {
      setAnalyzing(false);
    }
  };

  const allStatuses = ['OPEN', 'IN_PROGRESS', 'MITIGATED', 'ACCEPTED', 'FALSE_POSITIVE', 'REOPENED', 'CONTROLLED'];

  const handleStatusChange = async (newStatus: string) => {
    if (!vulnerabilityId || !vulnerability) return;

    // For CONTROLLED and ACCEPTED, prompt for reason
    if ((newStatus === 'CONTROLLED' || newStatus === 'ACCEPTED' || newStatus === 'FALSE_POSITIVE') && !showReasonInput) {
      setShowReasonInput(newStatus);
      return;
    }

    setUpdatingStatus(true);
    try {
      const updateData: any = { status: newStatus };
      if (statusReason.trim()) {
        updateData.statusReason = statusReason.trim();
      }
      await vulnerabilitiesAPI.update(vulnerabilityId, updateData);
      await fetchVulnerability();
      setStatusDropdownOpen(false);
      setShowReasonInput(null);
      setStatusReason('');
    } catch (err: any) {
      console.error('Error updating status:', err);
      setError(err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      HIGH: 'bg-red-500/20 text-red-400 border-red-500/30',
      MEDIUM: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      LOW: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      INFO: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return colors[severity.toUpperCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      OPEN: 'bg-red-500/20 text-red-400 border-red-500/30',
      IN_PROGRESS: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      MITIGATED: 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const formatStatus = (status: string) => status.replace(/_/g, ' ');
  const formatDate = (date: string) => new Date(date).toLocaleString();

  const getRiskScoreColor = (score: number) => {
    if (score >= 80) return 'text-purple-400';
    if (score >= 60) return 'text-red-400';
    if (score >= 40) return 'text-orange-400';
    if (score >= 20) return 'text-yellow-400';
    return 'text-blue-400';
  };

  const toggleEvidence = (id: string) => {
    setExpandedEvidence(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatHttpEvidence = (content: string) => {
    // Try to split HTTP request and response
    const sections = content.split(/\n\n(?=HTTP\/|GET|POST|PUT|DELETE|PATCH)/);
    return sections;
  };

  const getEvidenceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'http_response':
      case 'http_request':
        return <FileText className="w-5 h-5 text-blue-400" />;
      case 'screenshot':
        return <FileText className="w-5 h-5 text-green-400" />;
      case 'log':
        return <FileText className="w-5 h-5 text-yellow-400" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  if (error || !vulnerability) {
    return (
      <div className="p-8">
        <div className="glass-panel p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Vulnerability</h2>
          <p className="text-gray-400 mb-4">{error || 'Vulnerability not found'}</p>
          <button
            onClick={() => (safeReturnTo ? router.push(safeReturnTo) : router.push('/dashboard/vulnerabilities'))}
            className="btn-secondary px-4 py-2"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => (safeReturnTo ? router.push(safeReturnTo) : router.push('/dashboard/vulnerabilities'))}
            className="btn-secondary p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{vulnerability.title}</h1>
            {vulnerability.cveId && <p className="text-gray-400 text-sm mt-1">{vulnerability.cveId}</p>}
          </div>
        </div>
        <button onClick={fetchVulnerability} className="btn-secondary px-4 py-2 flex items-center space-x-2">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-gray-400 text-sm mb-2">Severity</p>
          <span className={`inline-block px-3 py-1 rounded text-sm font-semibold border ${getSeverityColor(vulnerability.severity)}`}>
            {vulnerability.severity}
          </span>
        </div>
        <div className="glass-panel p-4">
          <p className="text-gray-400 text-sm mb-2">Status</p>
          <span className={`inline-block px-3 py-1 rounded text-sm font-semibold border ${getStatusColor(vulnerability.status)}`}>
            {formatStatus(vulnerability.status)}
          </span>
        </div>
        <div className="glass-panel p-4">
          <p className="text-gray-400 text-sm mb-2">CVSS Score</p>
          <p className="text-2xl font-bold text-white">{vulnerability.cvssScore?.toFixed(1) || 'N/A'}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-gray-400 text-sm mb-2">AI Risk Score</p>
          <p className={`text-2xl font-bold ${vulnerability.riskScore ? getRiskScoreColor(vulnerability.riskScore) : 'text-gray-400'}`}>
            {vulnerability.riskScore ? vulnerability.riskScore.toFixed(1) : 'N/A'}
          </p>
        </div>
      </div>

      {vulnerability.aiAnalysis ? (
        <div className="glass-panel p-6 border-purple-500/30 bg-purple-500/5">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">AI Analysis</h3>
              <p className="text-xs text-gray-400">Analyzed {formatDate(vulnerability.analyzedAt!)}</p>
            </div>
          </div>
          <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{vulnerability.aiAnalysis}</p>
        </div>
      ) : (
        <div className="glass-panel p-6 text-center border-purple-500/30">
          <Sparkles className="w-12 h-12 text-purple-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Generate AI Analysis</h3>
          <p className="text-gray-400 mb-4">Get AI-powered insights and recommendations</p>
          <button onClick={handleAnalyze} disabled={analyzing} className="btn-premium px-6 py-3 flex items-center space-x-2 mx-auto">
            {analyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generate Analysis</span>
              </>
            )}
          </button>
        </div>
      )}

      {vulnerability.aiRecommendations && vulnerability.aiRecommendations.length > 0 && (
        <div className="glass-panel p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Shield className="w-6 h-6 text-green-400" />
            <h3 className="text-xl font-bold text-white">AI-Powered Recommendations</h3>
          </div>
          <ul className="space-y-3">
            {vulnerability.aiRecommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start space-x-3 p-3 bg-dark-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-white mb-4">Description</h3>
        <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{vulnerability.description}</p>
      </div>

      {vulnerability.targetUrl && (
        <div className="glass-panel p-6 border-cyan-500/30 bg-cyan-500/5">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
            <span>Vulnerability Location</span>
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-gray-400 text-sm mb-2">Target URL</p>
              <a
                href={vulnerability.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline break-all font-mono text-sm"
              >
                {vulnerability.targetUrl}
              </a>
            </div>
            {vulnerability.templateId && (
              <div>
                <p className="text-gray-400 text-sm mb-2">Detection Template</p>
                <code className="text-purple-400 bg-purple-500/10 px-3 py-1 rounded text-sm">
                  {vulnerability.templateId}
                </code>
              </div>
            )}
          </div>
        </div>
      )}

      {vulnerability.rawResponse && (
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white flex items-center space-x-2">
              <FileText className="w-6 h-6 text-orange-400" />
              <span>Raw Server Response</span>
            </h3>
          </div>
          <div className="bg-dark-300 rounded-lg overflow-hidden border border-orange-500/30">
            <div className="bg-dark-400 px-4 py-2 border-b border-orange-500/20">
              <p className="text-xs text-orange-400 font-mono">HTTP Response</p>
            </div>
            <div className="p-4 overflow-x-auto max-h-96 overflow-y-auto">
              <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                {vulnerability.rawResponse}
              </pre>
            </div>
          </div>
        </div>
      )}

      {vulnerability.curlCommand && (
        <div className="glass-panel p-6 border-green-500/30 bg-green-500/5">
          <h3 className="text-xl font-bold text-white mb-4">Reproduce with cURL</h3>
          <div className="bg-dark-300 rounded-lg overflow-hidden border border-green-500/30">
            <div className="bg-dark-400 px-4 py-2 border-b border-green-500/20 flex items-center justify-between">
              <p className="text-xs text-green-400 font-mono">Command</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(vulnerability.curlCommand!);
                  alert('Copied to clipboard!');
                }}
                className="text-xs text-green-400 hover:text-green-300 transition-colors"
              >
                Copy
              </button>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                {vulnerability.curlCommand}
              </pre>
            </div>
          </div>
        </div>
      )}

      {vulnerability.recommendation && (
        <div className="glass-panel p-6">
          <h3 className="text-xl font-bold text-white mb-4">Remediation</h3>
          <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{vulnerability.recommendation}</p>
        </div>
      )}

      {vulnerability.evidence && vulnerability.evidence.length > 0 && (
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-cyan-400" />
              <h3 className="text-xl font-bold text-white">Evidence ({vulnerability.evidence.length})</h3>
            </div>
          </div>
          <div className="space-y-3">
            {vulnerability.evidence.map((evidence) => (
              <div key={evidence.id} className="bg-dark-200 rounded-lg overflow-hidden border border-gray-700">
                <button
                  onClick={() => toggleEvidence(evidence.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-dark-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    {getEvidenceIcon(evidence.type)}
                    <div className="text-left">
                      <p className="text-white font-medium">
                        {evidence.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </p>
                      {evidence.description && (
                        <p className="text-gray-400 text-sm">{evidence.description}</p>
                      )}
                      <p className="text-gray-500 text-xs mt-1">{formatDate(evidence.createdAt)}</p>
                    </div>
                  </div>
                  {expandedEvidence.has(evidence.id) ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                {expandedEvidence.has(evidence.id) && evidence.content && (
                  <div className="p-4 bg-dark-300 border-t border-gray-700">
                    {evidence.type === 'http_response' || evidence.type === 'http_request' ? (
                      <div className="space-y-3">
                        {formatHttpEvidence(evidence.content).map((section, idx) => (
                          <div key={idx} className="bg-dark-400 rounded p-3 overflow-x-auto">
                            <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                              {section.trim()}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-dark-400 rounded p-3 overflow-x-auto">
                        <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                          {evidence.content}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-white mb-4">Asset Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-sm mb-1">Asset Name</p>
            <p className="text-white font-semibold">{vulnerability.assets?.name || "Unknown Asset"}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Asset Type</p>
            <p className="text-white font-semibold">{vulnerability.assets?.type || "Unknown"}</p>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-xl font-bold text-white mb-4">Timeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-gray-400 text-sm mb-1">First Seen</p>
            <p className="text-white">{formatDate(vulnerability.firstSeen)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">Last Seen</p>
            <p className="text-white">{formatDate(vulnerability.lastSeen)}</p>
          </div>
          {vulnerability.mitigatedAt && (
            <div>
              <p className="text-gray-400 text-sm mb-1">Mitigated</p>
              <p className="text-white">{formatDate(vulnerability.mitigatedAt)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
