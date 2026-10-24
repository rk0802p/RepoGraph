
import path from "node:path";
import type { SourceFile } from "./repositoryScanner.js";
import type { CodeImport } from "./codeParser.js";

export type ResolvedImport = {
  source: string;
  startLine: number;
  resolvedPath: string | null;
};

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

function normalizePath(filePath: string): string {
  return path.posix.normalize(filePath.replace(/\\/g, "/"));
}

export function resolveImports(
  importingFile: SourceFile,
  imports: CodeImport[],
  repositoryFiles: SourceFile[]
): ResolvedImport[] {
  const filesByPath = new Set(
    repositoryFiles.map((file) => normalizePath(file.path))
  );

  return imports.map((item) => {
    // External packages such as "express" are not local files.
    if (!item.source.startsWith(".")) {
      return { ...item, resolvedPath: null };
    }

    const basePath = normalizePath(
      path.posix.join(
        path.posix.dirname(normalizePath(importingFile.path)),
        item.source
      )
    );

    const importExtension = path.posix.extname(basePath);

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
    };
  });
}
