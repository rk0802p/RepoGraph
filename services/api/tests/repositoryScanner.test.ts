
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { scanRepository } from "../src/services/repositoryScanner.ts";

test("discovers supported source files and ignores generated directories", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "repograph-test-")
  );

  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "example"), {
      recursive: true,
    });
    await mkdir(path.join(root, "dist"), { recursive: true });

    await writeFile(path.join(root, "src", "App.tsx"), "export {};");
    await writeFile(path.join(root, "src", "server.js"), "export {};");
    await writeFile(path.join(root, "README.md"), "# Example");
    await writeFile(
      path.join(root, "node_modules", "example", "index.js"),
      "ignored"
    );
    await writeFile(path.join(root, "dist", "bundle.js"), "ignored");

    const files = await scanRepository(root);

    assert.deepEqual(
      files.map((file) => file.path),
      ["src/App.tsx", "src/server.js"]
    );

    assert.equal(files[0].language, "TypeScript React");
    assert.equal(files[1].language, "JavaScript");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
