
import { readdir } from "node:fs/promises";
import path from "node:path";

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

const MAX_FILES = 10_000;
const MAX_DEPTH = 30;

export async function scanRepository(
  rootDirectory: string
): Promise<SourceFile[]> {
  const root = path.resolve(rootDirectory);
  const results: SourceFile[] = [];

  async function walk(
    currentDirectory: string,
    depth: number
  ): Promise<void> {
    if (depth > MAX_DEPTH || results.length >= MAX_FILES) {
      return;
    }

    const entries = await readdir(currentDirectory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (results.length >= MAX_FILES) {
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
