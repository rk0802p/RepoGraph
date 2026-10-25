import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, validateConfig, parseAndValidateConfig } from '../src/config/index.js';
import { resolveRepository } from '../src/services/workspaceResolver.js';

test('validates valid configuration without errors', () => {
  const { config: parsedCfg, result } = parseAndValidateConfig({
    PORT: '3000',
    NODE_ENV: 'development',
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(parsedCfg.port, 3000);
  assert.equal(parsedCfg.nodeEnv, 'development');
});

test('rejects unsupported NODE_ENV values explicitly', () => {
  const { result } = parseAndValidateConfig({
    NODE_ENV: 'staging',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Invalid NODE_ENV "staging"')));
});

test('detects out-of-range port numbers in configuration', () => {
  const { result } = parseAndValidateConfig({
    PORT: '80', // privileged port under 1024
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('1024 and 65535')));
});

test('detects raw invalid non-numeric and decimal PORT values', () => {
  const resultAlpha = parseAndValidateConfig({ PORT: 'not-a-number' }).result;
  assert.equal(resultAlpha.valid, false);
  assert.ok(resultAlpha.errors.some((e) => e.includes('PORT')));

  const resultDecimal = parseAndValidateConfig({ PORT: '3000.5' }).result;
  assert.equal(resultDecimal.valid, false);
  assert.ok(resultDecimal.errors.some((e) => e.includes('PORT')));
});

test('detects invalid limit bounds and non-integer values', () => {
  const negResult = parseAndValidateConfig({ MAX_FILE_COUNT: '-50' }).result;
  assert.equal(negResult.valid, false);
  assert.ok(negResult.errors.some((e) => e.includes('MAX_FILE_COUNT')));

  const decResult = parseAndValidateConfig({ MAX_SCAN_DEPTH: '15.5' }).result;
  assert.equal(decResult.valid, false);
  assert.ok(decResult.errors.some((e) => e.includes('MAX_SCAN_DEPTH')));

  const excessResult = parseAndValidateConfig({ MAX_SCAN_DEPTH: '500' }).result;
  assert.equal(excessResult.valid, false);
  assert.ok(excessResult.errors.some((e) => e.includes('MAX_SCAN_DEPTH')));
});

test('enforces explicit DATABASE_URL and rejects default password in production mode', () => {
  const { result } = parseAndValidateConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://repograph:repograph_secret@localhost:5432/repograph_db',
    CORS_ORIGIN: 'https://app.repograph.io',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('cannot use known local development credentials')));
});

test('requires explicit DATABASE_URL when omitted in production mode', () => {
  const { result } = parseAndValidateConfig({
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://app.repograph.io',
    DATABASE_URL: '',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('DATABASE_URL must be explicitly configured in production')));
});

test('rejects wildcard CORS in production mode', () => {
  const { result } = parseAndValidateConfig({
    NODE_ENV: 'production',
    CORS_ORIGIN: '*',
    DATABASE_URL: 'postgresql://prod_user:strong_prod_pass@db.internal:5432/repograph',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('CORS_ORIGIN cannot be set to wildcard')));
});

test('accepts valid production configuration with secure credentials and explicit origins', () => {
  const { config: parsedProd, result } = parseAndValidateConfig({
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://repograph.internal',
    DATABASE_URL: 'postgresql://prod_user:strong_prod_pass@db.internal:5432/repograph_prod',
    REDIS_URL: 'redis://redis.internal:6379',
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(parsedProd.nodeEnv, 'production');
  assert.equal(parsedProd.corsOrigin, 'https://repograph.internal');
});

test('rejects REPOSITORY_WORKSPACE set to filesystem root', () => {
  const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
  const { result } = parseAndValidateConfig({
    REPOSITORY_WORKSPACE: rootPath,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('cannot be set to the filesystem root directory')));
});

test('rejects path traversal attempting to escape to parent directory with exact 403 Forbidden', async () => {
  const result = await resolveRepository('..');
  assert.ok('error' in result);
  assert.equal(result.status, 403);
});

test('rejects path traversal attempting to escape to sibling directory with exact 403 Forbidden', async () => {
  const result = await resolveRepository('../sibling-repo-escape');
  assert.ok('error' in result);
  assert.equal(result.status, 403);
});

test('rejects absolute path traversal pointing outside workspace with exact 403 Forbidden', async () => {
  const externalTarget = process.platform === 'win32' ? 'C:\\Windows' : '/etc/shadow';
  const result = await resolveRepository(externalTarget);
  assert.ok('error' in result);
  assert.equal(result.status, 403);
});

test('rejects UNC network share paths with exact 403 Forbidden', async () => {
  const uncTarget = '\\\\192.168.1.1\\share\\repo';
  const result = await resolveRepository(uncTarget);
  assert.ok('error' in result);
  assert.equal(result.status, 403);
});

test('returns exact 404 for non-existent directory within allowed workspace boundary', async () => {
  const nonExistentTarget = 'nonexistent-subproject-xyz';
  const result = await resolveRepository(nonExistentTarget);
  assert.ok('error' in result);
  assert.equal(result.status, 404);
});

test('rejects null byte injection in repository paths with exact 400 Bad Request', async () => {
  const nullByteTarget = 'RepoGraph\0/secret';
  const result = await resolveRepository(nullByteTarget);
  assert.ok('error' in result);
  assert.equal(result.status, 400);
});

test('rejects non-string and whitespace-only repository paths with exact 400 Bad Request', async () => {
  const emptyResult = await resolveRepository('   ');
  assert.ok('error' in emptyResult);
  assert.equal(emptyResult.status, 400);

  const nonStringResult = await resolveRepository(12345 as unknown as string);
  assert.ok('error' in nonStringResult);
  assert.equal(nonStringResult.status, 400);
});
