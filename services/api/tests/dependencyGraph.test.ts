import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDependencyGraph,
} from "../src/services/dependencyGraph.js";
import type {
  AnalyzedFile,
} from "../src/services/repositoryAnalyzer.js";

function createFile(
  filePath: string,
  dependencies: string[] = []
): AnalyzedFile {
  return {
    path: filePath,
    language: "TypeScript",
    extension: ".ts",
    symbols: [],
    imports: [],
    resolvedImports: dependencies.map((dependency) => ({
      source: `./${dependency.split("/").pop()?.replace(/\.ts$/, "")}`,
      startLine: 1,
      resolvedPath: dependency,
    })),
    dependencies,
  };
}

test("creates one graph node for each analyzed file", () => {
  const graph = buildDependencyGraph([
    createFile("src/app.ts"),
    createFile("src/auth.ts"),
  ]);

  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["src/app.ts", "src/auth.ts"]
  );
});

test("creates a directed edge from importer to dependency", () => {
  const graph = buildDependencyGraph([
    createFile("src/app.ts", ["src/auth.ts"]),
    createFile("src/auth.ts"),
  ]);

  assert.deepEqual(graph.edges, [
    {
      id: "src/app.ts->src/auth.ts",
      source: "src/app.ts",
      target: "src/auth.ts",
      importSource: "./auth",
      startLine: 1,
      relationType: "IMPORTS",
      resolutionMethod: "ast_relative",
      confidence: "observed",
      evidence: {
        specifier: "./auth",
        line: 1,
      },
    },
  ]);
});

test("supports multiple dependencies from one file", () => {
  const graph = buildDependencyGraph([
    createFile("src/app.ts", [
      "src/auth.ts",
      "src/database.ts",
    ]),
    createFile("src/auth.ts"),
    createFile("src/database.ts"),
  ]);

  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);

  assert.deepEqual(
    graph.edges.map((edge) => edge.target),
    ["src/auth.ts", "src/database.ts"]
  );
});

test("deduplicates parallel edges between the same file pair", () => {
  const fileA: AnalyzedFile = {
    path: "src/app.ts",
    language: "TypeScript",
    extension: ".ts",
    symbols: [],
    imports: [],
    resolvedImports: [
      { source: "./auth", startLine: 1, resolvedPath: "src/auth.ts" },
      { source: "./auth", startLine: 12, resolvedPath: "src/auth.ts" },
    ],
    dependencies: ["src/auth.ts"],
  };

  const fileB = createFile("src/auth.ts");

  const graph = buildDependencyGraph([fileA, fileB]);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].id, "src/app.ts->src/auth.ts");
  assert.equal(graph.edges[0].confidence, "observed");
});

test("keeps isolated files as nodes without edges", () => {
  const graph = buildDependencyGraph([
    createFile("src/app.ts"),
    createFile("src/standalone.ts"),
  ]);

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 0);
});

test("does not create edges to files outside the graph", () => {
  const graph = buildDependencyGraph([
    createFile("src/app.ts", ["src/missing.ts"]),
  ]);

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.edges.length, 0);
});
