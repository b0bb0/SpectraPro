'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search, Loader2, AlertTriangle, Shield, Eye, Code2,
  ChevronDown, ChevronRight, FileCode, Globe, Lock,
  ExternalLink, RefreshCw, Zap, Brain, Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { sourceScannerAPI } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface SecretFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  value: string;
  context: string;
  sourceUrl: string;
  line?: number;
  recommendation: string;
}

interface JSSource {
  url: string;
  size: number;
  type: 'external' | 'inline';
  snippet: string;
}

interface ScanResult {
  id: string;
  targetUrl: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  pagesScanned: number;
  jsFilesFound: number;
  jsSources: JSSource[];
  findings: SecretFinding[];
  summary?: string;
  error?: string;
}

const SEV: Record<string, {
  label: string; color: string; bg: string; border: string; icon: string;
}> = {
  critical: { label: 'CRITICAL', color: '#ff2d55', bg: 'rgba(255,45,85,0.08)', border: 'rgba(255,45,85,0.3)', icon: '💀' },
  high:     { label: 'HIGH',     color: '#ff6b35', bg: 'rgba(255,107,53,0.08)', border: 'rgba(255,107,53,0.3)', icon: '🔴' },
  medium:   { label: 'MEDIUM',   color: '#f0b840', bg: 'rgba(240,184,64,0.08)', border: 'rgba(240,184,64,0.3)', icon: '🟡' },
  low:      { label: 'LOW',      color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', icon: '🔵' },
  info:     { label: 'INFO',     color: '#6b7280', bg: 'rgba(107,114,128,0.08)',border: 'rgba(107,114,128,0.3)',icon: '⚪' },
};

export default function SourceScannerPage() {
  // ── State ──
  const [targetUrl, setTargetUrl] = useState('');
  const [depth, setDepth] = useState(2);
  const [maxPages, setMaxPages] = useState(30);
  const [includeInline, setIncludeInline] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);

  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [pastScans, setPastScans] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'findings' | 'sources' | 'history'>('findings');
  const [filterSev, setFilterSev] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Persist scan results to localStorage ──
  // Save currentScan whenever it changes
  useEffect(() => {
    if (currentScan) {
      try { localStorage.setItem('spectra_source_scan_current', JSON.stringify(currentScan)); } catch {}
    }
  }, [currentScan]);

  // Save pastScans whenever they change
  useEffect(() => {
    if (pastScans.length > 0) {
      try { localStorage.setItem('spectra_source_scan_history', JSON.stringify(pastScans)); } catch {}
    }
  }, [pastScans]);

  // On mount: restore from localStorage first, then fetch from backend
  useEffect(() => {
    // Restore saved state immediately (before backend responds)
    try {
      const savedCurrent = localStorage.getItem('spectra_source_scan_current');
      if (savedCurrent) {
        const parsed = JSON.parse(savedCurrent);
        if (parsed && parsed.id) setCurrentScan(parsed);
      }
      const savedHistory = localStorage.getItem('spectra_source_scan_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) setPastScans(parsed);
      }
    } catch {}

    // Then fetch latest from backend (will overwrite with fresh data)
    sourceScannerAPI.listScans().then(scans => {
      setPastScans(scans);
      // If we have a current scan ID, refresh it from the backend too
      const savedCurrent = localStorage.getItem('spectra_source_scan_current');
      if (savedCurrent) {
        try {
          const parsed = JSON.parse(savedCurrent);
          if (parsed?.id) {
            sourceScannerAPI.getScan(parsed.id).then(fresh => {
              if (fresh) setCurrentScan(fresh);
            }).catch(() => {});
          }
        } catch {}
      }
    }).catch(() => {});

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── Handlers ──
  const handleStartScan = async () => {
    if (!targetUrl.trim()) { toast.error('Enter a target URL'); return; }
    let url = targetUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    try {
      setScanning(true); setCurrentScan(null); setActiveTab('findings');
      toast.info(`Scanning ${url}...`);
      const result = await sourceScannerAPI.startScan({
        url, depth, maxPages, includeInline,
        customPrompt: customPrompt.trim() || undefined,
      });
      const scanId = result.scanId;

      const poll = async () => {
        try {
          const scan = await sourceScannerAPI.getScan(scanId);
          setCurrentScan(scan);
          if (scan.status !== 'running') {
            if (pollRef.current) clearInterval(pollRef.current);
            setScanning(false);
            scan.status === 'completed'
              ? toast.success(`Done! ${scan.findings?.length || 0} secrets found.`)
              : toast.error(`Scan failed: ${scan.error || 'Unknown'}`);
            sourceScannerAPI.listScans().then(setPastScans).catch(() => {});
          }
        } catch {}
      };
      await poll();
      pollRef.current = setInterval(poll, 2000);
    } catch (e: any) {
      setScanning(false);
      toast.error(`Failed: ${e.message}`);
    }
  };

  const toggle = (id: string) => setExpanded(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const copyValue = (id: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filtered = currentScan?.findings?.filter(
    f => filterSev === 'all' || f.severity === filterSev
  ) || [];

  const sevCounts = currentScan?.findings?.reduce((a, f) => {
    a[f.severity] = (a[f.severity] || 0) + 1; return a;
  }, {} as Record<string, number>) || {};

  // Shared
  const S: Record<string, React.CSSProperties> = {
    card: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 20 },
    lbl: { fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
    inp: { width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(2,2,13,0.6)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: "'Space Mono',monospace", fontSize: 12, color: '#e2dff4', outline: 'none' },
    mono: { fontFamily: "'Space Mono',monospace" },
  };

  return (
    <div style={{ margin: '-0px -2rem -2.5rem -2rem', height: 'calc(100vh - 3.5rem)', background: '#02020d', overflowY: 'auto', padding: '24px 32px' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, rgba(157,95,255,0.15), rgba(240,184,64,0.1))', border: '1px solid rgba(157,95,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Code2 style={{ width: 22, height: 22, color: '#9d5fff' }} />
          </div>
          <div>
            <h1 style={{ ...S.mono, fontSize: 20, fontWeight: 700, color: '#e2dff4', margin: 0 }}>Source Code Scanner</h1>
            <p style={{ ...S.mono, fontSize: 11, color: '#4a3d6a', margin: 0 }}>Crawl → Extract JS → TruffleHog + Regex + Ollama LLM Secret Detection</p>
          </div>
        </div>
        {currentScan && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 8,
            background: currentScan.status === 'running' ? 'rgba(157,95,255,0.1)' : currentScan.status === 'completed' ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${currentScan.status === 'running' ? 'rgba(157,95,255,0.3)' : currentScan.status === 'completed' ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {currentScan.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#9d5fff' }} />}
            <span style={{ ...S.mono, fontSize: 10, fontWeight: 600,
              color: currentScan.status === 'running' ? '#9d5fff' : currentScan.status === 'completed' ? '#4ade80' : '#ef4444',
            }}>
              {currentScan.status.toUpperCase()} — {currentScan.pagesScanned} pages / {currentScan.jsFilesFound} JS
            </span>
          </div>
        )}
      </div>

      {/* ── SCAN INPUT ── */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 14, alignItems: 'end' }}>
          <div>
            <div style={S.lbl as any}>Target URL</div>
            <div style={{ position: 'relative' }}>
              <Globe style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#4a3d6a' }} />
              <input type="text" value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
                placeholder="https://example.com" onKeyDown={e => e.key === 'Enter' && handleStartScan()}
                style={{ ...S.inp, paddingLeft: 36 }} />
            </div>
          </div>
          <div style={{ width: 80 }}>
            <div style={S.lbl as any}>Depth</div>
            <select value={depth} onChange={e => setDepth(Number(e.target.value))} style={{ ...S.inp, cursor: 'pointer' }}>
              {[1,2,3,4,5].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ width: 100 }}>
            <div style={S.lbl as any}>Max Pages</div>
            <select value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} style={{ ...S.inp, cursor: 'pointer' }}>
              {[10,20,30,50,100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ width: 90 }}>
            <div style={S.lbl as any}>Inline JS</div>
            <button onClick={() => setIncludeInline(!includeInline)} style={{
              ...S.inp, textAlign: 'center', cursor: 'pointer',
              background: includeInline ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.08)',
              border: includeInline ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(239,68,68,0.2)',
              color: includeInline ? '#4ade80' : '#ef4444',
            }}>
              {includeInline ? 'ON' : 'OFF'}
            </button>
          </div>
          <button onClick={handleStartScan} disabled={scanning} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, height: 42,
            background: scanning ? 'rgba(157,95,255,0.15)' : 'linear-gradient(135deg, #9d5fff 0%, #7c3aed 100%)',
            border: '1px solid rgba(157,95,255,0.4)', color: '#fff', ...S.mono, fontSize: 12, fontWeight: 700,
            cursor: scanning ? 'wait' : 'pointer',
          }}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>

        {/* AI Prompt toggle */}
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowPrompt(!showPrompt)} style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
            cursor: 'pointer', padding: 0,
          }}>
            <Brain style={{ width: 14, height: 14, color: '#9d5fff' }} />
            <span style={{ ...S.mono, fontSize: 11, color: '#9d5fff', fontWeight: 600 }}>
              Custom AI Extraction Prompt
            </span>
            {showPrompt
              ? <ChevronDown style={{ width: 12, height: 12, color: '#9d5fff' }} />
              : <ChevronRight style={{ width: 12, height: 12, color: '#9d5fff' }} />
            }
            {customPrompt.trim() && (
              <span style={{ ...S.mono, fontSize: 9, color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(74,222,128,0.2)' }}>
                ACTIVE
              </span>
            )}
          </button>
          {showPrompt && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                rows={4}
                placeholder={"Tell the AI what to look for, e.g.:\n• Find hardcoded Firebase credentials and project IDs\n• Extract all API endpoint URLs and bearer tokens\n• Look for S3 bucket names, internal hostnames, debug flags\n• Find any username/password combinations or login URLs"}
                style={{
                  ...S.inp, width: '100%', resize: 'vertical', lineHeight: 1.6,
                  background: 'rgba(157,95,255,0.03)', border: '1px solid rgba(157,95,255,0.15)',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {[
                  'Find all API keys, tokens, and credentials with their full values',
                  'Extract internal URLs, staging/dev endpoints, and admin panel paths',
                  'Look for database connection strings, S3 buckets, and cloud config',
                  'Find hardcoded usernames, passwords, and authentication bypasses',
                ].map((preset, i) => (
                  <button key={i} onClick={() => setCustomPrompt(preset)} style={{
                    ...S.mono, fontSize: 9, color: '#8b83a8', padding: '4px 10px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {preset.substring(0, 50)}...
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SEVERITY CHIPS ── */}
      {currentScan && currentScan.findings?.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {Object.entries(SEV).map(([sev, m]) => {
            const c = sevCounts[sev] || 0;
            if (!c) return null;
            return (
              <button key={sev} onClick={() => setFilterSev(filterSev === sev ? 'all' : sev)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
                background: filterSev === sev ? m.bg : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterSev === sev ? m.border : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer',
              }}>
                <span style={{ fontSize: 14 }}>{m.icon}</span>
                <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: m.color }}>{c}</span>
                <span style={{ ...S.mono, fontSize: 10, color: '#6b7280' }}>{m.label}</span>
              </button>
            );
          })}
          {filterSev !== 'all' && (
            <button onClick={() => setFilterSev('all')} style={{
              padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)', ...S.mono, fontSize: 10, color: '#6b7280', cursor: 'pointer',
            }}>Show All</button>
          )}
        </div>
      )}

      {/* ── TABS ── */}
      {currentScan && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
          {([
            { key: 'findings' as const, label: 'Secret Findings', icon: Lock, count: currentScan.findings?.length },
            { key: 'sources' as const, label: 'JS Sources', icon: FileCode, count: currentScan.jsSources?.length },
            { key: 'history' as const, label: 'History', icon: RefreshCw },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              borderRadius: '10px 10px 0 0', cursor: 'pointer',
              background: activeTab === tab.key ? 'rgba(157,95,255,0.08)' : 'transparent',
              borderTop: activeTab === tab.key ? '2px solid #9d5fff' : '2px solid transparent',
              borderLeft: activeTab === tab.key ? '1px solid rgba(157,95,255,0.15)' : '1px solid transparent',
              borderRight: activeTab === tab.key ? '1px solid rgba(157,95,255,0.15)' : '1px solid transparent',
              borderBottom: 'none',
            }}>
              <tab.icon style={{ width: 14, height: 14, color: activeTab === tab.key ? '#9d5fff' : '#4a3d6a' }} />
              <span style={{ ...S.mono, fontSize: 11, fontWeight: 600, color: activeTab === tab.key ? '#c4b5fd' : '#4a3d6a' }}>
                {tab.label}
              </span>
              {tab.count !== undefined && (
                <span style={{ padding: '1px 8px', borderRadius: 6, fontSize: 10, ...S.mono,
                  background: activeTab === tab.key ? 'rgba(157,95,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: activeTab === tab.key ? '#9d5fff' : '#4a3d6a',
                }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── FINDINGS TAB ── */}
      {activeTab === 'findings' && currentScan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {currentScan.summary && (
            <div style={{ ...S.card, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(157,95,255,0.04)', border: '1px solid rgba(157,95,255,0.12)',
            }}>
              <Brain style={{ width: 18, height: 18, color: '#9d5fff', flexShrink: 0 }} />
              <span style={{ ...S.mono, fontSize: 11, color: '#8b83a8', lineHeight: 1.6 }}>{currentScan.summary}</span>
            </div>
          )}

          {filtered.length === 0 && (
            <div style={{ ...S.card, textAlign: 'center', padding: 48 }}>
              <Shield style={{ width: 36, height: 36, color: '#4a3d6a', margin: '0 auto 12px' }} />
              <p style={{ ...S.mono, fontSize: 12, color: '#4a3d6a' }}>
                {scanning ? 'Scanning for secrets...' : 'No findings match your filter.'}
              </p>
            </div>
          )}

          {filtered.map(f => {
            const m = SEV[f.severity] || SEV.info;
            const isOpen = expanded.has(f.id);
            const isInline = f.sourceUrl.includes('#inline');
            // Build direct link for external JS files
            const directLink = !isInline ? f.sourceUrl.split('#')[0] : null;

            return (
              <div key={f.id} style={{ border: `1px solid ${m.border}`, borderRadius: 12, overflow: 'hidden', background: 'rgba(2,2,13,0.4)' }}>
                {/* Header row */}
                <div onClick={() => toggle(f.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: m.bg,
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{m.icon}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, ...S.mono, fontWeight: 700,
                    background: m.bg, color: m.color, border: `1px solid ${m.border}`,
                  }}>{m.label}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, ...S.mono, fontWeight: 600,
                    background: 'rgba(157,95,255,0.08)', color: '#9d5fff', border: '1px solid rgba(157,95,255,0.2)',
                  }}>{f.type}</span>

                  {/* ── ACTUAL VALUE (unmasked for validation) ── */}
                  <code style={{
                    flex: 1, ...S.mono, fontSize: 12, color: '#e2dff4', fontWeight: 600,
                    background: 'rgba(0,0,0,0.3)', padding: '3px 10px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    userSelect: 'all',
                  }}>
                    {f.value}
                  </code>

                  {/* Copy button */}
                  <button onClick={(e) => { e.stopPropagation(); copyValue(f.id, f.value); }} title="Copy value" style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: 4, cursor: 'pointer', flexShrink: 0, display: 'flex',
                  }}>
                    {copiedId === f.id
                      ? <Check style={{ width: 14, height: 14, color: '#4ade80' }} />
                      : <Copy style={{ width: 14, height: 14, color: '#6b7280' }} />
                    }
                  </button>

                  {/* Direct link to source file */}
                  {directLink && (
                    <a href={directLink} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()} title={`Open ${directLink}`} style={{
                      background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                      borderRadius: 6, padding: 4, cursor: 'pointer', flexShrink: 0, display: 'flex',
                    }}>
                      <ExternalLink style={{ width: 14, height: 14, color: '#3b82f6' }} />
                    </a>
                  )}

                  {f.line && <span style={{ ...S.mono, fontSize: 10, color: '#4a3d6a', flexShrink: 0 }}>L{f.line}</span>}
                  {isOpen ? <ChevronDown style={{ width: 16, height: 16, color: '#6b7280' }} /> : <ChevronRight style={{ width: 16, height: 16, color: '#6b7280' }} />}
                </div>

                {/* Expanded detail panel */}
                {isOpen && (
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Source URL with direct link */}
                    <div>
                      <div style={S.lbl as any}>Source File</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...S.mono, fontSize: 11, color: '#8b83a8', wordBreak: 'break-all', flex: 1 }}>
                          {f.sourceUrl}
                        </span>
                        {directLink && (
                          <a href={directLink} target="_blank" rel="noopener noreferrer" style={{
                            ...S.mono, fontSize: 10, color: '#3b82f6', background: 'rgba(59,130,246,0.08)',
                            border: '1px solid rgba(59,130,246,0.25)', padding: '4px 12px', borderRadius: 6,
                            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                          }}>
                            <ExternalLink style={{ width: 12, height: 12 }} /> Open File
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Full value for easy copy */}
                    <div>
                      <div style={S.lbl as any}>Full Value</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                        <pre style={{
                          flex: 1, padding: 12, borderRadius: 8, margin: 0,
                          background: 'rgba(240,184,64,0.04)', border: '1px solid rgba(240,184,64,0.15)',
                          ...S.mono, fontSize: 12, color: '#f0b840', wordBreak: 'break-all', whiteSpace: 'pre-wrap',
                          userSelect: 'all',
                        }}>{f.value}</pre>
                        <button onClick={() => copyValue(f.id + '-full', f.value)} style={{
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6, padding: 8, cursor: 'pointer', flexShrink: 0,
                        }}>
                          {copiedId === f.id + '-full'
                            ? <Check style={{ width: 14, height: 14, color: '#4ade80' }} />
                            : <Copy style={{ width: 14, height: 14, color: '#6b7280' }} />
                          }
                        </button>
                      </div>
                    </div>

                    {/* Code context */}
                    {f.context && (
                      <div>
                        <div style={S.lbl as any}>Code Context</div>
                        <pre style={{
                          padding: 14, borderRadius: 8, margin: 0,
                          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)',
                          ...S.mono, fontSize: 11, color: '#a78bfa', overflowX: 'auto',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                        }}>{f.context}</pre>
                      </div>
                    )}

                    {/* Recommendation */}
                    <div style={{
                      padding: '10px 14px', borderRadius: 8,
                      background: 'rgba(240,184,64,0.04)', border: '1px solid rgba(240,184,64,0.15)',
                    }}>
                      <div style={{ ...(S.lbl as any), color: '#f0b840' }}>Recommendation</div>
                      <p style={{ ...S.mono, fontSize: 11, color: '#d4c48a', margin: 0, lineHeight: 1.6 }}>
                        {f.recommendation}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── JS SOURCES TAB ── */}
      {activeTab === 'sources' && currentScan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(currentScan.jsSources || []).map((src, idx) => {
            const isExt = src.type === 'external';
            const link = isExt ? src.url.split('#')[0] : null;
            return (
              <div key={idx} style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <FileCode style={{ width: 16, height: 16, flexShrink: 0, color: isExt ? '#3b82f6' : '#f0b840' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{
                      ...S.mono, fontSize: 11, color: '#3b82f6', textDecoration: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                    }}>
                      {src.url} ↗
                    </a>
                  ) : (
                    <span style={{ ...S.mono, fontSize: 11, color: '#c4b5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {src.url}
                    </span>
                  )}
                  <div style={{ ...S.mono, fontSize: 10, color: '#4a3d6a', marginTop: 2 }}>
                    {src.snippet.substring(0, 120)}...
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 9, ...S.mono, flexShrink: 0,
                  background: isExt ? 'rgba(59,130,246,0.1)' : 'rgba(240,184,64,0.1)',
                  color: isExt ? '#3b82f6' : '#f0b840',
                  border: `1px solid ${isExt ? 'rgba(59,130,246,0.3)' : 'rgba(240,184,64,0.3)'}`,
                }}>{src.type}</span>
                <span style={{ ...S.mono, fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {(src.size / 1024).toFixed(1)} KB
                </span>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" style={{
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                    borderRadius: 6, padding: 4, display: 'flex', flexShrink: 0,
                  }}>
                    <ExternalLink style={{ width: 14, height: 14, color: '#3b82f6' }} />
                  </a>
                )}
              </div>
            );
          })}
          {(!currentScan.jsSources || currentScan.jsSources.length === 0) && (
            <div style={{ ...S.card, textAlign: 'center', padding: 48 }}>
              <FileCode style={{ width: 36, height: 36, color: '#4a3d6a', margin: '0 auto 12px' }} />
              <p style={{ ...S.mono, fontSize: 12, color: '#4a3d6a' }}>
                {scanning ? 'Discovering JS sources...' : 'No JavaScript sources found.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pastScans.map(scan => {
            const fc = scan.findings?.length || 0;
            const cc = scan.findings?.filter(f => f.severity === 'critical').length || 0;
            return (
              <button key={scan.id} onClick={() => { setCurrentScan(scan); setActiveTab('findings'); }}
                style={{ ...S.card, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: scan.status === 'completed' ? '#4ade80' : scan.status === 'failed' ? '#ef4444' : '#f0b840',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...S.mono, fontSize: 12, color: '#c4b5fd', fontWeight: 600 }}>{scan.targetUrl}</div>
                  <div style={{ ...S.mono, fontSize: 10, color: '#4a3d6a', marginTop: 2 }}>
                    {new Date(scan.startedAt).toLocaleString()} — {scan.pagesScanned} pages, {scan.jsFilesFound} JS
                  </div>
                </div>
                {fc > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {cc > 0 && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, ...S.mono, fontWeight: 700,
                      background: 'rgba(255,45,85,0.1)', color: '#ff2d55', border: '1px solid rgba(255,45,85,0.3)' }}>{cc} CRIT</span>}
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, ...S.mono,
                      background: 'rgba(157,95,255,0.08)', color: '#9d5fff' }}>{fc} total</span>
                  </div>
                )}
              </button>
            );
          })}
          {pastScans.length === 0 && (
            <div style={{ ...S.card, textAlign: 'center', padding: 48 }}>
              <RefreshCw style={{ width: 36, height: 36, color: '#4a3d6a', margin: '0 auto 12px' }} />
              <p style={{ ...S.mono, fontSize: 12, color: '#4a3d6a' }}>No scan history yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!currentScan && !scanning && (
        <div style={{
          ...S.card, textAlign: 'center', padding: '64px 32px',
          background: 'rgba(157,95,255,0.02)', border: '1px solid rgba(157,95,255,0.08)',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, rgba(157,95,255,0.1), rgba(240,184,64,0.06))',
            border: '1px solid rgba(157,95,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Eye style={{ width: 32, height: 32, color: '#9d5fff' }} />
          </div>
          <h3 style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: '#c4b5fd', marginBottom: 8 }}>
            Website Source Code Scanner
          </h3>
          <p style={{ ...S.mono, fontSize: 11, color: '#4a3d6a', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
            Enter a target URL to crawl the website, extract all JavaScript files
            (external + inline), and use Ollama LLM to detect exposed secrets —
            API keys, passwords, tokens, credentials, database strings, and more.
            Use the custom AI prompt to tell the LLM exactly what to look for.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 24, ...S.mono, fontSize: 10, color: '#4a3d6a' }}>
            <span>🐷 TruffleHog Secrets</span>
            <span>🔍 20+ Regex Patterns</span>
            <span>🧠 Ollama Deep Analysis</span>
            <span>📄 Inline + External JS</span>
            <span>🎯 Custom AI Prompts</span>
          </div>
        </div>
      )}
    </div>
  );
}
