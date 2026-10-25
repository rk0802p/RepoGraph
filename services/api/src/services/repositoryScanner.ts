import { readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config/index.js";

export type SourceFile = {
  path: string;
  language: string;
  extension: string;
};

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  ".js": "JavaScript",
  ".jsx": "JavaScript React",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript React",
};

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".venv",
  "__pycache__",
]);

export interface ScanOptions {
  maxFiles?: number;
  maxDepth?: number;
}

export async function scanRepository(
  rootDirectory: string,
  options: ScanOptions = {}
): Promise<SourceFile[]> {
  const root = path.resolve(rootDirectory);
  const results: SourceFile[] = [];

  const maxFiles = options.maxFiles ?? config.limits.maxFiles;
  const maxDepth = options.maxDepth ?? config.limits.maxDepth;

  async function walk(
    currentDirectory: string,
    depth: number
  ): Promise<void> {
    if (depth > maxDepth || results.length >= maxFiles) {
      return;
    }

    const entries = await readdir(currentDirectory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (results.length >= maxFiles) {
        break;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        await walk(absolutePath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const language = SUPPORTED_EXTENSIONS[extension];

      if (!language) {
        continue;
      }

      results.push({
        path: path.relative(root, absolutePath).split(path.sep).join("/"),
        language,
        extension,
      });
    }
  }

  await walk(root, 0);

  return results.sort((a, b) => a.path.localeCompare(b.path));
}
