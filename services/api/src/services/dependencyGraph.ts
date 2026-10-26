import type { AnalyzedFile } from "./repositoryAnalyzer.js";

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
  id: string;
  source: string;
  target: string;
  importSource: string;
  startLine: number;
  relationType: "IMPORTS" | "EXPORTS_FROM" | "DYNAMIC_IMPORT";
  resolutionMethod: "ast_relative" | "monorepo_workspace" | "tsconfig_alias" | "heuristic";
  confidence: "observed" | "likely";
  evidence: EdgeEvidence;
};

export type DependencyGraph = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
};

export function buildDependencyGraph(
  files: AnalyzedFile[]
): DependencyGraph {
  const nodes: DependencyNode[] = files.map((file) => {
    let pkg: string | undefined;
    if (file.path.startsWith("packages/")) {
      pkg = file.path.split("/").slice(0, 2).join("/");
    } else if (file.path.startsWith("services/")) {
      pkg = file.path.split("/").slice(0, 2).join("/");
    } else if (file.path.startsWith("apps/")) {
      pkg = file.path.split("/").slice(0, 2).join("/");
    }

    return {
      id: file.path,
      path: file.path,
      language: file.language,
      extension: file.extension,
      ...(pkg ? { package: pkg } : {}),
    };
  });

  const filePaths = new Set(nodes.map((node) => node.path));
  const edgesMap = new Map<string, DependencyEdge>();

  for (const file of files) {
    for (const item of file.resolvedImports) {
      if (
        item.resolvedPath === null ||
        !filePaths.has(item.resolvedPath)
      ) {
        continue;
      }

      const relationType = item.isReExport
        ? "EXPORTS_FROM"
        : item.isDynamic
          ? "DYNAMIC_IMPORT"
          : "IMPORTS";

      const resolutionMethod =
        item.resolutionMethod === "monorepo_workspace"
          ? "monorepo_workspace"
          : "ast_relative";

      const edgeKey = `${file.path}->${item.resolvedPath}`;

      if (!edgesMap.has(edgeKey)) {
        edgesMap.set(edgeKey, {
          id: edgeKey,
          source: file.path,
          target: item.resolvedPath,
          importSource: item.source,
          startLine: item.startLine,
          relationType,
          resolutionMethod,
          confidence: "observed",
          evidence: {
            specifier: item.source,
            line: item.startLine,
          },
        });
      }
    }
  }

  return { nodes, edges: Array.from(edgesMap.values()) };
}
