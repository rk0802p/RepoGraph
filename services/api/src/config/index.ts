import dotenv from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';

dotenv.config();

export interface AppLimits {
  maxFiles: number;
  maxDepth: number;
  maxRepoSizeMb: number;
  parserTimeoutSec: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  repositoryWorkspace: string;
  limits: AppLimits;
}

function resolveMonorepoRoot(startDir: string): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (
      (existsSync(path.join(curr, '.git')) || existsSync(path.join(curr, 'package.json'))) &&
      existsSync(path.join(curr, 'services')) &&
      existsSync(path.join(curr, 'apps'))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir);
}

function parsePort(val: string | undefined, defaultPort = 3000): number {
  if (!val) return defaultPort;
  const parsed = Number(val);
  if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535) {
    return parsed;
  }
  return defaultPort;
}

function parseLimit(val: string | undefined, defaultVal: number, min = 1, max = 1_000_000): number {
  if (!val) return defaultVal;
  const parsed = Number(val);
  if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
    return Math.floor(parsed);
  }
  return defaultVal;
}

const monorepoRoot = resolveMonorepoRoot(process.cwd());

export const config: AppConfig = {
  port: parsePort(process.env.PORT, 3000),
  nodeEnv: (['development', 'production', 'test'].includes(process.env.NODE_ENV || '')
    ? (process.env.NODE_ENV as 'development' | 'production' | 'test')
    : 'development'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://repograph:repograph_secret@localhost:5432/repograph_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  repositoryWorkspace: process.env.REPOSITORY_WORKSPACE
    ? path.resolve(process.env.REPOSITORY_WORKSPACE)
    : monorepoRoot,
  limits: {
    maxFiles: parseLimit(process.env.MAX_FILE_COUNT, 10_000, 10, 100_000),
    maxDepth: parseLimit(process.env.MAX_SCAN_DEPTH, 30, 1, 100),
    maxRepoSizeMb: parseLimit(process.env.MAX_REPO_SIZE_MB, 250, 1, 10_000),
    parserTimeoutSec: parseLimit(process.env.PARSER_WORKER_TIMEOUT_SEC, 300, 5, 3600),
  },
};

export interface ConfigValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateConfig(cfg: AppConfig = config): ConfigValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (cfg.port < 1024 || cfg.port > 65535) {
    errors.push(`Port ${cfg.port} is outside valid unprivileged port range (1024-65535).`);
  }

  if (cfg.nodeEnv === 'production' && cfg.corsOrigin === '*') {
    warnings.push('CORS_ORIGIN is set to "*" in production. It is recommended to restrict this to specific origins.');
  }

  if (!existsSync(cfg.repositoryWorkspace)) {
    warnings.push(`Repository workspace directory does not exist on disk: ${cfg.repositoryWorkspace}`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
