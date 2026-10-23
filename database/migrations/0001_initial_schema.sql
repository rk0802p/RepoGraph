-- ============================================================================
-- Migration: 0001_initial_schema.sql
-- Description: Core schema for RepoGraph (Entities, Relationships, Vector Embeddings)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Repositories
CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_id VARCHAR(255),
    provider VARCHAR(64) NOT NULL DEFAULT 'github',
    remote_url TEXT,
    default_branch VARCHAR(128) NOT NULL DEFAULT 'main',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Repository Revisions (Immutable snapshots)
CREATE TABLE IF NOT EXISTS repository_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    commit_sha VARCHAR(64) NOT NULL,
    branch VARCHAR(128),
    status VARCHAR(64) NOT NULL DEFAULT 'queued',
    progress_percent INT NOT NULL DEFAULT 0,
    error_message TEXT,
    indexed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_repo_revision UNIQUE (repository_id, commit_sha)
);

-- 3. Files
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    revision_id UUID NOT NULL REFERENCES repository_revisions(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    language VARCHAR(64) NOT NULL DEFAULT 'unknown',
    content_hash VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    line_count INT NOT NULL DEFAULT 0,
    parse_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    parse_errors JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_revision_file_path UNIQUE (revision_id, path)
);

-- 4. Code Symbols (Functions, Classes, Types, API routes, Tests)
CREATE TABLE IF NOT EXISTS symbols (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    revision_id UUID NOT NULL REFERENCES repository_revisions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    qualified_name TEXT NOT NULL,
    kind VARCHAR(64) NOT NULL,
    start_line INT NOT NULL,
    start_column INT NOT NULL DEFAULT 0,
    end_line INT NOT NULL,
    end_column INT NOT NULL DEFAULT 0,
    signature TEXT,
    docstring TEXT,
    is_exported BOOLEAN NOT NULL DEFAULT FALSE,
    parent_symbol_id UUID REFERENCES symbols(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Graph Edges (Relationships between symbols or files)
CREATE TABLE IF NOT EXISTS edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    revision_id UUID NOT NULL REFERENCES repository_revisions(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    target_id UUID NOT NULL,
    relation_type VARCHAR(64) NOT NULL,
    resolution_method VARCHAR(64) NOT NULL DEFAULT 'ast_syntax',
    confidence VARCHAR(32) NOT NULL DEFAULT 'observed',
    source_span JSONB,
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_edge UNIQUE (revision_id, source_id, target_id, relation_type)
);

-- 6. Code Chunks & Semantic Vector Embeddings
CREATE TABLE IF NOT EXISTS code_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    symbol_id UUID REFERENCES symbols(id) ON DELETE SET NULL,
    start_line INT NOT NULL,
    end_line INT NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Background Ingestion & Refresh Jobs
CREATE TABLE IF NOT EXISTS index_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    revision_id UUID NOT NULL REFERENCES repository_revisions(id) ON DELETE CASCADE,
    stage VARCHAR(64) NOT NULL DEFAULT 'queued',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Analyses (Q&A and Impact Analysis Runs)
CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    revision_id UUID NOT NULL REFERENCES repository_revisions(id) ON DELETE CASCADE,
    analysis_type VARCHAR(64) NOT NULL,
    input_payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    result_summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- 9. Analysis Evidence Records
CREATE TABLE IF NOT EXISTS analysis_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    file_id UUID REFERENCES files(id) ON DELETE SET NULL,
    symbol_id UUID REFERENCES symbols(id) ON DELETE SET NULL,
    start_line INT,
    end_line INT,
    evidence_type VARCHAR(64) NOT NULL,
    snippet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Impact Findings (Structured change-impact findings)
CREATE TABLE IF NOT EXISTS impact_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    target_symbol_id UUID REFERENCES symbols(id) ON DELETE CASCADE,
    priority VARCHAR(32) NOT NULL DEFAULT 'medium',
    confidence_label VARCHAR(32) NOT NULL DEFAULT 'likely',
    rationale TEXT NOT NULL,
    suggested_tests JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_revision ON files(revision_id);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_revision ON symbols(revision_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_edges_revision ON edges(revision_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_code_chunks_file ON code_chunks(file_id);
