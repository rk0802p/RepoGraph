import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../config/index.js';

export type RepositoryResolution =
  | {
      error: string;
      status: number;
    }
  | {
      rootDirectory: string;
      repository: string;
    };

function findMonorepoRoot(startDir: string): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(curr, '.git')) || existsSync(path.join(curr, 'package.json'))) {
      if (existsSync(path.join(curr, 'services')) && existsSync(path.join(curr, 'apps'))) {
        return curr;
      }
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir);
}

function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolves a repository name, relative path, or identifier to a validated directory.
 * Includes containment verification to prevent directory traversal attacks.
 */
export async function resolveRepository(
  repositoryPath: unknown
): Promise<RepositoryResolution> {
  if (
    typeof repositoryPath !== 'string' ||
    repositoryPath.trim().length === 0
  ) {
    return {
      error: 'A repository path is required in the "path" field.',
      status: 400,
    };
  }

  // Reject null bytes or dangerous path components
  if (repositoryPath.includes('\0')) {
    return {
      error: 'Invalid repository path.',
      status: 400,
    };
  }

  try {
    const rawPath = repositoryPath.trim();
    const monorepoRoot = findMonorepoRoot(process.cwd());

    // If identifier matches monorepo or standard sample id, resolve immediately
    if (
      rawPath === 'repo-sample-01' ||
      rawPath === 'repo-repograph' ||
      rawPath.toLowerCase() === path.basename(monorepoRoot).toLowerCase() ||
      rawPath === '.' ||
      rawPath === ''
    ) {
      return {
        rootDirectory: monorepoRoot,
        repository: path.basename(monorepoRoot),
      };
    }

    // Allowed container roots
    const allowedRoots = [
      monorepoRoot,
      config.repositoryWorkspace,
      path.dirname(monorepoRoot),
    ];

    // Try candidates
    const candidates = [
      path.resolve(config.repositoryWorkspace, rawPath),
      path.resolve(monorepoRoot, '..', rawPath),
      path.resolve(monorepoRoot, rawPath),
      path.resolve(process.cwd(), rawPath),
    ];

    let targetDir: string | null = null;
    let repoName = rawPath;

    for (const cand of candidates) {
      try {
        const resolved = await realpath(cand);
        const stats = await stat(resolved);
        if (stats.isDirectory()) {
          targetDir = resolved;
          repoName = path.basename(resolved);
          break;
        }
      } catch {
        // Continue searching
      }
    }

    if (!targetDir) {
      return {
        error: `Repository "${rawPath}" was not found in the configured workspace.`,
        status: 404,
      };
    }

    // Security check: Ensure resolved target directory is strictly within allowed workspace roots
    const isContained = allowedRoots.some((allowed) => isPathInside(allowed, targetDir!));
    if (!isContained) {
      return {
        error: 'Access denied: repository directory is outside the allowed workspace boundary.',
        status: 403,
      };
    }

    return {
      rootDirectory: targetDir,
      repository: repoName,
    };
  } catch {
    return {
      error: 'Failed to resolve repository path.',
      status: 500,
    };
  }
}
