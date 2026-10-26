import type { ScanSnapshot, ScanSnapshotSummary } from "@repograph/shared-types";
import type { DependencyGraph } from "./dependencyGraph.js";
import type { AnalyzedFile } from "./repositoryAnalyzer.js";

export interface StoredScanRecord extends ScanSnapshot {
  graph: DependencyGraph;
  files: AnalyzedFile[];
}

class SnapshotStore {
  private records = new Map<string, StoredScanRecord>();
  private latestByRepo = new Map<string, string>();

  /**
   * Saves a new scan snapshot record.
   */
  public save(record: StoredScanRecord): void {
    this.records.set(record.scanId, record);
    this.latestByRepo.set(record.repositoryName.toLowerCase(), record.scanId);
    this.latestByRepo.set(record.repositoryId.toLowerCase(), record.scanId);
  }

  /**
   * Retrieves a snapshot record by unique scan ID.
   */
  public getById(scanId: string): StoredScanRecord | undefined {
    return this.records.get(scanId);
  }

  /**
   * Retrieves the latest snapshot for a repository name or ID.
   */
  public getLatest(repositoryIdentifier: string): StoredScanRecord | undefined {
    const scanId = this.latestByRepo.get(repositoryIdentifier.toLowerCase());
    if (!scanId) return undefined;
    return this.records.get(scanId);
  }

  /**
   * Lists all stored snapshot summaries, optionally filtered by repository.
   */
  public list(repositoryIdentifier?: string): ScanSnapshot[] {
    const all = Array.from(this.records.values()).map(
      ({ graph: _g, files: _f, ...snapshot }) => snapshot
    );

    if (!repositoryIdentifier) {
      return all;
    }

    const norm = repositoryIdentifier.toLowerCase();
    return all.filter(
      (s) =>
        s.repositoryName.toLowerCase() === norm ||
        s.repositoryId.toLowerCase() === norm
    );
  }

  /**
   * Clears all snapshots (useful for test resets).
   */
  public clear(): void {
    this.records.clear();
    this.latestByRepo.clear();
  }
}

export const snapshotStore = new SnapshotStore();
