'use client';

import { Shield, Target, FileSearch, Server, AlertTriangle } from 'lucide-react';

interface AttackPath {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  because: string[];
  recommended_next_steps: string[];
}

interface AttackSurface {
  total_endpoints: number;
  parameters_found: number;
  services_exposed: string[];
}

interface WhyNotTested {
  check: string;
  reason: string;
}

interface ReconAIDecision {
  id: string;
  sessionId: string;
  modelName: string;
  modelVersion: string;
  temperature: number | null;
  attackSurface: AttackSurface;
  candidateAttackPaths: AttackPath[];
  recommendedNucleiTags: string[];
  whyNotTested: WhyNotTested[] | null;
  confidenceScore: number | null;
  createdAt: string;
}

interface ThreatAssessmentPanelProps {
  analysis: ReconAIDecision;
}

export function ThreatAssessmentPanel({ analysis }: ThreatAssessmentPanelProps) {
  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      case 'low':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
    }
  };

  return (
    <div className="glass-panel p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-premium-primary" />
        <div>
          <h2 className="text-xl font-semibold text-text-primary">AI Threat Assessment</h2>
          <p className="text-sm text-text-secondary">
            Powered by {analysis.modelName} (v{analysis.modelVersion})
          </p>
        </div>
      </div>

      {/* Attack Surface Summary */}
      <div>
        <h3 className="font-semibold mb-3 text-text-primary">Attack Surface</h3>
        <div className="grid grid-cols-3 gap-4">
          {/* Total Endpoints */}
          <div className="bg-background/50 border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-premium-primary" />
              <span className="text-sm text-text-secondary">Total Endpoints</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {analysis.attackSurface.total_endpoints}
            </div>
          </div>

          {/* Parameters Found */}
          <div className="bg-background/50 border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileSearch className="w-5 h-5 text-premium-primary" />
              <span className="text-sm text-text-secondary">Parameters</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {analysis.attackSurface.parameters_found}
            </div>
          </div>

          {/* Services Exposed */}
          <div className="bg-background/50 border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-5 h-5 text-premium-primary" />
              <span className="text-sm text-text-secondary">Services</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {analysis.attackSurface.services_exposed?.length || 0}
            </div>
          </div>
        </div>

        {/* Services List */}
        {analysis.attackSurface.services_exposed && analysis.attackSurface.services_exposed.length > 0 && (
          <div className="mt-3">
            <p className="text-sm text-text-secondary mb-2">Exposed Services:</p>
            <div className="flex flex-wrap gap-2">
              {analysis.attackSurface.services_exposed.map((service, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-blue-500/10 text-blue-500 text-sm rounded border border-blue-500/30"
                >
                  {service}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Candidate Attack Paths */}
      <div>
        <h3 className="font-semibold mb-3 text-text-primary">Most Likely Attack Paths</h3>
        <div className="space-y-3">
          {analysis.candidateAttackPaths.map((path, idx) => (
            <div key={idx} className="border border-border rounded-lg p-4 space-y-3">
              {/* Path Header */}
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-text-primary">{path.name}</h4>
                <span className={`px-3 py-1 text-sm rounded border ${getConfidenceColor(path.confidence)}`}>
                  {path.confidence.charAt(0).toUpperCase() + path.confidence.slice(1)} Confidence
                </span>
              </div>

              {/* Because */}
              <div>
                <p className="text-sm font-medium text-text-secondary mb-1">Evidence:</p>
                <ul className="list-disc list-inside space-y-1">
                  {path.because.map((reason, i) => (
                    <li key={i} className="text-sm text-text-secondary">{reason}</li>
                  ))}
                </ul>
              </div>

              {/* Next Steps */}
              <div>
                <p className="text-sm font-medium text-text-secondary mb-1">Recommended Actions:</p>
                <ul className="list-disc list-inside space-y-1">
                  {path.recommended_next_steps.map((step, i) => (
                    <li key={i} className="text-sm text-blue-400">{step}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}

          {analysis.candidateAttackPaths.length === 0 && (
            <div className="text-center py-8 text-text-secondary">
              No attack paths identified
            </div>
          )}
        </div>
      </div>

      {/* Recommended Nuclei Tags */}
      <div>
        <h3 className="font-semibold mb-3 text-text-primary">Recommended Nuclei Tags</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.recommendedNucleiTags.map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 bg-premium-primary/10 text-premium-primary text-sm rounded border border-premium-primary/30"
            >
              {tag}
            </span>
          ))}

          {analysis.recommendedNucleiTags.length === 0 && (
            <span className="text-sm text-text-secondary">No specific tags recommended</span>
          )}
        </div>
      </div>

      {/* Why Not Tested */}
      {analysis.whyNotTested && analysis.whyNotTested.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-text-primary flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Why Not Tested
          </h3>
          <div className="space-y-2">
            {analysis.whyNotTested.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 border border-yellow-500/30 rounded-lg bg-yellow-500/5"
              >
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-text-primary">{item.check}:</span>
                  <span className="text-text-secondary ml-2">{item.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confidence Score */}
      {analysis.confidenceScore !== null && (
        <div className="bg-background/50 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Overall Confidence</span>
            <span className="text-lg font-semibold text-text-primary">
              {Math.round(analysis.confidenceScore * 100)}%
            </span>
          </div>
          <div className="mt-2 w-full bg-background rounded-full h-2">
            <div
              className="bg-premium-primary rounded-full h-2 transition-all"
              style={{ width: `${analysis.confidenceScore * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
