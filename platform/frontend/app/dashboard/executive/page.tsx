'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  AlertTriangle,
  CheckCircle,
  Activity,
  Server
} from 'lucide-react';
import { API_URL } from '@/lib/api';

interface ExecutiveMetrics {
  overallRiskScore: {
    overall: number;
    components: {
      cvss: number;
      exploitability: number;
      assetCriticality: number;
      exposure: number;
      recurrence: number;
    };
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    calculation: string;
  };
  vulnerabilityDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  assetsWithCriticalRisk: {
    count: number;
    percentage: number;
    assets: Array<{ id: string; name: string; score: number }>;
  };
  riskTrend: Array<{
    date: string;
    score: number;
    vulnerabilities: number;
  }>;
  newVsResolved: {
    period: string;
    new: number;
    resolved: number;
    netChange: number;
  };
  topVulnerabilities: Array<{
    id: string;
    title: string;
    severity: string;
    affectedAssets: number;
    riskContribution: number;
  }>;
}

export default function ExecutiveDashboardPage() {
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMetrics();

    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch(`${API_URL}/api/executive/metrics`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setMetrics(data.data);
        setError('');
      }
    } catch (err: any) {
      setError('Failed to load executive metrics');
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'INCREASING':
        return <TrendingUp className="w-4 h-4 text-red-400" />;
      case 'DECREASING':
        return <TrendingDown className="w-4 h-4 text-green-400" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return 'text-red-500';
      case 'HIGH':
        return 'text-orange-500';
      case 'MEDIUM':
        return 'text-yellow-500';
      case 'LOW':
        return 'text-green-500';
      case 'INFO':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  const getRiskScoreColor = (score: number) => {
    if (score >= 90) return 'text-red-500';
    if (score >= 75) return 'text-orange-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="p-8">
        <div className="glass-panel p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Data Unavailable</h2>
          <p className="text-gray-400">{error || 'No metrics available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span>Executive Dashboard</span>
        </h1>
        <p className="text-gray-400">Enterprise security metrics and insights</p>
      </div>

      {/* Top Row - Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overall Risk Score */}
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Overall Risk Score
            </h3>
            {getTrendIcon(metrics.overallRiskScore.trend)}
          </div>
          <div className="flex items-baseline space-x-2 mb-2">
            <span className={`text-5xl font-bold ${getRiskScoreColor(metrics.overallRiskScore.overall)}`}>
              {metrics.overallRiskScore.overall}
            </span>
            <span className="text-gray-500 text-lg">/100</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Trend: {metrics.overallRiskScore.trend.toLowerCase()}
          </p>
          {/* Component Breakdown */}
          <div className="space-y-2">
            {Object.entries(metrics.overallRiskScore.components).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-gray-400 capitalize">{key}</span>
                <span className="text-gray-300 font-mono">{Math.round(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Assets With Critical Risk */}
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Critical Risk Assets
            </h3>
            <Server className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex items-baseline space-x-2 mb-2">
            <span className="text-5xl font-bold text-red-500">
              {metrics.assetsWithCriticalRisk.count}
            </span>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            {metrics.assetsWithCriticalRisk.percentage.toFixed(1)}% of total assets
          </p>
          {/* Top Critical Assets */}
          {metrics.assetsWithCriticalRisk.assets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-semibold">Highest Risk:</p>
              {metrics.assetsWithCriticalRisk.assets.slice(0, 3).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 truncate flex-1">{asset.name}</span>
                  <span className={`font-mono font-bold ml-2 ${getRiskScoreColor(asset.score)}`}>
                    {Math.round(asset.score)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New vs Resolved */}
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              {metrics.newVsResolved.period}
            </h3>
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400">New Vulnerabilities</span>
                <span className="text-2xl font-bold text-red-400">
                  {metrics.newVsResolved.new}
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400">Resolved</span>
                <span className="text-2xl font-bold text-green-400">
                  {metrics.newVsResolved.resolved}
                </span>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Net Change</span>
                <span className={`text-2xl font-bold ${
                  metrics.newVsResolved.netChange > 0 ? 'text-red-400' : 'text-green-400'
                }`}>
                  {metrics.newVsResolved.netChange > 0 ? '+' : ''}
                  {metrics.newVsResolved.netChange}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Vulnerability Distribution */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Vulnerability Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(metrics.vulnerabilityDistribution).map(([severity, count]) => (
              <div key={severity} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    severity === 'critical' ? 'bg-red-500' :
                    severity === 'high' ? 'bg-orange-500' :
                    severity === 'medium' ? 'bg-yellow-500' :
                    severity === 'low' ? 'bg-green-500' :
                    'bg-blue-500'
                  }`}></div>
                  <span className="text-sm text-gray-300 capitalize">{severity}</span>
                </div>
                <span className={`text-xl font-bold ${getSeverityColor(severity)}`}>
                  {count}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Total Vulnerabilities</span>
              <span className="text-2xl font-bold text-white">
                {Object.values(metrics.vulnerabilityDistribution).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Top Vulnerabilities */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Top Vulnerabilities by Risk
          </h3>
          <div className="space-y-3">
            {metrics.topVulnerabilities.slice(0, 5).map((vuln, index) => (
              <div key={vuln.id} className="p-3 bg-dark-200 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm text-gray-300 font-medium flex-1 line-clamp-1">
                    {vuln.title}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ml-2 ${
                    getSeverityColor(vuln.severity)
                  } bg-opacity-10`}>
                    {vuln.severity}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{vuln.affectedAssets} assets affected</span>
                  <span className="font-mono">Risk: {vuln.riskContribution}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row - Risk Trend Chart */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Risk Trend Over Time
        </h3>
        {metrics.riskTrend.length === 0 ? (
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-700 rounded-lg">
            <div className="text-center">
              <Activity className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No trend data available yet</p>
            </div>
          </div>
        ) : (() => {
          const data = metrics.riskTrend;
          const W = 860, H = 240, padL = 50, padR = 20, padT = 15, padB = 35;
          const cW = W - padL - padR, cH = H - padT - padB;
          const toX = (i: number) => padL + (i / Math.max(data.length - 1, 1)) * cW;
          const toY = (v: number) => padT + cH - (v / 100) * cH;
          const pts = data.map((p, i) => `${toX(i).toFixed(1)},${toY(p.score).toFixed(1)}`).join(' ');
          const area = `M${padL},${padT + cH} ` + data.map((p, i) => `L${toX(i).toFixed(1)},${toY(p.score).toFixed(1)}`).join(' ') + ` L${toX(data.length - 1).toFixed(1)},${padT + cH} Z`;
          const latest = data[data.length - 1];
          return (
            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-purple-400 font-semibold">● Risk Score ({data.length}d)</span>
                <span className="text-gray-400">Latest: <span className={latest.score >= 75 ? 'text-red-400' : latest.score >= 50 ? 'text-yellow-400' : 'text-green-400'} style={{ fontWeight: 'bold' }}>{latest.score}/100</span></span>
              </div>
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[0, 25, 50, 75, 100].map(v => (
                  <g key={v}>
                    <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="#1e293b" />
                    <text x={padL - 5} y={toY(v) + 4} fill="#64748b" fontSize={10} textAnchor="end">{v}</text>
                  </g>
                ))}
                <path d={area} fill="url(#riskGradient)" />
                <polyline points={pts} fill="none" stroke="#a855f7" strokeWidth={2} />
                {data.map((p, i) => (
                  <circle key={i} cx={toX(i)} cy={toY(p.score)} r={3} fill={p.score >= 75 ? '#ef4444' : p.score >= 50 ? '#f59e0b' : '#22c55e'} stroke="#0f172a" strokeWidth={1} />
                ))}
                {data.filter((_, i) => i % 5 === 0 || i === data.length - 1).map((p) => {
                  const i = data.indexOf(p);
                  const d = new Date(p.date);
                  return <text key={i} x={toX(i)} y={H - 5} fill="#64748b" fontSize={10} textAnchor="middle">{d.getMonth() + 1}/{d.getDate()}</text>;
                })}
              </svg>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
