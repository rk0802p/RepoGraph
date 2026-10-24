
import type { AnalyzedFile } from "./repositoryAnalyzer.js";

export type DependencyNode = {
  id: string;
  path: string;
  language: string;
  extension: string;
};

export type DependencyEdge = {
  source: string;
  target: string;
  importSource: string;
  startLine: number;
};

export type DependencyGraph = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
};

export function buildDependencyGraph(
  files: AnalyzedFile[]
): DependencyGraph {
  const nodes: DependencyNode[] = files.map((file) => ({
    id: file.path,
    path: file.path,
    language: file.language,
    extension: file.extension,
  }));

  const filePaths = new Set(nodes.map((node) => node.path));
  const edges: DependencyEdge[] = [];

  for (const file of files) {
    for (const item of file.resolvedImports) {
      if (
        item.resolvedPath === null ||
        !filePaths.has(item.resolvedPath)
      ) {
        continue;
      }

      edges.push({
        source: file.path,
        target: item.resolvedPath,
        importSource: item.source,
        startLine: item.startLine,
      });
    }
  }

  return { nodes, edges };
}
