import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, validateConfig } from '../src/config/index.js';
import { resolveRepository } from '../src/services/workspaceResolver.js';

test('validates valid configuration without errors', () => {
  const result = validateConfig(config);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('detects out-of-range port numbers in configuration', () => {
  const badConfig = {
    ...config,
    port: 80, // privileged port under 1024
  };
  const result = validateConfig(badConfig);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('1024-65535')));
});

test('flags wildcards for CORS in production mode', () => {
  const prodConfig = {
    ...config,
    nodeEnv: 'production' as const,
    corsOrigin: '*',
  };
  const result = validateConfig(prodConfig);
  assert.ok(result.warnings.some((w) => w.includes('CORS_ORIGIN')));
});

test('rejects path traversal attempts attempting to escape workspace boundary', async () => {
  const traversalTarget = '../../../../../../../../../../Windows';
  const result = await resolveRepository(traversalTarget);
  assert.ok('error' in result);
  // Must return 403 Forbidden or 404 Not Found, never expose system directories
  assert.ok(result.status === 403 || result.status === 404);
});

test('rejects null byte injection in repository paths', async () => {
  const nullByteTarget = 'RepoGraph\0/secret';
  const result = await resolveRepository(nullByteTarget);
  assert.ok('error' in result);
  assert.equal(result.status, 400);
});
