'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft,
  Server,
  Globe,
  Cloud,
  Network,
  AlertTriangle,
  Shield,
  Activity,
  RefreshCw,
  Edit,
  Play,
  Eye,
  Clock,
  TrendingUp,
  Tag,
  User,
} from 'lucide-react'
import { assetsAPI } from '@/lib/api'

interface Asset {
  id: string
  name: string
  type: string
  environment: string
  criticality: string
  identifier: string
  ipAddress?: string
  ipAddresses?: string[]
  hostname?: string
  url?: string
  services?: string[]
  parentAssetId?: string
  description?: string
  tags: string[]
  owner?: string
  source?: string[]
  riskScore: number
  vulnCount: number
  criticalVulnCount: number
  highVulnCount: number
  mediumVulnCount: number
  lowVulnCount: number
  infoVulnCount: number
  scanCount: number
  firstSeen: string
  lastSeen: string
  lastScanAt?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface Vulnerability {
  id: string
  title: string
  severity: string
  status: string
  cvssScore?: number
  cveId?: string
  firstSeen: string
  lastSeen: string
}

interface Scan {
  id: string
  name: string
  type: string
  status: string
  vulnFound: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  infoCount: number
  startedAt?: string
  completedAt?: string
  duration?: number
  createdAt: string
}

interface Hierarchy {
  parent?: {
    id: string
    name: string
    type: string
    identifier: string
    riskScore: number
    vulnCount: number
  }
  current: {
    id: string
    name: string
    type: string
    identifier: string
  }
  children: Array<{
    id: string
    name: string
    type: string
    identifier: string
    riskScore: number
    vulnCount: number
    criticalVulnCount: number
    lastSeen: string
  }>
}

type TabType = 'overview' | 'vulnerabilities' | 'scans' | 'hierarchy'

export default function AssetDetailPage() {
  const router = useRouter()
  const params = useParams()
  const assetId = params.id as string

  const [asset, setAsset] = useState<Asset | null>(null)
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([])
  const [scans, setScans] = useState<Scan[]>([])
  const [hierarchy, setHierarchy] = useState<Hierarchy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const fetchAsset = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await assetsAPI.get(assetId)
      setAsset(response)
    } catch (err: any) {
      setError(err.message || 'Failed to load asset')
    } finally {
      setLoading(false)
    }
  }

  const fetchVulnerabilities = async () => {
    try {
      const response = await assetsAPI.getVulnerabilities(assetId)
      setVulnerabilities(response)
    } catch (err) {
      console.error('Failed to load vulnerabilities:', err)
    }
  }

  const fetchScans = async () => {
    try {
      const response = await assetsAPI.getScans(assetId)
      setScans(response)
    } catch (err) {
      console.error('Failed to load scans:', err)
    }
  }

  const fetchHierarchy = async () => {
    try {
      const response = await assetsAPI.getHierarchy(assetId)
      setHierarchy(response)
    } catch (err) {
      console.error('Failed to load hierarchy:', err)
    }
  }

  useEffect(() => {
    fetchAsset()
  }, [assetId])

  useEffect(() => {
    if (activeTab === 'vulnerabilities') {
      fetchVulnerabilities()
    } else if (activeTab === 'scans') {
      fetchScans()
    } else if (activeTab === 'hierarchy') {
      fetchHierarchy()
    }
  }, [activeTab])

  const getTypeIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      DOMAIN: <Globe className="h-5 w-5" />,
      IP: <Server className="h-5 w-5" />,
      APPLICATION: <Activity className="h-5 w-5" />,
      API: <Network className="h-5 w-5" />,
      CLOUD_RESOURCE: <Cloud className="h-5 w-5" />,
      NETWORK_DEVICE: <Network className="h-5 w-5" />,
    }
    return icons[type] || <Server className="h-5 w-5" />
  }

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-red-500/10 text-red-400',
      HIGH: 'bg-orange-500/10 text-orange-400',
      MEDIUM: 'bg-yellow-500/10 text-yellow-400',
      LOW: 'bg-blue-500/10 text-blue-400',
      INFO: 'bg-background-elevated text-text-secondary',
    }
    return colors[severity] || 'bg-background-elevated text-text-secondary'
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      OPEN: 'bg-red-500/10 text-red-400',
      IN_PROGRESS: 'bg-yellow-500/10 text-yellow-400',
      MITIGATED: 'bg-green-500/10 text-green-400',
      ACCEPTED: 'bg-blue-500/10 text-blue-400',
      FALSE_POSITIVE: 'bg-background-elevated text-text-secondary',
      REOPENED: 'bg-orange-500/10 text-orange-400',
      PENDING: 'bg-background-elevated text-text-secondary',
      RUNNING: 'bg-blue-500/10 text-blue-400',
      COMPLETED: 'bg-green-500/10 text-green-400',
      FAILED: 'bg-red-500/10 text-red-400',
    }
    return colors[status] || 'bg-background-elevated text-text-secondary'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A'
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 text-accent-primary animate-spin" />
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary glass-hover px-3 py-2 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="glass-panel border-l-4 border-red-500 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-text-primary">Error</h3>
            <p className="text-sm text-text-secondary mt-1">{error || 'Asset not found'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.back()}
            className="mt-1 p-2 glass-hover rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-text-secondary" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-accent-primary/10 rounded-lg text-accent-primary">{getTypeIcon(asset.type)}</div>
              <div>
                <h1 className="text-3xl font-bold gradient-text">{asset.name}</h1>
                <p className="text-sm text-text-secondary">
                  {asset.hostname || asset.ipAddress || asset.url || asset.identifier}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getSeverityColor(asset.criticality)}`}>
                {asset.criticality}
              </span>
              <span className="text-sm text-text-secondary">{asset.environment}</span>
              <span className="text-sm text-text-secondary">•</span>
              <span className="text-sm text-text-secondary">{asset.type.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/dashboard/scans?assetId=${asset.id}`)}
            className="btn-premium px-4 py-2 text-sm flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Run Scan
          </button>
          <button className="p-2 glass-hover rounded-lg transition-colors">
            <Edit className="h-5 w-5 text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Risk Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className={`w-12 h-12 ${
              asset.riskScore >= 70 ? 'bg-red-500/10' :
              asset.riskScore >= 40 ? 'bg-orange-500/10' :
              asset.riskScore >= 20 ? 'bg-yellow-500/10' :
              'bg-green-500/10'
            } rounded-lg flex items-center justify-center`}>
              <TrendingUp className={`w-6 h-6 ${
                asset.riskScore >= 70 ? 'text-red-400' :
                asset.riskScore >= 40 ? 'text-orange-400' :
                asset.riskScore >= 20 ? 'text-yellow-400' :
                'text-green-400'
              }`} />
            </div>
            <div className="text-right">
              <p className={`text-3xl font-bold ${
                asset.riskScore >= 70 ? 'text-red-400' :
                asset.riskScore >= 40 ? 'text-orange-400' :
                asset.riskScore >= 20 ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {asset.riskScore.toFixed(0)}
              </p>
            </div>
          </div>
          <h3 className="text-text-secondary text-sm font-medium">Risk Score</h3>
          <div className="w-full h-2 bg-background-elevated rounded-full overflow-hidden mt-2">
            <div
              className={`h-full ${
                asset.riskScore >= 70 ? 'bg-red-500' :
                asset.riskScore >= 40 ? 'bg-orange-500' :
                asset.riskScore >= 20 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${asset.riskScore}%` }}
            />
          </div>
        </div>

        <div className="card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-text-primary">{asset.vulnCount}</p>
            </div>
          </div>
          <h3 className="text-text-secondary text-sm font-medium">Vulnerabilities</h3>
          <div className="flex items-center gap-2 mt-2">
            {asset.criticalVulnCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
                {asset.criticalVulnCount}C
              </span>
            )}
            {asset.highVulnCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-medium">
                {asset.highVulnCount}H
              </span>
            )}
            {asset.mediumVulnCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-medium">
                {asset.mediumVulnCount}M
              </span>
            )}
          </div>
        </div>

        <div className="card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-text-primary">{asset.scanCount}</p>
            </div>
          </div>
          <h3 className="text-text-secondary text-sm font-medium">Scans Run</h3>
          <p className="text-xs text-text-secondary mt-2">
            Last: {asset.lastScanAt ? formatDate(asset.lastScanAt) : 'Never'}
          </p>
        </div>

        <div className="card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-green-400" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-text-primary">
                {Math.floor((Date.now() - new Date(asset.lastSeen).getTime()) / (1000 * 60 * 60 * 24))}d
              </p>
            </div>
          </div>
          <h3 className="text-text-secondary text-sm font-medium">Last Seen</h3>
          <p className="text-xs text-text-secondary mt-2">
            {formatDate(asset.lastSeen)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card-hover">
        <div className="border-b border-border">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {[
              { id: 'overview', name: 'Overview', icon: Eye },
              { id: 'vulnerabilities', name: 'Vulnerabilities', icon: AlertTriangle, count: asset.vulnCount },
              { id: 'scans', name: 'Scans', icon: Activity, count: asset.scanCount },
              { id: 'hierarchy', name: 'Hierarchy', icon: Network },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'border-accent-primary text-accent-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                  }
                `}
              >
                <tab.icon className="h-4 w-4" />
                {tab.name}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-accent-primary/10 text-accent-primary' : 'bg-background-elevated text-text-secondary'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Asset Information */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">Asset Information</h3>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-text-secondary">Identifier</dt>
                      <dd className="text-sm text-text-primary mt-1">{asset.identifier}</dd>
                    </div>
                    {asset.ipAddress && (
                      <div>
                        <dt className="text-sm font-medium text-text-secondary">IP Address</dt>
                        <dd className="text-sm text-text-primary mt-1">{asset.ipAddress}</dd>
                      </div>
                    )}
                    {asset.ipAddresses && asset.ipAddresses.length > 0 && (
                      <div>
                        <dt className="text-sm font-medium text-text-secondary">Additional IPs</dt>
                        <dd className="text-sm text-text-primary mt-1">{asset.ipAddresses.join(', ')}</dd>
                      </div>
                    )}
                    {asset.hostname && (
                      <div>
                        <dt className="text-sm font-medium text-text-secondary">Hostname</dt>
                        <dd className="text-sm text-text-primary mt-1">{asset.hostname}</dd>
                      </div>
                    )}
                    {asset.url && (
                      <div>
                        <dt className="text-sm font-medium text-text-secondary">URL</dt>
                        <dd className="text-sm text-text-primary mt-1">
                          <a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:text-accent-secondary hover:underline">
                            {asset.url}
                          </a>
                        </dd>
                      </div>
                    )}
                    {asset.services && asset.services.length > 0 && (
                      <div>
                        <dt className="text-sm font-medium text-text-secondary">Services</dt>
                        <dd className="text-sm text-text-primary mt-1">
                          <div className="flex flex-wrap gap-2">
                            {asset.services.map((service, idx) => (
                              <span key={idx} className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-xs font-medium">
                                {service}
                              </span>
                            ))}
                          </div>
                        </dd>
                      </div>
                    )}
                    {asset.owner && (
                      <div>
                        <dt className="text-sm font-medium text-text-secondary">Owner</dt>
                        <dd className="text-sm text-text-primary mt-1 flex items-center gap-2">
                          <User className="h-4 w-4 text-text-secondary" />
                          {asset.owner}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Metadata */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">Metadata</h3>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-text-secondary">Source</dt>
                      <dd className="text-sm text-text-primary mt-1">
                        <div className="flex flex-wrap gap-2">
                          {asset.source?.map((src, idx) => (
                            <span key={idx} className="px-2 py-1 bg-background-elevated text-text-primary rounded text-xs font-medium">
                              {src}
                            </span>
                          ))}
                        </div>
                      </dd>
                    </div>
                    {asset.tags && asset.tags.length > 0 && (
                      <div>
                        <dt className="text-sm font-medium text-text-secondary">Tags</dt>
                        <dd className="text-sm text-text-primary mt-1">
                          <div className="flex flex-wrap gap-2">
                            {asset.tags.map((tag, idx) => (
                              <span key={idx} className="px-2 py-1 bg-accent-primary/10 text-accent-primary rounded text-xs font-medium flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-sm font-medium text-text-secondary">First Seen</dt>
                      <dd className="text-sm text-text-primary mt-1">{formatDate(asset.firstSeen)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-text-secondary">Last Seen</dt>
                      <dd className="text-sm text-text-primary mt-1">{formatDate(asset.lastSeen)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-text-secondary">Created</dt>
                      <dd className="text-sm text-text-primary mt-1">{formatDate(asset.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {asset.description && (
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">Description</h3>
                  <p className="text-sm text-text-secondary">{asset.description}</p>
                </div>
              )}
            </div>
          )}

          {/* Vulnerabilities Tab */}
          {activeTab === 'vulnerabilities' && (
            <div>
              {vulnerabilities.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">No vulnerabilities found</h3>
                  <p className="text-text-secondary">This asset has no reported vulnerabilities.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {vulnerabilities.map((vuln) => (
                    <div
                      key={vuln.id}
                      onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}?returnTo=${encodeURIComponent(`/dashboard/assets/${asset.id}`)}`)}
                      className="glass-panel p-4 hover:bg-background-elevated/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getSeverityColor(vuln.severity)}`}>
                              {vuln.severity}
                            </span>
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(vuln.status)}`}>
                              {vuln.status}
                            </span>
                            {vuln.cvssScore && (
                              <span className="text-sm text-text-secondary">CVSS: {vuln.cvssScore.toFixed(1)}</span>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-text-primary mb-1">{vuln.title}</h4>
                          {vuln.cveId && (
                            <p className="text-sm text-text-secondary">{vuln.cveId}</p>
                          )}
                          <p className="text-xs text-text-secondary mt-2">
                            First seen: {formatDate(vuln.firstSeen)}
                          </p>
                        </div>
                        <button className="text-accent-primary hover:text-accent-secondary">
                          <Eye className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Scans Tab */}
          {activeTab === 'scans' && (
            <div>
              {scans.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">No scans yet</h3>
                  <p className="text-text-secondary mb-6">Run your first scan to discover vulnerabilities.</p>
                  <button
                    onClick={() => router.push(`/dashboard/scans?assetId=${asset.id}`)}
                    className="btn-premium px-4 py-2 text-sm inline-flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Run Scan
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {scans.map((scan) => (
                    <div
                      key={scan.id}
                      onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
                      className="glass-panel p-4 hover:bg-background-elevated/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="text-sm font-medium text-text-primary">{scan.name}</h4>
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(scan.status)}`}>
                              {scan.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-text-secondary">
                            <span>{scan.type}</span>
                            <span>•</span>
                            <span>{scan.vulnFound} vulnerabilities</span>
                            {scan.criticalCount > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-red-400 font-medium">{scan.criticalCount} critical</span>
                              </>
                            )}
                            {scan.duration && (
                              <>
                                <span>•</span>
                                <span>{formatDuration(scan.duration)}</span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mt-2">
                            {scan.completedAt ? `Completed: ${formatDate(scan.completedAt)}` : `Started: ${formatDate(scan.startedAt || scan.createdAt)}`}
                          </p>
                        </div>
                        <button className="text-accent-primary hover:text-accent-secondary">
                          <Eye className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hierarchy Tab */}
          {activeTab === 'hierarchy' && (
            <div className="space-y-6">
              {hierarchy?.parent && (
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">Parent Asset</h3>
                  <div
                    onClick={() => router.push(`/dashboard/assets/${hierarchy.parent!.id}`)}
                    className="glass-panel p-4 hover:bg-background-elevated/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-accent-primary">
                        {getTypeIcon(hierarchy.parent.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-text-primary">{hierarchy.parent.name}</h4>
                        <p className="text-sm text-text-secondary">{hierarchy.parent.identifier}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-text-primary">Risk: {hierarchy.parent.riskScore.toFixed(0)}</p>
                        <p className="text-sm text-text-secondary">{hierarchy.parent.vulnCount} vulns</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {hierarchy?.children && hierarchy.children.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">Child Assets ({hierarchy.children.length})</h3>
                  <div className="space-y-3">
                    {hierarchy.children.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => router.push(`/dashboard/assets/${child.id}`)}
                        className="glass-panel p-4 hover:bg-background-elevated/50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-accent-primary">
                            {getTypeIcon(child.type)}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-text-primary">{child.name}</h4>
                            <p className="text-sm text-text-secondary">{child.identifier}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-text-primary">Risk: {child.riskScore.toFixed(0)}</p>
                            <div className="flex items-center gap-2 justify-end mt-1">
                              {child.criticalVulnCount > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
                                  {child.criticalVulnCount}C
                                </span>
                              )}
                              <span className="text-sm text-text-secondary">{child.vulnCount} total</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!hierarchy?.parent && (!hierarchy?.children || hierarchy.children.length === 0) && (
                <div className="text-center py-12">
                  <Network className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">No hierarchy</h3>
                  <p className="text-text-secondary">This asset has no parent or child assets.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
