# RepoGraph Worker Service

This service handles CPU-intensive and asynchronous tasks:
- Git repository cloning and archive extraction
- Tree-sitter AST parsing and symbol extraction
- Semantic code chunking & vector embedding generation
- Background change-impact graph traversals

## Stack
- Python 3.11+
- Tree-sitter
- Redis & Celery/BullMQ consumer
- pgvector / psycopg3
