'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Server,
  Globe,
  Cloud,
  Network,
  Activity,
  AlertTriangle,
  Save,
  X,
} from 'lucide-react'
import { assetsAPI } from '@/lib/api'

export default function NewAssetPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    type: 'DOMAIN' as const,
    environment: 'PRODUCTION' as const,
    criticality: 'MEDIUM' as const,
    ipAddress: '',
    hostname: '',
    url: '',
    description: '',
    tags: '',
    owner: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Prepare data
      const data: any = {
        name: formData.name,
        type: formData.type,
        environment: formData.environment,
        criticality: formData.criticality,
      }

      if (formData.ipAddress) data.ipAddress = formData.ipAddress
      if (formData.hostname) data.hostname = formData.hostname
      if (formData.url) data.url = formData.url
      if (formData.description) data.description = formData.description
      if (formData.owner) data.owner = formData.owner
      if (formData.tags) {
        data.tags = formData.tags.split(',').map(t => t.trim()).filter(t => t)
      }

      const response = await assetsAPI.create(data)

      // Navigate to the new asset detail page
      router.push(`/dashboard/assets/${response.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create asset')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 glass-hover rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </button>
          <div>
            <h1 className="text-3xl font-bold gradient-text">Add New Asset</h1>
            <p className="text-text-secondary mt-1">
              Add a new asset to your inventory
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-3xl">
        <div className="card-hover p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="glass-panel border-l-4 border-red-500 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-text-primary">Error</h3>
                <p className="text-sm text-text-secondary mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Asset Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., example.com or 192.168.1.1"
                  className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Asset Type <span className="text-red-400">*</span>
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary"
                >
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
                  Environment <span className="text-red-400">*</span>
                </label>
                <select
                  name="environment"
                  value={formData.environment}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary"
                >
                  <option value="PRODUCTION">Production</option>
                  <option value="STAGING">Staging</option>
                  <option value="DEVELOPMENT">Development</option>
                  <option value="TEST">Test</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Criticality <span className="text-red-400">*</span>
                </label>
                <select
                  name="criticality"
                  value={formData.criticality}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary"
                >
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Advanced Options Toggle */}
          <div className="pt-6 border-t border-border">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-accent-primary hover:text-accent-secondary transition-colors"
            >
              <Activity className="w-4 h-4" />
              <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Options</span>
            </button>
          </div>

          {/* Advanced Options */}
          {showAdvanced && (
            <>
              {/* Network Information */}
              <div className="pt-6 border-t border-border">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Network Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      IP Address
                    </label>
                    <input
                      type="text"
                      name="ipAddress"
                      value={formData.ipAddress}
                      onChange={handleChange}
                      placeholder="e.g., 192.168.1.1"
                      className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Hostname
                    </label>
                    <input
                      type="text"
                      name="hostname"
                      value={formData.hostname}
                      onChange={handleChange}
                      placeholder="e.g., example.com"
                      className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      URL
                    </label>
                    <input
                      type="url"
                      name="url"
                      value={formData.url}
                      onChange={handleChange}
                      placeholder="e.g., https://example.com"
                      className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="pt-6 border-t border-border">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Additional Information
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Brief description of the asset"
                      className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Tags
                    </label>
                    <input
                      type="text"
                      name="tags"
                      value={formData.tags}
                      onChange={handleChange}
                      placeholder="e.g., web, internal, customer-facing (comma separated)"
                      className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary"
                    />
                    <p className="text-xs text-text-secondary mt-1">
                      Separate multiple tags with commas
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Owner
                    </label>
                    <input
                      type="text"
                      name="owner"
                      value={formData.owner}
                      onChange={handleChange}
                      placeholder="e.g., Security Team or john@example.com"
                      className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-text-primary placeholder-text-secondary"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="pt-6 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2.5 glass-hover rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-premium px-4 py-2.5 text-sm flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Creating...' : 'Create Asset'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
