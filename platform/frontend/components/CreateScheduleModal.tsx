'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, RefreshCw } from 'lucide-react';
import { scheduledScansAPI, assetsAPI } from '@/lib/api';

interface CreateScheduleModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateScheduleModal({ onClose, onSuccess }: CreateScheduleModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [scanProfile, setScanProfile] = useState<'LIGHT' | 'BALANCED' | 'AGGRESSIVE' | 'EXTREME'>('BALANCED');
  const [timezone, setTimezone] = useState('UTC');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notifyOnCompletion, setNotifyOnCompletion] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
  const [notifyEmails, setNotifyEmails] = useState('');

  // Target selection
  const [targetType, setTargetType] = useState<'assets' | 'urls'>('assets');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [targetUrls, setTargetUrls] = useState('');
  const [assets, setAssets] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    try {
      setLoadingAssets(true);
      const response = await assetsAPI.list({ limit: 100 });
      setAssets(response.data || []);
    } catch (err) {
      console.error('Failed to load assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (targetType === 'assets' && selectedAssets.length === 0) {
      setError('Please select at least one asset');
      return;
    }

    if (targetType === 'urls' && !targetUrls.trim()) {
      setError('Please enter at least one URL');
      return;
    }

    setCreating(true);

    try {
      const data: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        frequency,
        scanProfile,
        timezone,
        notifyOnCompletion,
        notifyOnFailure,
      };

      if (startDate) data.startDate = new Date(startDate).toISOString();
      if (endDate) data.endDate = new Date(endDate).toISOString();

      if (targetType === 'assets') {
        data.assetIds = selectedAssets;
        data.targetUrls = [];
      } else {
        data.assetIds = [];
        data.targetUrls = targetUrls
          .split('\n')
          .map(url => url.trim())
          .filter(url => url.length > 0);
      }

      if (notifyEmails.trim()) {
        data.notifyEmails = notifyEmails
          .split(',')
          .map(email => email.trim())
          .filter(email => email.length > 0);
      }

      await scheduledScansAPI.create(data);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create schedule');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Calendar className="w-6 h-6 text-cyan-400" />
            <h2 className="text-2xl font-bold text-white">Create Scheduled Scan</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={creating}
          >
            <X className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <p className="text-sm text-cyan-300">
            Schedule recurring vulnerability scans to run automatically at specified intervals. Perfect for continuous security monitoring.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Schedule Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field w-full"
                placeholder="e.g., Daily Production Scan"
                disabled={creating}
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field w-full h-20 resize-none"
                placeholder="Brief description of this schedule"
                disabled={creating}
                maxLength={1000}
              />
            </div>
          </div>

          {/* Schedule Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Schedule Configuration</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Frequency <span className="text-red-400">*</span>
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as any)}
                  className="input-field w-full"
                  disabled={creating}
                >
                  <option value="HOURLY">Hourly</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Scan Profile
                </label>
                <select
                  value={scanProfile}
                  onChange={(e) => setScanProfile(e.target.value as any)}
                  className="input-field w-full"
                  disabled={creating}
                >
                  <option value="LIGHT">Light</option>
                  <option value="BALANCED">Balanced</option>
                  <option value="AGGRESSIVE">Aggressive</option>
                  <option value="EXTREME">Extreme</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Start Date
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-field w-full"
                  disabled={creating}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  End Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input-field w-full"
                  disabled={creating}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input-field w-full"
                placeholder="UTC"
                disabled={creating}
              />
            </div>
          </div>

          {/* Target Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Scan Targets</h3>

            <div className="flex space-x-4 mb-4">
              <button
                type="button"
                onClick={() => setTargetType('assets')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  targetType === 'assets'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
                disabled={creating}
              >
                Select Assets
              </button>
              <button
                type="button"
                onClick={() => setTargetType('urls')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  targetType === 'urls'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
                disabled={creating}
              >
                Enter URLs
              </button>
            </div>

            {targetType === 'assets' ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Assets <span className="text-red-400">*</span>
                </label>
                {loadingAssets ? (
                  <div className="text-center py-4 text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 glass-card p-3">
                    {assets.length === 0 ? (
                      <p className="text-gray-400 text-sm">No assets available</p>
                    ) : (
                      assets.map((asset) => (
                        <label key={asset.id} className="flex items-center space-x-2 cursor-pointer hover:bg-white/5 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={selectedAssets.includes(asset.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAssets([...selectedAssets, asset.id]);
                              } else {
                                setSelectedAssets(selectedAssets.filter(id => id !== asset.id));
                              }
                            }}
                            disabled={creating}
                            className="form-checkbox"
                          />
                          <span className="text-white text-sm">{asset.name}</span>
                          <span className="text-gray-400 text-xs">({asset.type})</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Target URLs (one per line) <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={targetUrls}
                  onChange={(e) => setTargetUrls(e.target.value)}
                  className="input-field w-full h-32 resize-none font-mono text-sm"
                  placeholder="https://example.com&#10;https://api.example.com"
                  disabled={creating}
                />
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Notifications</h3>

            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnCompletion}
                  onChange={(e) => setNotifyOnCompletion(e.target.checked)}
                  disabled={creating}
                  className="form-checkbox"
                />
                <span className="text-gray-300 text-sm">Notify on completion</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnFailure}
                  onChange={(e) => setNotifyOnFailure(e.target.checked)}
                  disabled={creating}
                  className="form-checkbox"
                />
                <span className="text-gray-300 text-sm">Notify on failure</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Addresses (comma separated)
              </label>
              <input
                type="text"
                value={notifyEmails}
                onChange={(e) => setNotifyEmails(e.target.value)}
                className="input-field w-full"
                placeholder="security@company.com, admin@company.com"
                disabled={creating}
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-6 py-2"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-6 py-2 flex items-center space-x-2"
              disabled={creating}
            >
              {creating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  <span>Create Schedule</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
