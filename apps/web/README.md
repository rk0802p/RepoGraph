# RepoGraph: The Code Atlas — Frontend Workstation

> **The Code Atlas** is a distinctive, editorial code-intelligence workspace where developers explore a codebase like an interactive geographic map. Built with React 19, TypeScript, and Cytoscape.js + Dagre.

---

## 1. Visual Identity & Design Direction

- **Warm Ivory Surfaces:** `#F4F1E8` canvas background, `#FBF9F3` soft cream card surfaces, and `#DCD9CE` architectural borders.
- **Deep Ink Typography:** `#202923` primary ink, paired with **Newsreader** editorial serif titles, **Plus Jakarta Sans** modern UI text, and **JetBrains Mono** for paths, symbols, and code.
- **Forest Green Navigation:** `#175B45` for primary actions, selected nodes, confirmed status badges, and active tabs.
- **Burnt Orange (Ember) Highlights:** `#E66A3C` for change-impact roots, affected dependent propagation, and traversal paths.

---

## 2. Four-Part Workspace Architecture

```text
+-----------------------------------------------------------------------------------+
| TopBar: Brand Monogram · Repo Selector · Quick Search (⌘K) · Status Pill · Guide  |
+-------------------+---------------------------------------+-----------------------+
|                   |                                       |                       |
|  Repository       |   Central Dependency Atlas            |   File & Symbol       |
|  Explorer         |                                       |   Inspector           |
|                   |   - Editorial Header & Controls       |                       |
|  - Active repo    |   - Cytoscape.js Interactive Graph    |   - File metadata     |
|  - Analyze button |   - Hierarchical / Concentric / COSE  |   - Quick Actions:    |
|  - Language chips |   - Selected Neighbor Highlighting    |     · Analyze Impact  |
|  - Test toggle    |   - Burnt Orange Impact Highlighting  |     · View Source     |
|  - Collapsible    |   - Floating Zoom & Interactive Legend|   - Tabs:             |
|    File Tree      |                                       |     · Overview        |
|                   |                                       |     · Symbols (:lines)|
|                   |                                       |     · Dependencies    |
|                   |                                       |     · Dependents (In) |
|                   |                                       |     · Impact Report   |
+-------------------+---------------------------------------+-----------------------+
| Bottom Analysis Drawer (Collapsible & Expandable)                                 |
| - Repository Overview & Language Distribution Bar (TS / JS / JSON / MD)           |
| - Architectural Hubs (Degree Centrality: in-degree + out-degree)                  |
| - Change-Impact Path Tracing (Breadcrumbs from Root Changed File)                 |
| - Scan Health Log & Relative Import Resolution Verification                       |
+-----------------------------------------------------------------------------------+
```

---

## 3. Key Components

- **`src/components/layout/TopBar.tsx`**: Header bar with custom monogram mark, repository switcher dropdown, global search shortcut (`⌘K`), API connection indicator, and About guide trigger.
- **`src/components/explorer/RepositoryExplorer.tsx`**: Workspace rail with path input, primary Analyze button, summary statistics, search filter, language filter chips (`All`, `TS`, `JS`, `JSON`), and test file toggle.
- **`src/components/explorer/FileTree.tsx`**: Collapsible directory tree with folder disclosure chevrons, language badges, symbol count badges, and impact indicators.
- **`src/components/graph/DependencyAtlas.tsx`**: Main Cytoscape canvas featuring custom card-styled nodes, directional bezier edges, layout switcher (Dagre / Concentric / COSE), zoom controls, and floating interactive legend.
- **`src/components/inspector/InspectorPanel.tsx`**: Detailed inspector with file metadata, symbols list, incoming dependents, outgoing dependencies, and reverse BFS change-impact report.
- **`src/components/inspector/SourcePreviewModal.tsx`**: Real source code viewer with line numbers and syntax formatting connected to `/api/repositories/:id/file?path=...`.
- **`src/components/drawer/AnalysisDrawer.tsx`**: Collapsible drawer with visual language distribution bar, top hub tables, step-by-step impact chains, and import health log.
- **`src/styles/tokens.css`**: Design system tokens for colors, typography, elevations, borders, and transitions.

---

## 4. Development & Build

```bash
# Start Vite development server with API reverse proxy
npm run dev

# Run TypeScript typechecks and production build
npm run build

# Run Oxlint linter
npm run lint

# Run frontend unit tests
npm test
```
