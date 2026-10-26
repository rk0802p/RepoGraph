import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { WorkspacePackageInfo } from "@repograph/shared-types";

import {
  scanRepository,
  type SourceFile,
} from "./repositoryScanner.js";
import {
  parseCode,
  type ParsedCode,
} from "./codeParser.js";
import {
  resolveImports,
  type ResolvedImport,
} from "./importResolver.js";
import {
  buildDependencyGraph,
  type DependencyGraph,
} from "./dependencyGraph.js";
import {
  discoverWorkspacePackages,
  getRepositoryFingerprint,
} from "./workspaceResolver.js";
import { snapshotStore } from "./snapshotStore.js";

export type AnalyzedFile = SourceFile &
  ParsedCode & {
    resolvedImports: ResolvedImport[];
    dependencies: string[];
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
  scanId: string;
  repository: string;
  totalFiles: number;
  files: AnalyzedFile[];
  graph: DependencyGraph;
  summary: AnalysisSummary;
};

export interface AnalyzeOptions {
  repositoryId?: string;
  workspacePackages?: Map<string, WorkspacePackageInfo>;
  commitSha?: string;
  branch?: string;
}

export async function analyzeRepository(
  rootDirectory: string,
  repositoryName: string,
  options: AnalyzeOptions = {}
): Promise<RepositoryAnalysis> {
  const sourceFiles = await scanRepository(rootDirectory);

  const workspacePackages =
    options.workspacePackages ??
    (await discoverWorkspacePackages(rootDirectory));

  const fingerprint =
    options.commitSha
      ? { commitSha: options.commitSha, branch: options.branch ?? "main" }
      : await getRepositoryFingerprint(rootDirectory);

  const languages: Record<string, number> = {};
  let totalSymbols = 0;
  let parseErrors = 0;

  const parsedFiles = await Promise.all(
    sourceFiles.map(async (file) => {
      languages[file.language] = (languages[file.language] ?? 0) + 1;

      const absolutePath = path.resolve(rootDirectory, file.path);
      let source = "";
      try {
        source = await readFile(absolutePath, "utf8");
      } catch (err: unknown) {
        parseErrors += 1;
        return {
          ...file,
          symbols: [],
          imports: [],
          parseError:
            err instanceof Error ? err.message : "Failed to read file",
        };
      }

      const parsed = parseCode(source, file.extension);
      if (parsed.parseError) {
        parseErrors += 1;
      }
      totalSymbols += parsed.symbols.length;

      return {
        ...file,
        ...parsed,
      };
    })
  );

  let crossPackageEdges = 0;

  const files: AnalyzedFile[] = parsedFiles.map((file) => {
    const resolvedImports = resolveImports(
      file,
      file.imports,
      sourceFiles,
      workspacePackages
    );

    const dependencies = [
      ...new Set(
        resolvedImports
          .map((item) => {
            if (item.resolutionMethod === "monorepo_workspace") {
              crossPackageEdges += 1;
            }
            return item.resolvedPath;
          })
          .filter((filePath): filePath is string => filePath !== null)
      ),
    ];

    return {
      ...file,
      resolvedImports,
      dependencies,
    };
  });

  const graph = buildDependencyGraph(files);

  const scanId = `scan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const repositoryId =
    options.repositoryId ?? `repo-${repositoryName.toLowerCase()}`;

  const summary: AnalysisSummary = {
    totalFiles: files.length,
    totalSymbols,
    totalEdges: graph.edges.length,
    crossPackageEdges,
    parseErrors,
    languages,
  };

  snapshotStore.save({
    scanId,
    repositoryId,
    repositoryName,
    rootDirectory,
    indexedAt: new Date().toISOString(),
    workingTreeFingerprint: fingerprint.commitSha,
    summary,
    limitations: [],
    graph,
    files,
  });

  return {
    scanId,
    repository: repositoryName,
    totalFiles: files.length,
    files,
    graph,
    summary,
  };
}
