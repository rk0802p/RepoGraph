# RepoGraph

> **Semantic Code Dependency & Change-Impact Explorer**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Tree--sitter](https://img.shields.io/badge/Parser-Tree--sitter-green.svg)](https://tree-sitter.github.io/)
[![Cytoscape.js](https://img.shields.io/badge/Visualization-Cytoscape.js-orange.svg)](https://js.cytoscape.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-336791.svg)](https://github.com/pgvector/pgvector)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)

**RepoGraph** is an open-source developer tool that turns an unfamiliar codebase into an explorable map of its structure, behavior, and relationships. It combines **Tree-sitter AST static code analysis**, **interactive dependency graphs**, **code search**, and **change-impact analysis** to help engineers understand how a repository works and estimate what could break when code changes.

---

## 1. Core Value Proposition

- **Understand:** Discover how modules, functions, classes, and tests fit together across frontend and backend boundaries.
- **Search:** Query symbols, functions, and file paths with relevance scoring and live source code snippets.
- **Trace:** Follow dependency, call, and import chains across your repository.
- **Assess (Signature Feature):** Analyze a changed file or Git diff to identify directly affected dependents, transitive reach, and candidate test suites.
- **Explain:** Ask architecture questions and receive answers citing exact files, symbols, and lines of code.
- **Verify:** Separate statically observed facts (`Observed`), high-probability dependencies (`Likely`), and inferred connections (`Uncertain`).

---

## 2. System Architecture

```text
                                 +-----------------------------+
                                 |  React 19 + TypeScript Web  |
                                 |  Workspace (apps/web)       |
                                 |  - Cytoscape.js + Dagre     |
                                 |  - Change-Impact Visualizer |
                                 +--------------+--------------+
                                                |
                                                | HTTP / REST (Vite Proxy)
                                                v
                                 +-----------------------------+
                                 |    Node.js / Express API    |
                                 |    (services/api)           |
                                 |  - Tree-sitter AST Parser   |
                                 |  - BFS Dependency Traverser |
                                 |  - Modular Express Routes   |
                                 +-------+-------------+-------+
                                         |             |
                     +-------------------+             +------------------+
                     v                                                    v
       +----------------------------+                       +----------------------------+
       |   PostgreSQL 16 + pgvector |                       |       Redis 7 Cache        |
       |  - Repositories & Revisions|                       |  - Background Job Queue    |
       |  - Files & Symbols (AST)   |                       |  - Invalidation Pub/Sub    |
       |  - Edges & Relationships   |                       +--------------+-------------+
       |  - Code Embeddings (HNSW)  |                                      |
       +--------------^-------------+                                      v
                      |                             +------------------------------------+
                      +-----------------------------+  Background Analysis Workers       |
                                                    |  (services/worker)                 |
                                                    |  - High-concurrency embeddings     |
                                                    |  - Heavy batch chunking            |
                                                    +------------------------------------+
```

---

## 3. Monorepo Structure

```text
repograph/
├── apps/
│   └── web/                     # React 19 + TypeScript workstation: RepoGraph: The Code Atlas
│       ├── src/
│       │   ├── components/      # Modular Code Atlas components
│       │   │   ├── layout/      # TopBar (repo switcher, ⌘K search, API status) & AboutModal
│       │   │   ├── explorer/    # RepositoryExplorer & searchable FileTree with language filters
│       │   │   ├── graph/       # DependencyAtlas (Cytoscape + Dagre/Concentric/COSE, zoom, legend)
│       │   │   ├── inspector/   # InspectorPanel (symbols, incoming/outgoing deps, impact report) & SourcePreviewModal
│       │   │   └── drawer/      # AnalysisDrawer (language distribution bar, hubs, impact paths, scan log)
│       │   ├── styles/tokens.css# Warm ivory Code Atlas design system tokens
│       │   ├── App.tsx          # Cohesive workspace coordinator
│       │   ├── App.css          # Editorial layout & responsive styles
│       │   └── api.ts           # Typed API client connecting to backend
│       └── vite.config.ts       # Code-split bundler with API reverse-proxy
├── services/
│   ├── api/                     # Node.js + Express REST API & Code Intelligence
│   │   ├── src/
│   │   │   ├── services/        # Core static analysis & graph services
│   │   │   │   ├── codeParser.ts        # Tree-sitter AST syntax parser
│   │   │   │   ├── repositoryScanner.ts # File discovery & filter engine
│   │   │   │   ├── importResolver.ts    # Path & index import resolution
│   │   │   │   ├── repositoryAnalyzer.ts# Pipeline orchestrator
│   │   │   │   ├── dependencyGraph.ts   # Directed graph construction
│   │   │   │   ├── impactAnalyzer.ts    # Reverse BFS change-impact engine
│   │   │   │   └── workspaceResolver.ts # Multi-root directory discovery
│   │   │   ├── routes/          # Health, repositories, graph, search, analysis
│   │   │   ├── middleware/      # Request logging & error handling
│   │   │   ├── app.ts           # Express application setup
│   │   │   └── index.ts         # Bootstrap & graceful shutdown
│   │   └── tests/               # Unit and integration test suites
│   └── worker/                  # Background worker scaffold
├── packages/
│   └── shared-types/            # Shared TypeScript domain models & API contracts
├── database/
│   └── migrations/              # PostgreSQL + pgvector DDL migrations
│       └── 0001_initial_schema.sql
├── docker-compose.yml           # Local dev infrastructure (PostgreSQL + Redis)
├── package.json                 # Monorepo workspaces & root scripts
├── .env.example                 # Environment configuration template
└── README.md
```

---

## 4. Getting Started

### Prerequisites

- **Node.js** >= 20 (Node 22 LTS recommended)
- **npm** >= 10
- **Docker & Docker Compose** (for PostgreSQL + pgvector & Redis)

### Step 1: Clone and Configure Environment

```bash
git clone https://github.com/your-username/RepoGraph.git
cd RepoGraph

cp .env.example .env
```

### Step 2: Start Infrastructure Services

Start PostgreSQL (with `pgvector`) and Redis:

```bash
docker compose up -d
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Run Development Servers

```bash
# Terminal 1: Start API Service (port 3000)
npm run dev:api

# Terminal 2: Start Web Application (port 5173)
npm run dev:web
```

Open your browser at **[http://localhost:5173](http://localhost:5173)**.

---

## 5. API Reference

All routes are mounted under `/api`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status, uptime, and timestamp |
| `GET` | `/api/repositories` | List all discovered and registered repositories |
| `POST` | `/api/repositories` | Register a new repository snapshot |
| `GET` | `/api/repositories/:id` | Get repository details and revision statistics |
| `POST` | `/api/repositories/:id/index` | Queue background indexing for a commit/branch |
| `POST` | `/api/repositories/scan` | Scan physical directory for supported source files |
| `POST` | `/api/repositories/analyze` | Parse AST with Tree-sitter & generate dependency graph |
| `POST` | `/api/repositories/impact` | Perform reverse dependency BFS change-impact analysis |
| `GET` | `/api/repositories/:id/graph` | Retrieve bounded graph neighborhood for symbol/file |
| `GET` | `/api/repositories/:id/search` | Search symbols, identifiers, and source code on disk |
| `POST` | `/api/repositories/:id/ask` | Evidence-grounded Q&A with verified file/line citations |
| `POST` | `/api/repositories/:id/impact-analysis` | Submit Git diff and retrieve downstream impact report |
| `GET` | `/api/repositories/:id/file` | Preview safe source code with line counts & containment checks |

---

## 6. Testing & Quality Verification

Run all 68 unit, integration, security, and parser test suites across the monorepo:

```bash
# Run full test suite
npm test

# Run typechecks and production builds
npm run build

# Run linter
npm run lint

# Run empirical performance benchmark
npm run benchmark
```

---

### Operational Model (v0.1.0)
- **Default Execution Mode**: RepoGraph operates in high-performance **Direct-on-Disk & In-Memory Mode**. File scanning, Tree-sitter AST extraction, import resolution, and BFS change-impact traversals execute via fast native bindings in the Node API service without requiring an external database to run.
- **Enterprise Infrastructure (Blueprint)**: The included PostgreSQL 16 + `pgvector` migration (`0001_initial_schema.sql`) and Redis container services provide the persistence and queueing blueprint for multi-tenant repositories, persistent vector embeddings, and background worker offloading.

---

## 7. Development Roadmap & Implementation Status

- [x] **Monorepo Foundation:** Workspaces configuration (`apps/web`, `services/api`, `packages/shared-types`).
- [x] **Database Schema:** PostgreSQL + pgvector DDL migrations (`repositories`, `files`, `symbols`, `edges`, `code_chunks`, `analyses`).
- [x] **Docker Dev Environment:** Containerized PostgreSQL 16 (`pgvector`) & Redis 7.
- [x] **Shared Types Package:** Canonical TypeScript contracts for domain models & API responses.
- [x] **API Gateway:** Express 4.x REST endpoints with modular routes, request logging, and error handling.
- [x] **Tree-sitter Parser Integration:** AST extraction pipeline for TypeScript, JavaScript, and TSX.
- [x] **Dependency Graph Builder:** Resolution of relative, directory index, and explicit extension imports.
- [x] **Change-Impact Analysis Engine:** Breadth-first search reverse dependency traversal with distance and dependency chain tracking.
- [x] **RepoGraph: The Code Atlas UI:** Polished architectural workspace with warm ivory palette, Newsreader editorial typography, Cytoscape dependency atlas, collapsible file tree, inspector with real source code preview, and bottom analysis drawer.
- [x] **Evidence-Grounded Q&A:** Code-aware retrieval generating answers citing exact file lines and snippets.
- [ ] **Vector Embeddings Pipeline:** pgvector semantic code chunk indexing for natural-language intent search.
- [ ] **Git Diff Engine:** Pull request review bot integration for GitHub Actions.

---

## 8. License

Licensed under the [Apache 2.0 License](LICENSE).
