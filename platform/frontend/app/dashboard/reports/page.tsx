'use client';

import { useEffect, useState } from 'react';
import { FileText, Download, Plus, CheckCircle, X, Loader2, AlertTriangle, FileDown } from 'lucide-react';
import { API_URL, scansAPI, reportsAPI, type ScanSummary as Scan } from '@/lib/api';

interface GeneratedReport {
  id: string;
  name: string;
  htmlContent: string;
  generatedAt: Date;
  scanCount: number;
}

export default function ReportsPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [reportName, setReportName] = useState('');
  const [error, setError] = useState('');
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [viewingReport, setViewingReport] = useState<GeneratedReport | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [showPDFOptionsModal, setShowPDFOptionsModal] = useState(false);

  useEffect(() => {
    fetchScans();
  }, []);

  const fetchScans = async () => {
    try {
      setLoading(true);
      const data = await scansAPI.getAll();
      setScans(data.filter((s: Scan) => s.status === 'COMPLETED'));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load scans');
    } finally {
      setLoading(false);
    }
  };

  const toggleScanSelection = (scanId: string) => {
    setSelectedScans(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scanId)) {
        newSet.delete(scanId);
      } else {
        newSet.add(scanId);
      }
      return newSet;
    });
  };

  const handleGenerateReport = async () => {
    if (selectedScans.size === 0) {
      setError('Please select at least one scan');
      return;
    }

    if (!reportName.trim()) {
      setError('Please enter a report name');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: reportName,
          scanIds: Array.from(selectedScans),
          type: 'TECHNICAL',
          format: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to generate report';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          // Response was not JSON
        }
        throw new Error(errorMessage);
      }

      // Get the HTML content — handle both raw HTML and JSON-wrapped responses
      const responseText = await response.text();
      let htmlText: string;
      try {
        const parsed = JSON.parse(responseText);
        htmlText = parsed.data || parsed.html || responseText;
      } catch {
        // Response is raw HTML
        htmlText = responseText;
      }

      // Create new report object
      const newReport: GeneratedReport = {
        id: Date.now().toString(),
        name: reportName,
        htmlContent: htmlText,
        generatedAt: new Date(),
        scanCount: selectedScans.size,
      };

      // Add to reports list
      setGeneratedReports(prev => [newReport, ...prev]);

      // Close the generate modal
      setShowGenerateModal(false);
      setSelectedScans(new Set());
      setReportName('');
      setError('');
    } catch (err: any) {
      console.error('Report generation error:', err);
      setError(err.message || 'Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleViewReport = (report: GeneratedReport) => {
    setViewingReport(report);
  };

  const handleDownloadReport = (report: GeneratedReport) => {
    const blob = new Blob([report.htmlContent], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${report.name.replace(/\s+/g, '_')}_${new Date(report.generatedAt).toISOString().split('T')[0]}.html`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleClosePreview = () => {
    setViewingReport(null);
  };

  const handleDeleteReport = (reportId: string) => {
    if (confirm('Are you sure you want to delete this report?')) {
      setGeneratedReports(prev => prev.filter(r => r.id !== reportId));
      if (viewingReport?.id === reportId) {
        setViewingReport(null);
      }
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleString();

  const handleGenerateExecutivePDF = async () => {
    setGeneratingPDF(true);
    setError('');

    try {
      await reportsAPI.generateExecutivePDF();
    } catch (err: any) {
      setError(err.message || 'Failed to generate PDF report');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleGenerateDetailedPDF = async () => {
    setGeneratingPDF(true);
    setError('');

    try {
      await reportsAPI.generateDetailedPDF();
      setShowPDFOptionsModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to generate PDF report');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text mb-2">Reports</h1>
          <p className="text-gray-400">Generate AI-powered security assessment reports and PDF exports</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleGenerateExecutivePDF}
            disabled={generatingPDF}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
          >
            {generatingPDF ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FileDown className="w-5 h-5" />
            )}
            <span>Executive PDF</span>
          </button>
          <button
            onClick={() => setShowPDFOptionsModal(true)}
            disabled={generatingPDF}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
          >
            <FileDown className="w-5 h-5" />
            <span>Detailed PDF</span>
          </button>
          <button onClick={() => setShowGenerateModal(true)} className="btn-premium px-6 py-3 flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-panel p-4 border-red-500/30 bg-red-500/5 flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {generatedReports.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <FileText className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Generate Security Report</h3>
          <p className="text-gray-400 mb-6">Select scans and generate AI-powered security assessment reports with executive summaries, detailed findings, and remediation recommendations</p>
          <button onClick={() => setShowGenerateModal(true)} className="btn-premium px-6 py-3 inline-flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Generate Report</span>
          </button>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
            <div className="p-4 bg-dark-200 rounded-lg">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center mb-3">
                <FileText className="w-5 h-5 text-purple-400" />
              </div>
              <h4 className="text-white font-semibold mb-2">AI-Powered Analysis</h4>
              <p className="text-gray-400 text-sm">Executive summaries and strategic recommendations generated by AI</p>
            </div>
            <div className="p-4 bg-dark-200 rounded-lg">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                <CheckCircle className="w-5 h-5 text-blue-400" />
              </div>
              <h4 className="text-white font-semibold mb-2">Complete Details</h4>
              <p className="text-gray-400 text-sm">All severity levels, URLs, evidence, and remediation steps included</p>
            </div>
            <div className="p-4 bg-dark-200 rounded-lg">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mb-3">
                <Download className="w-5 h-5 text-green-400" />
              </div>
              <h4 className="text-white font-semibold mb-2">Preview & Download</h4>
              <p className="text-gray-400 text-sm">Preview reports in-browser before downloading HTML format</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {generatedReports.map((report) => (
            <div key={report.id} className="glass-panel p-6 hover:border-purple-500/30 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-lg line-clamp-1">{report.name}</h3>
                    <p className="text-gray-400 text-sm">{report.scanCount} scan{report.scanCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-gray-400 text-sm">
                  Generated {formatDate(report.generatedAt.toISOString())}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleViewReport(report)}
                  className="flex-1 btn-secondary px-4 py-2 flex items-center justify-center space-x-2 hover:bg-purple-500/20 hover:border-purple-500/30"
                >
                  <FileText className="w-4 h-4" />
                  <span>View</span>
                </button>
                <button
                  onClick={() => handleDownloadReport(report)}
                  className="flex-1 btn-premium px-4 py-2 flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
              </div>

              <button
                onClick={() => handleDeleteReport(report.id)}
                className="mt-3 w-full text-red-400 hover:text-red-300 text-sm transition-colors"
              >
                Delete Report
              </button>
            </div>
          ))}
        </div>
      )}

      {viewingReport && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-100 rounded-lg w-full h-full max-w-7xl max-h-[95vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-dark-200">
              <div className="flex items-center space-x-3">
                <FileText className="w-6 h-6 text-purple-400" />
                <div>
                  <h2 className="text-xl font-bold text-white">{viewingReport.name}</h2>
                  <p className="text-sm text-gray-400">Security Assessment Report Preview</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => handleDownloadReport(viewingReport)}
                  className="btn-premium px-4 py-2 flex items-center space-x-2">
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
                <button onClick={handleClosePreview}
                  className="btn-secondary p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-white">
              <iframe
                srcDoc={viewingReport.htmlContent}
                className="w-full h-full border-0"
                title="Report Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Generate Security Report</h2>
              <button onClick={() => setShowGenerateModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Report Name</label>
                <input type="text" value={reportName} onChange={(e) => setReportName(e.target.value)}
                  placeholder="e.g., Q1 2026 Security Assessment"
                  className="w-full px-4 py-3 bg-dark-200 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Select Scans to Include ({selectedScans.size} selected)
                </label>
                {scans.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No completed scans available</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {scans.map((scan) => (
                      <div key={scan.id} onClick={() => toggleScanSelection(scan.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedScans.has(scan.id) ? 'border-primary bg-primary/10' : 'border-gray-700 bg-dark-200 hover:border-gray-600'
                        }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 flex-1">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              selectedScans.has(scan.id) ? 'border-primary bg-primary' : 'border-gray-600'
                            }`}>
                              {selectedScans.has(scan.id) && <CheckCircle className="w-4 h-4 text-white" />}
                            </div>
                            <div className="flex-1">
                              <p className="text-white font-medium">{scan.name}</p>
                              <p className="text-sm text-gray-400">
                                {formatDate(scan.completedAt || scan.startedAt)} • {scan.vulnFound} findings
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 text-sm">
                            {scan.criticalCount > 0 && (
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">{scan.criticalCount} Critical</span>
                            )}
                            {scan.highCount > 0 && (
                              <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded">{scan.highCount} High</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-700">
                <button onClick={() => setShowGenerateModal(false)} className="btn-secondary px-6 py-3" disabled={generating}>
                  Cancel
                </button>
                <button onClick={handleGenerateReport} disabled={generating || selectedScans.size === 0}
                  className="btn-premium px-6 py-3 flex items-center space-x-2">
                  {generating ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /><span>Generating...</span></>
                  ) : (
                    <><FileText className="w-5 h-5" /><span>Generate Report</span></>
                  )}
                </button>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-400 text-sm">
                  <strong>Note:</strong> Report generation uses AI and may take 30-60 seconds. The report will include an executive summary, vulnerability analysis, and remediation recommendations.
                </p>
              </div>

              {generating && (
                <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <p className="text-purple-400 text-sm flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span><strong>Generating...</strong> AI is analyzing vulnerabilities and creating your report. This may take up to 60 seconds.</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPDFOptionsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 max-w-lg w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Generate Detailed PDF Report</h2>
              <button
                onClick={() => setShowPDFOptionsModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                <p className="text-cyan-300 text-sm">
                  <strong>Detailed Report Includes:</strong>
                  <ul className="mt-2 space-y-1 ml-4 list-disc">
                    <li>Executive Summary</li>
                    <li>Asset Overview (Top 20 by Risk)</li>
                    <li>Vulnerability Details (Up to 100)</li>
                    <li>Recent Scan Activity</li>
                    <li>Recommendations</li>
                  </ul>
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-700">
                <button
                  onClick={() => setShowPDFOptionsModal(false)}
                  className="btn-secondary px-6 py-3"
                  disabled={generatingPDF}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateDetailedPDF}
                  disabled={generatingPDF}
                  className="btn-premium px-6 py-3 flex items-center space-x-2"
                >
                  {generatingPDF ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <FileDown className="w-5 h-5" />
                      <span>Generate PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
