# RepoGraph

> **Semantic Code Dependency & Change-Impact Explorer**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-336791.svg)](https://github.com/pgvector/pgvector)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)

**RepoGraph** is an open-source developer tool that turns an unfamiliar codebase into an explorable map of its structure, behavior, and relationships. It combines **AST static code analysis**, **dependency graphs**, **semantic code search**, and **evidence-grounded AI** to help engineers understand how a repository works and estimate what could break when code changes.

---

## 1. Core Value Proposition

- **Understand:** Discover how modules, functions, classes, API routes, and tests fit together.
- **Search:** Find relevant code by behavior or intent (hybrid lexical + semantic search), even when the query does not match identifiers.
- **Trace:** Follow dependency, call, and import chains across your repository.
- **Assess (Signature Feature):** Analyze a Git diff to identify directly affected symbols, downstream consumers, and relevant test suites.
- **Explain:** Generate AI answers and reports that cite the exact files, symbols, and lines supporting each claim.
- **Verify:** Separate statically observed facts (`Observed`), high-probability dependencies (`Likely`), and inferred connections (`Uncertain`).

---

## 2. System Architecture

```text
                                 +-----------------------------+
                                 |  React 19 + TypeScript Web  |
                                 |  Workspace (apps/web)       |
                                 +--------------+--------------+
                                                |
                                                | HTTP / REST (Vite Proxy)
                                                v
                                 +-----------------------------+
                                 |    Node.js / Express API    |
                                 |    (services/api)           |
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
                                                    |  - Tree-sitter AST Parser          |
                                                    |  - Graph Builder & Chunking        |
                                                    +------------------------------------+
```

---

## 3. Monorepo Structure

```text
repograph/
├── apps/
│   └── web/                     # React 19 + TypeScript workstation UI
│       ├── src/
│       │   ├── App.tsx          # 3-panel workspace (Explorer, Canvas, Inspector)
│       │   ├── App.css          # Layout & card styles
│       │   └── index.css        # Design tokens & dark mode styling
│       └── vite.config.ts       # Vite bundler with API reverse-proxy
├── services/
│   ├── api/                     # Node.js + Express REST API
│   │   └── src/
│   │       ├── config/          # Validated environment configuration
│   │       ├── middleware/      # Request logging & error handling
│   │       ├── routes/          # Health, repositories, graph, search, analysis
│   │       ├── app.ts           # Express application setup
│   │       └── index.ts         # Bootstrap & graceful shutdown
│   └── worker/                  # Python background ingestion & AST parser service
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
# Clone the repository
git clone https://github.com/your-username/RepoGraph.git
cd RepoGraph

# Create local environment config from template
cp .env.example .env
```

### Step 2: Start Infrastructure Services

Start PostgreSQL (with `pgvector`) and Redis:

```bash
docker compose up -d
```

Verify services are healthy:
```bash
docker compose ps
```

### Step 3: Install Dependencies

Using npm workspaces:

```bash
npm install
```

### Step 4: Run Development Servers

Run both the API and Web frontends:

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
| `GET` | `/api/health` | Healthcheck & system uptime status |
| `GET` | `/api/repositories` | List all registered repositories |
| `POST` | `/api/repositories` | Register a new repository for indexing |
| `GET` | `/api/repositories/:id` | Get repository metadata and revision snapshots |
| `POST` | `/api/repositories/:id/index` | Queue background indexing for a commit/branch |
| `GET` | `/api/repositories/:id/graph` | Retrieve bounded graph neighborhood for a symbol |
| `GET` | `/api/repositories/:id/search` | Query code & symbols (lexical, structural, hybrid) |
| `POST` | `/api/repositories/:id/ask` | Evidence-grounded architecture Q&A |
| `POST` | `/api/repositories/:id/impact-analysis` | Submit Git diff and retrieve downstream impact report |

---

## 6. Development Roadmap & Implementation Status

- [x] **Monorepo Foundation:** Workspaces configuration (`apps/web`, `services/api`, `packages/shared-types`).
- [x] **Database Schema:** PostgreSQL + pgvector DDL migrations (`repositories`, `files`, `symbols`, `edges`, `code_chunks`, `analyses`).
- [x] **Docker Dev Environment:** Containerized PostgreSQL 16 (`pgvector`) & Redis 7.
- [x] **Shared Types Package:** Canonical TypeScript contracts for domain models & API responses.
- [x] **API Gateway:** Express 4.x REST endpoints with modular routes, request logging, and error handling.
- [x] **Interactive Workspace UI:** 3-panel developer workstation (Symbol tree, interactive graph canvas, detail inspector, Git diff impact simulator, architecture Q&A).
- [ ] **Tree-sitter Parser Integration:** AST extraction pipeline for TypeScript/JavaScript/Python.
- [ ] **Vector Embeddings Pipeline:** pgvector semantic code chunk indexing.
- [ ] **Git Diff Engine:** Live diff line-to-AST symbol mapper for GitHub PR review bots.

---

## 7. License

Licensed under the [Apache 2.0 License](LICENSE).
