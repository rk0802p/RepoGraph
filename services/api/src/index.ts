
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { realpath, stat } from "node:fs/promises";

import { scanRepository } from "./services/repositoryScanner.js";

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

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "RepoGraph API is running",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/repositories/scan", async (req, res) => {
  try {
    const repositoryPath = req.body?.path;

    if (
      typeof repositoryPath !== "string" ||
      repositoryPath.trim().length === 0
    ) {
      res.status(400).json({
        error: 'A repository path is required in the "path" field.',
      });
      return;
    }

    // Resolve symlinks before checking the workspace boundary.
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
      res.status(403).json({
        error: "The repository must be inside the configured workspace.",
      });
      return;
    }

    const repositoryStats = await stat(resolvedRepository);

    if (!repositoryStats.isDirectory()) {
      res.status(400).json({
        error: "The specified repository path must be a directory.",
      });
      return;
    }

    const files = await scanRepository(resolvedRepository);

    res.status(200).json({
      repository: relativePath.split(path.sep).join("/"),
      totalFiles: files.length,
      files,
    });
  } catch (error) {
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

    console.error("Repository scan failed:", error);

    res.status(500).json({
      error: "Failed to scan repository.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`RepoGraph API running at http://localhost:${PORT}`);
});
