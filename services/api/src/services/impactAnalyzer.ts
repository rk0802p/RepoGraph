
import type {
  DependencyEdge,
  DependencyGraph,
} from "./dependencyGraph.js";

export type ImpactedFile = {
  path: string;
  distance: number;
  relationship: "direct" | "transitive";
  dependencyChain: string[];
  importLine: number;
};

export type ChangeImpactReport = {
  changedFile: string;
  totalImpactedFiles: number;
  directDependents: number;
  transitiveDependents: number;
  impactedFiles: ImpactedFile[];
};

export type ImpactAnalysisResult =
  | {
      success: true;
      report: ChangeImpactReport;
    }
  | {
      success: false;
      error: string;
    };

type DependentEdge = {
  dependentPath: string;
  dependencyPath: string;
  edge: DependencyEdge;
};

export function analyzeChangeImpact(
  graph: DependencyGraph,
  changedFile: string
): ImpactAnalysisResult {
  const normalizedPath = changedFile.replace(/\\/g, "/").replace(/^\.\/+/, "");

  const nodePaths = new Set(graph.nodes.map((node) => node.path));

  if (!nodePaths.has(normalizedPath)) {
    return {
      success: false,
      error: `File "${normalizedPath}" was not found in the dependency graph.`,
    };
  }

  /*
   * Graph edges point from importer to dependency:
   *
   *   App.tsx -> api.ts
   *
   * If api.ts changes, App.tsx may be affected.
   * Therefore, impact analysis traverses edges in reverse.
   */
  const dependentsByDependency = new Map<string, DependentEdge[]>();

  for (const edge of graph.edges) {
    const dependentEdge: DependentEdge = {
      dependentPath: edge.source,
      dependencyPath: edge.target,
      edge,
    };

    const existing = dependentsByDependency.get(edge.target) ?? [];
    existing.push(dependentEdge);
    dependentsByDependency.set(edge.target, existing);
  }

  /*
   * Breadth-first search ensures the first discovered path to a file
   * has the shortest dependency distance.
   */
  const queue: Array<{
    path: string;
    distance: number;
    dependencyChain: string[];
    importLine: number;
  }> = [
    {
      path: normalizedPath,
      distance: 0,
      dependencyChain: [normalizedPath],
      importLine: 0,
    },
  ];

  const visited = new Set<string>([normalizedPath]);
  const impactedFiles: ImpactedFile[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    if (!current) {
      continue;
    }

    const dependentEdges =
      dependentsByDependency.get(current.path) ?? [];

    for (const dependentEdge of dependentEdges) {
      const dependentPath = dependentEdge.dependentPath;

      if (visited.has(dependentPath)) {
        continue;
      }

      visited.add(dependentPath);

      const distance = current.distance + 1;
      const dependencyChain = [
        ...current.dependencyChain,
        dependentPath,
      ];

      impactedFiles.push({
        path: dependentPath,
        distance,
        relationship: distance === 1 ? "direct" : "transitive",
        dependencyChain,
        importLine: dependentEdge.edge.startLine,
      });

      queue.push({
        path: dependentPath,
        distance,
        dependencyChain,
        importLine: dependentEdge.edge.startLine,
      });
    }
  }

  impactedFiles.sort(
    (a, b) =>
      a.distance - b.distance ||
      a.path.localeCompare(b.path)
  );

  const directDependents = impactedFiles.filter(
    (file) => file.relationship === "direct"
  ).length;

  return {
    success: true,
    report: {
      changedFile: normalizedPath,
      totalImpactedFiles: impactedFiles.length,
      directDependents,
      transitiveDependents:
        impactedFiles.length - directDependents,
      impactedFiles,
    },
  };
}
