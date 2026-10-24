import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { createApp } from '../app.js';

describe('RepoGraph API Test Suite', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/health should return 200 and ok status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'RepoGraph API');
    assert.ok(typeof body.uptimeSeconds === 'number');
  });

  it('GET /api/repositories should return list of repositories', async () => {
    const res = await fetch(`${baseUrl}/api/repositories`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.repositories));
    assert.ok(body.total >= 1);
  });

  it('POST /api/repositories should register a new repository', async () => {
    const newRepo = {
      name: 'test-project',
      remoteUrl: 'https://github.com/example/test-project',
      provider: 'github',
    };
    const res = await fetch(`${baseUrl}/api/repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRepo),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.name, 'test-project');
    assert.ok(body.id.startsWith('repo-'));
  });

  it('POST /api/repositories should reject empty repository name', async () => {
    const res = await fetch(`${baseUrl}/api/repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  it('GET /api/repositories/:id should return repository details', async () => {
    const res = await fetch(`${baseUrl}/api/repositories/repo-sample-01`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.repository.id, 'repo-sample-01');
    assert.ok(Array.isArray(body.revisions));
  });

  it('GET /api/repositories/:id should return 404 for unknown repository', async () => {
    const res = await fetch(`${baseUrl}/api/repositories/unknown-id-999`);
    assert.equal(res.status, 404);
  });

  it('POST /api/repositories/:id/index should queue indexing job', async () => {
    const res = await fetch(`${baseUrl}/api/repositories/repo-sample-01/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitSha: 'b7c21e0' }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.ok(body.jobId);
    assert.equal(body.revision.commitSha, 'b7c21e0');
  });

  it('GET /api/repositories/:id/graph should return real repository graph neighborhood', async () => {
    const res = await fetch(`${baseUrl}/api/repositories/RepoGraph/graph?depth=2`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.rootSymbolId);
    assert.ok(Array.isArray(body.nodes));
    assert.ok(Array.isArray(body.edges));
    assert.ok(body.nodes.length >= 1);
  });

  it('GET /api/repositories/:id/search should return real code & symbol matches from disk', async () => {
    const res = await fetch(`${baseUrl}/api/repositories/RepoGraph/search?q=scanRepository`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.results));
    assert.ok(body.results.length >= 1);
    assert.ok(body.results.some((r: { snippet: string }) => r.snippet.includes('scanRepository')));
  });

  it('POST /api/repositories/:id/ask should return evidence-grounded answer with real citations', async () => {
    const res = await fetch(`${baseUrl}/api/repositories/RepoGraph/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Where is the repository scanned and files discovered?' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.answer);
    assert.ok(Array.isArray(body.citations));
    assert.ok(body.citations.length >= 1);
    assert.ok(body.citations.some((c: { filePath: string }) => c.filePath.includes('repositoryScanner')));
  });

  it('POST /api/repositories/:id/impact-analysis should return real impact findings from dependency graph', async () => {
    const res = await fetch(`${baseUrl}/api/repositories/RepoGraph/impact-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diffText: 'diff --git a/services/api/src/services/codeParser.ts b/services/api/src/services/codeParser.ts',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.summary);
    assert.ok(Array.isArray(body.findings));
    assert.ok(body.findings.length >= 1);
    assert.equal(body.findings[0].priority, 'high');
  });

  it('GET /api/nonexistent should return 404 error format', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.statusCode, 404);
  });
});
