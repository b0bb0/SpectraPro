'use client';

import { useState } from 'react';
import { X, Upload, FileCode2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { templatesAPI } from '@/lib/api';

interface TemplateUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function TemplateUploadModal({ onClose, onSuccess }: TemplateUploadModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    metadata?: any;
    error?: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleValidate = async () => {
    if (!content.trim()) {
      setError('Please enter template content');
      return;
    }

    setValidating(true);
    setError('');
    setValidationResult(null);

    try {
      const result = await templatesAPI.validate(content);
      setValidationResult(result);

      // Auto-fill fields from metadata if validation successful
      if (result.isValid && result.metadata) {
        if (!name && result.metadata.name) {
          setName(result.metadata.name);
        }
        if (!description && result.metadata.description) {
          setDescription(result.metadata.description);
        }
        if (!fileName && result.metadata.id) {
          setFileName(`${result.metadata.id}.yaml`);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Validation failed');
      setValidationResult({ isValid: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate form
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!fileName.trim()) {
      setError('File name is required');
      return;
    }

    if (!fileName.endsWith('.yaml')) {
      setError('File name must end with .yaml');
      return;
    }

    if (!content.trim()) {
      setError('Template content is required');
      return;
    }

    // Check if validated
    if (!validationResult || !validationResult.isValid) {
      setError('Please validate the template first');
      return;
    }

    setUploading(true);

    try {
      await templatesAPI.create({
        name: name.trim(),
        description: description.trim() || undefined,
        fileName: fileName.trim(),
        content: content.trim(),
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to upload template');
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      if (!fileName) {
        setFileName(file.name);
      }
      // Auto-validate after loading file
      setTimeout(() => {
        handleValidate();
      }, 100);
    };
    reader.readAsText(file);
  };

  const exampleTemplate = `id: example-template

info:
  name: Example Vulnerability Template
  author: Your Name
  severity: medium
  description: Detects example vulnerability
  tags:
    - example
    - custom

http:
  - method: GET
    path:
      - "{{BaseURL}}/example"

    matchers:
      - type: status
        status:
          - 200`;

  const loadExample = () => {
    setContent(exampleTemplate);
    setName('Example Vulnerability Template');
    setFileName('example-template.yaml');
    setDescription('Example template for reference');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <FileCode2 className="w-6 h-6 text-cyan-400" />
            <h2 className="text-2xl font-bold text-white">Upload Custom Template</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={uploading}
          >
            <X className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <p className="text-sm text-cyan-300">
            Upload custom Nuclei templates to extend the platform's vulnerability detection capabilities. Templates must be valid YAML format with required fields: id, info, and info.name.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-6">
          {/* Template Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Template Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field w-full"
                placeholder="e.g., Custom Admin Panel Detector"
                disabled={uploading}
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
                placeholder="Brief description of what this template detects"
                disabled={uploading}
                maxLength={1000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                File Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="input-field w-full font-mono text-sm"
                placeholder="e.g., custom-admin-panel.yaml"
                disabled={uploading}
              />
              <p className="text-xs text-gray-400 mt-1">Must end with .yaml</p>
            </div>
          </div>

          {/* Template Content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Template Content (YAML) <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={loadExample}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                  disabled={uploading}
                >
                  Load Example
                </button>
                <label className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer">
                  <input
                    type="file"
                    accept=".yaml,.yml"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploading}
                  />
                  Upload File
                </label>
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input-field w-full h-64 resize-none font-mono text-sm"
              placeholder="Paste your Nuclei template YAML here..."
              disabled={uploading}
            />
          </div>

          {/* Validation Button */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleValidate}
              className="btn-secondary px-4 py-2 flex items-center space-x-2"
              disabled={validating || uploading || !content.trim()}
            >
              {validating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Validate Template</span>
                </>
              )}
            </button>
            <p className="text-sm text-gray-400">
              Validate your template before uploading
            </p>
          </div>

          {/* Validation Result */}
          {validationResult && (
            <div
              className={`p-4 rounded-lg border ${
                validationResult.isValid
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-start space-x-3">
                {validationResult.isValid ? (
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      validationResult.isValid ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {validationResult.isValid
                      ? 'Template is valid!'
                      : 'Validation failed'}
                  </p>
                  {validationResult.isValid && validationResult.metadata && (
                    <div className="mt-2 space-y-1 text-sm text-gray-300">
                      <p>ID: <span className="font-mono">{validationResult.metadata.id}</span></p>
                      <p>Name: {validationResult.metadata.name}</p>
                      {validationResult.metadata.author && (
                        <p>Author: {validationResult.metadata.author}</p>
                      )}
                      {validationResult.metadata.severity && (
                        <p>Severity: <span className="capitalize">{validationResult.metadata.severity}</span></p>
                      )}
                      {validationResult.metadata.tags && validationResult.metadata.tags.length > 0 && (
                        <p>Tags: {validationResult.metadata.tags.join(', ')}</p>
                      )}
                    </div>
                  )}
                  {!validationResult.isValid && validationResult.error && (
                    <p className="mt-1 text-sm text-red-300">{validationResult.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                <p className="text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-6 py-2"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-6 py-2 flex items-center space-x-2"
              disabled={uploading || !validationResult || !validationResult.isValid}
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload Template</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
