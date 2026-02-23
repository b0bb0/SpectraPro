/**
 * Enterprise Scan Orchestration Types
 * Rapid7 InsightVM-style multi-phase scanning architecture
 */

export enum ScanPhase {
  PREFLIGHT = 'PREFLIGHT',                    // Phase 0: Instant validation
  DISCOVERY = 'DISCOVERY',                    // Phase 1: Technology fingerprinting
  PASSIVE_SIGNALS = 'PASSIVE_SIGNALS',        // Phase 1.5: Exposure signals (deterministic)
  TARGETED_SCAN = 'TARGETED_SCAN',            // Phase 2: AI-driven context-aware
  BASELINE_HYGIENE = 'BASELINE_HYGIENE',      // Phase 2.5: Deterministic coverage
  CORRELATION = 'CORRELATION',                // Phase 4: Dedup, risk scoring (mandatory)
  DEEP_SCAN = 'DEEP_SCAN',                    // Phase 3: Optional aggressive (explicit auth)
  PROCESSING = 'PROCESSING',                  // Legacy compatibility
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ScanProfile {
  FAST = 'FAST',           // Phase 0,1,1.5,2,4 - Strict AI, high+critical only
  BALANCED = 'BALANCED',   // Phase 0,1,1.5,2,2.5,4 - Balanced AI, all severities (AI-filtered)
  DEEP = 'DEEP',          // Phase 0,1,1.5,2,2.5,3,4 - Permissive AI, explicit auth required for Phase 3
}

/**
 * Asset Context - normalized fingerprint from discovery phase
 * Used to drive intelligent template selection
 */
export interface AssetContext {
  // Core identification
  target: string;
  reachable: boolean;
  responseTime: number;

  // Technology stack
  technologies: {
    cms?: 'wordpress' | 'drupal' | 'joomla' | 'magento' | string;
    language?: 'php' | 'asp' | 'jsp' | 'python' | 'ruby' | 'node' | string;
    webServer?: 'apache' | 'nginx' | 'iis' | 'tomcat' | string;
    framework?: string;
    version?: string;
  };

  // Security features
  security: {
    https: boolean;
    hsts: boolean;
    tlsVersion?: string;
    waf?: boolean;
    wafType?: string;
    headers: Record<string, string>;
  };

  // Attack surface
  surface: {
    hasAuth: boolean;
    hasForms: boolean;
    hasFileUpload: boolean;
    hasApi: boolean;
    endpoints: string[];
    parameters: string[];
  };

  // Metadata
  discoveredAt: string;
  fingerprint: string;
}

/**
 * Scan Phase Configuration
 */
export interface PhaseConfig {
  phase: ScanPhase;
  displayName: string;
  description: string;
  templatePaths: string[];
  flags: string[];
  timeout: number;
  rateLimit: number;
  concurrency: number;
  severity: string[];
  estimatedDuration: number; // seconds
  required: boolean;
}

/**
 * Scan Orchestration Plan
 * Generated before scan execution
 */
export interface ScanPlan {
  scanId: string;
  profile: ScanProfile;
  phases: PhaseConfig[];
  estimatedTotalDuration: number;
  templateCount: number; // internal only, never exposed to UI
  createdAt: string;
}

/**
 * Phase Execution State
 */
export interface PhaseExecution {
  phase: ScanPhase;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  startedAt?: string;
  completedAt?: string;
  findings: number;
  progress: number; // 0-100
  error?: string;
}

/**
 * Scan Orchestration State
 * Real-time state of multi-phase scan
 */
export interface ScanOrchestrationState {
  scanId: string;
  currentPhase: ScanPhase;
  phases: PhaseExecution[];
  assetContext?: AssetContext;
  overallProgress: number; // 0-100, weighted across phases
  displayPhase: string; // User-friendly phase name
  findings: number;
  startedAt: string;
  estimatedCompletion?: string;
}

/**
 * Template Selection Rules
 * Maps discovered context to relevant templates
 */
export interface TemplateSelectionRule {
  name: string;
  condition: (context: AssetContext) => boolean;
  templates: string[];
  priority: number;
}

/**
 * Phase-2 AI Scan Intent (Nuclei-Compatible Output)
 * AI outputs ONLY semantic intent - no filesystem paths
 */
export interface AIScanIntent {
  scan_intent: {
    vulnerability_tags: string[];      // e.g. ["sqli", "lfi", "xss", "misconfiguration"]
    scan_scopes: string[];             // e.g. ["http-vulnerabilities", "http-misconfiguration"]
    severity_levels: string[];         // e.g. ["info", "low", "medium", "high", "critical"]
    deep_scan_recommended: boolean;
  };
  rationale: {
    key_factors: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  sqli_assessment?: {
    likely: boolean;
    confidence: 'low' | 'medium' | 'high';
    reasons: string[];
    recommended_techniques: ('error-based' | 'boolean-based' | 'time-based')[];
  };
  candidate_parameters?: string[];     // Parameter names only - NO payloads, NO values
}

/**
 * Scope to Nuclei Folder Mapping
 */
export const SCOPE_FOLDER_MAP: Record<string, string> = {
  'http-vulnerabilities': 'http/vulnerabilities/',
  'http-misconfiguration': 'http/misconfiguration/',
  'http-exposures': 'http/exposures/',
  'http-cves': 'http/cves/',
  'http-default-logins': 'http/default-logins/',
  'http-exposed-panels': 'http/exposed-panels/',
  'http-fuzzing': 'http/fuzzing/',
  'http-technologies': 'http/technologies/',
  'ssl': 'ssl/',
};

/**
 * Risk Score Components
 */
export interface RiskScore {
  overall: number; // 0-100
  components: {
    cvss: number;
    exploitability: number;
    assetCriticality: number;
    exposure: number;
    recurrence: number;
  };
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  calculation: string;
}

/**
 * Vulnerability Intelligence
 * Enhanced vulnerability data for AI processing
 */
export interface VulnerabilityIntelligence {
  id: string;
  templateId: string;
  category: string;
  severity: string;
  cvss?: number;

  // Context
  assetContext: AssetContext;
  discoveryPhase: ScanPhase;
  correlationGroup?: string;

  // Evidence
  matchedAt: string;
  parameter?: string;
  request?: string;
  response?: string;

  // Intelligence
  exploitAvailable: boolean;
  patchAvailable: boolean;
  ageInDays: number;

  // Deduplication key
  fingerprint: string;
}

/**
 * Authentication Configuration for Scans
 * Supports multiple authentication methods
 */
export interface ScanAuthConfig {
  // Method type
  method: 'none' | 'basic' | 'bearer' | 'cookie' | 'header' | 'form';

  // Basic Auth
  username?: string;
  password?: string;

  // Bearer Token
  bearerToken?: string;

  // Cookie-based
  cookies?: Record<string, string>;

  // Custom Headers
  headers?: Record<string, string>;

  // Form-based (for login forms)
  loginUrl?: string;
  usernameField?: string;
  passwordField?: string;
  submitPath?: string;

  // Session management
  sessionCookie?: string;
}

/**
 * Executive Dashboard Metrics
 */
export interface ExecutiveMetrics {
  overallRiskScore: RiskScore;

  vulnerabilityDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };

  assetsWithCriticalRisk: {
    count: number;
    percentage: number;
    assets: Array<{ id: string; name: string; score: number }>;
  };

  riskTrend: Array<{
    date: string;
    score: number;
    vulnerabilities: number;
  }>;

  newVsResolved: {
    period: string;
    new: number;
    resolved: number;
    netChange: number;
  };

  topVulnerabilities: Array<{
    id: string;
    title: string;
    severity: string;
    affectedAssets: number;
    riskContribution: number;
  }>;

  complianceScore?: {
    owasp: number;
    pci: number;
    hipaa: number;
  };
}
