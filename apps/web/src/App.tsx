import { useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import dagre from "cytoscape-dagre";
import {
  analyzeRepository,
  checkApiHealth,
  type AnalyzedFile,
  type ApiHealth,
  type RepositoryAnalysis,
} from "./api";
import "./App.css";

cytoscape.use(dagre);

const graphLayout = {
  name: "dagre" as const,
  rankDir: "TB" as const,
  ranker: "network-simplex" as const,
  acyclicer: "greedy" as const,
  nodeSep: 55,
  edgeSep: 25,
  rankSep: 90,
  spacingFactor: 1.1,
  nodeDimensionsIncludeLabels: true,
  fit: false,
  padding: 40,
};

function App() {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [repositoryPath, setRepositoryPath] = useState("RepoGraph");
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [selectedFile, setSelectedFile] = useState<AnalyzedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const graphContainer = useRef<HTMLDivElement>(null);
  const graphInstance = useRef<Core | null>(null);

  useEffect(() => {
    let cancelled = false;

    checkApiHealth()
      .then((result) => {
        if (!cancelled) {
          setHealth(result);
          setApiError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setApiError(
            err instanceof Error ? err.message : "Unable to connect to API"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = graphContainer.current;
    if (!container || !analysis) return;

    graphInstance.current?.destroy();

    const graph = cytoscape({
      container,
      elements: [
        ...analysis.graph.nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.path.split("/").pop() ?? node.path,
            path: node.path,
            language: node.language,
          },
        })),
        ...analysis.graph.edges.map((edge, index) => ({
          data: {
            id: `edge-${index}`,
            source: edge.source,
            target: edge.target,
            importSource: edge.importSource,
            startLine: edge.startLine,
          },
        })),
      ],

      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            color: "#dbe4f0",
            "font-size": 11,
            "font-family": "Inter, sans-serif",
            "font-weight": 500,
            "text-wrap": "wrap",
            "text-max-width": "140px",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 10,
            "text-background-color": "#0b0e14",
            "text-background-opacity": 0.9,
            "text-background-padding": "3px",
            "background-color": "#6366f1",
            width: 36,
            height: 36,
            "border-width": 1.5,
            "border-color": "#818cf8",
            "overlay-opacity": 0,
            "min-zoomed-font-size": 8,
          },
        },
        {
          selector: "node:selected",
          style: {
            "background-color": "#a5b4fc",
            "border-color": "#c7d2fe",
            "border-width": 3,
            color: "#ffffff",
            "font-weight": 700,
            "z-index": 10,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#475569",
            "target-arrow-color": "#818cf8",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.9,
            opacity: 0.8,
            "line-cap": "round",
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#818cf8",
            "target-arrow-color": "#a5b4fc",
            width: 2.5,
            opacity: 1,
          },
        },
      ],

      layout: {
        name: "preset",
      },

      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.2,
      selectionType: "single",
    });

    graphInstance.current = graph;

    let layoutComplete = false;

    const resizeObserver = new ResizeObserver(() => {
      if (graph.destroyed()) return;

      graph.resize();

      if (layoutComplete && graph.elements().length > 0) {
        graph.fit(graph.elements(), 40);
      }
    });

    resizeObserver.observe(container);

    graph.on("tap", "node", (event) => {
      const path = event.target.data("path") as string;
      const file = analysis.files.find((item) => item.path === path);
      setSelectedFile(file ?? null);
    });

    graph.on("tap", (event) => {
      if (event.target === graph) {
        setSelectedFile(null);
      }
    });

    const layout = graph.layout({
      ...graphLayout,
      fit: false,
    });

    layout.one("layoutstop", () => {
      layoutComplete = true;
      graph.resize();
      graph.fit(graph.elements(), 40);
    });

    layout.run();

    return () => {
      resizeObserver.disconnect();
      graph.destroy();

      if (graphInstance.current === graph) {
        graphInstance.current = null;
      }
    };
  }, [analysis]);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!repositoryPath.trim()) {
      setError("Enter a repository path.");
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedFile(null);

    try {
      const result = await analyzeRepository(repositoryPath.trim());
      setAnalysis(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Repository analysis failed."
      );
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  const fileName = (filePath: string) =>
    filePath.split("/").pop() ?? filePath;

  function selectFile(file: AnalyzedFile) {
    setSelectedFile(file);

    const graph = graphInstance.current;
    if (!graph) return;

    const node = graph.getElementById(file.path);

    if (node.length > 0) {
      graph.elements().unselect();
      node.select();

      graph.animate(
        {
          center: { eles: node },
          duration: 250,
        },
        { queue: false }
      );
    }
  }

  function rearrangeGraph() {
    const graph = graphInstance.current;
    if (!graph) return;

    const layout = graph.layout({
      ...graphLayout,
      fit: false,
    });

    layout.one("layoutstop", () => {
      graph.resize();
      graph.fit(graph.elements(), 40);
    });

    layout.run();
  }

  function fitGraph() {
    const graph = graphInstance.current;
    if (!graph) return;

    graph.resize();
    graph.fit(graph.elements(), 40);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">R</span>
          <span>RepoGraph</span>
        </a>

        <div className="connection-status">
          <span
            className={`status-dot ${
              health ? "online" : apiError ? "offline" : ""
            }`}
          />
          {health ? "API connected" : apiError ? "API offline" : "Connecting…"}
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <p className="eyebrow">CODE INTELLIGENCE</p>
          <h1>Repository explorer</h1>
          <p className="muted">
            Explore the structure and dependencies of your codebase.
          </p>

          <form className="analyze-form" onSubmit={handleAnalyze}>
            <label htmlFor="repository-path">Repository path</label>
            <input
              id="repository-path"
              value={repositoryPath}
              onChange={(event) => setRepositoryPath(event.target.value)}
              placeholder="e.g. RepoGraph"
            />
            <button type="submit" disabled={loading}>
              {loading ? "Analyzing…" : "Analyze repository"}
            </button>
          </form>

          {error && <p className="error-message">{error}</p>}

          {analysis && (
            <section className="summary">
              <p className="eyebrow">ANALYSIS SUMMARY</p>
              <div className="stat-row">
                <span>Files</span>
                <strong>{analysis.graph.nodes.length}</strong>
              </div>
              <div className="stat-row">
                <span>Dependencies</span>
                <strong>{analysis.graph.edges.length}</strong>
              </div>
            </section>
          )}

          {analysis && (
            <section className="file-list">
              <p className="eyebrow">FILES</p>
              {analysis.files.map((file) => (
                <button
                  className={`file-item ${
                    selectedFile?.path === file.path ? "active" : ""
                  }`}
                  key={file.path}
                  onClick={() => selectFile(file)}
                  type="button"
                  title={file.path}
                >
                  <span className="file-dot" />
                  <span>{file.path}</span>
                </button>
              ))}
            </section>
          )}
        </aside>

        <section className="graph-workspace">
          <div className="panel-header">
            <div>
              <p className="eyebrow">DEPENDENCY MAP</p>
              <h2>{analysis?.repository ?? "No repository loaded"}</h2>
            </div>

            {analysis && (
              <div className="graph-actions">
                <button type="button" onClick={fitGraph}>
                  Fit graph
                </button>
                <button type="button" onClick={rearrangeGraph}>
                  Rearrange
                </button>
              </div>
            )}
          </div>

          <div className="graph-canvas" ref={graphContainer}>
            {!analysis && !loading && (
              <div className="empty-state">
                <div className="empty-icon">⌘</div>
                <h3>Your codebase, mapped.</h3>
                <p>
                  Enter a repository path and analyze it to explore real
                  dependencies.
                </p>
              </div>
            )}

            {loading && (
              <div className="canvas-message">Analyzing repository…</div>
            )}
          </div>

          <footer className="graph-footer">
            <span>
              {analysis
                ? `${analysis.graph.nodes.length} nodes · ${analysis.graph.edges.length} edges`
                : "Waiting for repository analysis"}
            </span>
            <span>Scroll to zoom · Drag to pan · Click a node to inspect</span>
          </footer>
        </section>

        <aside className="details-panel">
          <p className="eyebrow">INSPECTOR</p>
          <h2>{selectedFile ? fileName(selectedFile.path) : "File details"}</h2>

          {selectedFile ? (
            <>
              <p className="file-path">{selectedFile.path}</p>

              <div className="detail-section">
                <span className="detail-label">Language</span>
                <strong>{selectedFile.language}</strong>
              </div>

              <div className="detail-section">
                <span className="detail-label">Symbols</span>
                <strong>{selectedFile.symbols.length}</strong>
                {selectedFile.symbols.length > 0 && (
                  <ul className="detail-list">
                    {selectedFile.symbols.map((symbol, index) => (
                      <li key={`${symbol.name}-${index}`}>
                        <span>{symbol.name}</span>
                        <small>{symbol.kind}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="detail-section">
                <span className="detail-label">Imports</span>
                <strong>{selectedFile.imports.length}</strong>
                {selectedFile.imports.length > 0 && (
                  <ul className="detail-list">
                    {selectedFile.imports.map((item, index) => (
                      <li key={`${item.source}-${index}`}>
                        <span>{item.source}</span>
                        <small>:{item.startLine}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="detail-section">
                <span className="detail-label">Local dependencies</span>
                <strong>{selectedFile.dependencies.length}</strong>
                {selectedFile.dependencies.length > 0 && (
                  <ul className="detail-list">
                    {selectedFile.dependencies.map((dependency) => (
                      <li key={dependency}>
                        <span>{fileName(dependency)}</span>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            const file = analysis?.files.find(
                              (item) => item.path === dependency
                            );

                            if (file) selectFile(file);
                          }}
                        >
                          Open
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <p>
                Select a node in the graph or a file in the sidebar to inspect
                it.
              </p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

export default App;