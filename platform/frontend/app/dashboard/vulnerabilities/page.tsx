'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  X,
  ChevronDown,
  Save,
  Download,
  Zap,
  Clock,
  Shield,
  TrendingUp,
  Star,
  StarOff,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import { vulnerabilitiesAPI } from '@/lib/api'

interface Asset {
  id: string
  name: string
  type: string
  environment?: string
}

interface Vulnerability {
  id: string
  title: string
  description: string
  severity: string
  cvssScore: number
  cveId: string
  status: string
  firstSeen: string
  lastSeen: string
  asset: Asset
  _count: {
    evidence: number
  }
}

interface FilterState {
  search: string
  severity: string[]
  status: string[]
  assetType: string
  environment: string
  cvssMin: number
  cvssMax: number
  dateRange: string
  hasEvidence: boolean | null
}

interface SavedFilter {
  id: string
  name: string
  filters: FilterState
}

const initialFilters: FilterState = {
  search: '',
  severity: [],
  status: [],
  assetType: '',
  environment: '',
  cvssMin: 0,
  cvssMax: 10,
  dateRange: '',
  hasEvidence: null,
}

export default function VulnerabilitiesPage() {
  const router = useRouter()
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false)
  const [filterName, setFilterName] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // Load saved filters from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('spectra_saved_filters')
    if (saved) {
      setSavedFilters(JSON.parse(saved))
    }
  }, [])

  const fetchVulnerabilities = async () => {
    try {
      setLoading(true)
      const params: any = { page, limit: 20 }

      if (filters.search) params.search = filters.search
      if (filters.severity.length > 0) params.severity = filters.severity.join(',')
      if (filters.status.length > 0) params.status = filters.status.join(',')
      if (filters.assetType) params.assetType = filters.assetType
      if (filters.environment) params.environment = filters.environment

      const response = await vulnerabilitiesAPI.list(params)
      setVulnerabilities(response.data || [])
      setTotal(response.meta?.total || 0)
      setError('')
    } catch (err: any) {
      console.error('Failed to load vulnerabilities:', err)
      // Secure error handling - generic user message only
      setError('Unable to load vulnerabilities. Please try again.')
      setVulnerabilities([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVulnerabilities()
  }, [page, filters])

  // Quick filter presets
  const quickFilters = [
    {
      name: 'Critical & High',
      icon: AlertTriangle,
      color: 'red',
      action: () => setFilters({ ...initialFilters, severity: ['CRITICAL', 'HIGH'] }),
    },
    {
      name: 'Needs Action',
      icon: Zap,
      color: 'orange',
      action: () => setFilters({ ...initialFilters, status: ['OPEN', 'REOPENED'] }),
    },
    {
      name: 'Recent (7d)',
      icon: Clock,
      color: 'blue',
      action: () => setFilters({ ...initialFilters, dateRange: '7d' }),
    },
    {
      name: 'Production Only',
      icon: Shield,
      color: 'purple',
      action: () => setFilters({ ...initialFilters, environment: 'PRODUCTION' }),
    },
    {
      name: 'High CVSS (>7.0)',
      icon: TrendingUp,
      color: 'yellow',
      action: () => setFilters({ ...initialFilters, cvssMin: 7, cvssMax: 10 }),
    },
  ]

  const clearFilters = () => {
    setFilters(initialFilters)
    setPage(1)
  }

  const saveFilter = () => {
    if (!filterName.trim()) return

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: filterName,
      filters: { ...filters },
    }

    const updated = [...savedFilters, newFilter]
    setSavedFilters(updated)
    localStorage.setItem('spectra_saved_filters', JSON.stringify(updated))
    setShowSaveFilterModal(false)
    setFilterName('')
  }

  const loadSavedFilter = (saved: SavedFilter) => {
    setFilters(saved.filters)
    setPage(1)
  }

  const deleteSavedFilter = (id: string) => {
    const updated = savedFilters.filter((f) => f.id !== id)
    setSavedFilters(updated)
    localStorage.setItem('spectra_saved_filters', JSON.stringify(updated))
  }

  const handleStatusChange = async (vulnId: string, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setUpdatingStatus(vulnId)
    try {
      await vulnerabilitiesAPI.update(vulnId, { status: newStatus })
      // Update local state immediately
      setVulnerabilities((prev) =>
        prev.map((v) => (v.id === vulnId ? { ...v, status: newStatus } : v))
      )
      setStatusDropdownOpen(null)
    } catch (err: any) {
      console.error('Failed to update vulnerability status:', err)
      setError('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(null)
    }
  }

  const exportResults = () => {
    const csv = [
      ['Title', 'Severity', 'Status', 'CVSS', 'CVE', 'Asset', 'First Seen'].join(','),
      ...vulnerabilities.map((v) =>
        [
          `"${v.title}"`,
          v.severity,
          v.status,
          v.cvssScore,
          v.cveId || '-',
          v.asset?.name || "Unknown Asset",
          new Date(v.firstSeen).toLocaleDateString(),
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vulnerabilities_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'HIGH':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'MEDIUM':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'LOW':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'INFO':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'IN_PROGRESS':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'MITIGATED':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'ACCEPTED':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'FALSE_POSITIVE':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
      case 'REOPENED':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'CONTROLLED':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  const formatStatus = (status: string) => status.replace(/_/g, ' ')
  const formatDate = (date: string) => new Date(date).toLocaleDateString()

  const severityOptions = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
  const statusOptions = ['OPEN', 'IN_PROGRESS', 'MITIGATED', 'ACCEPTED', 'FALSE_POSITIVE', 'REOPENED', 'CONTROLLED']
  const assetTypeOptions = ['DOMAIN', 'IP', 'APPLICATION', 'API', 'CLOUD_RESOURCE', 'NETWORK_DEVICE']
  const environmentOptions = ['PRODUCTION', 'STAGING', 'DEVELOPMENT', 'TEST']

  const severityCounts = vulnerabilities.reduce(
    (acc, vuln) => {
      acc[vuln.severity] = (acc[vuln.severity] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const activeFiltersCount =
    filters.severity.length +
    filters.status.length +
    (filters.search ? 1 : 0) +
    (filters.assetType ? 1 : 0) +
    (filters.environment ? 1 : 0) +
    (filters.cvssMin !== 0 || filters.cvssMax !== 10 ? 1 : 0)

  const toggleSeverity = (sev: string) => {
    setFilters({
      ...filters,
      severity: filters.severity.includes(sev)
        ? filters.severity.filter((s) => s !== sev)
        : [...filters.severity, sev],
    })
  }

  const toggleStatus = (stat: string) => {
    setFilters({
      ...filters,
      status: filters.status.includes(stat)
        ? filters.status.filter((s) => s !== stat)
        : [...filters.status, stat],
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Vulnerabilities</h1>
          <p className="text-text-secondary mt-1">
            {total > 0 ? `${total} vulnerabilities found` : 'Manage and track security vulnerabilities'}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={exportResults}
            disabled={vulnerabilities.length === 0}
            className="btn-secondary px-4 py-2 flex items-center space-x-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={fetchVulnerabilities}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-3">
        {quickFilters.map((qf) => (
          <button
            key={qf.name}
            onClick={qf.action}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all glass-hover border border-${qf.color}-500/30 hover:bg-${qf.color}-500/10`}
          >
            <qf.icon className={`w-4 h-4 text-${qf.color}-400`} />
            <span className="text-sm text-white">{qf.name}</span>
          </button>
        ))}
      </div>

      {/* Saved Filters */}
      {savedFilters.length > 0 && (
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Star className="w-4 h-4 text-yellow-400" />
              <span>Saved Filters</span>
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedFilters.map((sf) => (
              <div
                key={sf.id}
                className="flex items-center space-x-2 px-3 py-1.5 bg-dark-200 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all group"
              >
                <button
                  onClick={() => loadSavedFilter(sf)}
                  className="text-sm text-gray-300 hover:text-white"
                >
                  {sf.name}
                </button>
                <button
                  onClick={() => deleteSavedFilter(sf.id)}
                  className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-hover bg-purple-500/5 border-purple-500/20">
          <p className="text-purple-400 text-sm mb-1">Critical</p>
          <p className="text-3xl font-bold text-purple-400">{severityCounts['CRITICAL'] || 0}</p>
        </div>
        <div className="card-hover bg-red-500/5 border-red-500/20">
          <p className="text-red-400 text-sm mb-1">High</p>
          <p className="text-3xl font-bold text-red-400">{severityCounts['HIGH'] || 0}</p>
        </div>
        <div className="card-hover bg-orange-500/5 border-orange-500/20">
          <p className="text-orange-400 text-sm mb-1">Medium</p>
          <p className="text-3xl font-bold text-orange-400">{severityCounts['MEDIUM'] || 0}</p>
        </div>
        <div className="card-hover bg-yellow-500/5 border-yellow-500/20">
          <p className="text-yellow-400 text-sm mb-1">Low</p>
          <p className="text-3xl font-bold text-yellow-400">{severityCounts['LOW'] || 0}</p>
        </div>
        <div className="card-hover bg-blue-500/5 border-blue-500/20">
          <p className="text-blue-400 text-sm mb-1">Info</p>
          <p className="text-3xl font-bold text-blue-400">{severityCounts['INFO'] || 0}</p>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="glass-panel p-6 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title, description, CVE, or asset name..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full bg-dark-200 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`btn-secondary px-4 py-3 flex items-center space-x-2 ${
              activeFiltersCount > 0 ? 'border-purple-500' : ''
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Advanced</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                showAdvancedFilters ? 'rotate-180' : ''
              }`}
            />
            {activeFiltersCount > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {activeFiltersCount > 0 && (
            <button onClick={clearFilters} className="btn-secondary px-4 py-3 flex items-center space-x-2">
              <X className="w-4 h-4" />
              <span>Clear All</span>
            </button>
          )}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => setShowSaveFilterModal(true)}
              className="btn-premium px-4 py-3 flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Filter</span>
            </button>
          )}
        </div>

        {/* Advanced Filter Options */}
        {showAdvancedFilters && (
          <div className="space-y-6 pt-4 border-t border-gray-700">
            {/* Severity Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Severity ({filters.severity.length} selected)
              </label>
              <div className="flex flex-wrap gap-2">
                {severityOptions.map((sev) => (
                  <button
                    key={sev}
                    onClick={() => toggleSeverity(sev)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      filters.severity.includes(sev)
                        ? getSeverityColor(sev) + ' border'
                        : 'bg-dark-200 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Status ({filters.status.length} selected)
              </label>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((stat) => (
                  <button
                    key={stat}
                    onClick={() => toggleStatus(stat)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      filters.status.includes(stat)
                        ? getStatusColor(stat) + ' border'
                        : 'bg-dark-200 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {formatStatus(stat)}
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Asset Type</label>
                <select
                  value={filters.assetType}
                  onChange={(e) => setFilters({ ...filters, assetType: e.target.value })}
                  className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">All Types</option>
                  {assetTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Environment</label>
                <select
                  value={filters.environment}
                  onChange={(e) => setFilters({ ...filters, environment: e.target.value })}
                  className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">All Environments</option>
                  {environmentOptions.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Date Range</label>
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                  className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">All Time</option>
                  <option value="1d">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                </select>
              </div>
            </div>

            {/* CVSS Range */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                CVSS Score Range: {filters.cvssMin.toFixed(1)} - {filters.cvssMax.toFixed(1)}
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={filters.cvssMin}
                  onChange={(e) =>
                    setFilters({ ...filters, cvssMin: parseFloat(e.target.value) })
                  }
                  className="flex-1"
                />
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={filters.cvssMax}
                  onChange={(e) =>
                    setFilters({ ...filters, cvssMax: parseFloat(e.target.value) })
                  }
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="glass-panel p-4 bg-red-500/10 border-red-500/30">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Vulnerabilities List */}
      <div className="glass-panel p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          {activeFiltersCount > 0 ? 'Filtered Results' : 'All Vulnerabilities'}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-accent-primary animate-spin" />
          </div>
        ) : vulnerabilities.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {activeFiltersCount > 0 ? 'No Matching Vulnerabilities' : 'No Vulnerabilities Found'}
            </h3>
            <p className="text-gray-400 mb-4">
              {activeFiltersCount > 0
                ? 'Try adjusting your filters to see more results'
                : 'Run a scan to discover vulnerabilities in your assets'}
            </p>
            {activeFiltersCount > 0 && (
              <button onClick={clearFilters} className="btn-secondary px-4 py-2">
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {vulnerabilities.map((vuln) => (
              <div
                key={vuln.id}
                className="p-4 glass-hover rounded-lg cursor-pointer transition-all"
                onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}?returnTo=${encodeURIComponent('/dashboard/vulnerabilities')}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold border ${getSeverityColor(
                          vuln.severity
                        )}`}
                      >
                        {vuln.severity}
                      </span>
                      {/* Status badge with dropdown */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setStatusDropdownOpen(statusDropdownOpen === vuln.id ? null : vuln.id)
                          }}
                          className={`px-2 py-1 rounded text-xs font-semibold border flex items-center space-x-1.5 hover:ring-1 hover:ring-white/20 transition-all ${getStatusColor(
                            vuln.status
                          )}`}
                        >
                          {vuln.status === 'CONTROLLED' && <ShieldCheck className="w-3 h-3" />}
                          <span>{formatStatus(vuln.status)}</span>
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </button>
                        {statusDropdownOpen === vuln.id && (
                          <div
                            className="absolute top-full left-0 mt-1 z-50 bg-dark-100 border border-gray-700 rounded-lg shadow-2xl overflow-hidden min-w-[180px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-3 py-2 border-b border-gray-700">
                              <p className="text-xs text-gray-400 font-medium">Change Status</p>
                            </div>
                            {statusOptions.map((stat) => (
                              <button
                                key={stat}
                                onClick={(e) => handleStatusChange(vuln.id, stat, e)}
                                disabled={updatingStatus === vuln.id}
                                className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 transition-colors ${
                                  vuln.status === stat
                                    ? 'bg-purple-500/10 text-purple-400'
                                    : 'text-gray-300 hover:bg-dark-200'
                                } ${updatingStatus === vuln.id ? 'opacity-50' : ''}`}
                              >
                                {stat === 'CONTROLLED' && <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />}
                                {stat === 'MITIGATED' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                                {stat !== 'CONTROLLED' && stat !== 'MITIGATED' && (
                                  <span className={`w-2 h-2 rounded-full ${
                                    stat === 'OPEN' ? 'bg-red-400' :
                                    stat === 'IN_PROGRESS' ? 'bg-blue-400' :
                                    stat === 'ACCEPTED' ? 'bg-yellow-400' :
                                    stat === 'FALSE_POSITIVE' ? 'bg-gray-400' :
                                    stat === 'REOPENED' ? 'bg-orange-400' : 'bg-gray-400'
                                  }`} />
                                )}
                                <span>{formatStatus(stat)}</span>
                                {vuln.status === stat && <span className="ml-auto text-xs">✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {vuln.cveId && <span className="text-gray-400 text-sm">{vuln.cveId}</span>}
                      <span className="text-gray-500 text-sm">
                        CVSS: {vuln.cvssScore.toFixed(1)}
                      </span>
                    </div>
                    <h3 className="text-white font-semibold mb-1">{vuln.title}</h3>
                    <p className="text-gray-400 text-sm line-clamp-2 mb-2">{vuln.description}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>Asset: {vuln.asset?.name || "Unknown Asset"}</span>
                      <span>First Seen: {formatDate(vuln.firstSeen)}</span>
                      {vuln._count.evidence > 0 && <span>{vuln._count.evidence} Evidence</span>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {vuln.status === 'CONTROLLED' ? (
                      <ShieldCheck className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Filter Modal */}
      {showSaveFilterModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Save Filter Preset</h2>
              <button
                onClick={() => setShowSaveFilterModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Filter Name</label>
                <input
                  type="text"
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  placeholder="e.g., High Priority Production Issues"
                  className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                  onKeyPress={(e) => e.key === 'Enter' && saveFilter()}
                />
              </div>

              <div className="flex items-center space-x-3 pt-4">
                <button onClick={saveFilter} className="flex-1 btn-premium px-4 py-2">
                  Save Filter
                </button>
                <button
                  onClick={() => setShowSaveFilterModal(false)}
                  className="flex-1 btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
