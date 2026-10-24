# @repograph/shared-types

Canonical TypeScript domain entities, API contracts, and graph interfaces shared across all RepoGraph workspaces (`apps/web`, `services/api`, and `services/worker`).

## Core Models

### 1. Repository & Revision Entities
- `Repository`: Metadata for registered software repositories (`id`, `name`, `provider`, `defaultBranch`).
- `RepositoryRevision`: Snapshot state and progress tracking (`commitSha`, `status`, `progressPercent`, `totalFiles`).

### 2. Files & AST Symbols
- `SourceFile`: Detected source file with language, content hash, and line counts.
- `CodeSymbol`: AST-extracted declaration (`name`, `qualifiedName`, `kind`, `span`, `signature`, `docstring`).
- `SymbolKind`: Supported kinds (`function`, `method`, `class`, `interface`, `type_alias`, `enum`, `variable`, `api_route`, `test_suite`, `test_case`).

### 3. Graph Relationships
- `GraphEdge`: Directed edge (`sourceId`, `targetId`, `relationType`, `resolutionMethod`, `confidence`).
- `RelationType`: `CALLS`, `IMPORTS`, `DEFINES`, `EXTENDS`, `IMPLEMENTS`, `USES_TYPE`, `TESTS`, `EXPOSES_ROUTE`.
- `GraphNeighborhood`: Subgraph neighborhood around a focus symbol with depth filtering.

### 4. Search & Impact Analysis
- `SearchQuery` & `SearchResultItem`: Unified lexical, structural, and hybrid search contracts.
- `ImpactFinding`: Structured downstream impact hypothesis with priority (`high`, `medium`), confidence, dependency path, and suggested tests.
- `AssistantCitation` & `AssistantQueryResponse`: Grounded AI response model with verified source locations.

## Building

```bash
npm run build
```
Outputs compiled JavaScript and `.d.ts` declaration files to `dist/`.
