import React, { useState } from 'react';
import {
  X,
  Code2,
  FileCode,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  Layers,
  Terminal,
  TestTube,
  Trash2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { ArchitectureComponent } from '@shared/types.js';
import { StatusBadge } from './ui/StatusBadge.js';
import { SeverityBadge } from './ui/SeverityBadge.js';
import { ProgressBar } from './ui/ProgressBar.js';
import { TestBadge } from './ui/TestBadge.js';
import { WasteBadge } from './ui/WasteBadge.js';

interface ComponentDrawerProps {
  component: ArchitectureComponent | null;
  allComponents: ArchitectureComponent[];
  onClose: () => void;
  onNavigateToComponent: (id: string) => void;
}

export const ComponentDrawer: React.FC<ComponentDrawerProps> = ({
  component,
  allComponents,
  onClose,
  onNavigateToComponent,
}) => {
  const [activeTab, setActiveTab] = useState<'anatomy' | 'graph' | 'files' | 'gaps' | 'tests' | 'waste'>('anatomy');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  if (!component) return null;

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedFile(path);
    setTimeout(() => setCopiedFile(null), 1800);
  };

  const activeGaps = component.gaps.filter((g) => !g.resolved);
  const resolvedGaps = component.gaps.filter((g) => g.resolved);
  const effectiveStatus = activeGaps.length > 0 ? 'gap_detected' : component.status;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-2xl h-full bg-[var(--surface-window)] shadow-2xl flex flex-col z-10 hairline-l animate-slide-left">
        {/* Drawer Header */}
        <div className="p-5 hairline-b shrink-0 bg-[var(--surface-titlebar)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2.5 font-mono">
              <span className="pill neutral font-bold">
                P{component.priority}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {component.id}
              </span>
              <StatusBadge status={effectiveStatus} gapCount={activeGaps.length} />
            </div>

            <button
              onClick={onClose}
              className="action-btn p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2.5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] font-mono">
                {component.name}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {component.description}
              </p>
            </div>
            <div className="shrink-0 text-right font-mono">
              <div className="text-[11px] font-bold text-[var(--text-primary)]">
                {component.progress}% Complete
              </div>
              <div className="w-24 mt-1">
                <ProgressBar progress={component.progress} status={effectiveStatus} hasGaps={activeGaps.length > 0} size="sm" />
              </div>
            </div>
          </div>

          {/* Navigation Segmented Tabs (AgentMonitor style) */}
          <div className="mt-4 pt-2.5 hairline-t">
            <div className="segmented-tabs font-mono text-xs flex-wrap">
              <button
                onClick={() => setActiveTab('anatomy')}
                className={`segmented-tab ${activeTab === 'anatomy' ? 'active' : ''}`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>API CONTRACT ({component.anatomy.functions?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('graph')}
                className={`segmented-tab ${activeTab === 'graph' ? 'active' : ''}`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>CALL GRAPH</span>
              </button>

              <button
                onClick={() => setActiveTab('files')}
                className={`segmented-tab ${activeTab === 'files' ? 'active' : ''}`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>FILES ({component.files.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('tests')}
                className={`segmented-tab ${activeTab === 'tests' ? 'active' : ''}`}
              >
                <TestTube className="w-3.5 h-3.5" />
                <span>TESTS ({component.testSummary?.totalTests || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('waste')}
                className={`segmented-tab ${activeTab === 'waste' ? 'active' : ''}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>PRUNE ({component.wasteMetrics?.unusedExports.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('gaps')}
                className={`segmented-tab ${activeTab === 'gaps' ? 'active' : ''}`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>GAPS ({activeGaps.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: API & ANATOMY STRUCTURE */}
          {activeTab === 'anatomy' && (
            <div className="space-y-5">
              {/* Functions & Methods Spec */}
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center justify-between">
                  <span>CALLABLE METHODS & SIGNATURES ({component.anatomy.functions?.length || 0})</span>
                  <span>INTERFACE CONTRACT</span>
                </div>

                {(!component.anatomy.functions || component.anatomy.functions.length === 0) ? (
                  <div className="p-3.5 rounded neu-well text-center text-xs text-[var(--text-disabled)] font-mono">
                    NO CALLABLE METHODS DEFINED
                  </div>
                ) : (
                  <div className="space-y-2">
                    {component.anatomy.functions.map((fn, idx) => (
                      <div key={idx} className="p-3 rounded-lg neu-surface">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-mono font-bold text-[var(--signal-active)]">
                              {fn.name}
                            </span>
                            {fn.isAsync && (
                              <span className="pill blue text-[9px] py-0">
                                ASYNC
                              </span>
                            )}
                          </div>
                          {fn.returnType && (
                            <span className="pill neutral text-[10px]">
                              → {fn.returnType}
                            </span>
                          )}
                        </div>
                        <div className="p-2 rounded neu-well font-mono text-[11px] text-[var(--text-primary)] overflow-x-auto">
                          {fn.signature}
                        </div>
                        {fn.description && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1.5 font-sans">
                            {fn.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Data Members & Fields Table */}
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  DATA MEMBERS & PROPERTIES ({component.anatomy.members?.length || 0})
                </div>

                {(!component.anatomy.members || component.anatomy.members.length === 0) ? (
                  <div className="p-3.5 rounded neu-well text-center text-xs text-[var(--text-disabled)] font-mono">
                    NO DATA MEMBERS DEFINED
                  </div>
                ) : (
                  <div className="rounded-lg neu-well p-1 space-y-1">
                    {component.anatomy.members.map((mem, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-[var(--surface-window)] flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex items-center space-x-2">
                          <span className={`pill ${mem.access === 'public' ? 'green' : 'neutral'} text-[9px]`}>
                            {mem.access || 'public'}
                          </span>
                          <span className="font-bold text-[var(--text-primary)]">
                            {mem.name}
                          </span>
                          <span className="text-[var(--text-tertiary)]">: {mem.type}</span>
                        </div>
                        {mem.description && (
                          <span className="text-[11px] text-[var(--text-tertiary)] font-sans hidden sm:inline">
                            {mem.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Internal States & Lifecycle */}
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  INTERNAL STATE & LIFECYCLE ({component.anatomy.state?.length || 0})
                </div>

                {(!component.anatomy.state || component.anatomy.state.length === 0) ? (
                  <div className="p-3.5 rounded neu-well text-center text-xs text-[var(--text-disabled)] font-mono">
                    STATELESS COMPONENT
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {component.anatomy.state.map((st, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg neu-surface text-xs font-mono">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[var(--text-primary)]">{st.name}</span>
                          <span className="text-[10px] text-[var(--text-tertiary)]">{st.type}</span>
                        </div>
                        {st.initialValue && (
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            init: <span className="text-[var(--signal-active)]">{st.initialValue}</span>
                          </div>
                        )}
                        {st.description && (
                          <p className="text-[11px] text-[var(--text-tertiary)] font-sans mt-0.5">{st.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CALL GRAPH & CONTRACTS */}
          {activeTab === 'graph' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg neu-surface">
                <div className="flex items-center space-x-1.5 mb-1.5 font-mono text-xs">
                  <ArrowLeft className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-bold text-[var(--text-primary)] uppercase">
                    INCOMING CALLERS ({component.anatomy.callers?.length || 0})
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-2.5">
                  Components authorized to invoke this component's public methods.
                </p>

                {component.anatomy.callers?.length === 0 ? (
                  <div className="p-2 rounded neu-well text-center text-xs text-[var(--text-disabled)] font-mono">
                    NO REGISTERED CALLERS
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {component.anatomy.callers.map((callerId, idx) => {
                      const match = allComponents.find((c) => c.id === callerId);
                      return (
                        <button
                          key={idx}
                          onClick={() => match && onNavigateToComponent(match.id)}
                          className="action-btn border border-[var(--border-default)] font-mono text-xs"
                        >
                          <Terminal className="w-3 h-3 text-emerald-500" />
                          <span>{match ? match.name : callerId}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-lg neu-surface">
                <div className="flex items-center space-x-1.5 mb-1.5 font-mono text-xs">
                  <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-bold text-[var(--text-primary)] uppercase">
                    OUTBOUND DEPENDENCIES ({component.anatomy.callees?.length || 0})
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-2.5">
                  Subsystems, drivers, and services consumed by this component.
                </p>

                {component.anatomy.callees?.length === 0 ? (
                  <div className="p-2 rounded neu-well text-center text-xs text-[var(--text-disabled)] font-mono">
                    ZERO OUTBOUND DEPENDENCIES (LEAF COMPONENT)
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {component.anatomy.callees.map((calleeId, idx) => {
                      const match = allComponents.find((c) => c.id === calleeId);
                      return (
                        <button
                          key={idx}
                          onClick={() => match && onNavigateToComponent(match.id)}
                          className="action-btn border border-[var(--border-default)] font-mono text-xs"
                        >
                          <Terminal className="w-3 h-3 text-blue-500" />
                          <span>{match ? match.name : calleeId}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FILES TRACKED & CHANGED */}
          {activeTab === 'files' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold uppercase text-[var(--text-tertiary)]">
                  TRACKED FILES ({component.files.length})
                </span>
                <span className="text-[var(--text-disabled)] text-[10px]">VERIFIED COMMITS</span>
              </div>

              {component.files.length === 0 ? (
                <div className="p-5 rounded neu-well text-center text-xs text-[var(--text-disabled)] font-mono">
                  NO FILES TOUCHED YET
                </div>
              ) : (
                <div className="space-y-1.5">
                  {component.files.map((file, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg neu-surface flex flex-col gap-1 font-mono">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 truncate">
                          <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-xs font-bold text-[var(--text-primary)] truncate" title={file.path}>
                            {file.path}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className={`pill ${file.status === 'created' ? 'green' : 'blue'} text-[9px]`}>
                            {file.status}
                          </span>
                          {file.linesChanged !== undefined && (
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              +{file.linesChanged}
                            </span>
                          )}
                          <button
                            onClick={() => copyPath(file.path)}
                            className="action-btn p-1"
                            title="Copy path"
                          >
                            {copiedFile === file.path ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      {file.description && (
                        <p className="text-xs text-[var(--text-secondary)] font-sans pl-5">
                          {file.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: GAPS & ARCHITECTURAL DEBT */}
          {activeTab === 'gaps' && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  ACTIVE ARCHITECTURAL GAPS ({activeGaps.length})
                </div>

                {activeGaps.length === 0 ? (
                  <div className="p-4 rounded-lg neu-surface border-l-4 border-l-emerald-600 text-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                    <div className="text-xs font-mono font-bold text-[var(--text-primary)]">
                      ZERO ACTIVE GAPS
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 font-sans">
                      All contracts and error-handling specs are implemented.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeGaps.map((gap) => (
                      <div
                        key={gap.id}
                        className="p-3 rounded-lg neu-surface border-l-4 border-l-amber-500"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                            {gap.title}
                          </span>
                          <SeverityBadge severity={gap.severity} />
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-sans">
                          {gap.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {resolvedGaps.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                    RESOLVED GAPS HISTORY ({resolvedGaps.length})
                  </div>
                  <div className="space-y-1.5">
                    {resolvedGaps.map((gap) => (
                      <div key={gap.id} className="p-2.5 rounded-lg neu-well text-xs font-mono">
                        <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-bold mb-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{gap.title}</span>
                        </div>
                        {gap.resolutionNote && (
                          <p className="text-[var(--text-tertiary)] text-[11px] font-sans pl-4.5">
                            Fix: {gap.resolutionNote}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: TESTS & VERIFICATION COVERAGE */}
          {activeTab === 'tests' && (
            <div className="space-y-5">
              {/* Coverage Telemetry Header */}
              <div className="p-4 rounded-xl neu-surface hairline-b">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 font-mono">
                    <TestTube className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      VERIFICATION & TEST COVERAGE
                    </span>
                  </div>
                  <TestBadge testSummary={component.testSummary} />
                </div>

                <div className="grid grid-cols-3 gap-2.5 mt-3 pt-2.5 hairline-t font-mono text-center">
                  <div className="p-2 rounded neu-well">
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase">TEST FILES</div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {component.testFiles?.length || component.testSummary?.testFilesCount || 0}
                    </div>
                  </div>
                  <div className="p-2 rounded neu-well">
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase">TOTAL ASSERTIONS</div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {component.testSummary?.totalTests || 0}
                    </div>
                  </div>
                  <div className="p-2 rounded neu-well">
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase">EST. COVERAGE</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {component.testSummary?.coverageEstimatePercent || 0}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Suites and Test Cases */}
              {component.testFiles && component.testFiles.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    LINKED TEST SPECIFICATIONS ({component.testFiles.length})
                  </div>
                  {component.testFiles.map((testFile, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl neu-surface hairline-b space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-[var(--text-primary)] truncate" title={testFile.path}>
                          {testFile.path}
                        </span>
                        <span className="pill green text-[10px]">
                          {testFile.testCount} TESTS
                        </span>
                      </div>

                      {/* Suites */}
                      {testFile.suites && testFile.suites.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                          {testFile.suites.map((s, sIdx) => (
                            <span key={sIdx} className="px-1.5 py-0.5 rounded neu-well text-[var(--text-secondary)]">
                              suite: {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Individual Test Cases */}
                      {testFile.testCases && testFile.testCases.length > 0 && (
                        <div className="space-y-1 pt-1 hairline-t">
                          {testFile.testCases.map((tc, tcIdx) => (
                            <div key={tcIdx} className="flex items-center space-x-2 text-[11px] font-mono text-[var(--text-secondary)]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span className="truncate">{tc.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl neu-well text-center space-y-2">
                  <HelpCircle className="w-6 h-6 text-amber-500 mx-auto" />
                  <div className="text-xs font-mono font-bold text-[var(--text-primary)]">
                    NO LINKED TESTS FOUND
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] max-w-md mx-auto">
                    This component currently lacks automated test coverage. Coding agents should generate a unit test file targeting its callable contract methods.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: WASTE & PRUNING ANALYSIS */}
          {activeTab === 'waste' && (
            <div className="space-y-5">
              {/* Cleanliness Telemetry Header */}
              <div className="p-4 rounded-xl neu-surface hairline-b">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 font-mono">
                    <Trash2 className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      CODE WASTE & PRUNING AUDIT
                    </span>
                  </div>
                  <WasteBadge wasteMetrics={component.wasteMetrics} />
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-[var(--text-tertiary)] uppercase font-semibold">CLEANLINESS SCORE</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {component.wasteMetrics?.cleanlinessScore ?? 100}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full neu-well overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        (component.wasteMetrics?.cleanlinessScore ?? 100) >= 90
                          ? 'bg-[#30d158]'
                          : (component.wasteMetrics?.cleanlinessScore ?? 100) >= 70
                          ? 'bg-[#ff9f0a]'
                          : 'bg-[#ff453a]'
                      }`}
                      style={{ width: `${component.wasteMetrics?.cleanlinessScore ?? 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Unused Exports */}
              {component.wasteMetrics && component.wasteMetrics.unusedExports.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-500 flex items-center justify-between">
                    <span>DEAD / UNUSED EXPORTS ({component.wasteMetrics.unusedExports.length})</span>
                    <span>ACTION: PRUNE</span>
                  </div>
                  <div className="space-y-1.5">
                    {component.wasteMetrics.unusedExports.map((sym, sIdx) => (
                      <div
                        key={sIdx}
                        className="p-2.5 rounded-lg neu-well flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <Trash2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-[var(--text-primary)] font-semibold truncate">{sym}</span>
                        </div>
                        <button
                          onClick={() => copyPath(sym.split(':').pop() || sym)}
                          className="action-btn text-[10px] py-0.5 px-1.5"
                          title="Copy symbol identifier"
                        >
                          <Copy className="w-2.5 h-2.5 mr-1" />
                          COPY
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Duplicate Functions */}
              {component.wasteMetrics && component.wasteMetrics.duplicateFunctions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-500 flex items-center justify-between">
                    <span>DUPLICATE IMPLEMENTATIONS ({component.wasteMetrics.duplicateFunctions.length})</span>
                    <span>ACTION: CONSOLIDATE</span>
                  </div>
                  <div className="space-y-1.5">
                    {component.wasteMetrics.duplicateFunctions.map((dup, dIdx) => (
                      <div key={dIdx} className="p-3 rounded-lg neu-well text-xs font-mono space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-[var(--text-primary)]">
                          <span>{dup.name}()</span>
                          <span className="pill amber text-[9px]">100% MATCH</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-tertiary)] font-sans">
                          {dup.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Test Zombies */}
              {component.wasteMetrics && component.wasteMetrics.testZombies.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-500 flex items-center justify-between">
                    <span>TEST ZOMBIES ({component.wasteMetrics.testZombies.length})</span>
                    <span>CALLED ONLY BY TESTS</span>
                  </div>
                  <div className="space-y-1.5">
                    {component.wasteMetrics.testZombies.map((zombie, zIdx) => (
                      <div key={zIdx} className="p-2.5 rounded-lg neu-well text-xs font-mono">
                        <span className="text-[var(--text-primary)] font-semibold">{zombie}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clean Status Banner if zero waste */}
              {(!component.wasteMetrics ||
                (component.wasteMetrics.unusedExports.length === 0 &&
                  component.wasteMetrics.duplicateFunctions.length === 0 &&
                  component.wasteMetrics.testZombies.length === 0)) && (
                <div className="p-6 rounded-xl neu-surface hairline-b text-center space-y-2">
                  <Sparkles className="w-6 h-6 text-emerald-500 mx-auto" />
                  <div className="text-xs font-mono font-bold text-[var(--text-primary)]">
                    CLEAN ARCHITECTURAL SPECIFICATION
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] max-w-sm mx-auto">
                    Zero dead exports, duplicate utility functions, or orphan files detected in this component.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
