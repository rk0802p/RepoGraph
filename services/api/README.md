# RepoGraph API Service

REST API service coordinating repository management, graph queries, code search, and change-impact analysis.

## Endpoints

### Repositories
- `GET /api/repositories`: List registered repositories
- `POST /api/repositories`: Register a new repository
- `GET /api/repositories/:id`: Get repository details and revision snapshots
- `POST /api/repositories/:id/index`: Trigger repository indexing

### Graph & Search
- `GET /api/repositories/:id/graph`: Retrieve bounded graph neighborhood
- `GET /api/repositories/:id/search?q=...&mode=...`: Lexical & hybrid code search

### AI & Change-Impact Analysis
- `POST /api/repositories/:id/ask`: Ask architecture questions with evidence citations
- `POST /api/repositories/:id/impact-analysis`: Analyze a Git diff for downstream impact

## Development

```bash
# Start API in watch mode
npm run dev

# Build TypeScript to dist
npm run build
```
