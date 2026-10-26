import path from 'node:path';
import { realpath, stat, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { WorkspacePackageInfo } from '@repograph/shared-types';
import { config } from '../config/index.js';

export type RepositoryResolution =
  | {
      error: string;
      status: number;
    }
  | {
      rootDirectory: string;
      repository: string;
      commitSha?: string;
      branch?: string;
      isMonorepo?: boolean;
      workspacePackages?: Map<string, WorkspacePackageInfo>;
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
 * Discovers internal monorepo packages and their source entry points.
 */
export async function discoverWorkspacePackages(
  rootDirectory: string
): Promise<Map<string, WorkspacePackageInfo>> {
  const packageMap = new Map<string, WorkspacePackageInfo>();
  const rootPkgPath = path.join(rootDirectory, 'package.json');
  if (!existsSync(rootPkgPath)) {
    return packageMap;
  }

  try {
    const rootPkgRaw = await readFile(rootPkgPath, 'utf8');
    const rootPkg = JSON.parse(rootPkgRaw);
    const workspacePatterns: string[] = Array.isArray(rootPkg.workspaces)
      ? rootPkg.workspaces
      : Array.isArray(rootPkg.workspaces?.packages)
        ? rootPkg.workspaces.packages
        : ['packages/*', 'services/*', 'apps/*'];

    for (const pattern of workspacePatterns) {
      const baseDir = pattern.replace(/\/\*.*$/, '');
      const fullBaseDir = path.join(rootDirectory, baseDir);
      if (!existsSync(fullBaseDir)) continue;

      try {
        const subdirs = await readdir(fullBaseDir, { withFileTypes: true });
        for (const sub of subdirs) {
          if (!sub.isDirectory()) continue;
          const pkgJsonPath = path.join(fullBaseDir, sub.name, 'package.json');
          if (!existsSync(pkgJsonPath)) continue;

          try {
            const pkgRaw = await readFile(pkgJsonPath, 'utf8');
            const pkg = JSON.parse(pkgRaw);
            if (!pkg.name) continue;

            const pkgRelDir = path.posix.normalize(
              path.relative(rootDirectory, path.join(fullBaseDir, sub.name)).replace(/\\/g, '/')
            );

            const candidateEntries = [
              path.posix.join(pkgRelDir, 'src', 'index.ts'),
              path.posix.join(pkgRelDir, 'src', 'index.tsx'),
              path.posix.join(pkgRelDir, 'src', 'index.js'),
              path.posix.join(pkgRelDir, 'src', 'main.tsx'),
              path.posix.join(pkgRelDir, 'src', 'main.ts'),
              path.posix.join(pkgRelDir, 'index.ts'),
              path.posix.join(pkgRelDir, 'index.js'),
            ];

            if (pkg.main && typeof pkg.main === 'string') {
              const srcMain = pkg.main
                .replace(/^(\.\/)?dist\//, 'src/')
                .replace(/^(\.\/)?lib\//, 'src/')
                .replace(/\.js$/, '.ts');
              candidateEntries.unshift(path.posix.join(pkgRelDir, srcMain));
            }

            let resolvedEntry = '';
            for (const cand of candidateEntries) {
              if (existsSync(path.join(rootDirectory, cand))) {
                resolvedEntry = cand;
                break;
              }
            }

            packageMap.set(pkg.name, {
              name: pkg.name,
              version: pkg.version,
              directory: pkgRelDir,
              entryPoint: resolvedEntry || path.posix.join(pkgRelDir, 'src', 'index.ts'),
              isPrivate: Boolean(pkg.private),
            });
          } catch {
            // Ignore malformed sub-package.json
          }
        }
      } catch {
        // Ignore unreadable directory
      }
    }
  } catch {
    // Ignore malformed root package.json
  }

  return packageMap;
}

/**
 * Extracts revision fingerprint (commit SHA, branch) if available.
 */
export async function getRepositoryFingerprint(rootDirectory: string): Promise<{
  commitSha: string;
  branch: string;
}> {
  let commitSha = 'HEAD';
  let branch = 'main';

  const gitHeadPath = path.join(rootDirectory, '.git', 'HEAD');
  if (existsSync(gitHeadPath)) {
    try {
      const headContent = (await readFile(gitHeadPath, 'utf8')).trim();
      if (headContent.startsWith('ref: ')) {
        const refRelative = headContent.slice(5).trim();
        branch = refRelative.replace(/^refs\/heads\//, '');
        const refPath = path.join(rootDirectory, '.git', refRelative);
        if (existsSync(refPath)) {
          commitSha = (await readFile(refPath, 'utf8')).trim().slice(0, 7);
        } else {
          const packedRefsPath = path.join(rootDirectory, '.git', 'packed-refs');
          if (existsSync(packedRefsPath)) {
            const packed = await readFile(packedRefsPath, 'utf8');
            for (const line of packed.split('\n')) {
              if (line.endsWith(refRelative)) {
                commitSha = line.split(' ')[0].trim().slice(0, 7);
                break;
              }
            }
          }
        }
      } else if (headContent.length >= 7) {
        commitSha = headContent.slice(0, 7);
      }
    } catch {
      // Fallback
    }
  }

  return { commitSha, branch };
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
      const rootDir = allowedRoots[0];
      const fingerprint = await getRepositoryFingerprint(rootDir);
      const workspacePackages = await discoverWorkspacePackages(rootDir);
      return {
        rootDirectory: rootDir,
        repository: path.basename(rootDir),
        commitSha: fingerprint.commitSha,
        branch: fingerprint.branch,
        isMonorepo: workspacePackages.size > 0,
        workspacePackages,
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

    const fingerprint = await getRepositoryFingerprint(targetDir);
    const workspacePackages = await discoverWorkspacePackages(targetDir);

    return {
      rootDirectory: targetDir,
      repository: repoName,
      commitSha: fingerprint.commitSha,
      branch: fingerprint.branch,
      isMonorepo: workspacePackages.size > 0,
      workspacePackages,
    };
  } catch {
    return {
      error: 'Failed to resolve repository path.',
      status: 500,
    };
  }
}
