/**
 * @repograph/shared-types
 * Core domain entities, API schemas, and graph data structures for RepoGraph.
 */

// ==========================================
// 1. REPOSITORY & REVISION ENTITIES
// ==========================================

export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'local';

export interface Repository {
  id: string;
  name: string;
  ownerId?: string;
  provider: GitProvider;
  remoteUrl?: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export type RevisionIndexingStatus =
  | 'queued'
  | 'cloning'
  | 'parsing'
  | 'graph_building'
  | 'embedding'
  | 'ready'
  | 'failed'
  | 'partial';

export interface RepositoryRevision {
  id: string;
  repositoryId: string;
  commitSha: string;
  branch?: string;
  status: RevisionIndexingStatus;
  progressPercent: number;
  indexedAt?: string;
  errorMessage?: string;
  totalFiles: number;
  totalSymbols: number;
  totalEdges: number;
}

// ==========================================
// 2. FILES & SYMBOLS
// ==========================================

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'json'
  | 'markdown'
  | 'unknown';

export type FileParseStatus = 'pending' | 'success' | 'partial' | 'failed' | 'skipped';

export interface SourceFile {
  id: string;
  revisionId: string;
  path: string;
  language: SupportedLanguage;
  contentHash: string;
  sizeBytes: number;
  lineCount: number;
  parseStatus: FileParseStatus;
  parseErrors?: string[];
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'enum'
  | 'variable'
  | 'constant'
  | 'api_route'
  | 'test_suite'
  | 'test_case';

export interface SourceSpan {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CodeSymbol {
  id: string;
  fileId: string;
  revisionId: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  span: SourceSpan;
  signature?: string;
  docstring?: string;
  isExported: boolean;
  parentSymbolId?: string;
}

// ==========================================
// 3. GRAPH EDGES & RELATIONSHIPS
// ==========================================

export type RelationType =
  | 'CALLS'
  | 'IMPORTS'
  | 'EXPORTS'
  | 'DEFINES'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'USES_TYPE'
  | 'TESTS'
  | 'EXPOSES_ROUTE'
  | 'READS_STATE'
  | 'WRITES_STATE';

export type ResolutionMethod =
  | 'ast_syntax'
  | 'compiler_metadata'
  | 'import_table'
  | 'framework_convention'
  | 'monorepo_workspace'
  | 'tsconfig_alias'
  | 'heuristic'
  | 'llm_inferred';

export type ConfidenceCategory = 'observed' | 'likely' | 'uncertain';

export interface GraphEdge {
  id: string;
  revisionId: string;
  sourceId: string; // symbol or file ID
  targetId: string; // symbol or file ID
  relationType: RelationType;
  resolutionMethod: ResolutionMethod;
  confidence: ConfidenceCategory;
  sourceSpan?: SourceSpan;
  rationale?: string;
}

export interface GraphNeighborhood {
  rootSymbolId: string;
  depth: number;
  nodes: CodeSymbol[];
  edges: GraphEdge[];
  metadata: {
    truncated: boolean;
    totalConnected: number;
  };
}

// ==========================================
// 4. CODE RETRIEVAL & SEARCH
// ==========================================

export type SearchMode = 'lexical' | 'structural' | 'semantic' | 'hybrid';

export interface SearchQuery {
  query: string;
  mode: SearchMode;
  repositoryId: string;
  revisionId?: string;
  limit?: number;
  language?: SupportedLanguage;
  symbolKinds?: SymbolKind[];
}

export interface SearchResultItem {
  symbolId?: string;
  fileId: string;
  filePath: string;
  symbolName?: string;
  symbolKind?: SymbolKind;
  lineSpan: { start: number; end: number };
  snippet: string;
  score: number;
  matchReason: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  totalMatches: number;
  executionTimeMs: number;
  modeUsed: SearchMode;
}

// ==========================================
// 5. CHANGE-IMPACT ANALYSIS & AI REASONING
// ==========================================

export type ImpactPriority = 'high' | 'medium' | 'needs_inspection';

export interface ChangedFileDiff {
  path: string;
  oldPath?: string;
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  changedLineRanges: Array<{ start: number; end: number }>;
}

export interface ImpactFinding {
  id: string;
  targetSymbolId: string;
  targetSymbolName: string;
  targetFilePath: string;
  priority: ImpactPriority;
  confidenceLabel: ConfidenceCategory;
  dependencyPath: string[]; // chain of symbol IDs or names
  rationale: string;
  suggestedTests: Array<{
    symbolId: string;
    name: string;
    filePath: string;
    isConfirmed: boolean;
  }>;
}

export interface ImpactAnalysisReport {
  id: string;
  repositoryId: string;
  baseRevisionSha: string;
  targetRevisionSha?: string;
  createdAt: string;
  summary: {
    totalChangedFiles: number;
    totalChangedSymbols: number;
    highImpactCount: number;
    mediumImpactCount: number;
    needsInspectionCount: number;
  };
  changedSymbols: CodeSymbol[];
  findings: ImpactFinding[];
  limitations: string[];
}

export interface AssistantCitation {
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  snippet?: string;
}

export interface AssistantQueryRequest {
  repositoryId: string;
  revisionId?: string;
  question: string;
  contextSymbolId?: string;
}

export interface AssistantQueryResponse {
  answer: string;
  citations: AssistantCitation[];
  confidence: ConfidenceCategory;
  caveats?: string[];
}

// ==========================================
// 6. SCAN SNAPSHOTS & REPOSITORY INTELLIGENCE
// ==========================================

export interface WorkspacePackageInfo {
  name: string;
  version?: string;
  directory: string;
  entryPoint: string;
  isPrivate?: boolean;
}

export interface EdgeEvidence {
  specifier: string;
  line: number;
  column?: number;
}

export interface ScanSnapshotSummary {
  totalFiles: number;
  totalSymbols: number;
  totalEdges: number;
  crossPackageEdges: number;
  parseErrors: number;
  languages: Record<string, number>;
}

export interface ScanSnapshot {
  scanId: string;
  repositoryId: string;
  repositoryName: string;
  rootDirectory: string;
  indexedAt: string;
  workingTreeFingerprint: string;
  summary: ScanSnapshotSummary;
  limitations: string[];
}
