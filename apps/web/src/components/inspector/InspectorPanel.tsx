import React, { useState, useMemo } from "react";
import type {
  AnalyzedFile,
  ChangeImpactReport,
  ImpactedFile,
  RepositoryAnalysis,
} from "../../api";
import { SourcePreviewModal } from "./SourcePreviewModal";

interface InspectorPanelProps {
  analysis: RepositoryAnalysis | null;
  selectedFile: AnalyzedFile | null;
  onSelectFile: (file: AnalyzedFile | null) => void;
  impactReport: ChangeImpactReport | null;
  impactLoading: boolean;
  impactError: string | null;
  onAnalyzeImpact: () => void;
  onInspectImpactedFile: (item: ImpactedFile) => void;
}

type InspectorTab = "overview" | "symbols" | "dependencies" | "dependents" | "impact";

function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/").toLowerCase();
  const base = norm.split("/").pop() ?? norm;
  return (
    /\.(test|spec)\.[^.]+$/i.test(base) ||
    /(^|\/)(__tests__|tests?)(\/|$)/i.test(norm)
  );
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  analysis,
  selectedFile,
  onSelectFile,
  impactReport,
  impactLoading,
  impactError,
  onAnalyzeImpact,
  onInspectImpactedFile,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [selectedImpactFile, setSelectedImpactFile] = useState<ImpactedFile | null>(null);

  // Compute incoming dependents for selected file from graph edges
  const dependents = useMemo(() => {
    if (!analysis || !selectedFile) return [];
    const incomingSources = new Set<string>();
    for (const edge of analysis.graph.edges) {
      if (edge.target === selectedFile.path) {
        incomingSources.add(edge.source);
      }
    }
    return Array.from(incomingSources)
      .map((srcPath) => analysis.files.find((f) => f.path === srcPath))
      .filter((f): f is AnalyzedFile => Boolean(f));
  }, [analysis, selectedFile]);

  // Top connected hub files across the entire repository
  const topHubFiles = useMemo(() => {
    if (!analysis) return [];
    const degrees = new Map<string, number>();
    for (const edge of analysis.graph.edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    }
    return Array.from(degrees.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([filePath, count]) => {
        const fileObj = analysis.files.find((f) => f.path === filePath);
        return {
          path: filePath,
          file: fileObj,
          connections: count,
        };
      });
  }, [analysis]);

  function handleCopyPath() {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  }

  const getFileName = (path: string) => path.split("/").pop() ?? path;

  // Render Repository Overview when no file is selected
  if (!selectedFile) {
    return (
      <aside className="atlas-inspector-panel">
        <div className="inspector-header">
          <span className="eyebrow-tag">ARCHITECTURAL OVERVIEW</span>
          <h2 className="inspector-title font-serif">Repository Blueprint</h2>
          <p className="inspector-subtitle">
            {analysis
              ? `Structural summary of ${analysis.repository}`
              : "No repository currently loaded"}
          </p>
        </div>

        {analysis ? (
          <div className="inspector-body">
            <div className="overview-stats-grid">
              <div className="overview-stat-card">
                <span className="stat-card-label">TOTAL FILES</span>
                <span className="stat-card-value font-mono">{analysis.totalFiles}</span>
              </div>
              <div className="overview-stat-card">
                <span className="stat-card-label">DEPENDENCIES</span>
                <span className="stat-card-value font-mono">{analysis.graph.edges.length}</span>
              </div>
              <div className="overview-stat-card">
                <span className="stat-card-label">AST SYMBOLS</span>
                <span className="stat-card-value font-mono">
                  {analysis.files.reduce((sum, f) => sum + f.symbols.length, 0)}
                </span>
              </div>
              <div className="overview-stat-card">
                <span className="stat-card-label">GRAPH DENSITY</span>
                <span className="stat-card-value font-mono">
                  {analysis.totalFiles > 1
                    ? (
                        analysis.graph.edges.length /
                        (analysis.totalFiles * (analysis.totalFiles - 1))
                      ).toFixed(3)
                    : "0.000"}
                </span>
              </div>
            </div>

            {/* Most Connected Hubs */}
            <div className="inspector-section">
              <span className="section-heading">MOST CONNECTED FILES (HUBS)</span>
              <ul className="hub-file-list">
                {topHubFiles.map((hub) => (
                  <li key={hub.path} className="hub-file-item">
                    <button
                      type="button"
                      className="hub-file-btn"
                      onClick={() => hub.file && onSelectFile(hub.file)}
                    >
                      <div className="hub-info">
                        <span className="hub-name font-mono">{getFileName(hub.path)}</span>
                        <span className="hub-path font-mono">{hub.path}</span>
                      </div>
                      <span className="hub-badge" title={`${hub.connections} combined in/out dependencies`}>
                        {hub.connections} edges
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="inspector-tip-card">
              <span className="tip-tag">INTERACTIVE ATLAS</span>
              <p>
                Click any file in the <strong>Repository rail</strong> or any node on the{" "}
                <strong>Dependency Atlas</strong> to view extracted symbols, incoming dependents,
                outgoing dependencies, or trace change impact.
              </p>
            </div>
          </div>
        ) : (
          <div className="inspector-empty-state">
            <div className="empty-symbol-icon">⬚</div>
            <h3>No file selected</h3>
            <p>Select any node in the graph or file in the rail to inspect its code intelligence.</p>
          </div>
        )}
      </aside>
    );
  }

  // File is selected
  const hasImpactForThisFile = impactReport && impactReport.changedFile === selectedFile.path;

  return (
    <aside className="atlas-inspector-panel">
      {/* File Header */}
      <div className="inspector-header">
        <div className="file-header-top">
          <span className="eyebrow-tag">FILE INSPECTOR</span>
          <span className="lang-tag font-mono">{selectedFile.language}</span>
        </div>
        <h2 className="inspector-title font-mono">{getFileName(selectedFile.path)}</h2>

        <div className="file-path-strip">
          <span className="file-path-text font-mono" title={selectedFile.path}>
            {selectedFile.path}
          </span>
          <button
            type="button"
            className="copy-path-btn"
            onClick={handleCopyPath}
            title="Copy path to clipboard"
          >
            {copiedPath ? (
              <span className="copied-tag">Copied</span>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Quick Actions Strip */}
      <div className="inspector-action-bar">
        <button
          type="button"
          className="atlas-btn atlas-btn-impact"
          onClick={onAnalyzeImpact}
          disabled={impactLoading}
        >
          {impactLoading ? (
            <>
              <span className="loading-spinner" />
              <span>Analyzing…</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>Analyze Impact</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="atlas-btn atlas-btn-secondary"
          onClick={() => setIsSourceModalOpen(true)}
          title="View raw source file with line numbers"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span>View Source</span>
        </button>
      </div>

      {impactError && (
        <div className="atlas-alert error-alert compact">
          <span>{impactError}</span>
        </div>
      )}

      {/* Inspector Navigation Tabs */}
      <div className="inspector-nav-tabs">
        <button
          type="button"
          className={`inspector-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={`inspector-tab ${activeTab === "symbols" ? "active" : ""}`}
          onClick={() => setActiveTab("symbols")}
        >
          Symbols ({selectedFile.symbols.length})
        </button>
        <button
          type="button"
          className={`inspector-tab ${activeTab === "dependencies" ? "active" : ""}`}
          onClick={() => setActiveTab("dependencies")}
        >
          Deps ({selectedFile.dependencies.length})
        </button>
        <button
          type="button"
          className={`inspector-tab ${activeTab === "dependents" ? "active" : ""}`}
          onClick={() => setActiveTab("dependents")}
        >
          Dependents ({dependents.length})
        </button>
        {hasImpactForThisFile && (
          <button
            type="button"
            className={`inspector-tab tab-impact ${activeTab === "impact" ? "active" : ""}`}
            onClick={() => setActiveTab("impact")}
          >
            Impact ({impactReport.totalImpactedFiles})
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div className="inspector-body">
        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="tab-pane">
            <div className="overview-stats-grid">
              <div className="overview-stat-card">
                <span className="stat-card-label">SYMBOLS</span>
                <span className="stat-card-value font-mono">{selectedFile.symbols.length}</span>
              </div>
              <div className="overview-stat-card">
                <span className="stat-card-label">IMPORTS</span>
                <span className="stat-card-value font-mono">{selectedFile.imports.length}</span>
              </div>
              <div className="overview-stat-card">
                <span className="stat-card-label">LOCAL DEPS</span>
                <span className="stat-card-value font-mono">{selectedFile.dependencies.length}</span>
              </div>
              <div className="overview-stat-card">
                <span className="stat-card-label">DEPENDENTS</span>
                <span className="stat-card-value font-mono">{dependents.length}</span>
              </div>
            </div>

            <div className="inspector-section">
              <span className="section-heading">FILE DETAILS</span>
              <div className="property-row">
                <span className="prop-name">Extension</span>
                <span className="prop-value font-mono">{selectedFile.extension}</span>
              </div>
              <div className="property-row">
                <span className="prop-name">Language Parser</span>
                <span className="prop-value">{selectedFile.language} (Tree-sitter)</span>
              </div>
              <div className="property-row">
                <span className="prop-name">Is Test File</span>
                <span className="prop-value">{isTestFile(selectedFile.path) ? "Yes" : "No"}</span>
              </div>
            </div>

            {hasImpactForThisFile && (
              <div className="impact-summary-box">
                <div className="impact-box-header">
                  <span className="impact-box-title">Change Impact Detected</span>
                  <span className="impact-box-count">{impactReport.totalImpactedFiles} files affected</span>
                </div>
                <p className="impact-box-desc">
                  Changes to this file statically propagate to {impactReport.directDependents} direct and{" "}
                  {impactReport.transitiveDependents} transitive dependents.
                </p>
                <button
                  type="button"
                  className="atlas-btn atlas-btn-secondary view-impact-btn"
                  onClick={() => setActiveTab("impact")}
                >
                  View Impact Report →
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SYMBOLS */}
        {activeTab === "symbols" && (
          <div className="tab-pane">
            {selectedFile.symbols.length === 0 ? (
              <p className="muted empty-tab-text">No top-level exported symbols discovered in this file.</p>
            ) : (
              <ul className="symbols-list">
                {selectedFile.symbols.map((sym, idx) => (
                  <li key={`${sym.name}-${idx}`} className="symbol-item">
                    <div className="symbol-info">
                      <span className="symbol-kind-tag" data-kind={sym.kind}>
                        {sym.kind}
                      </span>
                      <span className="symbol-name font-mono">{sym.name}</span>
                    </div>
                    <span className="symbol-lines font-mono" title={`Lines ${sym.startLine} to ${sym.endLine}`}>
                      :{sym.startLine}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* TAB 3: DEPENDENCIES (Outgoing) */}
        {activeTab === "dependencies" && (
          <div className="tab-pane">
            {selectedFile.dependencies.length === 0 ? (
              <p className="muted empty-tab-text">This file has no local repository dependencies.</p>
            ) : (
              <ul className="deps-list">
                {selectedFile.dependencies.map((depPath) => {
                  const targetFile = analysis?.files.find((f) => f.path === depPath);
                  return (
                    <li key={depPath} className="dep-item">
                      <div className="dep-info">
                        <span className="dep-name font-mono">{getFileName(depPath)}</span>
                        <span className="dep-path font-mono">{depPath}</span>
                      </div>
                      {targetFile && (
                        <button
                          type="button"
                          className="atlas-btn-text"
                          onClick={() => onSelectFile(targetFile)}
                          title="Jump to this dependency in the atlas"
                        >
                          Jump →
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* TAB 4: DEPENDENTS (Incoming) */}
        {activeTab === "dependents" && (
          <div className="tab-pane">
            {dependents.length === 0 ? (
              <p className="muted empty-tab-text">No other files in this repository import this file.</p>
            ) : (
              <ul className="deps-list">
                {dependents.map((depFile) => (
                  <li key={depFile.path} className="dep-item">
                    <div className="dep-info">
                      <span className="dep-name font-mono">{getFileName(depFile.path)}</span>
                      <span className="dep-path font-mono">{depFile.path}</span>
                    </div>
                    <button
                      type="button"
                      className="atlas-btn-text"
                      onClick={() => onSelectFile(depFile)}
                      title="Jump to this dependent in the atlas"
                    >
                      Jump →
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* TAB 5: IMPACT REPORT */}
        {activeTab === "impact" && hasImpactForThisFile && (
          <div className="tab-pane impact-report-pane">
            <div className="impact-stat-bar">
              <div className="impact-stat">
                <span className="stat-val">{impactReport.totalImpactedFiles}</span>
                <span className="stat-lbl">Total Affected</span>
              </div>
              <div className="impact-stat">
                <span className="stat-val">{impactReport.directDependents}</span>
                <span className="stat-lbl">Direct (1 hop)</span>
              </div>
              <div className="impact-stat">
                <span className="stat-val">{impactReport.transitiveDependents}</span>
                <span className="stat-lbl">Transitive</span>
              </div>
            </div>

            {/* Selected Impact File Chain Details */}
            {selectedImpactFile && (
              <div className="impact-chain-card">
                <div className="chain-card-header">
                  <span className="chain-title">Traversed Path Detail</span>
                  <button
                    type="button"
                    className="close-chain-btn"
                    onClick={() => setSelectedImpactFile(null)}
                  >
                    ×
                  </button>
                </div>
                <div className="chain-path-line font-mono">{selectedImpactFile.path}</div>
                <div className="chain-meta-row">
                  <span>Relationship: <strong>{selectedImpactFile.relationship}</strong></span>
                  <span>Distance: <strong>{selectedImpactFile.distance} hops</strong></span>
                </div>
                <div className="chain-breadcrumb">
                  {selectedImpactFile.dependencyChain.map((p, i) => (
                    <React.Fragment key={p}>
                      {i > 0 && <span className="chain-arrow">→</span>}
                      <span className="chain-step font-mono" title={p}>
                        {getFileName(p)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Impacted Source Files */}
            <div className="inspector-section">
              <span className="section-heading">POTENTIALLY AFFECTED SOURCE FILES</span>
              {impactReport.impactedFiles.filter((item) => !isTestFile(item.path)).length === 0 ? (
                <p className="muted empty-tab-text">No non-test source files were identified.</p>
              ) : (
                <ul className="impacted-list">
                  {impactReport.impactedFiles
                    .filter((item) => !isTestFile(item.path))
                    .map((item) => {
                      const fileObj = analysis?.files.find((f) => f.path === item.path);
                      return (
                        <li key={item.path} className="impacted-item">
                          <div className="impacted-item-info">
                            <span className="impacted-name font-mono">{getFileName(item.path)}</span>
                            <div className="impacted-meta">
                              <span className={`impact-badge ${item.relationship}`}>
                                {item.relationship} · {item.distance} hop{item.distance > 1 ? "s" : ""}
                              </span>
                              <span className="impact-chain-preview font-mono" title={item.dependencyChain.join(" → ")}>
                                {item.dependencyChain.map(getFileName).join(" → ")}
                              </span>
                            </div>
                          </div>
                          <div className="impacted-item-actions">
                            <button
                              type="button"
                              className="atlas-btn-text"
                              onClick={() => {
                                setSelectedImpactFile(item);
                                onInspectImpactedFile(item);
                              }}
                            >
                              Trace
                            </button>
                            {fileObj && (
                              <button
                                type="button"
                                className="atlas-btn-text"
                                onClick={() => onSelectFile(fileObj)}
                              >
                                View
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>

            {/* Impacted Test Files */}
            <div className="inspector-section">
              <span className="section-heading">POTENTIALLY AFFECTED TESTS</span>
              {impactReport.impactedFiles.filter((item) => isTestFile(item.path)).length === 0 ? (
                <p className="muted empty-tab-text">No test files detected in the impact set.</p>
              ) : (
                <ul className="impacted-list">
                  {impactReport.impactedFiles
                    .filter((item) => isTestFile(item.path))
                    .map((item) => (
                      <li key={item.path} className="impacted-item test-impact-item">
                        <div className="impacted-item-info">
                          <span className="impacted-name font-mono">{getFileName(item.path)}</span>
                          <span className="impact-badge test-badge">Test · {item.distance} hops</span>
                        </div>
                        <button
                          type="button"
                          className="atlas-btn-text"
                          onClick={() => {
                            setSelectedImpactFile(item);
                            onInspectImpactedFile(item);
                          }}
                        >
                          Trace
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <p className="impact-disclaimer">
              Impacted files are statically traced via import declarations. This identifies potential
              reachability, not guaranteed runtime breakage.
            </p>
          </div>
        )}
      </div>

      {/* Real Source Code Preview Modal */}
      {isSourceModalOpen && (
        <SourcePreviewModal
          repositoryName={analysis?.repository ?? "RepoGraph"}
          filePath={selectedFile.path}
          onClose={() => setIsSourceModalOpen(false)}
        />
      )}
    </aside>
  );
};
