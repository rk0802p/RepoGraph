import test from "node:test";
import assert from "node:assert/strict";

import { resolveImports } from "../src/services/importResolver.js";
import type { SourceFile } from "../src/services/repositoryScanner.js";
import type { CodeImport } from "../src/services/codeParser.js";
import type { WorkspacePackageInfo } from "@repograph/shared-types";

const importingFile: SourceFile = {
  path: "src/app.ts",
  language: "TypeScript",
  extension: ".ts",
};

const repositoryFiles: SourceFile[] = [
  importingFile,
  {
    path: "src/auth.ts",
    language: "TypeScript",
    extension: ".ts",
  },
  {
    path: "src/auth.js",
    language: "JavaScript",
    extension: ".js",
  },
  {
    path: "src/services/index.ts",
    language: "TypeScript",
    extension: ".ts",
  },
];

function resolveOne(source: string) {
  const imports: CodeImport[] = [
    { source, startLine: 1 },
  ];

  return resolveImports(
    importingFile,
    imports,
    repositoryFiles
  )[0];
}

test("resolves extensionless relative imports", () => {
  assert.equal(
    resolveOne("./auth")?.resolvedPath,
    "src/auth.ts"
  );
});

test("resolves imports with explicit extensions", () => {
  assert.equal(
    resolveOne("./auth.js")?.resolvedPath,
    "src/auth.js"
  );
});

test("resolves directory imports through index files", () => {
  assert.equal(
    resolveOne("./services")?.resolvedPath,
    "src/services/index.ts"
  );
});

test("does not resolve external packages as local files", () => {
  assert.equal(
    resolveOne("express")?.resolvedPath,
    null
  );
  assert.equal(
    resolveOne("express")?.resolutionMethod,
    "external_package"
  );
});

test("returns null for missing relative imports", () => {
  assert.equal(
    resolveOne("./missing")?.resolvedPath,
    null
  );
});

test("normalizes Windows-style repository paths", () => {
  const windowsImporter: SourceFile = {
    ...importingFile,
    path: "src\\app.ts",
  };

  const result = resolveImports(
    windowsImporter,
    [{ source: "./auth", startLine: 1 }],
    repositoryFiles
  );

  assert.equal(result[0]?.resolvedPath, "src/auth.ts");
});

test("resolves .js import specifiers to TypeScript source files", () => {
  const result = resolveImports(
    importingFile,
    [{ source: "./repositoryAnalyzer.js", startLine: 1 }],
    [
      importingFile,
      {
        path: "src/repositoryAnalyzer.ts",
        language: "TypeScript",
        extension: ".ts",
      },
    ]
  );

  assert.equal(
    result[0]?.resolvedPath,
    "src/repositoryAnalyzer.ts"
  );
});

test("resolves monorepo workspace package imports", () => {
  const workspacePackages = new Map<string, WorkspacePackageInfo>([
    [
      "@repograph/shared-types",
      {
        name: "@repograph/shared-types",
        directory: "packages/shared-types",
        entryPoint: "packages/shared-types/src/index.ts",
      },
    ],
  ]);

  const repoFilesWithWorkspace: SourceFile[] = [
    {
      path: "services/api/src/routes/repositories.ts",
      language: "TypeScript",
      extension: ".ts",
    },
    {
      path: "packages/shared-types/src/index.ts",
      language: "TypeScript",
      extension: ".ts",
    },
  ];

  const result = resolveImports(
    repoFilesWithWorkspace[0],
    [{ source: "@repograph/shared-types", startLine: 2 }],
    repoFilesWithWorkspace,
    workspacePackages
  );

  assert.equal(
    result[0]?.resolvedPath,
    "packages/shared-types/src/index.ts"
  );
  assert.equal(
    result[0]?.resolutionMethod,
    "monorepo_workspace"
  );
});

test("identifies static asset imports explicitly", () => {
  const result = resolveImports(
    importingFile,
    [{ source: "./styles.css", startLine: 1 }],
    repositoryFiles
  );

  assert.equal(result[0]?.resolvedPath, null);
  assert.equal(result[0]?.resolutionMethod, "static_asset");
});
