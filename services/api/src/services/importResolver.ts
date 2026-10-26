import path from "node:path";
import type { WorkspacePackageInfo } from "@repograph/shared-types";
import type { SourceFile } from "./repositoryScanner.js";
import type { CodeImport } from "./codeParser.js";

export type ResolvedImport = {
  source: string;
  startLine: number;
  resolvedPath: string | null;
  resolutionMethod?:
    | "ast_relative"
    | "monorepo_workspace"
    | "static_asset"
    | "external_package"
    | "unresolved";
  isReExport?: boolean;
  isDynamic?: boolean;
};

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

const STATIC_ASSET_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".json",
]);

function normalizePath(filePath: string): string {
  return path.posix.normalize(filePath.replace(/\\/g, "/"));
}

export function resolveImports(
  importingFile: SourceFile,
  imports: CodeImport[],
  repositoryFiles: SourceFile[],
  workspacePackages?: Map<string, WorkspacePackageInfo>
): ResolvedImport[] {
  const filesByPath = new Set(
    repositoryFiles.map((file) => normalizePath(file.path))
  );

  return imports.map((item) => {
    // Check if it's a relative import
    if (item.source.startsWith(".")) {
      const basePath = normalizePath(
        path.posix.join(
          path.posix.dirname(normalizePath(importingFile.path)),
          item.source
        )
      );

      const importExtension = path.posix.extname(basePath).toLowerCase();

      // If it explicitly references a static asset
      if (STATIC_ASSET_EXTENSIONS.has(importExtension)) {
        return {
          ...item,
          resolvedPath: null,
          resolutionMethod: "static_asset",
        };
      }

      const candidates = [
        basePath,

        // TypeScript projects may use .js specifiers for .ts source files.
        ...(importExtension === ".js"
          ? [
              basePath.slice(0, -3) + ".ts",
              basePath.slice(0, -3) + ".tsx",
            ]
          : []),

        // Extensionless imports.
        ...EXTENSIONS.map((extension) => basePath + extension),

        // Directory imports.
        ...EXTENSIONS.map((extension) =>
          path.posix.join(basePath, `index${extension}`)
        ),
      ];

      const resolvedPath =
        candidates.find((candidate) => filesByPath.has(candidate)) ?? null;

      return {
        ...item,
        resolvedPath,
        resolutionMethod: resolvedPath !== null ? "ast_relative" : "unresolved",
      };
    }

    // Check if it matches an internal monorepo package
    if (workspacePackages && workspacePackages.size > 0) {
      // Direct package name match (e.g. '@repograph/shared-types')
      const directMatch = workspacePackages.get(item.source);
      if (directMatch) {
        const normEntry = normalizePath(directMatch.entryPoint);
        // Verify if entry file exists in scanned files or matches
        const matchedPath = filesByPath.has(normEntry)
          ? normEntry
          : Array.from(filesByPath).find(
              (p) =>
                p.startsWith(directMatch.directory) &&
                (p.endsWith("index.ts") ||
                  p.endsWith("index.tsx") ||
                  p.endsWith("index.js"))
            );

        if (matchedPath) {
          return {
            ...item,
            resolvedPath: matchedPath,
            resolutionMethod: "monorepo_workspace",
          };
        }
      }

      // Subpath package match (e.g. '@repograph/shared-types/sub')
      for (const [pkgName, pkgInfo] of workspacePackages.entries()) {
        if (item.source.startsWith(pkgName + "/")) {
          const subPath = item.source.slice(pkgName.length + 1);
          const candidateBase = normalizePath(
            path.posix.join(pkgInfo.directory, "src", subPath)
          );
          const subCandidates = [
            candidateBase,
            ...EXTENSIONS.map((ext) => candidateBase + ext),
            ...EXTENSIONS.map((ext) =>
              path.posix.join(candidateBase, `index${ext}`)
            ),
          ];
          const resolvedSub =
            subCandidates.find((c) => filesByPath.has(c)) ?? null;
          if (resolvedSub) {
            return {
              ...item,
              resolvedPath: resolvedSub,
              resolutionMethod: "monorepo_workspace",
            };
          }
        }
      }
    }

    // External third-party packages (e.g. 'express', 'react', 'cytoscape')
    return {
      ...item,
      resolvedPath: null,
      resolutionMethod: "external_package",
    };
  });
}
