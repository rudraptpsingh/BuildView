import React, { useState } from 'react';
import { X, FolderGit2, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BuildViewProject } from '@shared/types.js';

interface ScanRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (project: BuildViewProject) => void;
}

export const ScanRepoModal: React.FC<ScanRepoModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [repoPath, setRepoPath] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;

    setIsScanning(true);
    setError(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: repoPath.trim(),
          projectName: projectName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to scan repository');
      }

      onScanSuccess(data.project);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error occurred while scanning codebase');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-2xl neu-surface bg-[var(--surface-window)] p-6 shadow-2xl z-10 border border-[var(--border-strong)] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3.5 hairline-b">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-500 flex items-center justify-center font-mono">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] font-mono">
                SCAN & MAP ANY REPOSITORY
              </h3>
              <p className="text-[11px] text-[var(--text-tertiary)] font-sans">
                Automatic AST parsing, layer clustering, and waste analysis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg neu-well text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleScan} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-mono font-bold text-[var(--text-primary)] mb-1">
              Repository Directory Path *
            </label>
            <input
              type="text"
              required
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="e.g. /Users/rp/Documents/GitHub/AgentMonitor or ."
              className="w-full px-3 py-2 text-xs font-mono rounded-lg neu-well bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] border border-[var(--border-default)] focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1 font-mono">
              Absolute path or path relative to the current workspace.
            </p>
          </div>

          <div>
            <label className="block text-xs font-mono font-bold text-[var(--text-primary)] mb-1">
              Project Display Name (Optional)
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Defaults to folder or package.json name"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg neu-well bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] border border-[var(--border-default)] focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-mono flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 hairline-t flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isScanning}
              className="action-btn text-xs px-3 py-1.5"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isScanning || !repoPath.trim()}
              className="action-btn bg-blue-600 text-white font-bold hover:bg-blue-700 text-xs px-4 py-1.5 flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>PARSING AST & CLUSTERING...</span>
                </>
              ) : (
                <>
                  <span>ANALYZE CODEBASE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
