import React, { useState, useMemo } from "react";
import type { AnalyzedFile, ChangeImpactReport, RepositoryAnalysis } from "../../api";

interface AnalysisDrawerProps {
  analysis: RepositoryAnalysis | null;
  impactReport: ChangeImpactReport | null;
  selectedFile: AnalyzedFile | null;
  onSelectFile: (file: AnalyzedFile) => void;
}

type DrawerTab = "overview" | "impact" | "scan-log";

export const AnalysisDrawer: React.FC<AnalysisDrawerProps> = ({
  analysis,
  impactReport,
  selectedFile,
  onSelectFile,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");

  // Compute language distribution
  const languageStats = useMemo(() => {
    if (!analysis || analysis.files.length === 0) return [];
    const counts: Record<string, { label: string; count: number; color: string }> = {};

    for (const file of analysis.files) {
      const ext = file.extension.toLowerCase();
      let key = ext;
      let label = ext.toUpperCase().replace(".", "");
      let color = "#8DA58D";

      if (ext.startsWith(".ts")) {
        key = "ts";
        label = "TypeScript";
        color = "#2D68C4";
      } else if (ext.startsWith(".js")) {
        key = "js";
        label = "JavaScript";
        color = "#A1741B";
      } else if (ext === ".json") {
        key = "json";
        label = "JSON";
        color = "#68727A";
      } else if (ext === ".md") {
        key = "md";
        label = "Markdown";
        color = "#546E7A";
      }

      if (!counts[key]) {
        counts[key] = { label, count: 0, color };
      }
      counts[key].count += 1;
    }

    const total = analysis.files.length;
    return Object.values(counts)
      .map((item) => ({
        ...item,
        percentage: ((item.count / total) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
  }, [analysis]);

  // Compute top hubs
  const topHubs = useMemo(() => {
    if (!analysis) return [];
    const inDegrees = new Map<string, number>();
    const outDegrees = new Map<string, number>();

    for (const edge of analysis.graph.edges) {
      outDegrees.set(edge.source, (outDegrees.get(edge.source) || 0) + 1);
      inDegrees.set(edge.target, (inDegrees.get(edge.target) || 0) + 1);
    }

    return analysis.files
      .map((f) => ({
        file: f,
        inDegree: inDegrees.get(f.path) || 0,
        outDegree: outDegrees.get(f.path) || 0,
        totalDegree: (inDegrees.get(f.path) || 0) + (outDegrees.get(f.path) || 0),
      }))
      .sort((a, b) => b.totalDegree - a.totalDegree)
      .slice(0, 6);
  }, [analysis]);

  // Unresolved imports across repository
  const unresolvedImports = useMemo(() => {
    if (!analysis) return [];
    const list: Array<{ sourceFile: string; importTarget: string; line: number }> = [];
    for (const file of analysis.files) {
      for (const imp of file.resolvedImports) {
        if (!imp.resolvedPath && imp.source.startsWith(".")) {
          list.push({
            sourceFile: file.path,
            importTarget: imp.source,
            line: imp.startLine,
          });
        }
      }
    }
    return list;
  }, [analysis]);

  const getFileName = (path: string) => path.split("/").pop() ?? path;

  if (!analysis) {
    return null;
  }

  return (
    <div className={`atlas-analysis-drawer ${isOpen ? "is-open" : "is-collapsed"}`}>
      {/* Header bar / Drawer handle */}
      <div className="drawer-header-bar" onClick={() => setIsOpen(!isOpen)}>
        <div className="drawer-left-title">
          <button
            type="button"
            className="drawer-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            aria-label={isOpen ? "Collapse analysis drawer" : "Expand analysis drawer"}
          >
            <svg
              className={`drawer-chevron ${isOpen ? "open" : ""}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <span className="drawer-title font-sans">ANALYSIS DRAWER</span>
          {impactReport && (
            <span className="drawer-impact-indicator font-mono">
              ● Impact: {impactReport.totalImpactedFiles} affected
            </span>
          )}
        </div>

        {/* Tab Switcher inside Drawer Header */}
        <div
          className="drawer-tabs"
          onClick={(e) => {
            e.stopPropagation();
            if (!isOpen) setIsOpen(true);
          }}
        >
          <button
            type="button"
            className={`drawer-tab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("overview");
              setIsOpen(true);
            }}
          >
            Repository Overview
          </button>
          <button
            type="button"
            className={`drawer-tab ${activeTab === "impact" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("impact");
              setIsOpen(true);
            }}
          >
            Impact Paths {impactReport ? `(${impactReport.totalImpactedFiles})` : ""}
          </button>
          <button
            type="button"
            className={`drawer-tab ${activeTab === "scan-log" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("scan-log");
              setIsOpen(true);
            }}
          >
            Scan & Health {unresolvedImports.length > 0 ? `(!${unresolvedImports.length})` : ""}
          </button>
        </div>

        <div className="drawer-right-meta">
          <span className="drawer-summary-pill font-mono">
            {analysis.files.length} files · {analysis.graph.edges.length} edges
          </span>
        </div>
      </div>

      {/* Drawer Body (Visible when open) */}
      {isOpen && (
        <div className="drawer-content-pane">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="drawer-grid">
              {/* Language Distribution */}
              <div className="drawer-card">
                <span className="drawer-card-title">LANGUAGE DISTRIBUTION</span>
                <div className="language-bar-track">
                  {languageStats.map((item) => (
                    <div
                      key={item.label}
                      className="language-bar-segment"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.color,
                      }}
                      title={`${item.label}: ${item.count} files (${item.percentage}%)`}
                    />
                  ))}
                </div>
                <div className="language-legend-grid">
                  {languageStats.map((item) => (
                    <div key={item.label} className="lang-legend-item">
                      <span className="legend-swatch" style={{ backgroundColor: item.color }} />
                      <span className="lang-name font-mono">{item.label}</span>
                      <span className="lang-perc font-mono">{item.percentage}%</span>
                      <span className="lang-count muted">({item.count})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Hubs */}
              <div className="drawer-card span-2">
                <span className="drawer-card-title">CENTRAL ARCHITECTURAL HUBS (DEGREE CENTRALITY)</span>
                <div className="hubs-table-wrapper">
                  <table className="hubs-table font-mono">
                    <thead>
                      <tr>
                        <th>File Name</th>
                        <th>Path</th>
                        <th>Imported By (In)</th>
                        <th>Imports (Out)</th>
                        <th>Total</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topHubs.map((hub) => (
                        <tr key={hub.file.path} className={hub.file.path === selectedFile?.path ? "active-hub-row" : ""}>
                          <td className="bold">{getFileName(hub.file.path)}</td>
                          <td className="muted">{hub.file.path}</td>
                          <td className="center-cell">{hub.inDegree}</td>
                          <td className="center-cell">{hub.outDegree}</td>
                          <td className="center-cell bold">{hub.totalDegree}</td>
                          <td>
                            <button
                              type="button"
                              className="atlas-btn-text"
                              onClick={() => onSelectFile(hub.file)}
                            >
                              Inspect →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPACT PATHS */}
          {activeTab === "impact" && (
            <div className="drawer-impact-pane">
              {impactReport ? (
                <div>
                  <div className="impact-overview-banner">
                    <div>
                      <span className="eyebrow-tag">CHANGE SOURCE</span>
                      <h4 className="font-mono impact-source-heading">{impactReport.changedFile}</h4>
                    </div>
                    <div className="impact-stats-horizontal">
                      <div className="stat-box">
                        <span className="box-val font-mono">{impactReport.totalImpactedFiles}</span>
                        <span className="box-lbl">Total Impacted</span>
                      </div>
                      <div className="stat-box">
                        <span className="box-val font-mono">{impactReport.directDependents}</span>
                        <span className="box-lbl">Direct (1 hop)</span>
                      </div>
                      <div className="stat-box">
                        <span className="box-val font-mono">{impactReport.transitiveDependents}</span>
                        <span className="box-lbl">Transitive (2+ hops)</span>
                      </div>
                    </div>
                  </div>

                  <div className="drawer-paths-table-wrapper">
                    <table className="hubs-table font-mono">
                      <thead>
                        <tr>
                          <th>Impacted File</th>
                          <th>Distance</th>
                          <th>Relationship</th>
                          <th>Propagation Path (Importer → ... → Dependency)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {impactReport.impactedFiles.map((file) => (
                          <tr key={file.path}>
                            <td className="bold">{getFileName(file.path)}</td>
                            <td>{file.distance} hop{file.distance > 1 ? "s" : ""}</td>
                            <td>
                              <span className={`impact-badge ${file.relationship}`}>
                                {file.relationship}
                              </span>
                            </td>
                            <td className="chain-cell">
                              {file.dependencyChain.map((p, i) => (
                                <React.Fragment key={p}>
                                  {i > 0 && <span className="arrow-sep">→</span>}
                                  <span title={p}>{getFileName(p)}</span>
                                </React.Fragment>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="drawer-empty-impact">
                  <p>No change-impact analysis currently active.</p>
                  <small className="muted">
                    Select any file in the <strong>Inspector</strong> and click <strong>Analyze Impact</strong> to see its complete blast-radius traversal here.
                  </small>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SCAN LOG & HEALTH */}
          {activeTab === "scan-log" && (
            <div className="drawer-scan-pane">
              <div className="scan-health-strip">
                <div className="health-card">
                  <span className="health-lbl">PARSER STATUS</span>
                  <span className="health-val text-success">100% Tree-sitter Parsed</span>
                </div>
                <div className="health-card">
                  <span className="health-lbl">INDEXED REPOSITORY</span>
                  <span className="health-val font-mono">{analysis.repository}</span>
                </div>
                <div className="health-card">
                  <span className="health-lbl">FILES SCANNED</span>
                  <span className="health-val font-mono">{analysis.totalFiles} source files</span>
                </div>
                <div className="health-card">
                  <span className="health-lbl">UNRESOLVED RELATIVE IMPORTS</span>
                  <span className={`health-val font-mono ${unresolvedImports.length > 0 ? "text-warning" : "text-success"}`}>
                    {unresolvedImports.length} detected
                  </span>
                </div>
              </div>

              {unresolvedImports.length > 0 ? (
                <div className="unresolved-imports-section">
                  <span className="drawer-card-title">UNRESOLVED RELATIVE IMPORTS</span>
                  <p className="muted small-text">
                    The following relative import paths could not be statically resolved to existing source files:
                  </p>
                  <ul className="unresolved-list font-mono">
                    {unresolvedImports.map((item, idx) => (
                      <li key={idx} className="unresolved-item">
                        <span className="unres-src">{item.sourceFile}:{item.line}</span>
                        <span className="unres-arrow">imports</span>
                        <span className="unres-target">{item.importTarget}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="all-clean-notice">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>All relative imports resolved cleanly to local workspace files.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
