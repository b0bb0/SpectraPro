'use client';

import { CheckCircle, Circle, XCircle, Loader, Play, StopCircle, RotateCw, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ReconPhaseRun {
  id: string;
  sessionId: string;
  phase: 'SUBDOMAINS' | 'NMAP' | 'FEROXBUSTER' | 'AI_ANALYSIS' | 'NUCLEI';
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

interface ReconPhaseControlProps {
  phase: 'SUBDOMAINS' | 'NMAP' | 'FEROXBUSTER' | 'AI_ANALYSIS' | 'NUCLEI';
  label: string;
  sessionId: string;
  phaseRun: ReconPhaseRun | undefined;
  onRun: () => void;
  onCancel: () => void;
  onViewArtifacts?: () => void;
  disabled?: boolean;
}

export function ReconPhaseControl({
  phase,
  label,
  sessionId,
  phaseRun,
  onRun,
  onCancel,
  onViewArtifacts,
  disabled = false,
}: ReconPhaseControlProps) {
  const status = phaseRun?.status || 'not_started';
  const isRunning = status === 'RUNNING';
  const isCompleted = status === 'DONE';
  const isFailed = status === 'FAILED';
  const isQueued = status === 'QUEUED';

  const getStatusIcon = () => {
    if (isCompleted) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (isRunning) {
      return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
    }
    if (isFailed) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    if (isQueued) {
      return <Circle className="w-5 h-5 text-yellow-500" />;
    }
    return <Circle className="w-5 h-5 text-gray-500" />;
  };

  const getStatusText = () => {
    if (isRunning) return 'Running...';
    if (isCompleted && phaseRun?.finishedAt) {
      return `Completed ${formatDistanceToNow(new Date(phaseRun.finishedAt))} ago`;
    }
    if (isFailed) return `Failed: ${phaseRun?.errorMessage || 'Unknown error'}`;
    if (isQueued) return 'Queued';
    return 'Not started';
  };

  const getStatusColor = () => {
    if (isCompleted) return 'text-green-500';
    if (isRunning) return 'text-blue-500';
    if (isFailed) return 'text-red-500';
    if (isQueued) return 'text-yellow-500';
    return 'text-text-secondary';
  };

  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:border-border-hover transition-colors">
      {/* Status Icon and Label */}
      <div className="flex items-center gap-4">
        {getStatusIcon()}

        <div>
          <h3 className="font-semibold text-text-primary">{label}</h3>
          <p className={`text-sm ${getStatusColor()}`}>{getStatusText()}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!isRunning && !isCompleted && !isQueued && (
          <button
            onClick={onRun}
            disabled={disabled}
            className="btn-premium flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Run
          </button>
        )}

        {isRunning && (
          <button
            onClick={onCancel}
            className="btn-secondary bg-red-500/10 border-red-500/30 hover:bg-red-500/20 flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          >
            <StopCircle className="w-4 h-4" />
            Stop
          </button>
        )}

        {isCompleted && (
          <button
            onClick={onRun}
            disabled={disabled}
            className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCw className="w-4 h-4" />
            Re-run
          </button>
        )}

        {isFailed && (
          <button
            onClick={onRun}
            disabled={disabled}
            className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCw className="w-4 h-4" />
            Retry
          </button>
        )}

        {phaseRun && onViewArtifacts && (
          <button
            onClick={onViewArtifacts}
            className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            View Output
          </button>
        )}
      </div>
    </div>
  );
}
