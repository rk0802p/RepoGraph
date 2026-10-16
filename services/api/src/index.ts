
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { realpath, stat } from "node:fs/promises";

import { scanRepository } from "./services/repositoryScanner.js";
import { analyzeRepository } from "./services/repositoryAnalyzer.js";
import { buildDependencyGraph } from "./services/dependencyGraph.js";
import { analyzeChangeImpact } from "./services/impactAnalyzer.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const configuredWorkspace = process.env.REPOSITORY_WORKSPACE;

if (!configuredWorkspace) {
  throw new Error(
    "REPOSITORY_WORKSPACE must be configured in services/api/.env"
  );
}

const WORKSPACE_ROOT = path.resolve(configuredWorkspace);

app.use(cors());
app.use(express.json());

type RepositoryResolution =
  | {
      error: string;
      status: number;
    }
  | {
      rootDirectory: string;
      repository: string;
    };

async function resolveRepository(
  repositoryPath: unknown
): Promise<RepositoryResolution> {
  if (
    typeof repositoryPath !== "string" ||
    repositoryPath.trim().length === 0
  ) {
    return {
      error: 'A repository path is required in the "path" field.',
      status: 400,
    };
  }

  const resolvedWorkspace = await realpath(WORKSPACE_ROOT);
  const resolvedRepository = await realpath(
    path.resolve(resolvedWorkspace, repositoryPath)
  );

  const relativePath = path.relative(
    resolvedWorkspace,
    resolvedRepository
  );

  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return {
      error: "The repository must be inside the configured workspace.",
      status: 403,
    };
  }

  const repositoryStats = await stat(resolvedRepository);

  if (!repositoryStats.isDirectory()) {
    return {
      error: "The specified repository path must be a directory.",
      status: 400,
    };
  }

  return {
    rootDirectory: resolvedRepository,
    repository: relativePath.split(path.sep).join("/"),
  };
}

function handleRepositoryError(
  error: unknown,
  res: express.Response,
  operation: string
): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  ) {
    res.status(404).json({
      error: "Repository path not found.",
    });
    return;
  }

  console.error(`${operation} failed:`, error);

  res.status(500).json({
    error: `${operation} failed.`,
  });
}

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "RepoGraph API is running",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/repositories/scan", async (req, res) => {
  try {
    const resolved = await resolveRepository(req.body?.path);

    if ("error" in resolved) {
      res.status(resolved.status).json({
        error: resolved.error,
      });
      return;
    }

    const files = await scanRepository(resolved.rootDirectory);

    res.status(200).json({
      repository: resolved.repository,
      totalFiles: files.length,
      files,
    });
  } catch (error) {
    handleRepositoryError(error, res, "Repository scan");
  }
});

app.post("/api/repositories/analyze", async (req, res) => {
  try {
    const resolved = await resolveRepository(req.body?.path);

    if ("error" in resolved) {
      res.status(resolved.status).json({
        error: resolved.error,
      });
      return;
    }

    const analysis = await analyzeRepository(
      resolved.rootDirectory,
      resolved.repository
    );

    const graph = buildDependencyGraph(analysis.files);

    res.status(200).json({
      ...analysis,
      graph,
    });
  } catch (error) {
    handleRepositoryError(error, res, "Repository analysis");
  }
});

app.post("/api/repositories/impact", async (req, res) => {
  try {
    const { path: repositoryPath, file: changedFile } = req.body ?? {};

    if (
      typeof changedFile !== "string" ||
      changedFile.trim().length === 0
    ) {
      res.status(400).json({
        error: 'A file path is required in the "file" field.',
      });
      return;
    }

    const resolved = await resolveRepository(repositoryPath);

    if ("error" in resolved) {
      res.status(resolved.status).json({
        error: resolved.error,
      });
      return;
    }

    const analysis = await analyzeRepository(
      resolved.rootDirectory,
      resolved.repository
    );

    const graph = buildDependencyGraph(analysis.files);

    const result = analyzeChangeImpact(graph, changedFile);

    if (!result.success) {
      res.status(404).json({
        error: result.error,
      });
      return;
    }

    res.status(200).json({
      repository: analysis.repository,
      ...result.report,
    });
  } catch (error) {
    handleRepositoryError(error, res, "Change-impact analysis");
  }
});

app.listen(PORT, () => {
  console.log(`RepoGraph API running at http://localhost:${PORT}`);
});
