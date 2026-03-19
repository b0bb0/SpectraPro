'use client';

import { useEffect, useState } from 'react';
import { FileCode2, Plus, RefreshCw, Search, Shield, X, CheckCircle, XCircle, Clock, Trash2, Eye, Power, PowerOff } from 'lucide-react';
import { templatesAPI } from '@/lib/api';
import TemplateUploadModal from '@/components/TemplateUploadModal';

interface Template {
  id: string;
  name: string;
  description?: string;
  fileName: string;
  author?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  status: 'ACTIVE' | 'INACTIVE' | 'VALIDATING' | 'FAILED';
  tags: string[];
  reference: string[];
  cveId?: string;
  cweId?: string;
  isValid: boolean;
  validationError?: string;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  uploadedBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (categoryFilter !== 'ALL') filters.category = categoryFilter;
      if (severityFilter !== 'ALL') filters.severity = severityFilter;

      const data = await templatesAPI.list(filters);
      setTemplates(data || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [statusFilter, categoryFilter, severityFilter]);

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    fetchTemplates();
  };

  const handleToggleStatus = async (template: Template) => {
    try {
      const newStatus = template.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await templatesAPI.updateStatus(template.id, newStatus);
      fetchTemplates();
    } catch (err: any) {
      alert(err.message || 'Failed to update template status');
    }
  };

  const handleDelete = async (template: Template) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await templatesAPI.delete(template.id);
      fetchTemplates();
    } catch (err: any) {
      alert(err.message || 'Failed to delete template');
    }
  };

  const handleView = (template: Template) => {
    setSelectedTemplate(template);
    setShowViewModal(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'INACTIVE':
        return <PowerOff className="w-4 h-4 text-gray-500" />;
      case 'VALIDATING':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-500';
      case 'INACTIVE':
        return 'text-gray-500';
      case 'VALIDATING':
        return 'text-blue-500';
      case 'FAILED':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'LOW':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'INFO':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      CVE: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
      MISCONFIGURATION: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      EXPOSED_PANEL: 'bg-red-500/20 text-red-400 border-red-500/50',
      EXPOSED_SERVICE: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      DEFAULT_CREDENTIALS: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
      INFORMATION_DISCLOSURE: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      INJECTION: 'bg-red-500/20 text-red-400 border-red-500/50',
      XSS: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      AUTHENTICATION: 'bg-green-500/20 text-green-400 border-green-500/50',
      AUTHORIZATION: 'bg-teal-500/20 text-teal-400 border-teal-500/50',
      CUSTOM: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    };
    return colors[category] || colors.CUSTOM;
  };

  const filteredTemplates = templates.filter((template) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      template.name.toLowerCase().includes(searchLower) ||
      template.description?.toLowerCase().includes(searchLower) ||
      template.fileName.toLowerCase().includes(searchLower) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  });

  const stats = {
    total: templates.length,
    active: templates.filter(t => t.status === 'ACTIVE').length,
    inactive: templates.filter(t => t.status === 'INACTIVE').length,
    failed: templates.filter(t => t.status === 'FAILED').length,
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Custom Templates</h1>
          <p className="text-gray-400">Manage your custom Nuclei templates</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchTemplates}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="btn-primary px-4 py-2 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Template</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Templates</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </div>
            <FileCode2 className="w-8 h-8 text-cyan-400" />
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Active</p>
              <p className="text-2xl font-bold text-green-400">{stats.active}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Inactive</p>
              <p className="text-2xl font-bold text-gray-400">{stats.inactive}</p>
            </div>
            <PowerOff className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Failed</p>
              <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
            </div>
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 w-full"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="VALIDATING">Validating</option>
            <option value="FAILED">Failed</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field"
          >
            <option value="ALL">All Categories</option>
            <option value="CVE">CVE</option>
            <option value="MISCONFIGURATION">Misconfiguration</option>
            <option value="EXPOSED_PANEL">Exposed Panel</option>
            <option value="EXPOSED_SERVICE">Exposed Service</option>
            <option value="DEFAULT_CREDENTIALS">Default Credentials</option>
            <option value="INFORMATION_DISCLOSURE">Information Disclosure</option>
            <option value="INJECTION">Injection</option>
            <option value="XSS">XSS</option>
            <option value="AUTHENTICATION">Authentication</option>
            <option value="AUTHORIZATION">Authorization</option>
            <option value="CUSTOM">Custom</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="input-field"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="INFO">Info</option>
          </select>
        </div>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="glass-card p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-gray-400">Loading templates...</p>
          </div>
        </div>
      ) : error ? (
        <div className="glass-card p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <XCircle className="w-12 h-12 text-red-400" />
            <p className="text-red-400 text-center">{error}</p>
            <button onClick={fetchTemplates} className="btn-primary px-4 py-2">
              Try Again
            </button>
          </div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="glass-card p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <FileCode2 className="w-12 h-12 text-gray-600" />
            <p className="text-gray-400 text-center">
              {searchTerm || statusFilter !== 'ALL' || categoryFilter !== 'ALL' || severityFilter !== 'ALL'
                ? 'No templates match your filters'
                : 'No custom templates yet'}
            </p>
            {!searchTerm && statusFilter === 'ALL' && categoryFilter === 'ALL' && severityFilter === 'ALL' && (
              <button onClick={() => setShowUploadModal(true)} className="btn-primary px-4 py-2">
                Upload Your First Template
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTemplates.map((template) => (
            <div key={template.id} className="glass-card p-6 hover:bg-white/5 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  {/* Header */}
                  <div className="flex items-start space-x-3">
                    <FileCode2 className="w-5 h-5 text-cyan-400 mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                        {getStatusIcon(template.status)}
                        <span className={`text-sm font-medium ${getStatusColor(template.status)}`}>
                          {template.status}
                        </span>
                      </div>
                      {template.description && (
                        <p className="text-gray-400 text-sm">{template.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full border ${getSeverityColor(template.severity)}`}>
                      {template.severity}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full border ${getCategoryColor(template.category)}`}>
                      {template.category.replace(/_/g, ' ')}
                    </span>
                    {template.cveId && (
                      <span className="text-xs px-2 py-1 rounded-full border bg-purple-500/20 text-purple-400 border-purple-500/50">
                        {template.cveId}
                      </span>
                    )}
                    {template.tags.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/50">
                        {tag}
                      </span>
                    ))}
                    {template.tags.length > 3 && (
                      <span className="text-xs text-gray-400">+{template.tags.length - 3} more</span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center space-x-6 text-sm text-gray-400">
                    <span>File: {template.fileName}</span>
                    <span>Used: {template.usageCount} times</span>
                    <span>By: {template.uploadedBy.firstName} {template.uploadedBy.lastName}</span>
                    <span>Created: {new Date(template.createdAt).toLocaleDateString()}</span>
                  </div>

                  {/* Validation Error */}
                  {template.status === 'FAILED' && template.validationError && (
                    <div className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
                      <p className="text-sm text-red-400">{template.validationError}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleView(template)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="View Template"
                  >
                    <Eye className="w-4 h-4 text-gray-400 hover:text-white" />
                  </button>
                  {template.status !== 'FAILED' && (
                    <button
                      onClick={() => handleToggleStatus(template)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title={template.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    >
                      {template.status === 'ACTIVE' ? (
                        <PowerOff className="w-4 h-4 text-gray-400 hover:text-white" />
                      ) : (
                        <Power className="w-4 h-4 text-gray-400 hover:text-white" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(template)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Delete Template"
                  >
                    <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <TemplateUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* View Modal */}
      {showViewModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Template Details</h2>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                <p className="text-white">{selectedTemplate.name}</p>
              </div>

              {selectedTemplate.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                  <p className="text-white">{selectedTemplate.description}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">File Name</label>
                <p className="text-white font-mono">{selectedTemplate.fileName}</p>
              </div>

              {selectedTemplate.author && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Author</label>
                  <p className="text-white">{selectedTemplate.author}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Severity</label>
                  <span className={`inline-block text-xs px-2 py-1 rounded-full border ${getSeverityColor(selectedTemplate.severity)}`}>
                    {selectedTemplate.severity}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Category</label>
                  <span className={`inline-block text-xs px-2 py-1 rounded-full border ${getCategoryColor(selectedTemplate.category)}`}>
                    {selectedTemplate.category.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {selectedTemplate.tags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.tags.map((tag, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate.reference.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">References</label>
                  <ul className="list-disc list-inside space-y-1">
                    {selectedTemplate.reference.map((ref, idx) => (
                      <li key={idx} className="text-cyan-400 text-sm">
                        <a href={ref} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {ref}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedTemplate.cveId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">CVE ID</label>
                    <p className="text-white">{selectedTemplate.cveId}</p>
                  </div>
                )}
                {selectedTemplate.cweId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">CWE ID</label>
                    <p className="text-white">{selectedTemplate.cweId}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Usage Count</label>
                  <p className="text-white">{selectedTemplate.usageCount} times</p>
                </div>
                {selectedTemplate.lastUsedAt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Last Used</label>
                    <p className="text-white">{new Date(selectedTemplate.lastUsedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Uploaded By</label>
                <p className="text-white">
                  {selectedTemplate.uploadedBy.firstName} {selectedTemplate.uploadedBy.lastName} ({selectedTemplate.uploadedBy.email})
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Created At</label>
                <p className="text-white">{new Date(selectedTemplate.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowViewModal(false)}
                className="btn-secondary px-6 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
