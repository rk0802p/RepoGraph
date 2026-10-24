# RepoGraph API Service

High-performance Node.js / Express REST API and static code analysis gateway for RepoGraph.

## Architecture & Services

The API coordinates both in-memory routing and deep AST code analysis through dedicated services in `src/services/`:

- **`codeParser.ts`**: Multi-language Tree-sitter AST syntax parser (TypeScript, JavaScript, TSX) extracting functions, classes, interfaces, types, imports, and calls.
- **`repositoryScanner.ts`**: Recursive disk discovery with `.gitignore` and vendor directory exclusions.
- **`importResolver.ts`**: Path-aware import resolver handling extensionless imports, explicit extensions (`.js` to `.ts`), directory index files, and package distinctions.
- **`repositoryAnalyzer.ts`**: Pipeline orchestrator combining scanning, AST parsing, and import resolution into unified repository analyses.
- **`dependencyGraph.ts`**: Directed dependency graph builder mapping file nodes and import edges.
- **`impactAnalyzer.ts`**: Breadth-first search (BFS) reverse dependency traversal calculating direct and transitive downstream impact reach.
- **`workspaceResolver.ts`**: Dynamic monorepo and workspace root directory discovery.

---

## API Endpoints

All routes are mounted under `/api`:

### 1. Repository Management
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status, uptime, and timestamp |
| `GET` | `/api/repositories` | List all discovered and registered repositories |
| `POST` | `/api/repositories` | Register a new repository snapshot |
| `GET` | `/api/repositories/:id` | Get repository details and revision statistics |
| `POST` | `/api/repositories/:id/index` | Queue or trigger background repository re-indexing |

### 2. Live Repository Scanning & Analysis
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/repositories/scan` | Scan physical directory for supported source files |
| `POST` | `/api/repositories/analyze` | Parse AST symbols and construct full dependency graph |
| `POST` | `/api/repositories/impact` | Perform reverse dependency BFS change-impact analysis |

### 3. Graph, Search & Evidence Q&A
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/repositories/:id/graph` | Retrieve bounded graph neighborhood for symbol/file |
| `GET` | `/api/repositories/:id/search` | Search symbols, identifiers, and source code on disk |
| `POST` | `/api/repositories/:id/ask` | Evidence-grounded Q&A with verified file/line citations |
| `POST` | `/api/repositories/:id/impact-analysis`| Submit Unified Git diff and receive downstream impact report |

---

## Testing

The API includes 31 unit and integration test suites:

```bash
# Run all tests using Node.js native test runner
npm test

# Run tests in watch mode
npm run dev
```

---

## Building & Running

```bash
# Compile TypeScript to dist/
npm run build

# Start production server
npm start
```
