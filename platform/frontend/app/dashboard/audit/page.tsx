'use client';

import { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  RefreshCw,
  Search,
  Filter,
  Clock,
  User,
  Activity,
  Shield,
  TrendingUp
} from 'lucide-react';
import { auditAPI } from '@/lib/api';

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

interface Stats {
  totalActions: number;
  actionsByType: Record<string, number>;
  topUsers: Array<{ userId: string; email: string; count: number }>;
  recentActivity: number;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    action: '',
    resource: '',
    userId: '',
    startDate: '',
    endDate: '',
  });

  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [currentPage, filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await auditAPI.list({
        page: currentPage,
        limit: 50,
        ...filters,
      });

      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setError('');
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await auditAPI.getStats(30);
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await auditAPI.exportCSV(filters);
    } catch (err: any) {
      console.error('Error exporting logs:', err);
      alert('Failed to export logs');
    } finally {
      setExporting(false);
    }
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      CREATE: 'bg-green-500/20 text-green-400 border-green-500/30',
      UPDATE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
      LOGIN: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      LOGOUT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      VIEW: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      EXPORT: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    };
    return colors[action] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const applyFilters = () => {
    setCurrentPage(1);
    fetchLogs();
  };

  const clearFilters = () => {
    setFilters({
      action: '',
      resource: '',
      userId: '',
      startDate: '',
      endDate: '',
    });
    setCurrentPage(1);
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Audit Logs</h1>
          <p className="text-gray-400">Track all user actions and system events</p>
        </div>
        <div className="flex space-x-3">
          <button onClick={handleExport} disabled={exporting} className="btn-secondary px-4 py-2 flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
          <button onClick={fetchLogs} className="btn-secondary px-4 py-2 flex items-center space-x-2">
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">Total Actions (30d)</p>
              <Activity className="w-5 h-5 text-accent-primary" />
            </div>
            <p className="text-3xl font-bold text-white">{stats.totalActions.toLocaleString()}</p>
          </div>

          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">Recent Activity (24h)</p>
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <p className="text-3xl font-bold text-white">{stats.recentActivity.toLocaleString()}</p>
          </div>

          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">Active Users</p>
              <User className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-3xl font-bold text-white">{stats.topUsers.length}</p>
          </div>

          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">Most Common Action</p>
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-xl font-bold text-white">
              {Object.entries(stats.actionsByType).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="glass-panel p-6">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center space-x-2 text-white hover:text-accent-primary transition-colors mb-4"
        >
          <Filter className="w-5 h-5" />
          <span className="font-semibold">Filters</span>
          <span className="text-xs text-gray-400">
            ({Object.values(filters).filter((v) => v).length} active)
          </span>
        </button>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Action</label>
              <select
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="LOGIN">Login</option>
                <option value="LOGOUT">Logout</option>
                <option value="VIEW">View</option>
                <option value="EXPORT">Export</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Resource</label>
              <input
                type="text"
                value={filters.resource}
                onChange={(e) => setFilters({ ...filters, resource: e.target.value })}
                placeholder="e.g., User, Asset, Vulnerability"
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white"
              />
            </div>

            <div className="flex items-end space-x-2">
              <button onClick={applyFilters} className="btn-premium px-4 py-2 flex-1">
                Apply Filters
              </button>
              <button onClick={clearFilters} className="btn-secondary px-4 py-2">
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Logs Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-200 border-b border-gray-700">
              <tr>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Action
                </th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Resource
                </th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  IP Address
                </th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-accent-primary animate-spin mx-auto mb-2" />
                    <p className="text-gray-400">Loading audit logs...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <p className="text-red-400">{error}</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <FileText className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400">No audit logs found</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-dark-100 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2 text-gray-300 text-sm">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span>{formatDate(log.createdAt)}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {log.user ? (
                        <div>
                          <p className="text-white font-medium">{log.user.firstName} {log.user.lastName}</p>
                          <p className="text-gray-400 text-sm">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-gray-500">System</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-block px-3 py-1 rounded text-xs font-semibold border ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-white">{log.resource}</p>
                      {log.resourceId && (
                        <p className="text-gray-500 text-xs font-mono truncate max-w-xs">
                          {log.resourceId}
                        </p>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-gray-300 text-sm font-mono">
                        {log.ipAddress || 'N/A'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {log.details && Object.keys(log.details).length > 0 ? (
                        <details className="cursor-pointer">
                          <summary className="text-accent-primary text-sm hover:underline">
                            View Details
                          </summary>
                          <pre className="mt-2 text-xs text-gray-400 bg-dark-300 p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-gray-500 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
            <p className="text-gray-400 text-sm">
              Showing {logs.length} of {total} logs
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn-secondary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="flex items-center px-4 text-white">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn-secondary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
