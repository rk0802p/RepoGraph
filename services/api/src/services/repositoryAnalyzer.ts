
import { readFile } from "node:fs/promises";
import path from "node:path";

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

export type AnalyzedFile = SourceFile &
  ParsedCode & {
    resolvedImports: ResolvedImport[];
    dependencies: string[];
  };

export type RepositoryAnalysis = {
  repository: string;
  totalFiles: number;
  files: AnalyzedFile[];
};

export async function analyzeRepository(
  rootDirectory: string,
  repositoryName: string
): Promise<RepositoryAnalysis> {
  const sourceFiles = await scanRepository(rootDirectory);

  const parsedFiles = await Promise.all(
    sourceFiles.map(async (file) => {
      const absolutePath = path.resolve(rootDirectory, file.path);
      const source = await readFile(absolutePath, "utf8");
      const parsed = parseCode(source, file.extension);

      return {
        ...file,
        ...parsed,
      };
    })
  );

  const files: AnalyzedFile[] = parsedFiles.map((file) => {
    const resolvedImports = resolveImports(
      file,
      file.imports,
      sourceFiles
    );

    const dependencies = [
      ...new Set(
        resolvedImports
          .map((item) => item.resolvedPath)
          .filter((filePath): filePath is string => filePath !== null)
      ),
    ];

    return {
      ...file,
      resolvedImports,
      dependencies,
    };
  });

  return {
    repository: repositoryName,
    totalFiles: files.length,
    files,
  };
}
