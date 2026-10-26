const API_URL = import.meta.env.VITE_API_URL ?? "";

export type ApiHealth = {
  status: string;
  message: string;
  timestamp: string;
};

export type CodeSymbol = {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable";
  startLine: number;
  endLine: number;
};

export type CodeImport = {
  source: string;
  startLine: number;
  isReExport?: boolean;
  isDynamic?: boolean;
};

export type ResolvedImport = CodeImport & {
  resolvedPath: string | null;
  resolutionMethod?:
    | "ast_relative"
    | "monorepo_workspace"
    | "static_asset"
    | "external_package"
    | "unresolved";
};

export type AnalyzedFile = {
  path: string;
  language: string;
  extension: string;
  symbols: CodeSymbol[];
  imports: CodeImport[];
  resolvedImports: ResolvedImport[];
  dependencies: string[];
};

export type EdgeEvidence = {
  specifier: string;
  line: number;
};

export type DependencyNode = {
  id: string;
  path: string;
  language: string;
  extension: string;
  package?: string;
};

export type DependencyEdge = {
  id?: string;
  source: string;
  target: string;
  importSource: string;
  startLine: number;
  relationType?: "IMPORTS" | "EXPORTS_FROM" | "DYNAMIC_IMPORT";
  resolutionMethod?:
    | "ast_relative"
    | "monorepo_workspace"
    | "tsconfig_alias"
    | "heuristic";
  confidence?: "observed" | "likely" | "uncertain";
  evidence?: EdgeEvidence;
};

export type DependencyGraph = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
};

export type AnalysisSummary = {
  totalFiles: number;
  totalSymbols: number;
  totalEdges: number;
  crossPackageEdges: number;
  parseErrors: number;
  languages: Record<string, number>;
};

export type RepositoryAnalysis = {
  scanId?: string;
  repository: string;
  totalFiles: number;
  files: AnalyzedFile[];
  graph: DependencyGraph;
  summary?: AnalysisSummary;
};

export type ImpactedFile = {
  path: string;
  distance: number;
  relationship: "direct" | "transitive";
  dependencyChain: string[];
  importLine: number;
};

export type FileContentResponse = {
  repository: string;
  path: string;
  content: string;
  lines: number;
  sizeBytes: number;
  extension: string;
};

export type RepositoryItem = {
  id: string;
  name: string;
  provider?: string;
  defaultBranch?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RepositoriesListResponse = {
  repositories: RepositoryItem[];
  total: number;
};

export type ChangeImpactReport = {
  repository: string;
  changedFile: string;
  totalImpactedFiles: number;
  directDependents: number;
  transitiveDependents: number;
  impactedFiles: ImpactedFile[];
};

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, options);

  if (!response.ok) {
    let message = `API request failed: ${response.status}`;

    try {
      const body = await response.json();

      if (typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // Keep the fallback error message if the response isn't JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function checkApiHealth(): Promise<ApiHealth> {
  return request<ApiHealth>("/api/health");
}

export function analyzeRepository(
  repositoryPath: string
): Promise<RepositoryAnalysis> {
  return request<RepositoryAnalysis>("/api/repositories/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: repositoryPath }),
  });
}

export function listRepositories(): Promise<RepositoriesListResponse> {
  return request<RepositoriesListResponse>("/api/repositories");
}

export function fetchFileContent(
  repositoryPath: string,
  filePath: string
): Promise<FileContentResponse> {
  return request<FileContentResponse>(
    `/api/repositories/${encodeURIComponent(repositoryPath)}/file?path=${encodeURIComponent(filePath)}`
  );
}

export function analyzeChangeImpact(
  repositoryPath: string,
  filePath: string
): Promise<ChangeImpactReport> {
  return request<ChangeImpactReport>("/api/repositories/impact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: repositoryPath,
      file: filePath,
    }),
  });
}
