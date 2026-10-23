import React, { useState, useEffect } from 'react';
import type {
  CodeSymbol,
  GraphEdge,
  ImpactAnalysisReport,
  AssistantQueryResponse,
} from '@repograph/shared-types';
import './App.css';

// Initial Demo Data
const INITIAL_SYMBOLS: CodeSymbol[] = [
  {
    id: 'sym-validate-token',
    fileId: 'file-auth-service',
    revisionId: 'rev-sample-01',
    name: 'validateToken',
    qualifiedName: 'src/services/AuthService.ts::AuthService.validateToken',
    kind: 'method',
    span: { startLine: 28, startColumn: 2, endLine: 45, endColumn: 3 },
    signature: 'public validateToken(token: string): Promise<UserSession>',
    docstring: 'Verifies signed JWT payload and checks session validity against Redis cache.',
    isExported: true,
  },
  {
    id: 'sym-auth-middleware',
    fileId: 'file-auth-middleware',
    revisionId: 'rev-sample-01',
    name: 'requireAuth',
    qualifiedName: 'src/middleware/auth.ts::requireAuth',
    kind: 'function',
    span: { startLine: 10, startColumn: 0, endLine: 26, endColumn: 1 },
    signature: 'function requireAuth(req: Request, res: Response, next: NextFunction): void',
    docstring: 'Express middleware verifying bearer authorization header.',
    isExported: true,
  },
  {
    id: 'sym-user-controller',
    fileId: 'file-user-controller',
    revisionId: 'rev-sample-01',
    name: 'getUserProfile',
    qualifiedName: 'src/controllers/user.ts::getUserProfile',
    kind: 'function',
    span: { startLine: 15, startColumn: 0, endLine: 35, endColumn: 1 },
    signature: 'async function getUserProfile(req: Request, res: Response): Promise<void>',
    docstring: 'Returns authenticated profile details for current user.',
    isExported: true,
  },
  {
    id: 'sym-auth-test',
    fileId: 'file-auth-test',
    revisionId: 'rev-sample-01',
    name: 'test_token_expiry',
    qualifiedName: 'tests/auth.test.ts::test_token_expiry',
    kind: 'test_case',
    span: { startLine: 22, startColumn: 0, endLine: 34, endColumn: 1 },
    signature: 'it("rejects expired tokens with 401 Unauthorized")',
    docstring: 'Integration test validating token expiry handling.',
    isExported: false,
  },
];

const INITIAL_EDGES: GraphEdge[] = [
  {
    id: 'e1',
    revisionId: 'rev-sample-01',
    sourceId: 'sym-auth-middleware',
    targetId: 'sym-validate-token',
    relationType: 'CALLS',
    resolutionMethod: 'ast_syntax',
    confidence: 'observed',
    rationale: 'Direct invocation in request handling loop',
  },
  {
    id: 'e2',
    revisionId: 'rev-sample-01',
    sourceId: 'sym-user-controller',
    targetId: 'sym-auth-middleware',
    relationType: 'CALLS',
    resolutionMethod: 'framework_convention',
    confidence: 'observed',
    rationale: 'Route middleware chain attaches requireAuth',
  },
  {
    id: 'e3',
    revisionId: 'rev-sample-01',
    sourceId: 'sym-auth-test',
    targetId: 'sym-validate-token',
    relationType: 'TESTS',
    resolutionMethod: 'import_table',
    confidence: 'observed',
    rationale: 'Explicit test assertions on validateToken return structure',
  },
];

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'graph' | 'impact' | 'qa'>('graph');
  const [sidebarTab, setSidebarTab] = useState<'symbols' | 'indexing'>('symbols');
  const [selectedSymbolId, setSelectedSymbolId] = useState<string>('sym-validate-token');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [depth, setDepth] = useState<number>(2);
  const [relationFilter, setRelationFilter] = useState<string>('ALL');
  const [apiOnline, setApiOnline] = useState<boolean>(false);

  // Impact Analysis State
  const [diffInput, setDiffInput] = useState<string>(
    `--- a/src/services/AuthService.ts\n+++ b/src/services/AuthService.ts\n@@ -28,3 +28,4 @@\n-  public async validateToken(token: string): Promise<UserSession>\n+  public async validateToken(token: string, options?: VerifyOptions): Promise<UserSession>`
  );
  const [impactReport, setImpactReport] = useState<ImpactAnalysisReport | null>(null);
  const [analyzingDiff, setAnalyzingDiff] = useState<boolean>(false);

  // Q&A State
  const [qaInput, setQaInput] = useState<string>('Where is authentication enforced before requests reach controllers?');
  const [qaResponse, setQaResponse] = useState<AssistantQueryResponse | null>(null);
  const [loadingQa, setLoadingQa] = useState<boolean>(false);

  // Check API health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (res.ok) setApiOnline(true);
      })
      .catch(() => setApiOnline(false));
  }, []);

  const selectedSymbol =
    INITIAL_SYMBOLS.find((s) => s.id === selectedSymbolId) || INITIAL_SYMBOLS[0];

  const filteredSymbols = INITIAL_SYMBOLS.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.qualifiedName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Callers & Callees for selected symbol
  const callers = INITIAL_EDGES.filter((e) => e.targetId === selectedSymbol.id).map((e) => ({
    edge: e,
    symbol: INITIAL_SYMBOLS.find((s) => s.id === e.sourceId),
  }));

  const callees = INITIAL_EDGES.filter((e) => e.sourceId === selectedSymbol.id).map((e) => ({
    edge: e,
    symbol: INITIAL_SYMBOLS.find((s) => s.id === e.targetId),
  }));

  const handleRunImpactAnalysis = async () => {
    setAnalyzingDiff(true);
    try {
      const res = await fetch('/api/repositories/repo-sample-01/impact-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diffText: diffInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setImpactReport(data);
      }
    } catch (err) {
      console.warn('API unavailable, generating client fallback report', err);
      setImpactReport({
        id: `analysis-${Date.now()}`,
        repositoryId: 'repo-sample-01',
        baseRevisionSha: 'a4b89f2',
        targetRevisionSha: 'HEAD',
        createdAt: new Date().toISOString(),
        summary: {
          totalChangedFiles: 1,
          totalChangedSymbols: 1,
          highImpactCount: 1,
          mediumImpactCount: 1,
          needsInspectionCount: 0,
        },
        changedSymbols: [selectedSymbol],
        findings: [
          {
            id: 'f1',
            targetSymbolId: 'sym-auth-middleware',
            targetSymbolName: 'requireAuth',
            targetFilePath: 'src/middleware/auth.ts',
            priority: 'high',
            confidenceLabel: 'observed',
            dependencyPath: ['validateToken', 'requireAuth'],
            rationale: 'Direct caller of validateToken. Modifying signature parameters breaks session initialization.',
            suggestedTests: [
              {
                symbolId: 'sym-auth-test',
                name: 'tests/auth.test.ts',
                filePath: 'tests/auth.test.ts',
                isConfirmed: true,
              },
            ],
          },
          {
            id: 'f2',
            targetSymbolId: 'sym-user-controller',
            targetSymbolName: 'getUserProfile',
            targetFilePath: 'src/controllers/user.ts',
            priority: 'medium',
            confidenceLabel: 'likely',
            dependencyPath: ['validateToken', 'requireAuth', 'getUserProfile'],
            rationale: 'Indirect consumer: expects req.user from requireAuth.',
            suggestedTests: [],
          },
        ],
        limitations: ['Diff parsed against 1 file. Dynamic route injection not traced.'],
      });
    } finally {
      setAnalyzingDiff(false);
    }
  };

  const handleAskAssistant = async () => {
    if (!qaInput.trim()) return;
    setLoadingQa(true);
    try {
      const res = await fetch('/api/repositories/repo-sample-01/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: qaInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setQaResponse(data);
      }
    } catch {
      setQaResponse({
        answer:
          'Authentication is enforced at the HTTP gateway via `requireAuth` in `src/middleware/auth.ts`, which delegates token verification to `AuthService.validateToken` (`src/services/AuthService.ts`). If the JWT is expired or invalid, it halts the request with an HTTP 401 before any downstream controllers are reached.',
        citations: [
          {
            filePath: 'src/middleware/auth.ts',
            startLine: 10,
            endLine: 26,
            symbolName: 'requireAuth',
            snippet: 'const token = req.headers.authorization?.split(" ")[1];',
          },
          {
            filePath: 'src/services/AuthService.ts',
            startLine: 28,
            endLine: 45,
            symbolName: 'validateToken',
            snippet: 'public async validateToken(token: string): Promise<UserSession>',
          },
        ],
        confidence: 'observed',
        caveats: ['Static analysis resolved calls using TypeScript AST.'],
      });
    } finally {
      setLoadingQa(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="nav-left">
          <div className="brand-logo">
            <span className="brand-icon">RG</span>
            <span>RepoGraph</span>
            <span className="badge badge-purple">v0.1.0-alpha</span>
          </div>

          <div className="repo-select-container">
            <span style={{ color: 'var(--text-secondary)' }}>Repo:</span>
            <select defaultValue="repograph-core">
              <option value="repograph-core">repograph-core</option>
              <option value="add-repo">+ Connect Repository</option>
            </select>
          </div>
        </div>

        <div className="nav-center">
          <div className="search-box">
            <span style={{ color: 'var(--text-secondary)' }}>🔍</span>
            <input
              type="text"
              placeholder="Search symbols, functions, or intent (Ctrl + K)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="nav-right">
          <div className="stat-pill">
            <span>Rev:</span>
            <strong className="mono">main (a4b89f2)</strong>
          </div>
          <div className="stat-pill">
            <span>Symbols:</span>
            <strong>{INITIAL_SYMBOLS.length}</strong>
          </div>
          <div className="stat-pill">
            <span>Edges:</span>
            <strong>{INITIAL_EDGES.length}</strong>
          </div>
          <span className={`badge ${apiOnline ? 'badge-green' : 'badge-yellow'}`}>
            {apiOnline ? 'API Online' : 'Local Mock'}
          </span>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="workspace-body">
        {/* Left Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab-btn ${sidebarTab === 'symbols' ? 'active' : ''}`}
              onClick={() => setSidebarTab('symbols')}
            >
              Symbols ({filteredSymbols.length})
            </button>
            <button
              className={`sidebar-tab-btn ${sidebarTab === 'indexing' ? 'active' : ''}`}
              onClick={() => setSidebarTab('indexing')}
            >
              Index Health
            </button>
          </div>

          <div className="sidebar-content">
            {sidebarTab === 'symbols' ? (
              <div className="symbol-list">
                {filteredSymbols.map((sym) => (
                  <div
                    key={sym.id}
                    className={`symbol-item ${selectedSymbolId === sym.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSymbolId(sym.id)}
                  >
                    <div className="symbol-header">
                      <span className="symbol-name">{sym.name}</span>
                      <span
                        className={`badge ${
                          sym.kind === 'class'
                            ? 'badge-purple'
                            : sym.kind === 'method' || sym.kind === 'function'
                            ? 'badge-blue'
                            : 'badge-yellow'
                        }`}
                      >
                        {sym.kind}
                      </span>
                    </div>
                    <span className="symbol-file mono">{sym.qualifiedName}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div className="card">
                  <h4>Snapshot Summary</h4>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Commit: <span className="mono">a4b89f2</span> (Clean)
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }}>Status: 100% Parsed</p>
                  <p style={{ color: 'var(--text-secondary)' }}>AST Parsers: TypeScript, TSX</p>
                </div>
                <div className="card">
                  <h4>Edge Provenance</h4>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    • Observed AST Calls: <strong>2</strong>
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    • Framework Routes: <strong>1</strong>
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    • Linked Tests: <strong>1</strong>
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Main Canvas / Viewport */}
        <main className="center-viewport">
          {/* View Tabs */}
          <div className="viewport-tabs">
            <div className="tabs-group">
              <button
                className={`tab-pill ${activeTab === 'graph' ? 'active' : ''}`}
                onClick={() => setActiveTab('graph')}
              >
                Dependency Graph
              </button>
              <button
                className={`tab-pill ${activeTab === 'impact' ? 'active' : ''}`}
                onClick={() => setActiveTab('impact')}
              >
                Change-Impact Explorer
              </button>
              <button
                className={`tab-pill ${activeTab === 'qa' ? 'active' : ''}`}
                onClick={() => setActiveTab('qa')}
              >
                Repository Q&A
              </button>
            </div>

            {activeTab === 'graph' && (
              <div className="canvas-controls">
                <label>
                  Depth:
                  <select
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                    style={{ marginLeft: '4px' }}
                  >
                    <option value={1}>1 hop</option>
                    <option value={2}>2 hops</option>
                    <option value={3}>3 hops</option>
                  </select>
                </label>
                <label>
                  Filter:
                  <select
                    value={relationFilter}
                    onChange={(e) => setRelationFilter(e.target.value)}
                    style={{ marginLeft: '4px' }}
                  >
                    <option value="ALL">All Relations</option>
                    <option value="CALLS">Calls Only</option>
                    <option value="TESTS">Tests Only</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Tab 1: Dependency Graph Canvas */}
          {activeTab === 'graph' && (
            <div className="canvas-area">
              <div className="graph-stage">
                {/* Caller Layer */}
                <div className="graph-row">
                  <div
                    className={`node-card ${selectedSymbolId === 'sym-user-controller' ? 'focused' : ''}`}
                    onClick={() => setSelectedSymbolId('sym-user-controller')}
                  >
                    <div className="node-header">
                      <span className="node-title">getUserProfile</span>
                      <span className="badge badge-blue">route</span>
                    </div>
                    <div className="node-meta mono">src/controllers/user.ts</div>
                  </div>
                </div>

                <div className="edge-connector-label">↓ CALLS (Framework Chain)</div>

                {/* Middleware Layer */}
                <div className="graph-row">
                  <div
                    className={`node-card ${selectedSymbolId === 'sym-auth-middleware' ? 'focused' : ''}`}
                    onClick={() => setSelectedSymbolId('sym-auth-middleware')}
                  >
                    <div className="node-header">
                      <span className="node-title">requireAuth</span>
                      <span className="badge badge-blue">fn</span>
                    </div>
                    <div className="node-meta mono">src/middleware/auth.ts</div>
                  </div>
                </div>

                <div className="edge-connector-label">↓ CALLS (AST Observed)</div>

                {/* Focused Root Method Layer */}
                <div className="graph-row">
                  <div
                    className={`node-card ${selectedSymbolId === 'sym-validate-token' ? 'focused' : ''}`}
                    onClick={() => setSelectedSymbolId('sym-validate-token')}
                    style={{ borderColor: 'var(--accent-blue)', background: 'rgba(88,166,255,0.08)' }}
                  >
                    <div className="node-header">
                      <span className="node-title">validateToken</span>
                      <span className="badge badge-purple">method (FOCUS)</span>
                    </div>
                    <div className="node-meta mono">src/services/AuthService.ts</div>
                  </div>

                  <div className="edge-connector-label">← TESTS</div>

                  {/* Connected Test Node */}
                  <div
                    className={`node-card ${selectedSymbolId === 'sym-auth-test' ? 'focused' : ''}`}
                    onClick={() => setSelectedSymbolId('sym-auth-test')}
                  >
                    <div className="node-header">
                      <span className="node-title">test_token_expiry</span>
                      <span className="badge badge-yellow">test</span>
                    </div>
                    <div className="node-meta mono">tests/auth.test.ts</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Change-Impact Analysis */}
          {activeTab === 'impact' && (
            <div className="panel-view">
              <div className="card">
                <h3>Git Diff Input & Symbol Resolution</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Paste a git diff or commit patch. RepoGraph maps line ranges to symbols and predicts downstream reach.
                </p>
                <textarea
                  className="diff-input-area"
                  value={diffInput}
                  onChange={(e) => setDiffInput(e.target.value)}
                  placeholder="Paste git diff here..."
                />
                <button
                  className="btn-primary"
                  onClick={handleRunImpactAnalysis}
                  disabled={analyzingDiff}
                >
                  {analyzingDiff ? 'Traversing Graph...' : 'Analyze Impact & Downstream Reach'}
                </button>
              </div>

              {impactReport && (
                <div className="card">
                  <h3>
                    <span>Impact Analysis Findings</span>
                    <span className="badge badge-red">
                      {impactReport.summary.highImpactCount} High Risk
                    </span>
                  </h3>

                  <div style={{ display: 'flex', gap: '16px', margin: '8px 0 16px' }}>
                    <div className="stat-pill">
                      Files Changed: <strong>{impactReport.summary.totalChangedFiles}</strong>
                    </div>
                    <div className="stat-pill">
                      Symbols Altered: <strong>{impactReport.summary.totalChangedSymbols}</strong>
                    </div>
                    <div className="stat-pill">
                      Direct Dependents: <strong>{impactReport.findings.length}</strong>
                    </div>
                  </div>

                  <table className="findings-table">
                    <thead>
                      <tr>
                        <th>Target Dependent</th>
                        <th>File Location</th>
                        <th>Priority</th>
                        <th>Confidence</th>
                        <th>Path & Rationale</th>
                        <th>Suggested Tests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impactReport.findings.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <strong>{f.targetSymbolName}</strong>
                          </td>
                          <td className="mono">{f.targetFilePath}</td>
                          <td>
                            <span
                              className={`badge ${
                                f.priority === 'high'
                                  ? 'badge-red'
                                  : f.priority === 'medium'
                                  ? 'badge-yellow'
                                  : 'badge-blue'
                              }`}
                            >
                              {f.priority}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-green">{f.confidenceLabel}</span>
                          </td>
                          <td>
                            <div style={{ fontSize: '12px' }}>{f.rationale}</div>
                            <div className="mono" style={{ fontSize: '11px', color: 'var(--accent-blue)', marginTop: '2px' }}>
                              {f.dependencyPath.join(' ➔ ')}
                            </div>
                          </td>
                          <td>
                            {f.suggestedTests.length > 0 ? (
                              f.suggestedTests.map((t) => (
                                <span key={t.symbolId} className="badge badge-yellow">
                                  {t.name}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                No direct test
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Repository Q&A Assistant */}
          {activeTab === 'qa' && (
            <div className="panel-view">
              <div className="card">
                <h3>Ask Repository Architecture Assistant</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Ask natural-language questions grounded in AST symbols and static graph relationships.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="diff-input-area"
                    style={{ height: '40px' }}
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    placeholder="Ask about architecture, request lifecycle, or dependencies..."
                  />
                  <button
                    className="btn-primary"
                    style={{ margin: 0, whiteSpace: 'nowrap' }}
                    onClick={handleAskAssistant}
                    disabled={loadingQa}
                  >
                    {loadingQa ? 'Querying...' : 'Ask Assistant'}
                  </button>
                </div>
              </div>

              {qaResponse && (
                <div className="card">
                  <h3>
                    <span>Evidence-Grounded Explanation</span>
                    <span className="badge badge-green">{qaResponse.confidence} Evidence</span>
                  </h3>
                  <p style={{ fontSize: '14px', lineHeight: '1.6', marginTop: '8px' }}>
                    {qaResponse.answer}
                  </p>

                  <h4 style={{ fontSize: '12px', marginTop: '16px', color: 'var(--text-secondary)' }}>
                    CITED REPOSITORY EVIDENCE:
                  </h4>
                  {qaResponse.citations.map((c, i) => (
                    <div key={i} className="citation-box">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="mono" style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                          {c.filePath}:{c.startLine}-{c.endLine}
                        </span>
                        {c.symbolName && <span className="badge badge-purple">{c.symbolName}</span>}
                      </div>
                      {c.snippet && (
                        <div className="code-snippet" style={{ marginTop: '6px', fontSize: '11px' }}>
                          {c.snippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Detail Panel */}
        <aside className="detail-panel">
          <div className="detail-section">
            <h4>Selected Symbol</h4>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {selectedSymbol.name}
            </div>
            <div style={{ marginTop: '4px' }}>
              <span className="badge badge-purple">{selectedSymbol.kind}</span>
              <span className="badge badge-green" style={{ marginLeft: '6px' }}>
                Exported
              </span>
            </div>
          </div>

          <div className="detail-section">
            <h4>Location</h4>
            <div className="mono" style={{ fontSize: '12px', color: 'var(--accent-blue)' }}>
              {selectedSymbol.qualifiedName}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Lines {selectedSymbol.span.startLine} - {selectedSymbol.span.endLine}
            </div>
          </div>

          {selectedSymbol.signature && (
            <div className="detail-section">
              <h4>Signature</h4>
              <div className="code-snippet">{selectedSymbol.signature}</div>
            </div>
          )}

          {selectedSymbol.docstring && (
            <div className="detail-section">
              <h4>Docstring / Comments</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {selectedSymbol.docstring}
              </p>
            </div>
          )}

          <div className="detail-section">
            <h4>Known Callers ({callers.length})</h4>
            {callers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {callers.map((c) => (
                  <div
                    key={c.edge.id}
                    className="symbol-item"
                    onClick={() => c.symbol && setSelectedSymbolId(c.symbol.id)}
                  >
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>
                      {c.symbol?.name || 'Unknown'}
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      via {c.edge.resolutionMethod} ({c.edge.confidence})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                No incoming callers recorded
              </span>
            )}
          </div>

          <div className="detail-section">
            <h4>Known Callees ({callees.length})</h4>
            {callees.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {callees.map((c) => (
                  <div
                    key={c.edge.id}
                    className="symbol-item"
                    onClick={() => c.symbol && setSelectedSymbolId(c.symbol.id)}
                  >
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>
                      {c.symbol?.name || 'Unknown'}
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {c.edge.relationType} ➔ {c.edge.confidence}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                No outgoing calls recorded
              </span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
