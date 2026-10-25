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

export interface ConfigValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

const DEFAULT_DEV_DATABASE_URL =
  'postgresql://repograph:repograph_secret@localhost:5432/repograph_db';
const DEFAULT_DEV_REDIS_URL = 'redis://localhost:6379';

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

function parsePort(val: string | undefined): { port: number; error?: string } {
  if (val === undefined || val.trim() === '') {
    return { port: 3000 };
  }
  const parsed = Number(val);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    return {
      port: 3000,
      error: `Invalid PORT value "${val}". PORT must be an integer between 1024 and 65535.`,
    };
  }
  return { port: parsed };
}

function parseLimit(
  val: string | undefined,
  defaultVal: number,
  min = 1,
  max = 1_000_000,
  paramName = 'limit'
): { val: number; error?: string } {
  if (val === undefined || val.trim() === '') {
    return { val: defaultVal };
  }
  const parsed = Number(val);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return {
      val: defaultVal,
      error: `Invalid ${paramName} value "${val}". Must be a number between ${min} and ${max}.`,
    };
  }
  return { val: Math.floor(parsed) };
}

const monorepoRoot = resolveMonorepoRoot(process.cwd());

const parsedPortResult = parsePort(process.env.PORT);
const parsedMaxFiles = parseLimit(process.env.MAX_FILE_COUNT, 10_000, 10, 100_000, 'MAX_FILE_COUNT');
const parsedMaxDepth = parseLimit(process.env.MAX_SCAN_DEPTH, 30, 1, 100, 'MAX_SCAN_DEPTH');
const parsedMaxRepoMb = parseLimit(process.env.MAX_REPO_SIZE_MB, 250, 1, 10_000, 'MAX_REPO_SIZE_MB');
const parsedTimeout = parseLimit(process.env.PARSER_WORKER_TIMEOUT_SEC, 300, 5, 3600, 'PARSER_WORKER_TIMEOUT_SEC');

export const config: AppConfig = {
  port: parsedPortResult.port,
  nodeEnv: (['development', 'production', 'test'].includes(process.env.NODE_ENV || '')
    ? (process.env.NODE_ENV as 'development' | 'production' | 'test')
    : 'development'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: process.env.DATABASE_URL || DEFAULT_DEV_DATABASE_URL,
  redisUrl: process.env.REDIS_URL || DEFAULT_DEV_REDIS_URL,
  repositoryWorkspace: process.env.REPOSITORY_WORKSPACE
    ? path.resolve(process.env.REPOSITORY_WORKSPACE)
    : monorepoRoot,
  limits: {
    maxFiles: parsedMaxFiles.val,
    maxDepth: parsedMaxDepth.val,
    maxRepoSizeMb: parsedMaxRepoMb.val,
    parserTimeoutSec: parsedTimeout.val,
  },
};

/**
 * Validates configuration and raw environment inputs.
 * Enforces production secrets requirements and rejects invalid numeric strings.
 */
export function validateConfig(
  cfg: AppConfig = config,
  rawEnv: NodeJS.ProcessEnv = process.env
): ConfigValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check raw port input errors
  if (rawEnv.PORT !== undefined && rawEnv.PORT.trim() !== '') {
    const rawPort = Number(rawEnv.PORT);
    if (!Number.isInteger(rawPort) || rawPort < 1024 || rawPort > 65535) {
      errors.push(`Raw PORT environment variable "${rawEnv.PORT}" is invalid. Must be between 1024 and 65535.`);
    }
  }

  // Check limit parse errors
  if (parsedMaxFiles.error) errors.push(parsedMaxFiles.error);
  if (parsedMaxDepth.error) errors.push(parsedMaxDepth.error);
  if (parsedMaxRepoMb.error) errors.push(parsedMaxRepoMb.error);
  if (parsedTimeout.error) errors.push(parsedTimeout.error);

  // Validate port range on active config
  if (cfg.port < 1024 || cfg.port > 65535) {
    errors.push(`Configured port ${cfg.port} is outside valid unprivileged port range (1024-65535).`);
  }

  // Validate URLs syntax
  try {
    const dbUrl = new URL(cfg.databaseUrl);
    if (!['postgresql:', 'postgres:'].includes(dbUrl.protocol)) {
      errors.push(`Invalid DATABASE_URL protocol "${dbUrl.protocol}". Must be postgresql:// or postgres://.`);
    }
  } catch {
    errors.push(`DATABASE_URL is not a valid URL: "${cfg.databaseUrl}".`);
  }

  try {
    const redisUrl = new URL(cfg.redisUrl);
    if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
      errors.push(`Invalid REDIS_URL protocol "${redisUrl.protocol}". Must be redis:// or rediss://.`);
    }
  } catch {
    errors.push(`REDIS_URL is not a valid URL: "${cfg.redisUrl}".`);
  }

  // Production environment constraints
  if (cfg.nodeEnv === 'production') {
    if (cfg.corsOrigin === '*') {
      errors.push('CORS_ORIGIN cannot be set to wildcard "*" in production. Must specify authorized origins.');
    }

    if (!rawEnv.DATABASE_URL || cfg.databaseUrl === DEFAULT_DEV_DATABASE_URL) {
      errors.push('DATABASE_URL must be explicitly configured in production (cannot use local development default).');
    }

    if (!rawEnv.REDIS_URL || cfg.redisUrl === DEFAULT_DEV_REDIS_URL) {
      warnings.push('REDIS_URL is using default localhost in production; verify external Redis connectivity.');
    }
  } else {
    if (cfg.databaseUrl === DEFAULT_DEV_DATABASE_URL) {
      warnings.push('Using default local PostgreSQL credentials for development/testing.');
    }
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
