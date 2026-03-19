'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Server,
  Activity,
  Clock,
  AlertCircle,
  Target,
} from 'lucide-react'
import NewScanModal from '@/components/NewScanModal'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { dashboardAPI } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

interface DashboardMetrics {
  totalAssets: number
  totalVulnerabilities: number
  openVulnerabilities: number
  criticalAssets: number
  newVulnerabilities: number
  mitigatedVulnerabilities: number
  riskScore: number
  severityCounts: {
    critical: number
    high: number
    medium: number
    low: number
  }
  trends: {
    vulnerabilities: { value: number; direction: 'up' | 'down' | 'stable' }
    critical: { value: number; direction: 'up' | 'down' | 'stable' }
  }
  timeRange: string
}

interface AssetsByCategory {
  byType: Array<{ category: string; count: number }>
  byEnvironment: Array<{ category: string; count: number }>
  byCriticality: Array<{ category: string; count: number }>
}

interface TopVulnerability {
  id: string; title: string; severity: string; cvssScore: number | null
  cveId: string | null; status: string; firstSeen: Date
  asset: { id: string; name: string; type: string }
}

interface RecentScan {
  id: string; status: string; scanProfile: string
  createdAt: Date; completedAt: Date | null
  assets: { id: string; name: string }
}

interface RiskTrendData { date: string; critical: number; high: number; medium: number; low: number }
interface SeverityData { name: string; value: number; color: string }

// Cosmic chart colors
const COSMIC_COLORS = {
  critical: '#ff6b6b',
  high: '#f0b840',
  medium: '#9d5fff',
  low: '#60a5fa',
  grid: 'rgba(157, 95, 255, 0.08)',
  axis: '#8878a9',
  tooltip: {
    bg: '#0e0e3a',
    border: 'rgba(157, 95, 255, 0.2)',
  },
}

const cosmicTooltipStyle = {
  backgroundColor: COSMIC_COLORS.tooltip.bg,
  border: `1px solid ${COSMIC_COLORS.tooltip.border}`,
  borderRadius: '12px',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 4px 24px rgba(2,2,13,0.6)',
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [riskTrend, setRiskTrend] = useState<RiskTrendData[]>([])
  const [assetsByCategory, setAssetsByCategory] = useState<AssetsByCategory | null>(null)
  const [topVulnerabilities, setTopVulnerabilities] = useState<TopVulnerability[]>([])
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [loading, setLoading] = useState(true)
  const [showScanModal, setShowScanModal] = useState(false)

  useEffect(() => { loadDashboardData() }, [timeRange])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      const [metricsData, trendData, assetsData, topVulnsData, scansData] = await Promise.all([
        dashboardAPI.getMetrics(timeRange),
        dashboardAPI.getRiskTrend(timeRange),
        dashboardAPI.getAssetsByCategory(),
        dashboardAPI.getTopVulnerabilities(5),
        dashboardAPI.getRecentScans(4),
      ])
      setMetrics(metricsData)
      setRiskTrend(trendData)
      setAssetsByCategory(assetsData)
      setTopVulnerabilities(topVulnsData)
      setRecentScans(scansData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally { setLoading(false) }
  }

  const handleScanStarted = (scanId: string) => {
    setShowScanModal(false)
    router.push('/dashboard/scans')
  }

  if (loading || !metrics) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 rounded w-1/4" style={{ background: 'rgba(157,95,255,0.1)' }} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl" style={{ background: 'rgba(14,14,58,0.4)', border: '1px solid rgba(157,95,255,0.08)' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const severityData: SeverityData[] = [
    { name: 'Critical', value: metrics.severityCounts.critical, color: COSMIC_COLORS.critical },
    { name: 'High', value: metrics.severityCounts.high, color: COSMIC_COLORS.high },
    { name: 'Medium', value: metrics.severityCounts.medium, color: COSMIC_COLORS.medium },
    { name: 'Low', value: metrics.severityCounts.low, color: COSMIC_COLORS.low },
  ]

  const riskScore = metrics.riskScore

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const getSeverityColor = (s: string) => {
    const map: Record<string, string> = { CRITICAL: '#ff6b6b', HIGH: '#f0b840', MEDIUM: '#c8a0ff', LOW: '#60a5fa' }
    return map[s] || '#8878a9'
  }

  const getScanStatusColor = (s: string) => {
    const map: Record<string, string> = { COMPLETED: '#4ade80', RUNNING: '#60a5fa', FAILED: '#ff6b6b' }
    return map[s] || '#8878a9'
  }

  // KPI Card component
  const KPICard = ({ icon: Icon, value, label, trend, trendDir, iconColor }: any) => (
    <div
      className="cosmic-panel p-5 group cursor-default"
      style={{ animation: 'rise 0.5s ease-out both' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: `${iconColor}12`, border: `1px solid ${iconColor}30` }}
        >
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
        <p className="text-3xl font-bold" style={{ color: '#e0d6f6' }}>{value}</p>
      </div>
      <h3 className="text-sm font-medium" style={{ color: '#8878a9' }}>{label}</h3>
      {trend !== undefined && (
        <div className="mt-2 flex items-center text-xs">
          {trendDir === 'down' ? (
            <><TrendingDown className="w-3 h-3 mr-1" style={{ color: '#4ade80' }} /><span style={{ color: '#4ade80' }}>-{trend}% improved</span></>
          ) : trendDir === 'up' ? (
            <><TrendingUp className="w-3 h-3 mr-1" style={{ color: '#ff6b6b' }} /><span style={{ color: '#ff6b6b' }}>+{trend}% increase</span></>
          ) : (
            <span style={{ color: '#8878a9' }}>No change</span>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between" style={{ animation: 'rise 0.4s ease-out both' }}>
        <div>
          <h1 className="text-3xl font-bold gradient-text">Welcome back, {user?.firstName}</h1>
          <p className="mt-1 text-sm" style={{ color: '#8878a9' }}>Security overview for {user?.tenant?.name}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => setShowScanModal(true)} className="btn-premium px-4 py-2 text-sm flex items-center space-x-2">
            <Target className="w-4 h-4" /><span>New Scan</span>
          </button>
          <button className="btn-secondary px-4 py-2 text-sm flex items-center space-x-2">
            <Activity className="w-4 h-4" /><span>Generate Report</span>
          </button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="cosmic-panel p-4 flex items-center justify-between" style={{ animation: 'rise 0.45s ease-out both' }}>
        <div className="flex items-center space-x-3">
          <Clock className="w-5 h-5" style={{ color: '#f0b840' }} />
          <span className="text-sm font-medium font-mono" style={{ color: '#8878a9' }}>Time Range:</span>
        </div>
        <div className="flex items-center space-x-2">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: timeRange === range
                  ? 'linear-gradient(135deg, rgba(240,184,64,0.2), rgba(157,95,255,0.15))'
                  : 'transparent',
                border: timeRange === range
                  ? '1px solid rgba(240,184,64,0.3)'
                  : '1px solid rgba(157,95,255,0.1)',
                color: timeRange === range ? '#f0b840' : '#8878a9',
                boxShadow: timeRange === range ? '0 0 12px rgba(240,184,64,0.1)' : 'none',
              }}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard icon={Server} value={metrics.totalAssets} label="Total Assets" iconColor="#60a5fa" />
        <KPICard icon={AlertTriangle} value={metrics.openVulnerabilities} label="Open Vulnerabilities"
          trend={metrics.trends.vulnerabilities.value} trendDir={metrics.trends.vulnerabilities.direction} iconColor="#ff6b6b" />
        <KPICard icon={Shield} value={metrics.criticalAssets} label="Assets at Critical Risk" iconColor="#f0b840" />
        <KPICard icon={Activity} value={metrics.newVulnerabilities} label="Newly Discovered" iconColor="#9d5fff" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Trend */}
        <div className="cosmic-panel p-6" style={{ animation: 'rise 0.55s ease-out both' }}>
          <div className="mb-6">
            <h2 className="text-xl font-semibold" style={{ color: '#e0d6f6' }}>
              Risk Trend ({timeRange === '7d' ? '7 Days' : timeRange === '30d' ? '30 Days' : '90 Days'})
            </h2>
            <p className="text-sm mt-1" style={{ color: '#8878a9' }}>Vulnerability severity over time</p>
          </div>
          <div role="img" aria-label="Risk trend chart showing critical, high, medium, and low vulnerability counts over time">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={riskTrend}>
              <defs>
                <linearGradient id="critGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff6b6b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ff6b6b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f0b840" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f0b840" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="medGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9d5fff" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#9d5fff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COSMIC_COLORS.grid} />
              <XAxis dataKey="date" stroke={COSMIC_COLORS.axis} style={{ fontSize: '11px', fontFamily: 'Space Mono' }} />
              <YAxis stroke={COSMIC_COLORS.axis} style={{ fontSize: '11px', fontFamily: 'Space Mono' }} />
              <Tooltip contentStyle={cosmicTooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="critical" stroke="#ff6b6b" strokeWidth={2} fill="url(#critGrad)" name="Critical" />
              <Area type="monotone" dataKey="high" stroke="#f0b840" strokeWidth={2} fill="url(#highGrad)" name="High" />
              <Area type="monotone" dataKey="medium" stroke="#9d5fff" strokeWidth={2} fill="url(#medGrad)" name="Medium" />
              <Area type="monotone" dataKey="low" stroke="#60a5fa" strokeWidth={2} fill="url(#lowGrad)" name="Low" />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Severity Distribution */}
        <div className="cosmic-panel p-6" style={{ animation: 'rise 0.6s ease-out both' }}>
          <div className="mb-6">
            <h2 className="text-xl font-semibold" style={{ color: '#e0d6f6' }}>Severity Distribution</h2>
            <p className="text-sm mt-1" style={{ color: '#8878a9' }}>Current vulnerability breakdown</p>
          </div>
          <div role="img" aria-label="Pie chart showing current vulnerability severity distribution">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={severityData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" stroke="none">
                {severityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={cosmicTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {severityData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}40` }} />
                  <span style={{ color: '#8878a9' }}>{item.name}</span>
                </div>
                <span className="font-semibold font-mono" style={{ color: '#e0d6f6' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assets by Category */}
      {assetsByCategory && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[
            { title: 'Assets by Type', data: assetsByCategory.byType, color: '#9d5fff' },
            { title: 'Assets by Environment', data: assetsByCategory.byEnvironment, color: '#f0b840' },
            { title: 'Assets by Criticality', data: assetsByCategory.byCriticality, color: '#ff6b6b' },
          ].map((chart) => (
            <div key={chart.title} className="cosmic-panel p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>{chart.title}</h2>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chart.data} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={COSMIC_COLORS.grid} />
                  <XAxis type="number" stroke={COSMIC_COLORS.axis} style={{ fontSize: '11px', fontFamily: 'Space Mono' }} />
                  <YAxis type="category" dataKey="category" stroke={COSMIC_COLORS.axis} style={{ fontSize: '11px', fontFamily: 'Space Mono' }} width={100} />
                  <Tooltip contentStyle={cosmicTooltipStyle} />
                  <Bar dataKey="count" fill={chart.color} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {/* Top Vulnerabilities */}
      <div className="cosmic-panel p-6" style={{ animation: 'rise 0.65s ease-out both' }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: '#e0d6f6' }}>Top Vulnerabilities</h2>
            <p className="text-sm mt-1" style={{ color: '#8878a9' }}>Highest priority issues</p>
          </div>
          <button onClick={() => router.push('/dashboard/vulnerabilities')} className="text-sm font-medium" style={{ color: '#f0b840' }} aria-label="View all vulnerabilities">View All →</button>
        </div>
        {topVulnerabilities.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: '#4ade80' }} aria-hidden="true" />
            <p style={{ color: '#8878a9' }}>No open vulnerabilities found</p>
          </div>
        ) : (
          <div className="space-y-3" role="list" aria-label="Top vulnerabilities">
            {topVulnerabilities.map((vuln) => (
              <button
                key={vuln.id}
                onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}?returnTo=${encodeURIComponent('/dashboard')}`)}
                className="p-4 rounded-xl flex items-center justify-between cursor-pointer transition-all w-full text-left"
                style={{
                  background: 'rgba(14, 14, 58, 0.3)',
                  border: '1px solid rgba(157, 95, 255, 0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(240,184,64,0.2)'
                  e.currentTarget.style.background = 'rgba(14, 14, 58, 0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(157,95,255,0.08)'
                  e.currentTarget.style.background = 'rgba(14, 14, 58, 0.3)'
                }}
                aria-label={`${vuln.severity} vulnerability: ${vuln.title}`}
                role="listitem"
              >
                <div className="flex items-start space-x-4 flex-1">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${getSeverityColor(vuln.severity)}12`, border: `1px solid ${getSeverityColor(vuln.severity)}30` }}
                  >
                    <AlertTriangle className="w-5 h-5" style={{ color: getSeverityColor(vuln.severity) }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium mb-1 line-clamp-1" style={{ color: '#e0d6f6' }}>
                      {vuln.title}
                    </h3>
                    <div className="flex items-center space-x-4 text-xs" style={{ color: '#6b5f8a' }}>
                      <span className="flex items-center space-x-1">
                        <Server className="w-3 h-3" />
                        <span className="truncate max-w-[200px]">{vuln.asset?.name || 'Unknown'}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(vuln.firstSeen)}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {vuln.cvssScore && (
                    <div className="text-right">
                      <div className="text-[10px] font-mono" style={{ color: '#6b5f8a' }}>CVSS</div>
                      <div className="text-lg font-bold font-mono" style={{ color: getSeverityColor(vuln.severity) }}>{vuln.cvssScore.toFixed(1)}</div>
                    </div>
                  )}
                  <span
                    className="cosmic-pill"
                    style={{
                      background: `${getSeverityColor(vuln.severity)}15`,
                      color: getSeverityColor(vuln.severity),
                      border: `1px solid ${getSeverityColor(vuln.severity)}30`,
                    }}
                  >
                    {vuln.severity}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity & Risk Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Scans */}
        <div className="lg:col-span-2 cosmic-panel p-6" style={{ animation: 'rise 0.7s ease-out both' }}>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: '#e0d6f6' }}>Recent Scans</h2>
              <p className="text-sm mt-1" style={{ color: '#8878a9' }}>Latest scan activity</p>
            </div>
            <button onClick={() => router.push('/dashboard/scans')} className="text-sm font-medium" style={{ color: '#f0b840' }} aria-label="View all scans">View All →</button>
          </div>
          {recentScans.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 mx-auto mb-3" style={{ color: '#6b5f8a' }} />
              <p style={{ color: '#8878a9' }}>No recent scans</p>
              <button onClick={() => setShowScanModal(true)} className="mt-4 btn-premium px-4 py-2 text-sm">Start Your First Scan</button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentScans.map((scan) => (
                <button
                  key={scan.id}
                  onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
                  className="flex items-start space-x-3 p-3 rounded-xl cursor-pointer transition-all w-full text-left"
                  style={{ background: 'rgba(14,14,58,0.3)', border: '1px solid rgba(157,95,255,0.06)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(240,184,64,0.15)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(157,95,255,0.06)' }}
                  aria-label={`View scan: ${scan.assets?.name || 'Unknown'} - ${scan.status}`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${getScanStatusColor(scan.status)}12`, border: `1px solid ${getScanStatusColor(scan.status)}25` }}
                  >
                    <Activity className="w-4 h-4" style={{ color: getScanStatusColor(scan.status) }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate" style={{ color: '#e0d6f6' }}>{scan.assets?.name || 'Unknown'}</p>
                      <span
                        className="cosmic-pill text-[10px]"
                        style={{ background: `${getScanStatusColor(scan.status)}15`, color: getScanStatusColor(scan.status), border: `1px solid ${getScanStatusColor(scan.status)}30` }}
                      >
                        {scan.status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-xs" style={{ color: '#6b5f8a' }}>
                      <span className="flex items-center space-x-1"><Target className="w-3 h-3" /><span>{scan.scanProfile}</span></span>
                      <span className="flex items-center space-x-1"><Clock className="w-3 h-3" /><span>{timeAgo(scan.createdAt)}</span></span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Risk Score Ring */}
        <div className="cosmic-panel p-6" style={{ animation: 'rise 0.75s ease-out both' }}>
          <div className="mb-6">
            <h2 className="text-xl font-semibold" style={{ color: '#e0d6f6' }}>Risk Score</h2>
            <p className="text-sm mt-1" style={{ color: '#8878a9' }}>Overall security posture</p>
          </div>
          <div className="text-center py-6">
            <div className="relative inline-flex items-center justify-center">
              <svg className="w-40 h-40" viewBox="0 0 160 160">
                <defs>
                  <linearGradient id="riskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f0b840" />
                    <stop offset="100%" stopColor="#9d5fff" />
                  </linearGradient>
                  <filter id="riskGlow">
                    <feGaussianBlur stdDeviation="3" result="glow" />
                    <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <circle cx="80" cy="80" r="60" fill="none" stroke="rgba(157,95,255,0.1)" strokeWidth="12" />
                <circle
                  cx="80" cy="80" r="60" fill="none" stroke="url(#riskGrad)" strokeWidth="12"
                  strokeDasharray={`${(riskScore / 100) * 377} 377`}
                  strokeLinecap="round" filter="url(#riskGlow)"
                  transform="rotate(-90 80 80)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-4xl font-bold gradient-text">{riskScore}</span>
                <span className="text-xs font-mono" style={{ color: '#6b5f8a' }}>/ 100</span>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#8878a9' }}>Status</span>
                <span className="font-semibold font-mono" style={{
                  color: riskScore >= 80 ? '#ff6b6b' : riskScore >= 60 ? '#f0b840' : riskScore >= 40 ? '#c8a0ff' : '#4ade80'
                }}>
                  {riskScore >= 80 ? 'Critical Risk' : riskScore >= 60 ? 'High Risk' : riskScore >= 40 ? 'Medium Risk' : 'Low Risk'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#8878a9' }}>Critical Issues</span>
                <span className="font-semibold font-mono" style={{ color: '#ff6b6b' }}>{metrics.severityCounts.critical}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#8878a9' }}>High Issues</span>
                <span className="font-semibold font-mono" style={{ color: '#f0b840' }}>{metrics.severityCounts.high}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Scan Modal */}
      <NewScanModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        onScanStarted={handleScanStarted}
      />
    </div>
  )
}
