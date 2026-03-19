'use client';

import { useState, useEffect, useMemo } from 'react';
import { Save, Check, Brain, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { reconAPI } from '@/lib/api';

interface Port {
  port: number;
  protocol: string;
  state: string;
  service: string;
  version?: string | null;
}

interface Endpoint {
  url: string;
  status: number;
  contentLength?: number;
}

interface AIEndpoint {
  url: string;
  reason: string;
}

interface AIAnalysis {
  high: AIEndpoint[];
  medium: AIEndpoint[];
  low: AIEndpoint[];
  skip: AIEndpoint[];
  summary: string;
  recommendedTags: string[];
}

interface ReconSelectionPanelProps {
  sessionId: string;
  nmapData?: { open_ports?: Port[] };
  feroxData?: { endpoints?: Endpoint[] };
  onSelectionSaved?: () => void;
}

const PRIORITY_META: Record<string, { label: string; color: string; border: string; bg: string; icon: string }> = {
  high:   { label: 'High Priority',   color: '#ef4444', border: 'rgba(239,68,68,0.3)',  bg: 'rgba(239,68,68,0.06)',  icon: '🔴' },
  medium: { label: 'Medium Priority', color: '#f59e0b', border: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.06)', icon: '🟡' },
  low:    { label: 'Low Priority',    color: '#3b82f6', border: 'rgba(59,130,246,0.3)',  bg: 'rgba(59,130,246,0.06)', icon: '🔵' },
  skip:   { label: 'Skip',            color: '#6b7280', border: 'rgba(107,114,128,0.3)', bg: 'rgba(107,114,128,0.06)',icon: '⚫' },
};

export function ReconSelectionPanel({
  sessionId,
  nmapData,
  feroxData,
  onSelectionSaved,
}: ReconSelectionPanelProps) {
  const [selectedPorts, setSelectedPorts] = useState<Port[]>([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [scopeNotes, setScopeNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ high: true, medium: true, low: false, skip: false });

  const availableTags = [
    { value: 'sqli', label: 'SQL Injection', description: 'Test for SQL injection vulnerabilities' },
    { value: 'xss', label: 'XSS', description: 'Test for cross-site scripting' },
    { value: 'ssrf', label: 'SSRF', description: 'Server-side request forgery' },
    { value: 'lfi', label: 'LFI', description: 'Local file inclusion' },
    { value: 'rce', label: 'RCE', description: 'Remote code execution' },
    { value: 'auth-bypass', label: 'Auth Bypass', description: 'Authentication bypass' },
    { value: 'idor', label: 'IDOR', description: 'Insecure direct object reference' },
    { value: 'xxe', label: 'XXE', description: 'XML external entity' },
    { value: 'misconfig', label: 'Misconfig', description: 'Server misconfiguration' },
    { value: 'exposure', label: 'Exposure', description: 'Information exposure' },
    { value: 'default-login', label: 'Default Login', description: 'Default credentials' },
    { value: 'traversal', label: 'Traversal', description: 'Path traversal' },
    { value: 'upload', label: 'Upload', description: 'File upload vulnerabilities' },
    { value: 'cve', label: 'CVE', description: 'Known CVE exploits' },
  ];

  // ── AI Analysis ──
  const handleAIAnalyze = async () => {
    try {
      setAiLoading(true);
      toast.info('Sending endpoints to Ollama for analysis...', { duration: 5000 });
      const result = await reconAPI.analyzeEndpoints(sessionId);
      setAiAnalysis(result);

      // Auto-select all high + medium priority endpoints
      const autoSelected = [
        ...(result.high || []).map((e: AIEndpoint) => e.url),
        ...(result.medium || []).map((e: AIEndpoint) => e.url),
      ];
      setSelectedEndpoints(autoSelected);

      // Auto-select recommended tags
      if (result.recommendedTags?.length) {
        setSelectedTags(result.recommendedTags.filter((t: string) =>
          availableTags.some(at => at.value === t)
        ));
      }

      toast.success(`AI analysis complete — ${result.high?.length || 0} high-priority targets identified`);
    } catch (error: any) {
      console.error('AI analysis failed:', error);
      const msg = error?.message || String(error);
      if (msg.includes('No endpoint discovery')) {
        toast.error('No endpoints to analyse. Run Feroxbuster first to discover endpoints.');
      } else if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('AbortError')) {
        toast.error('Ollama analysis timed out. Try with fewer endpoints or increase timeout.');
      } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        toast.error('Cannot connect to Ollama. Make sure Ollama is running on localhost:11434.');
      } else {
        toast.error(`AI analysis failed: ${msg}`);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handlePortToggle = (port: Port) => {
    setSelectedPorts(prev => {
      const exists = prev.some(p => p.port === port.port);
      return exists ? prev.filter(p => p.port !== port.port) : [...prev, port];
    });
  };

  const handleEndpointToggle = (url: string) => {
    setSelectedEndpoints(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleGroupToggle = (group: string, urls: string[], checked: boolean) => {
    setSelectedEndpoints(prev => {
      const without = prev.filter(u => !urls.includes(u));
      return checked ? [...without, ...urls] : without;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await reconAPI.saveSelection({
        sessionId,
        selectedPorts,
        selectedServiceUrls: selectedPorts
          .filter((p) => (p.service || '').toLowerCase().includes('http'))
          .map((p) => `http://${p.service}:${p.port}`),
        selectedNucleiTargets: selectedEndpoints,
        selectedNucleiTags: selectedTags,
        scopeNotes,
      });
      toast.success('Selection saved successfully');
      onSelectionSaved?.();
    } catch (error) {
      console.error('Failed to save selection:', error);
      toast.error('Unable to save selection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const endpointCount = feroxData?.endpoints?.length || 0;

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'bg-green-500/10 text-green-500 border-green-500/30';
    if (status >= 300 && status < 400) return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    if (status >= 400 && status < 500) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    return 'bg-red-500/10 text-red-500 border-red-500/30';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontFamily: "'Space Mono',monospace", fontSize: 16, fontWeight: 700, color: '#e2dff4' }}>
          Scope Selection
        </h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {endpointCount > 0 && (
            <button
              onClick={handleAIAnalyze}
              disabled={aiLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8,
                background: aiLoading ? 'rgba(157,95,255,0.15)' : 'linear-gradient(135deg, #9d5fff 0%, #7c3aed 100%)',
                border: '1px solid rgba(157,95,255,0.4)',
                color: '#fff', fontFamily: "'Space Mono',monospace", fontSize: 11,
                cursor: aiLoading ? 'wait' : 'pointer', fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {aiLoading ? 'Analysing with Ollama...' : `AI Analyse ${endpointCount} Endpoints`}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 8,
              background: 'linear-gradient(135deg, #f0b840 0%, #e09520 100%)',
              border: '1px solid rgba(240,184,64,0.4)',
              color: '#02020d', fontFamily: "'Space Mono',monospace", fontSize: 11,
              cursor: saving ? 'wait' : 'pointer', fontWeight: 700,
            }}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Selection'}
          </button>
        </div>
      </div>

      {/* ── AI ANALYSIS RESULTS ── */}
      {aiAnalysis && (
        <div style={{
          background: 'rgba(157,95,255,0.04)', border: '1px solid rgba(157,95,255,0.15)',
          borderRadius: 12, padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Brain style={{ width: 18, height: 18, color: '#9d5fff' }} />
            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>
              AI Endpoint Analysis
            </span>
          </div>

          {/* Summary */}
          <p style={{
            fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#8b83a8',
            marginBottom: 16, lineHeight: 1.6,
          }}>
            {aiAnalysis.summary}
          </p>

          {/* Priority groups */}
          {(['high', 'medium', 'low', 'skip'] as const).map(priority => {
            const items = aiAnalysis[priority] || [];
            if (items.length === 0) return null;
            const meta = PRIORITY_META[priority];
            const urls = items.map(e => e.url);
            const allSelected = urls.every(u => selectedEndpoints.includes(u));
            const someSelected = urls.some(u => selectedEndpoints.includes(u));
            const expanded = expandedGroups[priority];

            return (
              <div key={priority} style={{
                marginBottom: 10, border: `1px solid ${meta.border}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                {/* Group header */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: meta.bg, cursor: 'pointer',
                  }}
                  onClick={() => toggleExpand(priority)}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={(e) => { e.stopPropagation(); handleGroupToggle(priority, urls, !allSelected); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 16, height: 16, accentColor: meta.color }}
                  />
                  <span style={{ fontSize: 14 }}>{meta.icon}</span>
                  <span style={{
                    fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, color: meta.color,
                  }}>
                    {meta.label}
                  </span>
                  <span style={{
                    fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#6b7280',
                    background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6,
                  }}>
                    {items.length} endpoints
                  </span>
                  <div style={{ marginLeft: 'auto', color: '#6b7280' }}>
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </div>

                {/* Expanded items */}
                {expanded && (
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {items.map((ep, idx) => (
                      <label
                        key={idx}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '8px 14px', borderTop: `1px solid ${meta.border}`,
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEndpoints.includes(ep.url)}
                          onChange={() => handleEndpointToggle(ep.url)}
                          style={{ marginTop: 3, width: 14, height: 14, accentColor: meta.color }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c4b5fd',
                            wordBreak: 'break-all',
                          }}>
                            {ep.url}
                          </div>
                          <div style={{
                            fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#6b7280',
                            marginTop: 2,
                          }}>
                            {ep.reason}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── PORT/SERVICE SELECTION ── */}
      {nmapData?.open_ports && nmapData.open_ports.length > 0 && (
        <div style={{
          background: 'rgba(240,184,64,0.03)', border: '1px solid rgba(240,184,64,0.12)',
          borderRadius: 12, padding: 20,
        }}>
          <h3 style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, color: '#f0b840', marginBottom: 12 }}>
            Select Ports / Services for Feroxbuster
          </h3>
          <div style={{ maxHeight: 256, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nmapData.open_ports.map((port) => (
              <label key={port.port} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                border: '1px solid rgba(240,184,64,0.1)', borderRadius: 8, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(240,184,64,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <input
                  type="checkbox"
                  checked={selectedPorts.some(p => p.port === port.port)}
                  onChange={() => handlePortToggle(port)}
                  style={{ width: 16, height: 16, accentColor: '#f0b840' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: '#e2dff4' }}>
                      Port {port.port}
                    </span>
                    <span style={{ color: '#4a3d6a' }}>—</span>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#8b83a8' }}>
                      {port.service}
                    </span>
                    {port.service.includes('http') && (
                      <span style={{
                        padding: '1px 6px', fontSize: 9, borderRadius: 4,
                        background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                        border: '1px solid rgba(59,130,246,0.3)',
                        fontFamily: "'Space Mono',monospace",
                      }}>HTTP</span>
                    )}
                  </div>
                  {port.version && (
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a' }}>
                      {port.version}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── MANUAL ENDPOINT LIST (fallback when AI not used) ── */}
      {!aiAnalysis && feroxData?.endpoints && feroxData.endpoints.length > 0 && (
        <div style={{
          background: 'rgba(59,130,246,0.03)', border: '1px solid rgba(59,130,246,0.12)',
          borderRadius: 12, padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>
              Discovered Endpoints ({feroxData.endpoints.length})
            </h3>
            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#6b7280' }}>
              Use AI Analyse above for smart selection
            </span>
          </div>
          <div style={{ maxHeight: 384, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {feroxData.endpoints.map((endpoint, idx) => (
              <label key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                border: '1px solid rgba(59,130,246,0.08)', borderRadius: 8, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={selectedEndpoints.includes(endpoint.url)}
                  onChange={() => handleEndpointToggle(endpoint.url)}
                  style={{ width: 14, height: 14, accentColor: '#3b82f6' }}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c4b5fd',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {endpoint.url}
                  </span>
                  <span style={{
                    padding: '1px 6px', fontSize: 9, borderRadius: 4, flexShrink: 0,
                    background: endpoint.status < 300 ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)',
                    color: endpoint.status < 300 ? '#4ade80' : '#f59e0b',
                    border: `1px solid ${endpoint.status < 300 ? 'rgba(74,222,128,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    fontFamily: "'Space Mono',monospace",
                  }}>
                    {endpoint.status}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── NUCLEI TAGS SELECTION ── */}
      <div style={{
        background: 'rgba(74,222,128,0.03)', border: '1px solid rgba(74,222,128,0.12)',
        borderRadius: 12, padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h3 style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, color: '#4ade80' }}>
            Nuclei Tags
          </h3>
          {aiAnalysis?.recommendedTags && (
            <span style={{
              fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#9d5fff',
              background: 'rgba(157,95,255,0.1)', padding: '2px 8px', borderRadius: 6,
              border: '1px solid rgba(157,95,255,0.2)',
            }}>
              AI recommended
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {availableTags.map((tag) => {
            const isRecommended = aiAnalysis?.recommendedTags?.includes(tag.value);
            return (
              <label key={tag.value} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                border: `1px solid ${isRecommended ? 'rgba(157,95,255,0.25)' : 'rgba(74,222,128,0.1)'}`,
                borderRadius: 8, cursor: 'pointer',
                background: isRecommended ? 'rgba(157,95,255,0.04)' : 'transparent',
              }}>
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.value)}
                  onChange={() => handleTagToggle(tag.value)}
                  style={{ marginTop: 2, width: 14, height: 14, accentColor: '#4ade80' }}
                />
                <div>
                  <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, fontWeight: 600, color: '#e2dff4' }}>
                    {tag.label}
                    {isRecommended && <span style={{ color: '#9d5fff', marginLeft: 4 }}>★</span>}
                  </div>
                  <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#6b7280' }}>
                    {tag.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── SCOPE NOTES ── */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: 20,
      }}>
        <h3 style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, color: '#8b83a8', marginBottom: 10 }}>
          Scope Notes (Optional)
        </h3>
        <textarea
          value={scopeNotes}
          onChange={(e) => setScopeNotes(e.target.value)}
          placeholder="Add any notes about the scope selection..."
          rows={3}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'rgba(2,2,13,0.5)', border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c4b5fd',
            resize: 'none', outline: 'none',
          }}
        />
      </div>

      {/* ── SUMMARY ── */}
      <div style={{
        background: 'rgba(240,184,64,0.04)', border: '1px solid rgba(240,184,64,0.15)',
        borderRadius: 12, padding: 16,
      }}>
        <h4 style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, fontWeight: 700, color: '#f0b840', marginBottom: 8 }}>
          Selection Summary
        </h4>
        <div style={{ display: 'flex', gap: 24, fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#8b83a8' }}>
          <span>Ports: <strong style={{ color: '#e2dff4' }}>{selectedPorts.length}</strong></span>
          <span>Endpoints: <strong style={{ color: '#e2dff4' }}>{selectedEndpoints.length}</strong></span>
          <span>Tags: <strong style={{ color: '#e2dff4' }}>{selectedTags.length}</strong></span>
          {aiAnalysis && (
            <span style={{ color: '#9d5fff' }}>
              AI: {aiAnalysis.high?.length || 0} high / {aiAnalysis.medium?.length || 0} med
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
