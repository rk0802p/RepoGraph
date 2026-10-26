import React, { useEffect, useRef, useState } from "react";
import cytoscape, { type Core, type LayoutOptions } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { AnalyzedFile, ChangeImpactReport, DependencyGraph } from "../../api";

cytoscape.use(dagre);

interface DependencyAtlasProps {
  graphData: DependencyGraph | null;
  files: AnalyzedFile[];
  repositoryName: string;
  selectedFile: AnalyzedFile | null;
  onSelectFile: (file: AnalyzedFile | null) => void;
  impactReport: ChangeImpactReport | null;
  onClearImpact: () => void;
  loading: boolean;
  globalSearchQuery?: string;
}

export const DependencyAtlas: React.FC<DependencyAtlasProps> = ({
  graphData,
  files,
  repositoryName,
  selectedFile,
  onSelectFile,
  impactReport,
  onClearImpact,
  loading,
  globalSearchQuery = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [layoutName, setLayoutName] = useState<"dagre" | "concentric" | "cose">("dagre");
  const [viewMode, setViewMode] = useState<"map" | "symbols" | "imports">("map");
  const [zoomLevel, setZoomLevel] = useState(100);

  // Layout configurations
  const getLayoutConfig = (name: "dagre" | "concentric" | "cose"): LayoutOptions => {
    switch (name) {
      case "dagre":
        return {
          name: "dagre",
          rankDir: "TB",
          ranker: "network-simplex",
          acyclicer: "greedy",
          nodeSep: 60,
          edgeSep: 30,
          rankSep: 95,
          spacingFactor: 1.15,
          nodeDimensionsIncludeLabels: true,
          padding: 40,
        } as unknown as LayoutOptions;
      case "concentric":
        return {
          name: "concentric" as const,
          concentric: (node: cytoscape.NodeSingular) => node.degree(),
          levelWidth: () => 2,
          padding: 40,
          nodeDimensionsIncludeLabels: true,
        };
      case "cose":
        return {
          name: "cose" as const,
          idealEdgeLength: () => 100,
          nodeOverlap: 20,
          refresh: 20,
          fit: true,
          padding: 40,
          randomize: false,
          componentSpacing: 100,
          nodeRepulsion: () => 400000,
          edgeElasticity: () => 100,
          nestingFactor: 5,
        };
    }
  };

  // Node label formatter
  const getFileBaseName = (path: string) => path.split("/").pop() ?? path;

  // Initialize and update Cytoscape graph
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !graphData || graphData.nodes.length === 0) return;

    cyRef.current?.destroy();

    const elements: cytoscape.ElementDefinition[] = [
      ...graphData.nodes.map((node) => {
        const fileObj = files.find((f) => f.path === node.path);
        const symbolCount = fileObj?.symbols.length ?? 0;
        const baseName = getFileBaseName(node.path);
        const ext = node.extension.toLowerCase();
        let langColor = "#2D68C4"; // TS default
        if (ext.startsWith(".js")) langColor = "#A1741B";
        else if (ext === ".json") langColor = "#68727A";
        else if (ext === ".md") langColor = "#546E7A";

        return {
          data: {
            id: node.id,
            label: baseName,
            fullPath: node.path,
            language: node.language,
            extension: node.extension,
            symbolCount,
            langColor,
          },
        };
      }),
      ...graphData.edges.map((edge, idx) => ({
        data: {
          id: `edge-${idx}`,
          source: edge.source,
          target: edge.target,
          importSource: edge.importSource,
          startLine: edge.startLine,
        },
      })),
    ];

    const cy = cytoscape({
      container,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            color: "#202923",
            "font-size": 11,
            "font-family": "Plus Jakarta Sans, sans-serif",
            "font-weight": 600,
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 8,
            "text-background-color": "#FBF9F3",
            "text-background-opacity": 0.95,
            "text-background-padding": "3px",
            "text-background-shape": "roundrectangle",
            "background-color": "#FBF9F3",
            width: 44,
            height: 44,
            "border-width": 2,
            "border-color": "#DCD9CE",
            "overlay-opacity": 0,
            "min-zoomed-font-size": 8,
          },
        },
        {
          selector: "node:selected",
          style: {
            "background-color": "#EBF3EF",
            "border-color": "#175B45",
            "border-width": 3.5,
            color: "#175B45",
            "font-weight": 700,
            "z-index": 10,
          },
        },
        {
          selector: "node.neighbor-connected",
          style: {
            "border-color": "#175B45",
            "border-width": 2.5,
            "background-color": "#F1F5F1",
            "z-index": 5,
          },
        },
        {
          selector: "node.dimmed",
          style: {
            opacity: 0.2,
            "text-opacity": 0.25,
          },
        },
        {
          selector: "node.impact-changed",
          style: {
            "background-color": "#FDF1EB",
            "border-color": "#E66A3C",
            "border-width": 4,
            width: 52,
            height: 52,
            color: "#BD4A20",
            "font-weight": 700,
            opacity: 1,
            "text-opacity": 1,
            "z-index": 20,
          },
        },
        {
          selector: "node.impact-direct",
          style: {
            "background-color": "#FEF3EB",
            "border-color": "#E66A3C",
            "border-width": 3,
            color: "#E66A3C",
            "font-weight": 600,
            opacity: 1,
            "text-opacity": 1,
            "z-index": 15,
          },
        },
        {
          selector: "node.impact-transitive",
          style: {
            "background-color": "#FFF9F5",
            "border-color": "#F97316",
            "border-width": 2.5,
            color: "#C2410C",
            opacity: 1,
            "text-opacity": 1,
            "z-index": 12,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#9BA39B",
            "target-arrow-color": "#8DA58D",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.85,
            opacity: 0.75,
            "line-cap": "round",
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#175B45",
            "target-arrow-color": "#175B45",
            width: 2.5,
            opacity: 1,
          },
        },
        {
          selector: "edge.edge-connected",
          style: {
            "line-color": "#175B45",
            "target-arrow-color": "#175B45",
            width: 2.5,
            opacity: 1,
          },
        },
        {
          selector: "edge.dimmed",
          style: {
            opacity: 0.1,
          },
        },
        {
          selector: "edge.impact-path",
          style: {
            "line-color": "#E66A3C",
            "target-arrow-color": "#E66A3C",
            width: 3.5,
            opacity: 1,
            "arrow-scale": 1.25,
            "z-index": 15,
          },
        },
      ],
      minZoom: 0.15,
      maxZoom: 3.5,
      wheelSensitivity: 0.25,
      selectionType: "single",
    });

    cyRef.current = cy;

    // Track zoom percentage
    cy.on("zoom", () => {
      setZoomLevel(Math.round(cy.zoom() * 100));
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (cy.destroyed()) return;
      cy.resize();
    });
    resizeObserver.observe(container);

    // Node selection
    cy.on("tap", "node", (evt) => {
      const fullPath = evt.target.data("fullPath") as string;
      const file = files.find((f) => f.path === fullPath);
      onSelectFile(file ?? null);
    });

    // Background tap
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        onSelectFile(null);
      }
    });

    // Initial layout execution
    const layout = cy.layout(getLayoutConfig(layoutName));
    layout.one("layoutstop", () => {
      if (!cy.destroyed()) {
        cy.resize();
        cy.fit(cy.elements(), 40);
      }
    });
    layout.run();

    return () => {
      resizeObserver.disconnect();
      cy.destroy();
      if (cyRef.current === cy) {
        cyRef.current = null;
      }
    };
  }, [graphData, layoutName]);

  // Handle Impact Highlighting & Selection Highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    const allNodes = cy.nodes();
    const allEdges = cy.edges();

    // Reset classes
    allNodes.removeClass("dimmed impact-changed impact-direct impact-transitive neighbor-connected");
    allEdges.removeClass("dimmed impact-path edge-connected");

    // Case 1: Impact Report Active
    if (impactReport) {
      allNodes.addClass("dimmed");
      allEdges.addClass("dimmed");

      const changedNode = cy.getElementById(impactReport.changedFile);
      if (changedNode.length > 0) {
        changedNode.removeClass("dimmed").addClass("impact-changed");
      }

      for (const impacted of impactReport.impactedFiles) {
        const node = cy.getElementById(impacted.path);
        if (node.length > 0) {
          node.removeClass("dimmed");
          if (impacted.relationship === "direct") {
            node.addClass("impact-direct");
          } else {
            node.addClass("impact-transitive");
          }
        }
      }

      // Highlight edges in dependency chains
      const pathEdgeKeys = new Set<string>();
      for (const item of impactReport.impactedFiles) {
        const chain = item.dependencyChain;
        for (let i = 0; i < chain.length - 1; i++) {
          const dep = chain[i];
          const importer = chain[i + 1];
          if (dep && importer) {
            pathEdgeKeys.add(`${importer}\u0000${dep}`);
          }
        }
      }

      allEdges.forEach((edge) => {
        const key = `${edge.data("source")}\u0000${edge.data("target")}`;
        if (pathEdgeKeys.has(key)) {
          edge.removeClass("dimmed").addClass("impact-path");
        }
      });

      return;
    }

    // Case 2: Selected File (Connected Neighbors Highlighting)
    if (selectedFile) {
      const selectedNode = cy.getElementById(selectedFile.path);
      if (selectedNode.length > 0) {
        cy.elements().unselect();
        selectedNode.select();

        const neighborhood = selectedNode.neighborhood();
        allNodes.addClass("dimmed");
        allEdges.addClass("dimmed");

        selectedNode.removeClass("dimmed");
        neighborhood.nodes().removeClass("dimmed").addClass("neighbor-connected");
        neighborhood.edges().removeClass("dimmed").addClass("edge-connected");
      }
    }
  }, [impactReport, selectedFile]);

  // Synchronize with external selectedFile change (center animation)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !selectedFile) return;

    const node = cy.getElementById(selectedFile.path);
    if (node.length > 0) {
      cy.animate(
        {
          center: { eles: node },
          zoom: Math.max(cy.zoom(), 0.95),
          duration: 300,
        },
        { queue: false }
      );
    }
  }, [selectedFile]);

  // Handle Global Search filtering/focus
  const activeSearch = globalSearchQuery.trim();
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !activeSearch) return;

    const query = activeSearch.toLowerCase();
    const matchingNode = cy.nodes().filter((node) => {
      const path = (node.data("fullPath") as string).toLowerCase();
      const label = (node.data("label") as string).toLowerCase();
      return path.includes(query) || label.includes(query);
    }).first();

    if (matchingNode.length > 0) {
      cy.animate(
        {
          center: { eles: matchingNode },
          zoom: 1.2,
          duration: 350,
        },
        { queue: false }
      );
    }
  }, [activeSearch]);

  // Graph control actions
  function handleFit() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(cy.elements(), 40);
  }

  function handleZoomIn() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * 1.25,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }

  function handleZoomOut() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * 0.8,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }

  function handleResetLayout() {
    const cy = cyRef.current;
    if (!cy) return;
    const layout = cy.layout(getLayoutConfig(layoutName));
    layout.one("layoutstop", () => {
      cy.fit(cy.elements(), 40);
    });
    layout.run();
  }

  return (
    <section className="atlas-graph-workspace">
      {/* Top Editorial Graph Header & Toolbar */}
      <div className="atlas-graph-header">
        <div className="graph-title-block">
          <span className="eyebrow-tag">DEPENDENCY MAP</span>
          <h1 className="atlas-editorial-title font-serif">
            See how your code connects.
          </h1>
          <p className="graph-subtitle">
            {graphData
              ? `Interactive dependency atlas for ${repositoryName} · ${graphData.nodes.length} source files · ${graphData.edges.length} directed relationships`
              : "Waiting for repository analysis"}
          </p>
        </div>

        {graphData && (
          <div className="graph-toolbar-actions">
            {/* View Mode Selector */}
            <div className="view-mode-tabs">
              <button
                type="button"
                className={`mode-tab ${viewMode === "map" ? "active" : ""}`}
                onClick={() => setViewMode("map")}
              >
                Map
              </button>
              <button
                type="button"
                className={`mode-tab ${viewMode === "symbols" ? "active" : ""}`}
                onClick={() => setViewMode("symbols")}
                title="Focus files with exported symbols"
              >
                Symbols
              </button>
              <button
                type="button"
                className={`mode-tab ${viewMode === "imports" ? "active" : ""}`}
                onClick={() => setViewMode("imports")}
                title="Focus dependency connections"
              >
                Imports
              </button>
            </div>

            {/* Layout Selector */}
            <div className="layout-select-wrapper">
              <select
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value as "dagre" | "concentric" | "cose")}
                className="layout-select"
                title="Change graph layout algorithm"
              >
                <option value="dagre">Hierarchical (Dagre)</option>
                <option value="concentric">Concentric (Degree)</option>
                <option value="cose">Force-directed (COSE)</option>
              </select>
            </div>

            {/* Clear Highlights button */}
            {impactReport && (
              <button
                type="button"
                className="atlas-btn atlas-btn-impact-clear"
                onClick={onClearImpact}
              >
                Clear Highlights
              </button>
            )}

            <button
              type="button"
              className="atlas-btn atlas-btn-secondary"
              onClick={handleResetLayout}
              title="Re-run layout calculation"
            >
              Rearrange
            </button>

            <button
              type="button"
              className="atlas-btn atlas-btn-secondary"
              onClick={handleFit}
              title="Fit map to viewport"
            >
              Fit Map
            </button>
          </div>
        )}
      </div>

      {/* Main Canvas Area */}
      <div className="atlas-canvas-container">
        <div className="cytoscape-element" ref={containerRef} />

        {/* Empty State */}
        {!graphData && !loading && (
          <div className="atlas-empty-canvas">
            <div className="empty-atlas-compass">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            </div>
            <h2 className="empty-title font-serif">Your codebase, mapped as an atlas.</h2>
            <p className="empty-description">
              Select a repository from the top rail or enter a local folder path, then click <strong>Analyze</strong> to explore AST symbols, dependency chains, and change impact.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="atlas-loading-overlay">
            <div className="loading-card">
              <span className="atlas-spinner-large" />
              <h3>Analyzing repository structure…</h3>
              <p>Scanning files, parsing AST symbols, and building dependency graph.</p>
            </div>
          </div>
        )}

        {/* Floating Zoom Controls */}
        {graphData && (
          <div className="atlas-floating-zoom-controls">
            <button type="button" className="zoom-btn" onClick={handleZoomIn} title="Zoom in">
              +
            </button>
            <span className="zoom-level-indicator font-mono">{zoomLevel}%</span>
            <button type="button" className="zoom-btn" onClick={handleZoomOut} title="Zoom out">
              −
            </button>
            <button type="button" className="zoom-btn fit-btn" onClick={handleFit} title="Fit to screen">
              ⛶
            </button>
          </div>
        )}

        {/* Floating Interactive Legend */}
        {graphData && (
          <div className="atlas-floating-legend">
            <div className="legend-items">
              <span className="legend-chip">
                <span className="legend-dot normal" /> Source Node
              </span>
              <span className="legend-chip">
                <span className="legend-dot selected-dot" /> Selected
              </span>
              <span className="legend-chip">
                <span className="legend-dot impact-root" /> Root Change
              </span>
              <span className="legend-chip">
                <span className="legend-dot impact-dep" /> Dependent
              </span>
              <span className="legend-chip">
                <span className="legend-arrow default-edge">→</span> Import
              </span>
              {impactReport && (
                <span className="legend-chip">
                  <span className="legend-arrow impact-edge">⇢</span> Impact Path
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Canvas Status Footer */}
      <footer className="atlas-graph-footer">
        <div className="footer-left">
          <span>
            {graphData
              ? `${graphData.nodes.length} files · ${graphData.edges.length} edges · Layout: ${layoutName}`
              : "Awaiting analysis"}
          </span>
        </div>
        <div className="footer-right">
          <span className="hint-text">Scroll to zoom · Drag to pan · Click node to inspect details</span>
        </div>
      </footer>
    </section>
  );
};
