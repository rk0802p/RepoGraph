import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Helper functions mirroring frontend logic
function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/").toLowerCase();
  const base = norm.split("/").pop() ?? norm;
  return (
    /\.(test|spec)\.[^.]+$/i.test(base) ||
    /(^|\/)(__tests__|tests?)(\/|$)/i.test(norm)
  );
}

function getLanguageBadge(ext: string): { label: string; colorClass: string } {
  switch (ext.toLowerCase()) {
    case ".ts":
      return { label: "TS", colorClass: "lang-ts" };
    case ".tsx":
      return { label: "TSX", colorClass: "lang-ts" };
    case ".js":
      return { label: "JS", colorClass: "lang-js" };
    case ".jsx":
      return { label: "JSX", colorClass: "lang-js" };
    case ".json":
      return { label: "JSON", colorClass: "lang-json" };
    case ".md":
      return { label: "MD", colorClass: "lang-md" };
    case ".css":
      return { label: "CSS", colorClass: "lang-css" };
    default:
      return { label: ext.replace(".", "").toUpperCase() || "FILE", colorClass: "lang-default" };
  }
}

function calculateDegreeCentrality(
  files: Array<{ path: string }>,
  edges: Array<{ source: string; target: string }>
) {
  const inDegrees = new Map<string, number>();
  const outDegrees = new Map<string, number>();

  for (const edge of edges) {
    outDegrees.set(edge.source, (outDegrees.get(edge.source) || 0) + 1);
    inDegrees.set(edge.target, (inDegrees.get(edge.target) || 0) + 1);
  }

  return files.map((f) => ({
    path: f.path,
    inDegree: inDegrees.get(f.path) || 0,
    outDegree: outDegrees.get(f.path) || 0,
    totalDegree: (inDegrees.get(f.path) || 0) + (outDegrees.get(f.path) || 0),
  })).sort((a, b) => b.totalDegree - a.totalDegree);
}

function computeLanguageDistribution(files: Array<{ extension: string }>) {
  if (files.length === 0) return [];
  const counts: Record<string, number> = {};

  for (const f of files) {
    const ext = f.extension.toLowerCase();
    counts[ext] = (counts[ext] || 0) + 1;
  }

  const total = files.length;
  return Object.entries(counts).map(([ext, count]) => ({
    extension: ext,
    count,
    percentage: ((count / total) * 100).toFixed(1),
  }));
}

describe("RepoGraph Code Atlas — Frontend Intelligence Helpers", () => {
  it("accurately identifies test files across varied naming conventions", () => {
    assert.equal(isTestFile("services/api/src/tests/api.test.ts"), true);
    assert.equal(isTestFile("src/components/button.spec.tsx"), true);
    assert.equal(isTestFile("src/__tests__/app.ts"), true);
    assert.equal(isTestFile("src/services/repositoryScanner.ts"), false);
    assert.equal(isTestFile("packages/shared-types/src/index.ts"), false);
  });

  it("assigns appropriate language badges and color tokens", () => {
    assert.deepEqual(getLanguageBadge(".ts"), { label: "TS", colorClass: "lang-ts" });
    assert.deepEqual(getLanguageBadge(".tsx"), { label: "TSX", colorClass: "lang-ts" });
    assert.deepEqual(getLanguageBadge(".js"), { label: "JS", colorClass: "lang-js" });
    assert.deepEqual(getLanguageBadge(".json"), { label: "JSON", colorClass: "lang-json" });
    assert.deepEqual(getLanguageBadge(".md"), { label: "MD", colorClass: "lang-md" });
  });

  it("calculates in-degree, out-degree, and total degree centrality for hubs", () => {
    const sampleFiles = [
      { path: "src/index.ts" },
      { path: "src/app.ts" },
      { path: "src/utils.ts" },
    ];
    const sampleEdges = [
      { source: "src/index.ts", target: "src/app.ts" },
      { source: "src/app.ts", target: "src/utils.ts" },
      { source: "src/index.ts", target: "src/utils.ts" },
    ];

    const hubs = calculateDegreeCentrality(sampleFiles, sampleEdges);
    assert.equal(hubs.length, 3);
    // index: out=2, in=0, total=2
    // app: out=1, in=1, total=2
    // utils: out=0, in=2, total=2
    const utilsHub = hubs.find((h) => h.path === "src/utils.ts");
    assert.equal(utilsHub?.inDegree, 2);
    assert.equal(utilsHub?.outDegree, 0);
  });

  it("calculates accurate language distribution percentages", () => {
    const files = [
      { extension: ".ts" },
      { extension: ".ts" },
      { extension: ".ts" },
      { extension: ".json" },
    ];
    const dist = computeLanguageDistribution(files);
    const tsEntry = dist.find((d) => d.extension === ".ts");
    const jsonEntry = dist.find((d) => d.extension === ".json");

    assert.equal(tsEntry?.count, 3);
    assert.equal(tsEntry?.percentage, "75.0");
    assert.equal(jsonEntry?.count, 1);
    assert.equal(jsonEntry?.percentage, "25.0");
  });
});
