# RepoGraph Web Application

Interactive developer workstation for exploring codebase dependencies, structural call graphs, semantic search, and change-impact analysis reports.

## Features
- **Interactive Dependency Graph:** Neighborhood expansion, caller/callee tracing, relation filtering.
- **Change-Impact Explorer:** Diff patch analysis, downstream reach mapping, and test discovery.
- **Architecture Q&A Assistant:** Evidence-backed answers citing exact file lines.
- **Symbol & File Inspector:** Detailed signatures, docstrings, and callers/callees.

## Development

```bash
# Start Vite development server
npm run dev
```

The app will run on `http://localhost:5173` and proxy `/api/*` requests to `http://localhost:3000`.
