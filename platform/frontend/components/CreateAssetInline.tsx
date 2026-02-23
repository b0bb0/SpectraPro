'use client';

import { useState, useEffect } from 'react';
import { X, Server, Globe, Cloud, Network, Activity, AlertTriangle } from 'lucide-react';
import { assetsAPI } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface CreateAssetInlineProps {
  onAssetCreated: (asset: any) => void;
  onCancel: () => void;
}

export function CreateAssetInline({ onAssetCreated, onCancel }: CreateAssetInlineProps) {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [formData, setFormData] = useState<{
    name: string;
    type: 'DOMAIN' | 'IP' | 'APPLICATION' | 'API' | 'CLOUD_RESOURCE' | 'NETWORK_DEVICE';
    environment: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' | 'TEST';
    criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    url: string;
    hostname: string;
    ipAddress: string;
  }>({
    name: '',
    type: 'DOMAIN',
    environment: 'PRODUCTION',
    criticality: 'MEDIUM',
    url: '',
    hostname: '',
    ipAddress: '',
  });

  // Check user role on mount or when user changes
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        setValidationError('You must be logged in to create assets. Please refresh and log in.');
      } else if (!!user && user.role !== 'ADMIN' && user.role !== 'ANALYST') {
        setValidationError('You do not have permission to create assets. Only ADMIN and ANALYST roles can create assets.');
      } else {
        setValidationError(''); // Clear error if authenticated with correct role
      }
    }
  }, [isAuthenticated, user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous validation errors
    setValidationError('');

    // Validate required fields
    if (!formData.name.trim()) {
      setValidationError('Asset name is required');
      toast.error('Please provide an asset name');
      return;
    }

    // Validate type-specific fields
    if (formData.type === 'DOMAIN' && !formData.url.trim()) {
      setValidationError('URL/Domain is required for domain assets');
      toast.error('Please provide a URL or domain');
      return;
    }

    if (formData.type === 'IP' && !formData.ipAddress.trim()) {
      setValidationError('IP address is required for IP assets');
      toast.error('Please provide an IP address');
      return;
    }

    if ((formData.type === 'APPLICATION' || formData.type === 'API') && !formData.hostname.trim()) {
      setValidationError('Hostname/URL is required');
      toast.error('Please provide a hostname or URL');
      return;
    }

    setLoading(true);

    try {
      // Prepare data
      const data: any = {
        name: formData.name,
        type: formData.type,
        environment: formData.environment,
        criticality: formData.criticality,
      };

      // Auto-populate identifier based on type
      if (formData.type === 'DOMAIN' && formData.url) {
        data.url = formData.url;
        data.hostname = formData.url.replace(/^https?:\/\//, '');
      } else if (formData.type === 'IP' && formData.ipAddress) {
        data.ipAddress = formData.ipAddress;
      } else if (formData.hostname) {
        data.hostname = formData.hostname;
      }

      const response = await assetsAPI.create(data);

      toast.success('Asset created successfully');

      onAssetCreated(response);
    } catch (err: any) {
      const errorMessage = err.message || 'Unknown error occurred';
      toast.error(errorMessage);
      setValidationError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const getTypeIcon = () => {
    const icons: Record<string, JSX.Element> = {
      DOMAIN: <Globe className="w-5 h-5" />,
      IP: <Server className="w-5 h-5" />,
      APPLICATION: <Activity className="w-5 h-5" />,
      API: <Network className="w-5 h-5" />,
      CLOUD_RESOURCE: <Cloud className="w-5 h-5" />,
      NETWORK_DEVICE: <Network className="w-5 h-5" />,
    };
    return icons[formData.type] || <Server className="w-5 h-5" />;
  };

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {getTypeIcon()}
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Create New Asset</h2>
            <p className="text-sm text-text-secondary">Add an asset to begin reconnaissance</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-background-elevated rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Asset Name */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Asset Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="e.g., example.com or Production API Server"
            className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-premium-primary text-text-primary placeholder-text-secondary"
          />
        </div>

        {/* Asset Type */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Type <span className="text-red-400">*</span>
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-premium-primary text-text-primary"
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
              Environment
            </label>
            <select
              name="environment"
              value={formData.environment}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-premium-primary text-text-primary"
            >
              <option value="PRODUCTION">Production</option>
              <option value="STAGING">Staging</option>
              <option value="DEVELOPMENT">Development</option>
              <option value="TEST">Test</option>
            </select>
          </div>
        </div>

        {/* Target Input (conditional based on type) */}
        {formData.type === 'DOMAIN' && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              URL/Domain <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="url"
              value={formData.url}
              onChange={handleChange}
              required
              placeholder="e.g., https://example.com or example.com"
              className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-premium-primary text-text-primary placeholder-text-secondary"
            />
            <p className="text-xs text-text-secondary mt-1">
              The domain or URL to scan
            </p>
          </div>
        )}

        {formData.type === 'IP' && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              IP Address <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="ipAddress"
              value={formData.ipAddress}
              onChange={handleChange}
              required
              placeholder="e.g., 192.168.1.1"
              pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
              className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-premium-primary text-text-primary placeholder-text-secondary"
            />
            <p className="text-xs text-text-secondary mt-1">
              Valid IPv4 address format
            </p>
          </div>
        )}

        {(formData.type === 'APPLICATION' || formData.type === 'API') && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Hostname/URL <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="hostname"
              value={formData.hostname}
              onChange={handleChange}
              required
              placeholder="e.g., api.example.com"
              className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-premium-primary text-text-primary placeholder-text-secondary"
            />
          </div>
        )}

        {/* Criticality */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Criticality
          </label>
          <select
            name="criticality"
            value={formData.criticality}
            onChange={handleChange}
            className="w-full px-4 py-2.5 bg-background-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-premium-primary text-text-primary"
          >
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-400">{validationError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading || !isAuthenticated || authLoading || (!!user && user.role !== 'ADMIN' && user.role !== 'ANALYST')}
            className="btn-premium flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {authLoading ? 'Checking authentication...' : loading ? 'Creating...' : 'Create Asset & Start Reconnaissance'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>

        {/* Auth status message */}
        {!authLoading && !isAuthenticated && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm text-yellow-400">
              Please <a href="/login" className="underline hover:text-yellow-300">log in</a> to create assets. You must have ADMIN or ANALYST role.
            </p>
          </div>
        )}

        {/* Role permission message */}
        {!authLoading && isAuthenticated && user && user.role !== 'ADMIN' && user.role !== 'ANALYST' && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">
              Your role ({user.role}) does not have permission to create assets. Only ADMIN and ANALYST roles can create assets.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
