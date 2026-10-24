
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { analyzeRepository } from "../src/services/repositoryAnalyzer.js";

test("analyzes files and returns resolved local dependencies", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "repograph-test-")
  );

  try {
    const sourceDirectory = path.join(root, "src");
    await mkdir(sourceDirectory);

    await writeFile(
      path.join(sourceDirectory, "app.ts"),
      `
        import { login } from "./auth";
        import express from "express";

        export const start = () => login();
      `
    );

    await writeFile(
      path.join(sourceDirectory, "auth.ts"),
      `
        export function login() {
          return true;
        }
      `
    );

    const result = await analyzeRepository(root, "test-repo");

    assert.equal(result.repository, "test-repo");
    assert.equal(result.totalFiles, 2);

    const app = result.files.find(
      (file) => file.path === "src/app.ts"
    );

    assert.ok(app, "app.ts should be analyzed");

    assert.ok(
      app.imports.some((item) => item.source === "./auth")
    );

    assert.ok(
      app.resolvedImports.some(
        (item) =>
          item.source === "./auth" &&
          item.resolvedPath === "src/auth.ts"
      )
    );

    assert.ok(
      app.resolvedImports.some(
        (item) =>
          item.source === "express" &&
          item.resolvedPath === null
      )
    );

    assert.deepEqual(app.dependencies, ["src/auth.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
