import dotenv from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';

dotenv.config();

export type SupportedEnvironment = 'development' | 'production' | 'test';

export interface AppLimits {
  maxFiles: number;
  maxDepth: number;
  maxRepoSizeMb: number;
  parserTimeoutSec: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: SupportedEnvironment;
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

export const DEFAULT_DEV_DATABASE_URL =
  'postgresql://repograph:repograph_secret@localhost:5432/repograph_db';
export const DEFAULT_DEV_REDIS_URL = 'redis://localhost:6379';

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

function parseInteger(
  val: string | undefined,
  defaultVal: number,
  min: number,
  max: number,
  paramName: string,
  errors: string[]
): number {
  if (val === undefined || val.trim() === '') {
    return defaultVal;
  }
  const trimmed = val.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    errors.push(
      `Invalid ${paramName} value "${trimmed}". Must be a whole integer between ${min} and ${max}.`
    );
    return defaultVal;
  }
  const parsed = Number(trimmed);
  if (parsed < min || parsed > max) {
    errors.push(
      `Invalid ${paramName} value "${trimmed}". Must be between ${min} and ${max}.`
    );
    return defaultVal;
  }
  return parsed;
}

/**
 * Deterministically parses and validates configuration from raw environment variables.
 * Does not rely on stale module-level captured variables.
 */
export function parseAndValidateConfig(
  rawEnv: NodeJS.ProcessEnv = process.env
): { config: AppConfig; result: ConfigValidationResult } {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Validate NODE_ENV
  const rawNodeEnv = rawEnv.NODE_ENV !== undefined ? rawEnv.NODE_ENV.trim() : '';
  let nodeEnv: SupportedEnvironment = 'development';

  if (rawNodeEnv === '') {
    nodeEnv = 'development';
  } else if (rawNodeEnv === 'development' || rawNodeEnv === 'production' || rawNodeEnv === 'test') {
    nodeEnv = rawNodeEnv;
  } else {
    errors.push(
      `Invalid NODE_ENV "${rawNodeEnv}". Allowed environments are: development, production, test.`
    );
    // Retain invalid string for inspection in type-cast config without silently assuming dev
    nodeEnv = 'development';
  }

  // 2. Validate PORT
  const port = parseInteger(rawEnv.PORT, 3000, 1024, 65535, 'PORT', errors);

  // 3. Validate Limits
  const maxFiles = parseInteger(rawEnv.MAX_FILE_COUNT, 10_000, 10, 100_000, 'MAX_FILE_COUNT', errors);
  const maxDepth = parseInteger(rawEnv.MAX_SCAN_DEPTH, 30, 1, 100, 'MAX_SCAN_DEPTH', errors);
  const maxRepoSizeMb = parseInteger(rawEnv.MAX_REPO_SIZE_MB, 250, 1, 10_000, 'MAX_REPO_SIZE_MB', errors);
  const parserTimeoutSec = parseInteger(rawEnv.PARSER_WORKER_TIMEOUT_SEC, 300, 5, 3600, 'PARSER_WORKER_TIMEOUT_SEC', errors);

  // 4. Validate CORS Origin
  const corsOrigin = rawEnv.CORS_ORIGIN || '*';
  if (nodeEnv === 'production') {
    if (corsOrigin === '*') {
      errors.push('CORS_ORIGIN cannot be set to wildcard "*" in production. Must specify authorized origins.');
    }
  }

  // 5. Validate Database URL
  let databaseUrl = rawEnv.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') {
    if (nodeEnv === 'production') {
      errors.push('DATABASE_URL must be explicitly configured in production.');
      databaseUrl = '';
    } else {
      databaseUrl = DEFAULT_DEV_DATABASE_URL;
      warnings.push('Using default local PostgreSQL credentials for development/testing.');
    }
  } else {
    databaseUrl = databaseUrl.trim();
    try {
      const parsedUrl = new URL(databaseUrl);
      if (!['postgresql:', 'postgres:'].includes(parsedUrl.protocol)) {
        errors.push(`Invalid DATABASE_URL protocol "${parsedUrl.protocol}". Must be postgresql:// or postgres://.`);
      }
      if (nodeEnv === 'production') {
        if (databaseUrl.includes('repograph_secret') || databaseUrl.includes('localhost:5432/repograph_db')) {
          errors.push('DATABASE_URL in production cannot use known local development credentials.');
        }
      }
    } catch {
      errors.push('DATABASE_URL is not a valid URL.');
    }
  }

  // 6. Validate Redis URL
  let redisUrl = rawEnv.REDIS_URL;
  if (!redisUrl || redisUrl.trim() === '') {
    redisUrl = DEFAULT_DEV_REDIS_URL;
    if (nodeEnv === 'production') {
      warnings.push('REDIS_URL is not configured; caching and background queueing are disabled in direct-on-disk mode.');
    }
  } else {
    redisUrl = redisUrl.trim();
    try {
      const parsedRedis = new URL(redisUrl);
      if (!['redis:', 'rediss:'].includes(parsedRedis.protocol)) {
        errors.push(`Invalid REDIS_URL protocol "${parsedRedis.protocol}". Must be redis:// or rediss://.`);
      }
    } catch {
      errors.push('REDIS_URL is not a valid URL.');
    }
  }

  // 7. Validate Workspace Root
  const monorepoRoot = resolveMonorepoRoot(process.cwd());
  const repositoryWorkspace = rawEnv.REPOSITORY_WORKSPACE
    ? path.resolve(rawEnv.REPOSITORY_WORKSPACE)
    : monorepoRoot;

  if (rawEnv.REPOSITORY_WORKSPACE) {
    const parsedWorkspace = path.resolve(rawEnv.REPOSITORY_WORKSPACE);
    const parentDir = path.dirname(parsedWorkspace);
    if (parentDir === parsedWorkspace) {
      errors.push('REPOSITORY_WORKSPACE cannot be set to the filesystem root directory.');
    }
    if (!existsSync(parsedWorkspace)) {
      warnings.push(`Configured REPOSITORY_WORKSPACE does not exist on disk: ${parsedWorkspace}`);
    }
  }

  const parsedConfig: AppConfig = {
    port,
    nodeEnv,
    corsOrigin,
    databaseUrl,
    redisUrl,
    repositoryWorkspace,
    limits: {
      maxFiles,
      maxDepth,
      maxRepoSizeMb,
      parserTimeoutSec,
    },
  };

  return {
    config: parsedConfig,
    result: {
      valid: errors.length === 0,
      warnings,
      errors,
    },
  };
}

// Active startup config
const parsed = parseAndValidateConfig(process.env);
export const config: AppConfig = parsed.config;

/**
 * Validates configuration and raw environment inputs.
 */
export function validateConfig(
  cfg: AppConfig = config,
  rawEnv: NodeJS.ProcessEnv = process.env
): ConfigValidationResult {
  // If custom cfg is provided, validate both rawEnv and cfg invariants
  const { result } = parseAndValidateConfig(rawEnv);
  const errors = [...result.errors];
  const warnings = [...result.warnings];

  // Also check direct cfg parameters if explicitly overridden
  if (cfg.port < 1024 || cfg.port > 65535) {
    if (!errors.some((e) => e.includes('PORT'))) {
      errors.push(`Configured port ${cfg.port} is outside valid unprivileged port range (1024-65535).`);
    }
  }

  if (cfg.nodeEnv === 'production') {
    if (cfg.corsOrigin === '*' && !errors.some((e) => e.includes('CORS_ORIGIN'))) {
      errors.push('CORS_ORIGIN cannot be set to wildcard "*" in production.');
    }
    if (
      (!cfg.databaseUrl ||
        cfg.databaseUrl.includes('repograph_secret') ||
        cfg.databaseUrl === DEFAULT_DEV_DATABASE_URL) &&
      !errors.some((e) => e.includes('DATABASE_URL'))
    ) {
      errors.push('DATABASE_URL must be explicitly configured in production (cannot use local development credentials).');
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
