import React, { useState } from "react";
import type { AnalyzedFile, RepositoryAnalysis } from "../../api";
import { FileTree } from "./FileTree";

interface RepositoryExplorerProps {
  repositoryPath: string;
  onRepositoryPathChange: (path: string) => void;
  onAnalyze: (path: string) => void;
  loading: boolean;
  error: string | null;
  analysis: RepositoryAnalysis | null;
  selectedFile: AnalyzedFile | null;
  onSelectFile: (file: AnalyzedFile) => void;
  impactedPaths: Set<string>;
  changedFilePath: string | null;
}

export const RepositoryExplorer: React.FC<RepositoryExplorerProps> = ({
  repositoryPath,
  onRepositoryPathChange,
  onAnalyze,
  loading,
  error,
  analysis,
  selectedFile,
  onSelectFile,
  impactedPaths,
  changedFilePath,
}) => {
  const [treeSearch, setTreeSearch] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [showTests, setShowTests] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (repositoryPath.trim()) {
      onAnalyze(repositoryPath.trim());
    }
  }

  // Count files by language
  const languageCounts = React.useMemo(() => {
    if (!analysis) return { all: 0, ts: 0, js: 0, json: 0, md: 0 };
    let ts = 0, js = 0, json = 0, md = 0;
    for (const f of analysis.files) {
      const ext = f.extension.toLowerCase();
      if (ext.startsWith(".ts")) ts++;
      else if (ext.startsWith(".js")) js++;
      else if (ext === ".json") json++;
      else if (ext === ".md") md++;
    }
    return { all: analysis.files.length, ts, js, json, md };
  }, [analysis]);

  return (
    <aside className="atlas-sidebar">
      <div className="sidebar-header">
        <span className="eyebrow-tag">EXPLORER</span>
        <h2 className="sidebar-title">Repository rail</h2>
        <p className="sidebar-description">
          Inspect source tree, filter modules, and trace structural dependencies.
        </p>
      </div>

      {/* Analysis trigger form */}
      <form className="analyze-action-card" onSubmit={handleSubmit}>
        <label htmlFor="repo-input" className="form-label">
          TARGET REPOSITORY
        </label>
        <div className="input-with-button">
          <input
            id="repo-input"
            type="text"
            value={repositoryPath}
            onChange={(e) => onRepositoryPathChange(e.target.value)}
            placeholder="e.g. RepoGraph or ."
            className="repo-text-input font-mono"
            disabled={loading}
          />
          <button
            type="submit"
            className="atlas-btn atlas-btn-primary analyze-submit-btn"
            disabled={loading || !repositoryPath.trim()}
          >
            {loading ? (
              <>
                <span className="loading-spinner" />
                <span>Analyzing…</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Analyze</span>
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="atlas-alert error-alert">
          <svg className="alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="alert-content">
            <div className="alert-title">Analysis Failed</div>
            <div className="alert-message">{error}</div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="explorer-content">
          {/* Quick Stats Pill Strip */}
          <div className="explorer-stats-strip">
            <div className="stat-pill">
              <span className="pill-number">{analysis.graph.nodes.length}</span>
              <span className="pill-label">files</span>
            </div>
            <div className="stat-pill">
              <span className="pill-number">{analysis.graph.edges.length}</span>
              <span className="pill-label">edges</span>
            </div>
            <div className="stat-pill">
              <span className="pill-number">
                {analysis.files.reduce((acc, f) => acc + f.symbols.length, 0)}
              </span>
              <span className="pill-label">symbols</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="explorer-filter-bar">
            <div className="tree-search-wrapper">
              <svg className="tree-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder="Filter files & symbols…"
                className="tree-search-input"
              />
              {treeSearch && (
                <button
                  type="button"
                  className="clear-tree-search"
                  onClick={() => setTreeSearch("")}
                  title="Clear filter"
                >
                  ×
                </button>
              )}
            </div>

            {/* Language Filter Chips */}
            <div className="lang-filter-chips">
              <button
                type="button"
                className={`filter-chip ${selectedLanguage === "all" ? "active" : ""}`}
                onClick={() => setSelectedLanguage("all")}
              >
                All ({languageCounts.all})
              </button>
              {languageCounts.ts > 0 && (
                <button
                  type="button"
                  className={`filter-chip ${selectedLanguage === "ts" ? "active" : ""}`}
                  onClick={() => setSelectedLanguage("ts")}
                >
                  TS ({languageCounts.ts})
                </button>
              )}
              {languageCounts.js > 0 && (
                <button
                  type="button"
                  className={`filter-chip ${selectedLanguage === "js" ? "active" : ""}`}
                  onClick={() => setSelectedLanguage("js")}
                >
                  JS ({languageCounts.js})
                </button>
              )}
              {languageCounts.json > 0 && (
                <button
                  type="button"
                  className={`filter-chip ${selectedLanguage === "json" ? "active" : ""}`}
                  onClick={() => setSelectedLanguage("json")}
                >
                  JSON ({languageCounts.json})
                </button>
              )}
            </div>

            {/* Toggle checkboxes */}
            <div className="explorer-toggle-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showTests}
                  onChange={(e) => setShowTests(e.target.checked)}
                />
                <span>Include test files</span>
              </label>
            </div>
          </div>

          {/* Directory Tree */}
          <div className="tree-scroll-pane">
            <FileTree
              files={analysis.files}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              impactedPaths={impactedPaths}
              changedFilePath={changedFilePath}
              searchFilter={treeSearch}
              selectedLanguage={selectedLanguage}
              showTests={showTests}
            />
          </div>
        </div>
      )}

      {!analysis && !loading && !error && (
        <div className="explorer-empty-placeholder">
          <div className="blueprint-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
          <h3>Ready to index</h3>
          <p>
            Enter a repository path above or click <strong>Analyze</strong> to build the live Code Atlas.
          </p>
        </div>
      )}
    </aside>
  );
};
