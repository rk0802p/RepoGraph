import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, validateConfig } from '../src/config/index.js';
import { resolveRepository } from '../src/services/workspaceResolver.js';

test('validates valid configuration without errors', () => {
  const result = validateConfig(config, {
    PORT: '3000',
    NODE_ENV: 'development',
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('detects out-of-range port numbers in configuration', () => {
  const badConfig = {
    ...config,
    port: 80, // privileged port under 1024
  };
  const result = validateConfig(badConfig, {});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('1024-65535')));
});

test('detects raw invalid non-numeric PORT environment variables', () => {
  const result = validateConfig(config, { PORT: 'not-a-number' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('PORT environment variable')));
});

test('enforces explicit DATABASE_URL and rejects default password in production mode', () => {
  const prodConfig = {
    ...config,
    nodeEnv: 'production' as const,
    corsOrigin: 'https://app.repograph.io',
    databaseUrl: 'postgresql://repograph:repograph_secret@localhost:5432/repograph_db',
  };
  const result = validateConfig(prodConfig, {
    NODE_ENV: 'production',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('DATABASE_URL must be explicitly configured in production')));
});

test('rejects wildcard CORS in production mode', () => {
  const prodConfig = {
    ...config,
    nodeEnv: 'production' as const,
    corsOrigin: '*',
    databaseUrl: 'postgresql://prod_user:strong_prod_pass@db.internal:5432/repograph',
  };
  const result = validateConfig(prodConfig, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://prod_user:strong_prod_pass@db.internal:5432/repograph',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('CORS_ORIGIN cannot be set to wildcard')));
});

test('accepts valid production configuration with secure credentials and explicit origins', () => {
  const validProdConfig = {
    ...config,
    nodeEnv: 'production' as const,
    corsOrigin: 'https://repograph.internal',
    databaseUrl: 'postgresql://prod_user:strong_prod_pass@db.internal:5432/repograph_prod',
    redisUrl: 'redis://redis.internal:6379',
  };
  const result = validateConfig(validProdConfig, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://prod_user:strong_prod_pass@db.internal:5432/repograph_prod',
    REDIS_URL: 'redis://redis.internal:6379',
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('rejects path traversal attempting to escape to parent directory', async () => {
  const result = await resolveRepository('..');
  assert.ok('error' in result);
  assert.ok(result.status === 403 || result.status === 404);
});

test('rejects path traversal attempting to escape to sibling directory', async () => {
  const result = await resolveRepository('../sibling-repo-escape');
  assert.ok('error' in result);
  assert.ok(result.status === 403 || result.status === 404);
});

test('rejects path traversal attempts reaching system root', async () => {
  const traversalTarget = '../../../../../../../../../../Windows';
  const result = await resolveRepository(traversalTarget);
  assert.ok('error' in result);
  assert.ok(result.status === 403 || result.status === 404);
});

test('rejects null byte injection in repository paths', async () => {
  const nullByteTarget = 'RepoGraph\0/secret';
  const result = await resolveRepository(nullByteTarget);
  assert.ok('error' in result);
  assert.equal(result.status, 400);
});
