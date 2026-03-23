'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ReconPhaseControl } from '@/components/ReconPhaseControl';
import { ReconSelectionPanel } from '@/components/ReconSelectionPanel';
import { ThreatAssessmentPanel } from '@/components/ThreatAssessmentPanel';
import { CreateAssetInline } from '@/components/CreateAssetInline';
import { scansAPI, assetsAPI, reconAPI } from '@/lib/api';
import { toast } from 'sonner';

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface Asset {
  id: string;
  name: string;
  url?: string;
  hostname?: string;
  ipAddress?: string;
  type: string;
  environment?: string;
  criticality?: string;
}

interface ReconSession {
  id: string;
  scanId: string;
  assetId: string;
  status: string;
  startedAt: string;
  assets: Asset;
}

interface ReconPhaseRun {
  id: string;
  sessionId: string;
  phase: 'SUBDOMAINS' | 'NMAP' | 'FEROXBUSTER' | 'AI_ANALYSIS' | 'NUCLEI';
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

/* ═══════════════════════════════════════════════════════
   PHASE CONFIG
   ═══════════════════════════════════════════════════════ */
const PHASE_META: Record<string, { icon: string; label: string; shortLabel: string; color: string; glow: string }> = {
  SUBDOMAINS:   { icon: '◎', label: 'Subdomain Enumeration', shortLabel: 'Subdomains', color: '#4ade80', glow: 'rgba(74,222,128,0.3)' },
  NMAP:         { icon: '⬡', label: 'Nmap Port Scanning',    shortLabel: 'Port Scan',  color: '#f97316', glow: 'rgba(249,115,22,0.3)' },
  FEROXBUSTER:  { icon: '◈', label: 'Directory Enumeration', shortLabel: 'Dir Enum',   color: '#3b82f6', glow: 'rgba(59,130,246,0.3)' },
  AI_ANALYSIS:  { icon: '⬢', label: 'AI Threat Assessment',  shortLabel: 'AI Threat',  color: '#a855f7', glow: 'rgba(168,85,247,0.3)' },
  NUCLEI:       { icon: '◉', label: 'Nuclei Validation',     shortLabel: 'Nuclei',     color: '#ef4444', glow: 'rgba(239,68,68,0.3)' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#a855f7', high: '#ef4444', medium: '#eab308', low: '#3b82f6', info: '#6b7280',
};

/* ═══════════════════════════════════════════════════════
   STAR CANVAS BACKGROUND
   ═══════════════════════════════════════════════════════ */
function MiniStarField({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Stable star positions — generated once, scaled on resize
  const starsRef = useRef<Array<{ rx: number; ry: number; r: number; a: number }> | null>(null);
  if (!starsRef.current) {
    starsRef.current = Array.from({ length: 120 }, () => ({
      rx: Math.random(), ry: Math.random(), r: Math.random() * 1.2, a: 0.3 + Math.random() * 0.5,
    }));
  }
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || width < 1 || height < 1) return;
    cvs.width = width; cvs.height = height;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#02020d'); g.addColorStop(1, '#080528');
    ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    for (const star of starsRef.current!) {
      ctx.beginPath();
      ctx.arc(star.rx * width, star.ry * height, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,160,255,${star.a})`;
      ctx.fill();
    }
  }, [width, height]);
  return <canvas ref={canvasRef} className="absolute inset-0" style={{ zIndex: 0 }} />;
}

/* ═══════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════ */
const STORAGE_KEY = 'spectra_recon_session';
const PHASES = ['SUBDOMAINS', 'NMAP', 'FEROXBUSTER', 'AI_ANALYSIS', 'NUCLEI'] as const;
const ASSET_TYPE_COLORS: Record<string, string> = {
  DOMAIN: '#4ade80', IP: '#f97316', APPLICATION: '#3b82f6', API: '#a855f7',
  CLOUD_RESOURCE: '#eab308', NETWORK_DEVICE: '#ef4444',
};

const FINDING_CATEGORIES: Array<{
  key: string; label: string; icon: string; color: string;
  types: string[]; // DB findingType values that belong to this category
}> = [
  { key: 'dns',      label: 'DNS & Domain',   icon: '⬢', color: '#a855f7', types: ['DNS_RECORDS', 'CT_LOGS', 'WHOIS_DATA', 'ASN_DATA'] },
  { key: 'network',  label: 'Network',        icon: '⬡', color: '#f97316', types: ['PORT_SCAN', 'HTTP_PROBE', 'TLS_FINGERPRINT'] },
  { key: 'web',      label: 'Web Discovery',  icon: '◈', color: '#3b82f6', types: ['CRAWLED_URLS', 'ENDPOINT_DISCOVERY', 'PARAMETERS', 'SECURITY_HEADERS'] },
  { key: 'tech',     label: 'Tech Stack',     icon: '◎', color: '#4ade80', types: ['FRAMEWORK', 'LANGUAGE', 'AUTH_TYPE'] },
  { key: 'behavior', label: 'Behavioral',     icon: '◉', color: '#eab308', types: ['BEHAVIORAL_SIGNALS'] },
];

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function ReconnaissancePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1200, h: 800 });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetStatuses, setAssetStatuses] = useState<Record<string, {
    latestSessionId: string; latestStatus: string; lastScannedAt: string;
    sessionCount: number; completedPhases: number; totalPhases: number; hasRunning: boolean;
  }>>({});
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [session, setSession] = useState<ReconSession | null>(null);
  const [phaseRuns, setPhaseRuns] = useState<ReconPhaseRun[]>([]);
  const [selection, setSelection] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [artifacts, setArtifacts] = useState<any>({});
  const [findings, setFindings] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [selectedScreenshot, setSelectedScreenshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [showCreateAsset, setShowCreateAsset] = useState(false);
  const [activeTab, setActiveTab] = useState<'phases' | 'findings' | 'selection' | 'threat'>('phases');
  const [expandedFindingType, setExpandedFindingType] = useState<string | null>(null);
  const [resumeModal, setResumeModal] = useState<{ open: boolean; sessions: ReconSession[] }>({ open: false, sessions: [] });
  const [pendingAsset, setPendingAsset] = useState<Asset | null>(null);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { fetchAssets(); }, []);

  // Persist active session to localStorage
  useEffect(() => {
    if (session && selectedAsset) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ assetId: selectedAsset.id, sessionId: session.id }));
    }
  }, [session, selectedAsset]);

  // Poll for phase updates when session is active
  useEffect(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (session) {
      const sid = session.id;
      pollingRef.current = setInterval(() => {
        reconAPI.getPhaseRuns(sid).then(d => setPhaseRuns(d || [])).catch(() => {});
        reconAPI.getArtifacts(sid).then(data => {
          const grouped: any = {};
          (data || []).forEach((a: any) => { grouped[a.phase] = a; });
          setArtifacts(grouped);
        }).catch(() => {});
        reconAPI.getFindings(sid).then(r => setFindings(r.findings || [])).catch(() => {});
        reconAPI.getScreenshots(sid).then(r => setScreenshots(r || [])).catch(() => {});
      }, 3000);
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [session?.id]);

  /* ─── API FUNCTIONS ─── */
  const fetchAssets = async () => {
    try {
      const response = await assetsAPI.list();
      const loadedAssets: Asset[] = response.data || [];
      setAssets(loadedAssets);

      // Fetch scan status for all assets in parallel
      try {
        const statusMap = await reconAPI.getAssetsStatus();
        if (statusMap) setAssetStatuses(statusMap);
      } catch (e) { /* No sessions yet — that's fine */ }

      // Check localStorage for a previously active session
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const { assetId } = JSON.parse(saved);
          const asset = loadedAssets.find((a: Asset) => a.id === assetId);
          if (asset) {
            const sessionsResp = await reconAPI.getSessionsByAsset(assetId);
            const sessions: ReconSession[] = sessionsResp?.sessions || [];
            if (sessions.length > 0) {
              setPendingAsset(asset);
              setResumeModal({ open: true, sessions });
            } else {
              localStorage.removeItem(STORAGE_KEY);
            }
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
      toast.error('Failed to load assets');
    }
  };

  const fetchOrCreateSession = async (assetId: string) => {
    try {
      setLoading(true);
      const asset = assets.find(a => a.id === assetId);
      if (!asset) { toast.error('Asset not found'); return; }
      const target = asset.url || asset.hostname || asset.ipAddress || asset.name;
      const scanData = await scansAPI.start({ target, scanLevel: 'light' });
      const sessionResponse = await reconAPI.initialize({
        target, scanId: scanData.scanId, assetId: asset.id,
      });
      const sessionData = await reconAPI.getSession(sessionResponse.sessionId);
      if (sessionData) {
        setSession(sessionData); setSelectedAsset(asset);
        try {
          const [pr, fd, sd] = await Promise.allSettled([
            reconAPI.getPhaseRuns(sessionData.id),
            reconAPI.getFindings(sessionData.id),
            reconAPI.getScreenshots(sessionData.id),
          ]);
          if (pr.status === 'fulfilled') setPhaseRuns(pr.value || []);
          if (fd.status === 'fulfilled') setFindings(fd.value.findings || []);
          if (sd.status === 'fulfilled') setScreenshots(sd.value || []);
        } catch (e) { console.error('Failed to fetch initial data:', e); }
        toast.success('Reconnaissance session ready!');
      }
    } catch (error) {
      console.error('Failed to fetch/create session:', error);
      toast.error('Unable to initialize session. Please try again.');
    } finally { setLoading(false); }
  };

  const fetchPhaseRuns = async () => {
    if (!session) return;
    try { const data = await reconAPI.getPhaseRuns(session.id); setPhaseRuns(data || []); } catch (e) { /* silent */ }
  };
  const fetchSelection = async () => {
    if (!session) return;
    try { const data = await reconAPI.getSelection(session.id); setSelection(data); } catch (e) { /* silent */ }
  };
  const fetchAIAnalysis = async () => {
    if (!session) return;
    try { const data = await reconAPI.getAIAnalysis(session.id); setAiAnalysis(data); } catch (e) { /* silent */ }
  };
  const fetchArtifacts = async () => {
    if (!session) return;
    try {
      const data = await reconAPI.getArtifacts(session.id);
      const grouped: any = {};
      (data || []).forEach((a: any) => { grouped[a.phase] = a; });
      setArtifacts(grouped);
    } catch (e) { /* silent */ }
  };
  const fetchFindings = async () => {
    if (!session) return;
    try { const r = await reconAPI.getFindings(session.id); setFindings(r.findings || []); } catch (e) { /* silent */ }
  };
  const fetchScreenshots = async () => {
    if (!session) return;
    try { const r = await reconAPI.getScreenshots(session.id); setScreenshots(r || []); } catch (e) { /* silent */ }
  };
  const getScreenshotForSubdomain = (subdomain: string) => screenshots.find(s => s.payload?.subdomain === subdomain);

  const runPhase = async (phase: string, parameters?: any) => {
    if (!session) return;
    try {
      await reconAPI.runPhase({ sessionId: session.id, phase, parameters });
      toast.success(`Phase ${phase} started`);
      await fetchPhaseRuns(); fetchArtifacts(); fetchFindings();
    } catch (e) { toast.error('Unable to start phase.'); }
  };
  const cancelPhase = async (phase: string) => {
    if (!session) return;
    try {
      await reconAPI.cancelPhase({ sessionId: session.id, phase });
      toast.success('Phase cancelled');
      await fetchPhaseRuns();
    } catch (e) { toast.error('Unable to cancel phase.'); }
  };

  const restoreSession = async (sessionToRestore: ReconSession) => {
    const asset = pendingAsset;
    setResumeModal({ open: false, sessions: [] });
    setPendingAsset(null);
    if (!asset) return;
    try {
      setLoading(true);
      setSelectedAsset(asset);
      setSession(sessionToRestore);
      const [phaseRunsResult, findingsResult, screenshotsResult] = await Promise.allSettled([
        reconAPI.getPhaseRuns(sessionToRestore.id),
        reconAPI.getFindings(sessionToRestore.id),
        reconAPI.getScreenshots(sessionToRestore.id),
      ]);
      if (phaseRunsResult.status === 'fulfilled') setPhaseRuns(phaseRunsResult.value || []);
      if (findingsResult.status === 'fulfilled') setFindings((findingsResult.value as any)?.findings || []);
      if (screenshotsResult.status === 'fulfilled') setScreenshots((screenshotsResult.value as any) || []);
      toast.success('Session restored — picking up where you left off!');
    } catch (e) {
      toast.error('Failed to restore session.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssetSelect = async (asset: Asset) => {
    try {
      const sessionsResp = await reconAPI.getSessionsByAsset(asset.id);
      const sessions: ReconSession[] = sessionsResp?.sessions || [];
      if (sessions.length > 0) {
        setPendingAsset(asset);
        setResumeModal({ open: true, sessions });
      } else {
        setSelectedAsset(asset);
        fetchOrCreateSession(asset.id);
      }
    } catch (e) {
      // Fall back to creating a new session if lookup fails
      setSelectedAsset(asset);
      fetchOrCreateSession(asset.id);
    }
  };

  const handleAssetCreated = async (newAsset: Asset) => {
    setAssets(prev => [newAsset, ...prev]); setShowCreateAsset(false);
    try {
      setLoading(true);
      const target = newAsset.url || newAsset.hostname || newAsset.ipAddress || newAsset.name;
      const scanData = await scansAPI.start({ target, scanLevel: 'light' });
      const sessionResponse = await reconAPI.initialize({ target, scanId: scanData.scanId, assetId: newAsset.id });
      const sessionData = await reconAPI.getSession(sessionResponse.sessionId);
      if (sessionData) {
        setSession(sessionData); setSelectedAsset(newAsset);
        try {
          const [pr, fd, sd] = await Promise.allSettled([
            reconAPI.getPhaseRuns(sessionData.id),
            reconAPI.getFindings(sessionData.id),
            reconAPI.getScreenshots(sessionData.id),
          ]);
          if (pr.status === 'fulfilled') setPhaseRuns(pr.value || []);
          if (fd.status === 'fulfilled') setFindings(fd.value.findings || []);
          if (sd.status === 'fulfilled') setScreenshots(sd.value || []);
        } catch (e) { /* silent */ }
        toast.success('Asset created! Reconnaissance ready.');
      }
    } catch (e) {
      toast.error('Asset created, but recon setup failed.');
      setSelectedAsset(newAsset);
    } finally { setLoading(false); }
  };

  const handleBack = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSelectedAsset(null); setSession(null); setPhaseRuns([]); setSelection(null);
    setAiAnalysis(null); setArtifacts({}); setFindings([]); setScreenshots([]);
    setSelectedScreenshot(null); setShowCreateAsset(false); setActiveTab('phases');
    setPendingAsset(null); setResumeModal({ open: false, sessions: [] });
  };

  const handleStartFresh = useCallback(() => {
    setResumeModal({ open: false, sessions: [] });
    const asset = pendingAsset;
    setPendingAsset(null);
    localStorage.removeItem(STORAGE_KEY);
    if (asset) { setSelectedAsset(asset); fetchOrCreateSession(asset.id); }
  }, [pendingAsset, assets]);

  /* ─── Shared resume modal renderer (used in both views) ─── */
  const renderResumeModal = (positioning: 'absolute' | 'fixed') => {
    if (!resumeModal.open) return null;
    return (
      <div className={`${positioning} inset-0 z-50 flex items-center justify-center p-4`}
        style={{ background: 'rgba(2,2,13,0.88)', backdropFilter: 'blur(14px)' }}>
        <div className="relative w-full max-w-lg"
          style={{ background: 'rgba(8,5,40,0.98)', border: '1px solid rgba(157,95,255,0.22)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 0 60px rgba(157,95,255,0.12)' }}>
          <div className="px-6 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(157,95,255,0.1)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(157,95,255,0.12)', border: '1px solid rgba(157,95,255,0.25)' }}>
                <span style={{ fontSize: 18 }}>◎</span>
              </div>
              <div>
                <h2 style={{ color: '#e2d8ff', fontWeight: 600, fontSize: 15 }}>Resume Reconnaissance?</h2>
                <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a', marginTop: 2 }}>
                  Found {resumeModal.sessions.length} existing session{resumeModal.sessions.length > 1 ? 's' : ''} for{' '}
                  <em className="not-italic" style={{ color: '#c8a0ff' }}>{pendingAsset?.name}</em>
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 space-y-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
            {resumeModal.sessions.map((s, i) => {
              const started = new Date(s.startedAt);
              const isActive = s.status === 'ACTIVE' || s.status === 'RUNNING';
              return (
                <button key={s.id} onClick={() => restoreSession(s)}
                  className="w-full text-left transition-all duration-200"
                  style={{
                    background: i === 0 ? 'rgba(157,95,255,0.08)' : 'rgba(4,2,18,0.5)',
                    border: `1px solid ${i === 0 ? 'rgba(157,95,255,0.28)' : 'rgba(157,95,255,0.1)'}`,
                    borderRadius: 12, padding: '12px 14px', cursor: 'pointer', width: '100%',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(157,95,255,0.5)'; e.currentTarget.style.background = 'rgba(157,95,255,0.14)'; }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = i === 0 ? 'rgba(157,95,255,0.28)' : 'rgba(157,95,255,0.1)';
                    e.currentTarget.style.background = i === 0 ? 'rgba(157,95,255,0.08)' : 'rgba(4,2,18,0.5)';
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 1.5, color: i === 0 ? '#c8a0ff' : '#4a3d6a' }}>
                      {i === 0 ? '◉ MOST RECENT' : `◎ SESSION ${i + 1}`}
                    </span>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>
                      {started.toLocaleDateString()} {started.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{
                      fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 1,
                      padding: '2px 8px', borderRadius: 100,
                      border: `1px solid ${isActive ? 'rgba(74,222,128,0.35)' : 'rgba(240,184,64,0.3)'}`,
                      color: isActive ? '#4ade80' : '#f0b840',
                      background: isActive ? 'rgba(74,222,128,0.08)' : 'rgba(240,184,64,0.08)',
                    }}>{s.status}</span>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>
                      ID: {s.id.slice(-8)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-6 py-4 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(157,95,255,0.1)', background: 'rgba(4,2,18,0.4)' }}>
            <button onClick={handleStartFresh}
              className="transition-all duration-200"
              style={{
                fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
                padding: '7px 20px', borderRadius: 100,
                border: '1px solid rgba(157,95,255,0.15)', background: 'transparent',
                color: '#4a3d6a', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(157,95,255,0.15)'; e.currentTarget.style.color = '#4a3d6a'; }}>
              ↺ Start Fresh
            </button>
            <button onClick={() => restoreSession(resumeModal.sessions[0])}
              className="transition-all duration-200"
              style={{
                fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
                padding: '7px 22px', borderRadius: 100,
                border: '1px solid rgba(157,95,255,0.4)', background: 'rgba(91,33,182,0.25)',
                color: '#c8a0ff', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,33,182,0.45)'; e.currentTarget.style.borderColor = 'rgba(157,95,255,0.6)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,33,182,0.25)'; e.currentTarget.style.borderColor = 'rgba(157,95,255,0.4)'; }}>
              ◉ Resume Session
            </button>
          </div>
        </div>
      </div>
    );
  };
  // Memoized computed stats — only recompute when data changes
  const { completedPhases, runningPhases } = useMemo(() => ({
    completedPhases: phaseRuns.filter(p => p.status === 'DONE').length,
    runningPhases: phaseRuns.filter(p => p.status === 'RUNNING').length,
  }), [phaseRuns]);

  const findingsByType = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const f of findings) {
      (grouped[f.findingType] ??= []).push(f);
    }
    return grouped;
  }, [findings]);

  const phaseRunIndex = useMemo(() => {
    // phaseRuns arrive sorted by createdAt DESC (newest first).
    // Keep only the most recent run per phase.
    const idx: Record<string, ReconPhaseRun> = {};
    for (const pr of phaseRuns) {
      if (!idx[pr.phase]) idx[pr.phase] = pr;
    }
    return idx;
  }, [phaseRuns]);

  const getPhaseRun = useCallback((phase: string) => phaseRunIndex[phase], [phaseRunIndex]);

  /* ═══════════════════════════════════════════════════════
     ASSET SELECTION VIEW
     ═══════════════════════════════════════════════════════ */
  if (!selectedAsset || !session) {
    return (
      <div ref={containerRef} className="overflow-hidden flex flex-col"
        style={{ margin: '-0px -2rem -2.5rem -2rem', height: 'calc(100vh - 3.5rem)', position: 'relative', background: '#02020d' }}>
        <MiniStarField width={containerSize.w} height={containerSize.h} />

        {/* Topbar */}
        <div className="h-[52px] flex-shrink-0 flex items-center px-5 gap-3.5 relative z-10"
          style={{ background: 'rgba(4,2,18,0.95)', borderBottom: '1px solid rgba(157,95,255,0.13)', backdropFilter: 'blur(20px)' }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#f0b840', boxShadow: '0 0 8px #f0b840' }} />
          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1, color: '#4a3d6a' }}>
            Reconnaissance › <em className="not-italic" style={{ color: '#c8a0ff' }}>Select Target</em>
          </span>
          <div className="flex-1" />
          <button onClick={() => setShowCreateAsset(true)}
            className="transition-all duration-200"
            style={{
              fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
              padding: '4px 14px', borderRadius: 100,
              border: '1px solid rgba(240,184,64,0.35)', background: 'rgba(240,184,64,0.08)',
              color: '#f0b840', cursor: 'pointer',
            }}>
            + NEW ASSET
          </button>
        </div>

        <div className="flex-1 overflow-y-auto relative z-10 p-6">
          {showCreateAsset ? (
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <CreateAssetInline onAssetCreated={handleAssetCreated} onCancel={() => setShowCreateAsset(false)} />
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: 'rgba(240,184,64,0.3)', borderTopColor: 'transparent' }} />
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#4a3d6a' }}>Initializing session…</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(157,95,255,0.06)', border: '1px solid rgba(157,95,255,0.12)' }}>
                <span style={{ fontSize: 32 }}>◎</span>
              </div>
              <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: '#4a3d6a', textAlign: 'center' }}>
                No assets found. Create one to begin reconnaissance.
              </p>
            </div>
          ) : (
            <>
              {/* Section header */}
              <div className="mb-5 flex items-center gap-3">
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#4a3d6a', textTransform: 'uppercase' as const }}>
                  Target Assets
                </span>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#f0b840' }}>
                  {assets.length}
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(157,95,255,0.08)' }} />
              </div>

              {/* Asset grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {assets.map(asset => {
                  const tc = ASSET_TYPE_COLORS[asset.type] || '#6b7280';
                  const status = assetStatuses[asset.id];
                  const hasScans = !!status;
                  const scanColor = status?.hasRunning ? '#4ade80' : status?.completedPhases === 5 ? '#f0b840' : status ? '#9d5fff' : null;
                  return (
                    <button key={asset.id} onClick={() => handleAssetSelect(asset)}
                      className="group text-left transition-all duration-300"
                      style={{
                        background: 'rgba(4,2,18,0.7)',
                        border: `1px solid ${hasScans ? (scanColor + '30') : 'rgba(157,95,255,0.1)'}`,
                        borderRadius: 14, padding: '18px 20px', backdropFilter: 'blur(12px)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = `${hasScans ? scanColor : tc}55`;
                        e.currentTarget.style.boxShadow = `0 0 20px ${hasScans ? scanColor : tc}15`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = hasScans ? (scanColor + '30') : 'rgba(157,95,255,0.1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}>
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative"
                          style={{ background: `${tc}15`, border: `1px solid ${tc}30` }}>
                          <span style={{ color: tc, fontSize: 16 }}>◎</span>
                          {hasScans && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2"
                              style={{
                                background: scanColor || '#9d5fff',
                                borderColor: '#02020d',
                                boxShadow: `0 0 6px ${scanColor}88`,
                                animation: status.hasRunning ? 'pulse 2s ease-in-out infinite' : 'none',
                              }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 style={{ color: '#e2d8ff', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{asset.name}</h3>
                          <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#4a3d6a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {asset.url || asset.hostname || asset.ipAddress || '—'}
                          </p>
                        </div>
                      </div>

                      {/* Scan status strip */}
                      {hasScans && (
                        <div className="mt-2.5 flex items-center gap-2" style={{ paddingLeft: 48 }}>
                          {/* Phase progress dots */}
                          <div className="flex gap-1">
                            {[0, 1, 2, 3, 4].map(i => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                                background: i < status.completedPhases ? '#4ade80'
                                  : i < status.totalPhases ? 'rgba(157,95,255,0.3)'
                                  : 'rgba(157,95,255,0.08)',
                              }} />
                            ))}
                          </div>
                          <span style={{
                            fontFamily: "'Space Mono',monospace", fontSize: 8, letterSpacing: 1,
                            color: status.hasRunning ? '#4ade80' : status.completedPhases === 5 ? '#f0b840' : '#4a3d6a',
                          }}>
                            {status.hasRunning ? 'SCANNING…' : `${status.completedPhases}/5 PHASES`}
                          </span>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 8, color: '#2a2445' }}>•</span>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 8, color: '#4a3d6a' }}>
                            {new Date(status.lastScannedAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      <div className={`${hasScans ? 'mt-2' : 'mt-3'} flex items-center gap-2`}>
                        <span style={{
                          fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 1,
                          padding: '2px 8px', borderRadius: 100, border: `1px solid ${tc}44`, color: tc, background: `${tc}12`,
                        }}>{asset.type}</span>
                        {asset.criticality && (
                          <span style={{
                            fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 1,
                            padding: '2px 8px', borderRadius: 100,
                            border: '1px solid rgba(240,184,64,0.25)', color: '#f0b840', background: 'rgba(240,184,64,0.06)',
                          }}>{asset.criticality}</span>
                        )}
                        {hasScans && status.sessionCount > 1 && (
                          <span style={{
                            fontFamily: "'Space Mono',monospace", fontSize: 8, letterSpacing: 1,
                            padding: '2px 7px', borderRadius: 100, marginLeft: 'auto',
                            border: '1px solid rgba(157,95,255,0.15)', color: '#4a3d6a', background: 'rgba(157,95,255,0.04)',
                          }}>{status.sessionCount} SESSIONS</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

      {renderResumeModal('absolute')}
    </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     ACTIVE SESSION VIEW
     ═══════════════════════════════════════════════════════ */
  return (
    <div ref={containerRef} className="overflow-hidden flex flex-col"
      style={{ margin: '-0px -2rem -2.5rem -2rem', height: 'calc(100vh - 3.5rem)', position: 'relative', background: '#02020d' }}>
      <MiniStarField width={containerSize.w} height={containerSize.h} />

      {/* ══ TOPBAR ══ */}
      <div className="h-[52px] flex-shrink-0 flex items-center px-5 gap-3.5 relative z-10"
        style={{ background: 'rgba(4,2,18,0.95)', borderBottom: '1px solid rgba(157,95,255,0.13)', backdropFilter: 'blur(20px)' }}>
        {/* Back */}
        <button onClick={handleBack} className="transition-all"
          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(157,95,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a3d6a', cursor: 'pointer', background: 'transparent' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(240,184,64,0.4)'; e.currentTarget.style.color = '#f0b840'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(157,95,255,0.15)'; e.currentTarget.style.color = '#4a3d6a'; }}>
          ‹
        </button>
        {/* Live dot */}
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
          background: runningPhases > 0 ? '#4ade80' : '#f0b840',
          boxShadow: `0 0 8px ${runningPhases > 0 ? '#4ade80' : '#f0b840'}`,
          animation: runningPhases > 0 ? 'pulse 2s ease-in-out infinite' : 'none',
        }} />
        {/* Breadcrumb */}
        <span className="flex-1 min-w-0" style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1, color: '#4a3d6a' }}>
          Recon › <em className="not-italic" style={{ color: '#c8a0ff' }}>{selectedAsset.name}</em>
          <span style={{ color: '#2a2445', margin: '0 6px' }}>|</span>
          <em className="not-italic" style={{ color: '#4a3d6a' }}>{selectedAsset.url || selectedAsset.hostname || ''}</em>
        </span>
        {/* Stats pills */}
        <div className="flex gap-2">
          {[
            { label: 'PHASES', value: `${completedPhases}/5`, color: '#f0b840' },
            { label: 'FINDINGS', value: String(findings.length), color: '#4ade80' },
            { label: 'DNS', value: String((findingsByType['DNS_RECORDS']?.length || 0) + (findingsByType['CT_LOGS']?.length || 0)), color: '#a855f7' },
            { label: 'NET', value: String((findingsByType['PORT_SCAN']?.length || 0) + (findingsByType['HTTP_PROBE']?.length || 0)), color: '#f97316' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5"
              style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 1, color: '#4a3d6a' }}>
              <span style={{ color: s.color, fontWeight: 700, fontSize: 11 }}>{s.value}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ PHASE PIPELINE ══ */}
      <div className="flex-shrink-0 relative z-10 px-5 py-3"
        style={{ background: 'rgba(4,2,18,0.6)', borderBottom: '1px solid rgba(157,95,255,0.08)' }}>
        <div className="flex items-center gap-1">
          {PHASES.map((phase, i) => {
            const meta = PHASE_META[phase];
            const run = getPhaseRun(phase);
            const isDone = run?.status === 'DONE';
            const isRunning = run?.status === 'RUNNING';
            const isFailed = run?.status === 'FAILED';
            return (
              <div key={phase} className="flex items-center">
                {i > 0 && (
                  <div className="w-8 h-px mx-1" style={{
                    background: isDone ? `linear-gradient(90deg, ${PHASE_META[PHASES[i-1]].color}44, ${meta.color}44)` : 'rgba(157,95,255,0.08)',
                  }} />
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: isRunning ? `${meta.color}12` : isDone ? `${meta.color}08` : 'transparent',
                    border: `1px solid ${isRunning ? `${meta.color}35` : isDone ? `${meta.color}20` : isFailed ? 'rgba(239,68,68,0.25)' : 'rgba(157,95,255,0.06)'}`,
                    borderRadius: 10,
                  }}>
                  {/* Status dot */}
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{
                    background: isDone ? `${meta.color}20` : isRunning ? `${meta.color}15` : isFailed ? 'rgba(239,68,68,0.12)' : 'rgba(157,95,255,0.05)',
                    border: `1px solid ${isDone ? meta.color : isRunning ? meta.color : isFailed ? '#ef4444' : 'rgba(157,95,255,0.12)'}`,
                    boxShadow: (isDone || isRunning) ? `0 0 8px ${meta.glow}` : 'none',
                  }}>
                    {isDone && <span style={{ color: meta.color, fontSize: 10 }}>✓</span>}
                    {isRunning && <span className="w-2 h-2 rounded-full animate-ping" style={{ background: meta.color }} />}
                    {isFailed && <span style={{ color: '#ef4444', fontSize: 10 }}>✕</span>}
                  </div>
                  <span style={{
                    fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 0.5,
                    color: isDone ? meta.color : isRunning ? meta.color : isFailed ? '#ef4444' : '#4a3d6a',
                    fontWeight: isRunning ? 600 : 400,
                  }}>{meta.shortLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ TAB NAV ══ */}
      <div className="flex-shrink-0 relative z-10 flex items-center gap-1 px-5 py-2"
        style={{ background: 'rgba(4,2,18,0.4)' }}>
        {([
          { key: 'phases' as const, label: '⬡ Phases', count: null },
          { key: 'findings' as const, label: '◈ Findings', count: findings.length || null },
          { key: 'selection' as const, label: '◎ Selection', count: null },
          { key: 'threat' as const, label: '⬢ Threat Intel', count: null },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="transition-all duration-200"
            style={{
              fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
              padding: '5px 14px', borderRadius: 100,
              border: `1px solid ${activeTab === tab.key ? 'rgba(157,95,255,0.35)' : 'rgba(157,95,255,0.08)'}`,
              background: activeTab === tab.key ? 'rgba(91,33,182,0.18)' : 'transparent',
              color: activeTab === tab.key ? '#c8a0ff' : '#4a3d6a',
              cursor: 'pointer',
            }}>
            {tab.label}{tab.count ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {/* ══ CONTENT AREA ══ */}
      <div className="flex-1 overflow-y-auto relative z-10 p-5">

        {/* ── PHASES TAB ── */}
        {activeTab === 'phases' && (
          <div className="space-y-3 max-w-4xl mx-auto">
            {PHASES.map((phase, i) => {
              const meta = PHASE_META[phase];
              const run = getPhaseRun(phase);
              return (
                <div key={phase} className="flex items-center gap-4 transition-all duration-300"
                  style={{
                    background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(157,95,255,0.1)',
                    borderRadius: 14, padding: '12px 16px 12px 20px', backdropFilter: 'blur(12px)',
                  }}>
                  {/* Custom phase icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}30`,
                      boxShadow: run?.status === 'RUNNING' ? `0 0 16px ${meta.glow}` : 'none' }}>
                    <span style={{ color: meta.color, fontSize: 16 }}>{meta.icon}</span>
                  </div>
                  {/* Phase number tag */}
                  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 2, color: meta.color,
                    textTransform: 'uppercase' as const, writingMode: 'vertical-lr' as const, transform: 'rotate(180deg)', opacity: 0.5 }}>
                    {i === 3 ? 'AI' : `P${i}`}
                  </span>
                  {/* ReconPhaseControl handles label + status + buttons */}
                  <div className="flex-1 min-w-0">
                    <ReconPhaseControl
                      phase={phase}
                      label={meta.label}
                      sessionId={session.id}
                      phaseRun={run || undefined}
                      onRun={() => {
                        if (phase === 'FEROXBUSTER') runPhase(phase, { baseUrl: selectedAsset.url });
                        else if (phase === 'NUCLEI') runPhase(phase, {
                          targetUrls: selection?.selectedNucleiTargets || [],
                          tags: selection?.selectedNucleiTags || [],
                        });
                        else runPhase(phase);
                      }}
                      onCancel={() => cancelPhase(phase)}
                      disabled={
                        (phase === 'FEROXBUSTER' && !selection?.selectedServiceUrls?.length && !artifacts.NMAP) ||
                        (phase === 'NUCLEI' && (!selection?.selectedNucleiTargets?.length || !selection?.selectedNucleiTags?.length))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── FINDINGS TAB ── */}
        {activeTab === 'findings' && (
          <div className="space-y-4">

            {/* Category filter pills */}
            <div className="flex gap-2 flex-wrap">
              {FINDING_CATEGORIES.map(cat => {
                const count = cat.types.reduce((n, t) => n + (findingsByType[t]?.length || 0), 0);
                return (
                  <button key={cat.key}
                    onClick={() => setExpandedFindingType(expandedFindingType === cat.key ? null : cat.key)}
                    className="transition-all duration-200"
                    style={{
                      fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 0.5,
                      padding: '6px 14px', borderRadius: 10,
                      border: `1px solid ${expandedFindingType === cat.key ? `${cat.color}45` : count > 0 ? `${cat.color}20` : 'rgba(157,95,255,0.08)'}`,
                      background: expandedFindingType === cat.key ? `${cat.color}12` : 'rgba(4,2,18,0.6)',
                      color: count > 0 ? cat.color : '#2a2445',
                      cursor: count > 0 ? 'pointer' : 'default',
                      backdropFilter: 'blur(12px)',
                    }}>
                    {cat.icon} {cat.label} <span style={{ fontWeight: 700, marginLeft: 4 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {findings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(157,95,255,0.06)', border: '1px solid rgba(157,95,255,0.12)' }}>
                  <span style={{ fontSize: 24, color: '#4a3d6a' }}>◈</span>
                </div>
                <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#4a3d6a' }}>
                  No findings yet. Run a phase to discover assets.
                </p>
              </div>
            ) : (
              <div className="space-y-3">

                {/* ── CT LOGS (Subdomains) ── */}
                {(findingsByType['CT_LOGS']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'dns') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(168,85,247,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
                      <span style={{ color: '#a855f7', fontSize: 14 }}>⬢</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#a855f7', textTransform: 'uppercase' as const }}>CT Logs &amp; Subdomains</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a' }}>
                        {findingsByType['CT_LOGS'].reduce((n: number, f: any) => n + (f.data?.subdomains?.length || 0), 0)} subdomains
                      </span>
                    </div>
                    <div className="p-4">
                      {findingsByType['CT_LOGS'].map((finding: any, idx: number) => (
                        <div key={idx} className="mb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#c8a0ff', fontWeight: 600 }}>{finding.data?.domain || finding.data?.target}</span>
                            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>{finding.data?.source}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {finding.data?.subdomains?.map((sub: string, si: number) => {
                              const screenshot = getScreenshotForSubdomain(sub);
                              return (
                                <div key={si} className="flex items-center gap-1.5" style={{
                                  fontFamily: "'Space Mono',monospace", fontSize: 10, padding: '4px 10px', borderRadius: 8,
                                  background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', color: '#c8a0ff',
                                }}>
                                  <span>{sub}</span>
                                  {screenshot && (
                                    <button onClick={() => setSelectedScreenshot(screenshot)} style={{ color: '#f0b840', cursor: 'pointer', background: 'none', border: 'none', fontSize: 9, padding: 0 }}>👁</button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {finding.data?.certificates?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {finding.data.certificates.map((cert: any, ci: number) => (
                                <span key={ci} style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 6, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)', color: '#eab308' }}>
                                  {cert.issuer || cert.subject || `cert-${ci}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── DNS RECORDS ── */}
                {(findingsByType['DNS_RECORDS']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'dns') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(168,85,247,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
                      <span style={{ color: '#a855f7', fontSize: 14 }}>⬢</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#a855f7', textTransform: 'uppercase' as const }}>DNS Records</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {findingsByType['DNS_RECORDS'].map((finding: any, idx: number) => {
                        const records = finding.data?.records || finding.data || {};
                        const typeColors: Record<string, string> = { A: '#4ade80', AAAA: '#3b82f6', MX: '#a855f7', TXT: '#f97316', NS: '#eab308', CNAME: '#14b8a6', SOA: '#6b7280' };
                        return (
                          <div key={idx} className="space-y-2">
                            {finding.data?.target && (
                              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#c8a0ff', fontWeight: 600 }}>{finding.data.target}</span>
                            )}
                            {Object.entries(records).filter(([k]) => k !== 'target' && k !== 'timestamp').map(([recordType, values]) => {
                              if (recordType === 'target' || recordType === 'timestamp') return null;
                              const items = Array.isArray(values) ? values : [];
                              if (items.length === 0) return null;
                              const c = typeColors[recordType] || '#6b7280';
                              return (
                                <div key={recordType} className="flex gap-3 items-start">
                                  <span style={{
                                    fontFamily: "'Space Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: 1,
                                    padding: '3px 10px', borderRadius: 6, minWidth: 50, textAlign: 'center' as const,
                                    background: `${c}12`, color: c, border: `1px solid ${c}30`,
                                  }}>{recordType}</span>
                                  <div className="flex flex-wrap gap-1">
                                    {items.map((v: any, vi: number) => (
                                      <span key={vi} style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c8a0ff', wordBreak: 'break-all' as const }}>
                                        {typeof v === 'object' ? (v.exchange || v.value || JSON.stringify(v)) : String(v)}
                                        {vi < items.length - 1 ? ',' : ''}&nbsp;
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── WHOIS DATA ── */}
                {(findingsByType['WHOIS_DATA']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'dns') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(168,85,247,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
                      <span style={{ color: '#a855f7', fontSize: 14 }}>⬢</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#a855f7', textTransform: 'uppercase' as const }}>WHOIS Data</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {findingsByType['WHOIS_DATA'].map((finding: any, idx: number) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Target', value: finding.data?.target },
                            { label: 'Registrar', value: finding.data?.registrar },
                            { label: 'Created', value: finding.data?.createdDate ? new Date(finding.data.createdDate).toLocaleDateString() : null },
                            { label: 'Expires', value: finding.data?.expiryDate ? new Date(finding.data.expiryDate).toLocaleDateString() : null },
                          ].filter(r => r.value).map((r, ri) => (
                            <div key={ri} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.04)' }}>
                              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', minWidth: 60 }}>{r.label}</span>
                              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c8a0ff' }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ASN DATA ── */}
                {(findingsByType['ASN_DATA']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'dns') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(168,85,247,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
                      <span style={{ color: '#a855f7', fontSize: 14 }}>⬢</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#a855f7', textTransform: 'uppercase' as const }}>ASN Info</span>
                    </div>
                    <div className="p-4">
                      {findingsByType['ASN_DATA'].map((finding: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-4 flex-wrap">
                          {[
                            { label: 'ASN', value: finding.data?.asn, color: '#a855f7' },
                            { label: 'Org', value: finding.data?.org, color: '#c8a0ff' },
                            { label: 'Country', value: finding.data?.country, color: '#4ade80' },
                          ].filter(r => r.value).map((r, ri) => (
                            <span key={ri} style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, padding: '4px 10px', borderRadius: 8, background: `${r.color}08`, border: `1px solid ${r.color}20`, color: r.color }}>{r.label}: {r.value}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── PORT SCAN ── */}
                {(findingsByType['PORT_SCAN']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'network') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(249,115,22,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(249,115,22,0.08)' }}>
                      <span style={{ color: '#f97316', fontSize: 14 }}>⬡</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#f97316', textTransform: 'uppercase' as const }}>Open Ports</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a' }}>
                        {findingsByType['PORT_SCAN'].reduce((n: number, f: any) => n + (f.data?.openPorts?.length || 0), 0)} ports
                      </span>
                    </div>
                    <div className="p-4">
                      {findingsByType['PORT_SCAN'].map((finding: any, idx: number) => (
                        <div key={idx}>
                          {finding.data?.target && (
                            <div className="mb-2 flex items-center gap-2">
                              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#c8a0ff', fontWeight: 600 }}>{finding.data.target}</span>
                              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>{finding.data?.totalScanned ? `${finding.data.totalScanned} scanned` : ''}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {(finding.data?.openPorts || []).map((port: any, pi: number) => (
                              <div key={pi} className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                                style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.08)' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(249,115,22,0.2)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(249,115,22,0.08)'}>
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
                                  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#f97316', fontWeight: 700 }}>
                                    {port.port || port}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span style={{ fontSize: 12, color: '#e2d8ff', fontWeight: 500 }}>{port.service || 'unknown'}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>{port.protocol || 'tcp'}</span>
                                    {port.version && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>v{port.version}</span>}
                                  </div>
                                </div>
                                <span style={{
                                  fontFamily: "'Space Mono',monospace", fontSize: 8, padding: '2px 6px', borderRadius: 100,
                                  border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80', background: 'rgba(74,222,128,0.06)',
                                }}>{port.state || 'open'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── HTTP PROBE ── */}
                {(findingsByType['HTTP_PROBE']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'network') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(249,115,22,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(249,115,22,0.08)' }}>
                      <span style={{ color: '#f97316', fontSize: 14 }}>⬡</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#f97316', textTransform: 'uppercase' as const }}>HTTP Probes</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {findingsByType['HTTP_PROBE'].map((finding: any, idx: number) => {
                        const sc = finding.data?.statusCode >= 200 && finding.data?.statusCode < 300 ? '#4ade80' : finding.data?.statusCode >= 400 ? '#ef4444' : '#eab308';
                        return (
                          <div key={idx} className="flex items-center gap-4 px-5 py-2.5 transition-colors"
                            style={{ borderBottom: '1px solid rgba(157,95,255,0.04)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(249,115,22,0.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: `${sc}12`, border: `1px solid ${sc}25` }}>
                              <span style={{ color: sc, fontSize: 9 }}>{finding.data?.reachable ? '✓' : '✕'}</span>
                            </div>
                            <span className="flex-1 min-w-0 truncate" style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c8a0ff' }}>{finding.data?.target}</span>
                            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 100, background: `${sc}10`, color: sc, border: `1px solid ${sc}25` }}>{finding.data?.statusCode}</span>
                            {finding.data?.redirects?.length > 0 && (
                              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#eab308' }}>{finding.data.redirects.length} redirects</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── TLS FINGERPRINT ── */}
                {(findingsByType['TLS_FINGERPRINT']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'network') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(249,115,22,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(249,115,22,0.08)' }}>
                      <span style={{ color: '#f97316', fontSize: 14 }}>⬡</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#f97316', textTransform: 'uppercase' as const }}>TLS Fingerprints</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {findingsByType['TLS_FINGERPRINT'].map((finding: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 flex-wrap p-2 rounded-lg" style={{ background: 'rgba(249,115,22,0.04)' }}>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#c8a0ff', fontWeight: 600 }}>{finding.data?.target}</span>
                          {finding.data?.tlsVersion && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 100, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}>{finding.data.tlsVersion}</span>}
                          {finding.data?.certificate?.issuer && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>Issuer: {finding.data.certificate.issuer}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── CRAWLED URLS ── */}
                {(findingsByType['CRAWLED_URLS']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'web') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(59,130,246,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                      <span style={{ color: '#3b82f6', fontSize: 14 }}>◈</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#3b82f6', textTransform: 'uppercase' as const }}>Crawled URLs</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a' }}>
                        {findingsByType['CRAWLED_URLS'].reduce((n: number, f: any) => n + (f.data?.urls?.length || 0), 0)} endpoints
                      </span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {findingsByType['CRAWLED_URLS'].map((finding: any, fidx: number) => (
                        <div key={fidx}>
                          {(finding.data?.urls || []).map((url: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-4 px-5 py-2.5 transition-colors"
                              style={{ borderBottom: '1px solid rgba(157,95,255,0.04)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.03)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                                <span style={{ color: '#3b82f6', fontSize: 9 }}>◈</span>
                              </div>
                              <span className="flex-1 min-w-0 truncate" style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c8a0ff' }}>{url}</span>
                              <button onClick={() => window.open(url, '_blank')} style={{
                                fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '3px 10px', borderRadius: 8,
                                border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', background: 'rgba(59,130,246,0.06)', cursor: 'pointer',
                              }}>Open</button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ENDPOINT DISCOVERY (Feroxbuster) ── */}
                {(findingsByType['ENDPOINT_DISCOVERY']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'web') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(59,130,246,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                      <span style={{ color: '#3b82f6', fontSize: 14 }}>◈</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#3b82f6', textTransform: 'uppercase' as const }}>Discovered Endpoints</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a' }}>
                        {findingsByType['ENDPOINT_DISCOVERY'].length} found
                      </span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {findingsByType['ENDPOINT_DISCOVERY'].map((finding: any, idx: number) => {
                        const s = finding.data?.status || finding.data?.status_code || 0;
                        const sc = s >= 200 && s < 300 ? '#4ade80' : s >= 400 ? '#ef4444' : '#eab308';
                        return (
                          <div key={idx} className="flex items-center gap-4 px-5 py-2.5 transition-colors"
                            style={{ borderBottom: '1px solid rgba(157,95,255,0.04)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: `${sc}12`, border: `1px solid ${sc}25` }}>
                              <span style={{ color: sc, fontSize: 9 }}>{s >= 200 && s < 300 ? '✓' : '!'}</span>
                            </div>
                            <span className="flex-1 min-w-0 truncate" style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c8a0ff' }}>
                              {finding.data?.url || finding.data?.path || finding.data?.original_url || '—'}
                            </span>
                            {s > 0 && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 100, background: `${sc}10`, color: sc, border: `1px solid ${sc}25` }}>{s}</span>}
                            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>
                              {finding.data?.content_length || finding.data?.content_length || 0}b
                            </span>
                            <button onClick={() => window.open(finding.data?.url || finding.data?.original_url, '_blank')} style={{
                              fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '3px 10px', borderRadius: 8,
                              border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', background: 'rgba(59,130,246,0.06)', cursor: 'pointer',
                            }}>Open</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── PARAMETERS ── */}
                {(findingsByType['PARAMETERS']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'web') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(59,130,246,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                      <span style={{ color: '#3b82f6', fontSize: 14 }}>◈</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#3b82f6', textTransform: 'uppercase' as const }}>Parameters</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {findingsByType['PARAMETERS'].map((finding: any, idx: number) => (
                        <div key={idx}>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#c8a0ff', fontWeight: 600 }}>{finding.data?.target}</span>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', marginLeft: 8 }}>{finding.data?.totalParams || 0} total</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(finding.data?.getParams || []).map((p: string, pi: number) => (
                              <span key={`get-${pi}`} style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 6, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', color: '#4ade80' }}>GET {p}</span>
                            ))}
                            {(finding.data?.postParams || []).map((p: string, pi: number) => (
                              <span key={`post-${pi}`} style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 6, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)', color: '#f97316' }}>POST {p}</span>
                            ))}
                            {(finding.data?.jsonParams || []).map((p: string, pi: number) => (
                              <span key={`json-${pi}`} style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', color: '#a855f7' }}>JSON {p}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── SECURITY HEADERS ── */}
                {(findingsByType['SECURITY_HEADERS']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'web') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(59,130,246,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                      <span style={{ color: '#3b82f6', fontSize: 14 }}>◈</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#3b82f6', textTransform: 'uppercase' as const }}>Security Headers</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {findingsByType['SECURITY_HEADERS'].map((finding: any, idx: number) => {
                        const headers = [
                          { label: 'CSP', value: finding.data?.csp, present: !!finding.data?.csp },
                          { label: 'HSTS', value: finding.data?.hsts, present: !!finding.data?.hsts },
                          { label: 'X-Frame', value: finding.data?.xFrameOptions, present: !!finding.data?.xFrameOptions },
                          { label: 'X-Content-Type', value: finding.data?.xContentTypeOptions, present: !!finding.data?.xContentTypeOptions },
                        ];
                        return (
                          <div key={idx}>
                            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#c8a0ff', fontWeight: 600, marginBottom: 4, display: 'block' }}>{finding.data?.target}</span>
                            <div className="grid grid-cols-2 gap-2">
                              {headers.map((h, hi) => (
                                <div key={hi} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: h.present ? 'rgba(74,222,128,0.04)' : 'rgba(239,68,68,0.04)' }}>
                                  <span style={{ fontSize: 10, color: h.present ? '#4ade80' : '#ef4444' }}>{h.present ? '✓' : '✕'}</span>
                                  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', minWidth: 80 }}>{h.label}</span>
                                  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#c8a0ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{h.value || 'Missing'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── TECH STACK (Framework, Language, Auth) ── */}
                {(['FRAMEWORK', 'LANGUAGE', 'AUTH_TYPE'].some(t => findingsByType[t]?.length > 0)) && (expandedFindingType === null || expandedFindingType === 'tech') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(74,222,128,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(74,222,128,0.08)' }}>
                      <span style={{ color: '#4ade80', fontSize: 14 }}>◎</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#4ade80', textTransform: 'uppercase' as const }}>Tech Stack</span>
                    </div>
                    <div className="p-4 flex flex-wrap gap-3">
                      {(findingsByType['FRAMEWORK'] || []).map((f: any, i: number) => (
                        <div key={`fw-${i}`} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.12)' }}>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>FW</span>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#e2d8ff', fontWeight: 500 }}>{f.data?.framework}</span>
                          {f.data?.version && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>v{f.data.version}</span>}
                          {f.data?.confidence && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#eab308' }}>{Math.round(f.data.confidence * 100)}%</span>}
                        </div>
                      ))}
                      {(findingsByType['LANGUAGE'] || []).map((f: any, i: number) => (
                        <div key={`lang-${i}`} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)' }}>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>LANG</span>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#e2d8ff', fontWeight: 500 }}>{f.data?.language}</span>
                          {f.data?.confidence && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#eab308' }}>{Math.round(f.data.confidence * 100)}%</span>}
                        </div>
                      ))}
                      {(findingsByType['AUTH_TYPE'] || []).map((f: any, i: number) => (
                        <div key={`auth-${i}`} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)' }}>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>AUTH</span>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#e2d8ff', fontWeight: 500 }}>{f.data?.authType}</span>
                          {f.data?.methods && <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>{Array.isArray(f.data.methods) ? f.data.methods.join(', ') : f.data.methods}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── BEHAVIORAL SIGNALS ── */}
                {(findingsByType['BEHAVIORAL_SIGNALS']?.length > 0) && (expandedFindingType === null || expandedFindingType === 'behavior') && (
                  <div style={{ background: 'rgba(4,2,18,0.7)', border: '1px solid rgba(234,179,8,0.1)', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(234,179,8,0.08)' }}>
                      <span style={{ color: '#eab308', fontSize: 14 }}>◉</span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#eab308', textTransform: 'uppercase' as const }}>Behavioral Signals</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {findingsByType['BEHAVIORAL_SIGNALS'].map((finding: any, idx: number) => {
                        const signals = [
                          { label: 'Admin Panel', value: finding.data?.adminPanelFound, type: 'bool' },
                          { label: 'Auth Wall', value: finding.data?.authWallDetected, type: 'bool' },
                          { label: 'Upload Forms', value: finding.data?.uploadFormDetected, type: 'bool' },
                          { label: 'Error Pages', value: finding.data?.errorPagesExposed, type: 'bool' },
                          { label: 'API Endpoints', value: finding.data?.apiEndpointCount, type: 'num' },
                          { label: 'Sensitive Paths', value: finding.data?.sensitivePathsFound, type: 'num' },
                        ];
                        return (
                          <div key={idx}>
                            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#c8a0ff', fontWeight: 600, marginBottom: 4, display: 'block' }}>{finding.data?.target}</span>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {signals.map((s, si) => {
                                const isAlert = s.type === 'bool' ? s.value === true : (s.value || 0) > 0;
                                return (
                                  <div key={si} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: isAlert ? 'rgba(234,179,8,0.06)' : 'rgba(4,2,18,0.4)' }}>
                                    <span style={{ fontSize: 10, color: isAlert ? '#eab308' : '#4a3d6a' }}>{isAlert ? '⚠' : '○'}</span>
                                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>{s.label}</span>
                                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: isAlert ? '#eab308' : '#2a2445', fontWeight: 600, marginLeft: 'auto' }}>
                                      {s.type === 'bool' ? (s.value ? 'Yes' : 'No') : (s.value ?? 0)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {/* ── SELECTION TAB ── */}
        {activeTab === 'selection' && (
          <div>
            {(artifacts.NMAP || artifacts.FEROXBUSTER) ? (
              <ReconSelectionPanel
                sessionId={session.id}
                nmapData={artifacts.NMAP?.payload}
                feroxData={artifacts.FEROXBUSTER?.payload}
                onSelectionSaved={() => { fetchSelection(); toast.success('Selection saved'); }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(157,95,255,0.06)', border: '1px solid rgba(157,95,255,0.12)' }}>
                  <span style={{ fontSize: 24, color: '#4a3d6a' }}>◎</span>
                </div>
                <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#4a3d6a', textAlign: 'center' as const }}>
                  Run Nmap or Directory Enumeration first to populate selection options.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── THREAT INTEL TAB ── */}
        {activeTab === 'threat' && (
          <div>
            {aiAnalysis ? (
              <ThreatAssessmentPanel analysis={aiAnalysis} />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <span style={{ fontSize: 24, color: '#a855f7' }}>⬢</span>
                </div>
                <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#4a3d6a', textAlign: 'center' as const, maxWidth: 360 }}>
                  Run the AI Threat Assessment phase to generate intelligence analysis.
                </p>
                <button onClick={() => { setActiveTab('phases'); }}
                  style={{
                    fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
                    padding: '6px 16px', borderRadius: 100,
                    border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)',
                    color: '#a855f7', cursor: 'pointer',
                  }}>Go to Phases</button>
              </div>
            )}
          </div>
        )}

      </div>


      {renderResumeModal('fixed')}

      {/* ══ SCREENSHOT MODAL ══ */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(2,2,13,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={() => setSelectedScreenshot(null)}>
          <div className="relative max-w-5xl w-full"
            style={{ background: 'rgba(8,5,42,0.95)', border: '1px solid rgba(157,95,255,0.15)', borderRadius: 16, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: '1px solid rgba(157,95,255,0.1)' }}>
              <div>
                <h3 style={{ color: '#e2d8ff', fontWeight: 600, fontSize: 14 }}>{selectedScreenshot.payload?.subdomain}</h3>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a' }}>
                  {selectedScreenshot.payload?.capturedAt ? new Date(selectedScreenshot.payload.capturedAt).toLocaleString() : ''}
                </span>
              </div>
              <button onClick={() => setSelectedScreenshot(null)}
                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(157,95,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a3d6a', cursor: 'pointer', background: 'transparent' }}>
                ✕
              </button>
            </div>
            {/* Image */}
            <div className="p-4" style={{ background: 'rgba(4,2,18,0.5)', maxHeight: '70vh', overflow: 'auto' }}>
              <img
                src={reconAPI.getScreenshotUrl(selectedScreenshot.id)}
                alt={`Screenshot of ${selectedScreenshot.payload?.subdomain}`}
                className="w-full h-auto rounded-lg"
                style={{ border: '1px solid rgba(157,95,255,0.1)' }}
              />
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: '1px solid rgba(157,95,255,0.1)' }}>
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#f0b840',
                padding: '2px 10px', borderRadius: 100, border: '1px solid rgba(240,184,64,0.2)', background: 'rgba(240,184,64,0.06)' }}>
                {selectedScreenshot.payload?.url}
              </span>
              <div className="flex gap-2">
                <button onClick={() => window.open(selectedScreenshot.payload?.url, '_blank')}
                  style={{
                    fontFamily: "'Space Mono',monospace", fontSize: 10, padding: '5px 14px', borderRadius: 8,
                    border: '1px solid rgba(59,130,246,0.25)', color: '#3b82f6', background: 'rgba(59,130,246,0.06)',
                    cursor: 'pointer',
                  }}>Open in Tab</button>
                <button onClick={() => setSelectedScreenshot(null)}
                  style={{
                    fontFamily: "'Space Mono',monospace", fontSize: 10, padding: '5px 14px', borderRadius: 8,
                    border: '1px solid rgba(157,95,255,0.15)', color: '#4a3d6a', background: 'transparent',
                    cursor: 'pointer',
                  }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style jsx>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
      `}</style>
    </div>
  );
}
