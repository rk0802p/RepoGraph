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

export function findMonorepoRoot(startDir: string): string {
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

/**
 * Checks if candidate path is strictly inside or equal to the parent root directory.
 * Normalizes Windows case-insensitivity and path separators.
 */
export function isPathInside(parent: string, child: string): boolean {
  const isWin = process.platform === 'win32';
  const parentNorm = isWin ? path.resolve(parent).toLowerCase() : path.resolve(parent);
  const childNorm = isWin ? path.resolve(child).toLowerCase() : path.resolve(child);
  const rel = path.relative(parentNorm, childNorm);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolves a repository name, relative path, or identifier to a validated directory.
 * Strict workspace containment ensures paths cannot escape the allowed workspace boundaries.
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

  // Reject null bytes or control characters
  if (repositoryPath.includes('\0')) {
    return {
      error: 'Invalid repository path.',
      status: 400,
    };
  }

  try {
    const rawPath = repositoryPath.trim();
    const monorepoRoot = findMonorepoRoot(process.cwd());
    const monorepoBase = path.basename(monorepoRoot).toLowerCase();

    // Canonical allowed workspace roots (strictly monorepoRoot and explicit REPOSITORY_WORKSPACE)
    const allowedRoots: string[] = [];
    try {
      allowedRoots.push(await realpath(monorepoRoot));
    } catch {
      allowedRoots.push(path.resolve(monorepoRoot));
    }

    if (process.env.REPOSITORY_WORKSPACE) {
      try {
        allowedRoots.push(await realpath(config.repositoryWorkspace));
      } catch {
        allowedRoots.push(path.resolve(config.repositoryWorkspace));
      }
    }

    // Portable aliases for current repository checkout (regardless of checkout folder name)
    const isCurrentRepoAlias =
      rawPath === '.' ||
      rawPath === '' ||
      rawPath === 'repo-sample-01' ||
      rawPath === 'repo-repograph' ||
      rawPath.toLowerCase() === 'repograph' ||
      rawPath.toLowerCase() === 'repograph-main' ||
      rawPath.toLowerCase() === 'repograph-master' ||
      rawPath.toLowerCase() === monorepoBase;

    if (isCurrentRepoAlias) {
      return {
        rootDirectory: allowedRoots[0],
        repository: path.basename(allowedRoots[0]),
      };
    }

    // Reject UNC and Windows device paths unless contained
    if (rawPath.startsWith('\\\\') || rawPath.startsWith('//')) {
      return {
        error: 'Access denied: repository directory is outside the allowed workspace boundary.',
        status: 403,
      };
    }

    // Pre-check for paths attempting to escape via absolute path or relative '..' traversal
    if (path.isAbsolute(rawPath)) {
      const isAbsoluteAllowed = allowedRoots.some((root) => isPathInside(root, rawPath));
      if (!isAbsoluteAllowed) {
        return {
          error: 'Access denied: repository directory is outside the allowed workspace boundary.',
          status: 403,
        };
      }
    } else if (rawPath.split(/[/\\]/).some((segment) => segment === '..')) {
      const wouldEscape = !allowedRoots.some((root) => isPathInside(root, path.resolve(root, rawPath)));
      if (wouldEscape) {
        return {
          error: 'Access denied: repository directory is outside the allowed workspace boundary.',
          status: 403,
        };
      }
    }

    // Only search within explicitly allowed roots
    const candidates = [
      path.resolve(allowedRoots[0], rawPath),
      ...(process.env.REPOSITORY_WORKSPACE ? [path.resolve(config.repositoryWorkspace, rawPath)] : []),
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

    // Strict containment verification after resolving symlinks (prevents symlink escapes)
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
