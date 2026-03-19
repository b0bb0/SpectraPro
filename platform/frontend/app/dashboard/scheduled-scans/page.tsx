'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, Plus, RefreshCw, Search, X, Play, Pause, Trash2, Eye, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { scheduledScansAPI } from '@/lib/api';
import CreateScheduleModal from '@/components/CreateScheduleModal';

interface ScheduledScan {
  id: string;
  name: string;
  description?: string;
  scanType: string;
  scanProfile: string;
  severity: string[];
  frequency: 'ONCE' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  cronExpression?: string;
  timezone: string;
  startDate: string;
  endDate?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  assetIds: string[];
  targetUrls: string[];
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'DISABLED';
  isActive: boolean;
  runCount: number;
  failCount: number;
  notifyOnCompletion: boolean;
  notifyOnFailure: boolean;
  notifyEmails: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  executions: Array<{
    id: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
    vulnFound: number;
    executedAt: string;
  }>;
}

export default function ScheduledScansPage() {
  const [scheduledScans, setScheduledScans] = useState<ScheduledScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduledScan | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  const fetchScheduledScans = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;

      const data = await scheduledScansAPI.list(filters);
      setScheduledScans(data || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load scheduled scans');
      setScheduledScans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduledScans();
  }, [statusFilter]);

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    fetchScheduledScans();
  };

  const handlePause = async (schedule: ScheduledScan) => {
    try {
      await scheduledScansAPI.pause(schedule.id);
      fetchScheduledScans();
    } catch (err: any) {
      alert(err.message || 'Failed to pause schedule');
    }
  };

  const handleResume = async (schedule: ScheduledScan) => {
    try {
      await scheduledScansAPI.resume(schedule.id);
      fetchScheduledScans();
    } catch (err: any) {
      alert(err.message || 'Failed to resume schedule');
    }
  };

  const handleExecute = async (schedule: ScheduledScan) => {
    if (!confirm(`Execute "${schedule.name}" now?`)) return;

    try {
      await scheduledScansAPI.execute(schedule.id);
      alert('Scan execution triggered successfully');
      fetchScheduledScans();
    } catch (err: any) {
      alert(err.message || 'Failed to execute schedule');
    }
  };

  const handleDelete = async (schedule: ScheduledScan) => {
    if (!confirm(`Are you sure you want to delete "${schedule.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await scheduledScansAPI.delete(schedule.id);
      fetchScheduledScans();
    } catch (err: any) {
      alert(err.message || 'Failed to delete schedule');
    }
  };

  const handleView = (schedule: ScheduledScan) => {
    setSelectedSchedule(schedule);
    setShowViewModal(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'PAUSED':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'EXPIRED':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'DISABLED':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-500';
      case 'PAUSED':
        return 'text-yellow-500';
      case 'EXPIRED':
        return 'text-red-500';
      case 'DISABLED':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      ONCE: 'One Time',
      HOURLY: 'Every Hour',
      DAILY: 'Daily',
      WEEKLY: 'Weekly',
      MONTHLY: 'Monthly',
    };
    return labels[frequency] || frequency;
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = then.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    if (diffHours > 0) return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    if (diffHours === 0) return 'within an hour';
    return 'overdue';
  };

  const filteredSchedules = scheduledScans.filter((schedule) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      schedule.name.toLowerCase().includes(searchLower) ||
      schedule.description?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: scheduledScans.length,
    active: scheduledScans.filter(s => s.status === 'ACTIVE').length,
    paused: scheduledScans.filter(s => s.status === 'PAUSED').length,
    totalRuns: scheduledScans.reduce((sum, s) => sum + s.runCount, 0),
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Scheduled Scans</h1>
          <p className="text-gray-400">Automate recurring vulnerability scans</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchScheduledScans}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary px-4 py-2 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Schedule</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Schedules</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </div>
            <Calendar className="w-8 h-8 text-cyan-400" />
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
              <p className="text-gray-400 text-sm">Paused</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.paused}</p>
            </div>
            <Pause className="w-8 h-8 text-yellow-400" />
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Runs</p>
              <p className="text-2xl font-bold text-cyan-400">{stats.totalRuns}</p>
            </div>
            <Play className="w-8 h-8 text-cyan-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search schedules..."
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
            <option value="PAUSED">Paused</option>
            <option value="EXPIRED">Expired</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>
      </div>

      {/* Schedules List */}
      {loading ? (
        <div className="glass-card p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-gray-400">Loading scheduled scans...</p>
          </div>
        </div>
      ) : error ? (
        <div className="glass-card p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <XCircle className="w-12 h-12 text-red-400" />
            <p className="text-red-400 text-center">{error}</p>
            <button onClick={fetchScheduledScans} className="btn-primary px-4 py-2">
              Try Again
            </button>
          </div>
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="glass-card p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Calendar className="w-12 h-12 text-gray-600" />
            <p className="text-gray-400 text-center">
              {searchTerm || statusFilter !== 'ALL'
                ? 'No scheduled scans match your filters'
                : 'No scheduled scans yet'}
            </p>
            {!searchTerm && statusFilter === 'ALL' && (
              <button onClick={() => setShowCreateModal(true)} className="btn-primary px-4 py-2">
                Create Your First Schedule
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSchedules.map((schedule) => (
            <div key={schedule.id} className="glass-card p-6 hover:bg-white/5 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  {/* Header */}
                  <div className="flex items-start space-x-3">
                    <Calendar className="w-5 h-5 text-cyan-400 mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">{schedule.name}</h3>
                        {getStatusIcon(schedule.status)}
                        <span className={`text-sm font-medium ${getStatusColor(schedule.status)}`}>
                          {schedule.status}
                        </span>
                      </div>
                      {schedule.description && (
                        <p className="text-gray-400 text-sm">{schedule.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Schedule Info */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4" />
                      <span>{getFrequencyLabel(schedule.frequency)}</span>
                    </div>
                    {schedule.nextRunAt && schedule.status === 'ACTIVE' && (
                      <div className="text-cyan-400">
                        Next run: {formatRelativeTime(schedule.nextRunAt)}
                      </div>
                    )}
                    <div>Targets: {schedule.assetIds.length + schedule.targetUrls.length}</div>
                    <div>Runs: {schedule.runCount}</div>
                    {schedule.failCount > 0 && (
                      <div className="text-red-400">Failures: {schedule.failCount}</div>
                    )}
                    <div>By: {schedule.createdBy.firstName} {schedule.createdBy.lastName}</div>
                  </div>

                  {/* Last Execution */}
                  {schedule.executions.length > 0 && (
                    <div className="text-sm text-gray-400">
                      Last run: {formatDateTime(schedule.executions[0].executedAt)} -
                      {' '}{schedule.executions[0].status}
                      {schedule.executions[0].vulnFound > 0 && (
                        <span className="text-orange-400 ml-2">
                          ({schedule.executions[0].vulnFound} vulnerabilities found)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleView(schedule)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4 text-gray-400 hover:text-white" />
                  </button>
                  {schedule.status === 'ACTIVE' ? (
                    <button
                      onClick={() => handlePause(schedule)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Pause Schedule"
                    >
                      <Pause className="w-4 h-4 text-yellow-400 hover:text-yellow-300" />
                    </button>
                  ) : schedule.status === 'PAUSED' ? (
                    <button
                      onClick={() => handleResume(schedule)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Resume Schedule"
                    >
                      <Play className="w-4 h-4 text-green-400 hover:text-green-300" />
                    </button>
                  ) : null}
                  <button
                    onClick={() => handleExecute(schedule)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Execute Now"
                    disabled={schedule.status === 'EXPIRED' || schedule.status === 'DISABLED'}
                  >
                    <Play className="w-4 h-4 text-cyan-400 hover:text-cyan-300" />
                  </button>
                  <button
                    onClick={() => handleDelete(schedule)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Delete Schedule"
                  >
                    <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateScheduleModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* View Modal - Simple version for now */}
      {showViewModal && selectedSchedule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Schedule Details</h2>
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
                <p className="text-white">{selectedSchedule.name}</p>
              </div>

              {selectedSchedule.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                  <p className="text-white">{selectedSchedule.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Frequency</label>
                  <p className="text-white">{getFrequencyLabel(selectedSchedule.frequency)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedSchedule.status)}
                    <span className={getStatusColor(selectedSchedule.status)}>
                      {selectedSchedule.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Scan Profile</label>
                  <p className="text-white">{selectedSchedule.scanProfile}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Timezone</label>
                  <p className="text-white">{selectedSchedule.timezone}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Targets</label>
                <p className="text-white">
                  {selectedSchedule.assetIds.length} assets, {selectedSchedule.targetUrls.length} URLs
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Run Count</label>
                  <p className="text-white">{selectedSchedule.runCount}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Fail Count</label>
                  <p className="text-white">{selectedSchedule.failCount}</p>
                </div>
              </div>

              {selectedSchedule.nextRunAt && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Next Run</label>
                  <p className="text-white">{formatDateTime(selectedSchedule.nextRunAt)}</p>
                </div>
              )}

              {selectedSchedule.lastRunAt && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Last Run</label>
                  <p className="text-white">{formatDateTime(selectedSchedule.lastRunAt)}</p>
                </div>
              )}

              {selectedSchedule.executions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Recent Executions</label>
                  <div className="space-y-2">
                    {selectedSchedule.executions.slice(0, 5).map((execution) => (
                      <div key={execution.id} className="glass-card p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">
                            {formatDateTime(execution.executedAt)}
                          </span>
                          <span className={execution.status === 'COMPLETED' ? 'text-green-400' : 'text-red-400'}>
                            {execution.status}
                          </span>
                          {execution.vulnFound > 0 && (
                            <span className="text-orange-400">
                              {execution.vulnFound} vulnerabilities
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
