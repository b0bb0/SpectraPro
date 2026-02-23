'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Filter,
  X,
  Server,
  Globe,
  Cloud,
  Network,
  AlertTriangle,
  Shield,
  RefreshCw,
  Plus,
  Eye,
  Calendar,
  Activity,
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
  hostname?: string
  url?: string
  tags: string[]
  owner?: string
  riskScore: number
  vulnCount: number
  criticalVulnCount: number
  lastScanAt?: string
  createdAt: string
  updatedAt: string
}

interface FilterState {
  search: string
  type: string
  environment: string
  criticality: string
}

const initialFilters: FilterState = {
  search: '',
  type: '',
  environment: '',
  criticality: '',
}

export default function AssetsPage() {
  const router = useRouter()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<any>(null)

  const fetchAssets = async () => {
    try {
      setLoading(true)
      setError('')

      const params: any = { page, limit: 20 }

      if (filters.search) params.search = filters.search
      if (filters.type) params.type = filters.type
      if (filters.environment) params.environment = filters.environment
      if (filters.criticality) params.criticality = filters.criticality

      const response = await assetsAPI.list(params)
      setAssets(response.data || [])
      setTotal(response.meta?.total || 0)
    } catch (err: any) {
      console.error('Failed to load assets:', err)
      // Secure error handling - generic user message only
      setError('Unable to load assets. Please try again.')
      setAssets([])
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await assetsAPI.getStats()
      setStats(response)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [page, filters])

  useEffect(() => {
    fetchStats()
  }, [])

  const resetFilters = () => {
    setFilters(initialFilters)
    setPage(1)
  }

  const handleAssetClick = (assetId: string) => {
    router.push(`/dashboard/assets/${assetId}`)
  }

  const getCriticalityColor = (criticality: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-red-100 text-red-800',
      HIGH: 'bg-orange-100 text-orange-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      LOW: 'bg-blue-100 text-blue-800',
    }
    return colors[criticality] || 'bg-gray-100 text-gray-800'
  }

  const getTypeIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      DOMAIN: <Globe className="h-4 w-4" />,
      IP: <Server className="h-4 w-4" />,
      APPLICATION: <Activity className="h-4 w-4" />,
      API: <Network className="h-4 w-4" />,
      CLOUD_RESOURCE: <Cloud className="h-4 w-4" />,
      NETWORK_DEVICE: <Network className="h-4 w-4" />,
    }
    return icons[type] || <Server className="h-4 w-4" />
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== '' && v !== null
  ).length

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Assets</h1>
          <p className="text-text-secondary mt-1">
            Manage and monitor your attack surface inventory
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchAssets}
            className="glass-hover px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => router.push('/dashboard/assets/new')}
            className="btn-premium px-4 py-2 text-sm flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Server className="w-6 h-6 text-blue-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">
                  {stats.total || 0}
                </p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">Total Assets</h3>
            <div className="mt-2 flex items-center text-xs text-gray-400">
              <span>Active in inventory</span>
            </div>
          </div>

          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">
                  {stats.highRisk || 0}
                </p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">High Risk Assets</h3>
            <div className="mt-2 flex items-center text-xs text-red-400">
              <AlertTriangle className="w-3 h-3 mr-1" />
              <span>Require attention</span>
            </div>
          </div>

          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">
                  {stats.recentlyScanned || 0}
                </p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">Recently Scanned</h3>
            <div className="mt-2 flex items-center text-xs text-gray-400">
              <span>Last 7 days</span>
            </div>
          </div>

          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">
                  {stats.byEnvironment?.PRODUCTION || 0}
                </p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">Production Assets</h3>
            <div className="mt-2 flex items-center text-xs text-gray-400">
              <span>Critical environment</span>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search assets by name, IP, hostname, or URL..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              className="w-full pl-10 pr-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              showFilters
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                : 'glass-hover text-text-secondary'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 bg-white/20 text-white text-xs rounded-full font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center space-x-2 px-4 py-2.5 text-text-secondary hover:text-text-primary glass-hover rounded-lg"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Asset Type
              </label>
              <select
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
                className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary"
              >
                <option value="">All Types</option>
                <option value="DOMAIN">Domain</option>
                <option value="IP">IP Address</option>
                <option value="APPLICATION">Application</option>
                <option value="API">API</option>
                <option value="CLOUD_RESOURCE">Cloud Resource</option>
                <option value="NETWORK_DEVICE">Network Device</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Environment
              </label>
              <select
                value={filters.environment}
                onChange={(e) =>
                  setFilters({ ...filters, environment: e.target.value })
                }
                className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary"
              >
                <option value="">All Environments</option>
                <option value="PRODUCTION">Production</option>
                <option value="STAGING">Staging</option>
                <option value="DEVELOPMENT">Development</option>
                <option value="TEST">Test</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Criticality
              </label>
              <select
                value={filters.criticality}
                onChange={(e) =>
                  setFilters({ ...filters, criticality: e.target.value })
                }
                className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary"
              >
                <option value="">All Criticality Levels</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-panel border-l-4 border-red-500 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              Error loading assets
            </h3>
            <p className="text-sm text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Assets Table */}
      <div className="card-hover overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-accent-primary animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 bg-accent-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Server className="w-8 h-8 text-accent-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No assets found
            </h3>
            <p className="text-text-secondary mb-6">
              {filters.search || activeFiltersCount > 0
                ? 'Try adjusting your filters'
                : 'Get started by adding your first asset'}
            </p>
            {!filters.search && activeFiltersCount === 0 && (
              <button
                onClick={() => router.push('/dashboard/assets/new')}
                className="btn-premium px-4 py-2 text-sm inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Asset</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Asset
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Environment
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Criticality
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Risk Score
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Vulnerabilities
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Last Scan
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assets.map((asset) => (
                    <tr
                      key={asset.id}
                      onClick={() => handleAssetClick(asset.id)}
                      className="hover:bg-background-elevated/50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1 text-accent-primary">
                            {getTypeIcon(asset.type)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {asset.name}
                            </p>
                            <p className="text-sm text-text-secondary truncate">
                              {asset.hostname || asset.ipAddress || asset.url || asset.identifier}
                            </p>
                            {asset.tags && asset.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {asset.tags.slice(0, 2).map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent-primary/10 text-accent-primary"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {asset.tags.length > 2 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-background-elevated text-text-secondary">
                                    +{asset.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">
                          {getTypeIcon(asset.type)}
                          {asset.type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-text-primary">
                          {asset.environment}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getCriticalityColor(
                            asset.criticality
                          )}`}
                        >
                          {asset.criticality}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-background-elevated rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                asset.riskScore >= 70
                                  ? 'bg-red-500'
                                  : asset.riskScore >= 40
                                  ? 'bg-orange-500'
                                  : asset.riskScore >= 20
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                              style={{ width: `${asset.riskScore}%` }}
                            />
                          </div>
                          <span
                            className={`text-sm font-medium ${
                              asset.riskScore >= 70
                                ? 'text-red-400'
                                : asset.riskScore >= 40
                                ? 'text-orange-400'
                                : asset.riskScore >= 20
                                ? 'text-yellow-400'
                                : 'text-green-400'
                            }`}
                          >
                            {asset.riskScore.toFixed(0)}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {asset.criticalVulnCount > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400">
                              {asset.criticalVulnCount}C
                            </span>
                          )}
                          <span className="text-sm text-text-secondary">
                            {asset.vulnCount} total
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                          <Calendar className="w-4 h-4" />
                          {asset.lastScanAt
                            ? formatDate(asset.lastScanAt)
                            : 'Never'}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAssetClick(asset.id)
                          }}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-sm text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > 20 && (
              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <div className="text-sm text-text-secondary">
                  Showing {(page - 1) * 20 + 1} to{' '}
                  {Math.min(page * 20, total)} of {total} assets
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-4 py-2 glass-hover rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page * 20 >= total}
                    className="px-4 py-2 glass-hover rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
