import { useState, useEffect, useRef, useMemo } from "react";
import {
  analyzeChangeImpact,
  analyzeRepository,
  checkApiHealth,
  listRepositories,
  type AnalyzedFile,
  type ApiHealth,
  type ChangeImpactReport,
  type ImpactedFile,
  type RepositoryAnalysis,
  type RepositoryItem,
} from "./api";
import { TopBar } from "./components/layout/TopBar";
import { AboutModal } from "./components/layout/AboutModal";
import { RepositoryExplorer } from "./components/explorer/RepositoryExplorer";
import { DependencyAtlas } from "./components/graph/DependencyAtlas";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { AnalysisDrawer } from "./components/drawer/AnalysisDrawer";
import "./App.css";

export function App() {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [availableRepos, setAvailableRepos] = useState<RepositoryItem[]>([]);
  const [repositoryPath, setRepositoryPath] = useState("RepoGraph");
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [selectedFile, setSelectedFile] = useState<AnalyzedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Impact analysis state
  const [impactReport, setImpactReport] = useState<ChangeImpactReport | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const impactRequestId = useRef(0);

  // Global search & modal state
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  function clearImpactState() {
    impactRequestId.current += 1;
    setImpactReport(null);
    setImpactLoading(false);
    setImpactError(null);
  }

  // Check health and list repositories on initial mount
  useEffect(() => {
    let cancelled = false;

    checkApiHealth()
      .then((res) => {
        if (!cancelled) {
          setHealth(res);
          setApiError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : "Unable to reach API");
        }
      });

    listRepositories()
      .then((res) => {
        if (!cancelled && res.repositories.length > 0) {
          setAvailableRepos(res.repositories);
        }
      })
      .catch(() => {
        // Fallback default repos if endpoint fails
        if (!cancelled) {
          setAvailableRepos([{ id: "repo-repograph", name: "RepoGraph" }]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Analyze repository by path
  async function performAnalysis(targetPath: string) {
    if (!targetPath.trim()) return;

    clearImpactState();
    setLoading(true);
    setError(null);
    setSelectedFile(null);

    try {
      const result = await analyzeRepository(targetPath.trim());
      setAnalysis(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Repository analysis failed.");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  // Trigger initial repository analysis on mount
  useEffect(() => {
    performAnalysis(repositoryPath);
  }, []);

  // Handle repository selection
  function handleSelectRepo(repoName: string) {
    setRepositoryPath(repoName);
    performAnalysis(repoName);
  }

  // Handle file selection
  function handleSelectFile(file: AnalyzedFile | null) {
    if (selectedFile?.path !== file?.path) {
      clearImpactState();
    }
    setSelectedFile(file);
  }

  // Run change impact analysis on current file
  async function handleAnalyzeImpact() {
    if (!analysis || !selectedFile) {
      setImpactError("Select a file to analyze its change impact.");
      return;
    }

    const requestId = ++impactRequestId.current;
    setImpactLoading(true);
    setImpactError(null);
    setImpactReport(null);

    try {
      const report = await analyzeChangeImpact(analysis.repository, selectedFile.path);
      if (impactRequestId.current === requestId) {
        setImpactReport(report);
      }
    } catch (err: unknown) {
      if (impactRequestId.current === requestId) {
        setImpactError(
          err instanceof Error ? err.message : "Change-impact analysis failed."
        );
      }
    } finally {
      if (impactRequestId.current === requestId) {
        setImpactLoading(false);
      }
    }
  }

  // Inspect an impacted file
  function handleInspectImpactedFile(impactedItem: ImpactedFile) {
    const fileObj = analysis?.files.find((f) => f.path === impactedItem.path);
    if (fileObj) {
      setSelectedFile(fileObj);
    }
  }

  // Set of all impacted paths for fast lookups
  const impactedPathsSet = useMemo(() => {
    if (!impactReport) return new Set<string>();
    return new Set(impactReport.impactedFiles.map((f) => f.path));
  }, [impactReport]);

  // Aggregate stats for TopBar
  const repositoryStats = useMemo(() => {
    if (!analysis) return null;
    return {
      files: analysis.totalFiles,
      edges: analysis.graph.edges.length,
      symbols: analysis.files.reduce((acc, f) => acc + f.symbols.length, 0),
    };
  }, [analysis]);

  return (
    <main className="atlas-app-shell">
      {/* Top Header */}
      <TopBar
        currentRepo={repositoryPath}
        onSelectRepo={handleSelectRepo}
        availableRepos={availableRepos}
        health={health}
        apiError={apiError}
        searchQuery={globalSearchQuery}
        onSearchChange={setGlobalSearchQuery}
        stats={repositoryStats}
        onOpenAbout={() => setIsAboutOpen(true)}
      />

      {/* 3-Panel Main Workspace */}
      <div className="atlas-main-workspace">
        {/* Left Rail: Repository Explorer */}
        <RepositoryExplorer
          repositoryPath={repositoryPath}
          onRepositoryPathChange={setRepositoryPath}
          onAnalyze={performAnalysis}
          loading={loading}
          error={error}
          analysis={analysis}
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          impactedPaths={impactedPathsSet}
          changedFilePath={impactReport?.changedFile ?? null}
        />

        {/* Center Panel: Dependency Atlas Canvas */}
        <DependencyAtlas
          graphData={analysis ? analysis.graph : null}
          files={analysis ? analysis.files : []}
          repositoryName={analysis?.repository ?? repositoryPath}
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          impactReport={impactReport}
          onClearImpact={clearImpactState}
          loading={loading}
          globalSearchQuery={globalSearchQuery}
        />

        {/* Right Panel: File and Symbol Inspector */}
        <InspectorPanel
          analysis={analysis}
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          impactReport={impactReport}
          impactLoading={impactLoading}
          impactError={impactError}
          onAnalyzeImpact={handleAnalyzeImpact}
          onInspectImpactedFile={handleInspectImpactedFile}
        />
      </div>

      {/* Bottom Analysis Drawer */}
      <AnalysisDrawer
        analysis={analysis}
        impactReport={impactReport}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
      />

      {/* About & Architectural Guide Modal */}
      {isAboutOpen && <AboutModal onClose={() => setIsAboutOpen(false)} />}
    </main>
  );
}

export default App;
