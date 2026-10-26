import React, { useState, useMemo } from "react";
import type { AnalyzedFile } from "../../api";

interface FileTreeProps {
  files: AnalyzedFile[];
  selectedFile: AnalyzedFile | null;
  onSelectFile: (file: AnalyzedFile) => void;
  impactedPaths: Set<string>;
  changedFilePath: string | null;
  searchFilter: string;
  selectedLanguage: string;
  showTests: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  file?: AnalyzedFile;
  children: Map<string, TreeNode>;
}

function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/").toLowerCase();
  const base = norm.split("/").pop() ?? norm;
  return (
    /\.(test|spec)\.[^.]+$/i.test(base) ||
    /(^|\/)(__tests__|tests?)(\/|$)/i.test(norm)
  );
}

function getLanguageBadge(ext: string): { label: string; colorClass: string } {
  switch (ext.toLowerCase()) {
    case ".ts":
      return { label: "TS", colorClass: "lang-ts" };
    case ".tsx":
      return { label: "TSX", colorClass: "lang-ts" };
    case ".js":
      return { label: "JS", colorClass: "lang-js" };
    case ".jsx":
      return { label: "JSX", colorClass: "lang-js" };
    case ".json":
      return { label: "JSON", colorClass: "lang-json" };
    case ".md":
      return { label: "MD", colorClass: "lang-md" };
    case ".css":
      return { label: "CSS", colorClass: "lang-css" };
    default:
      return { label: ext.replace(".", "").toUpperCase() || "FILE", colorClass: "lang-default" };
  }
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  selectedFile,
  onSelectFile,
  impactedPaths,
  changedFilePath,
  searchFilter,
  selectedLanguage,
  showTests,
}) => {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  function toggleFolder(folderPath: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }

  // Filter files by search, language filter, and test toggle
  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const normPath = f.path.replace(/\\/g, "/");

      if (!showTests && isTestFile(normPath)) {
        return false;
      }

      if (selectedLanguage !== "all") {
        const ext = f.extension.toLowerCase();
        if (selectedLanguage === "ts" && !ext.startsWith(".ts")) return false;
        if (selectedLanguage === "js" && !ext.startsWith(".js")) return false;
        if (selectedLanguage === "json" && ext !== ".json") return false;
        if (selectedLanguage === "md" && ext !== ".md") return false;
      }

      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        const matchesPath = normPath.toLowerCase().includes(query);
        const matchesSymbol = f.symbols.some((s) => s.name.toLowerCase().includes(query));
        if (!matchesPath && !matchesSymbol) return false;
      }

      return true;
    });
  }, [files, searchFilter, selectedLanguage, showTests]);

  // Build tree data structure
  const rootNode = useMemo(() => {
    const root: TreeNode = {
      name: "root",
      path: "",
      isDirectory: true,
      children: new Map(),
    };

    for (const file of filteredFiles) {
      const parts = file.path.replace(/\\/g, "/").split("/");
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join("/");

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            isDirectory: !isFile,
            file: isFile ? file : undefined,
            children: new Map(),
          });
        }

        current = current.children.get(part)!;
      }
    }

    return root;
  }, [filteredFiles]);

  function renderTree(node: TreeNode, depth: number = 0): React.ReactNode {
    // Sort directories first, then alphabetically
    const entries = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <ul className="atlas-tree-list">
        {entries.map((item) => {
          if (item.isDirectory) {
            const isCollapsed = collapsedFolders.has(item.path);
            return (
              <li key={item.path} className="atlas-tree-node directory-node">
                <button
                  type="button"
                  className="tree-row directory-row"
                  style={{ paddingLeft: `${depth * 14 + 10}px` }}
                  onClick={() => toggleFolder(item.path)}
                  title={item.path}
                >
                  <svg
                    className={`folder-chevron ${isCollapsed ? "collapsed" : "expanded"}`}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <svg className="folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="folder-name font-mono">{item.name}</span>
                </button>
                {!isCollapsed && renderTree(item, depth + 1)}
              </li>
            );
          }

          const file = item.file!;
          const isSelected = selectedFile?.path === file.path;
          const isChanged = changedFilePath === file.path;
          const isImpacted = impactedPaths.has(file.path);
          const badge = getLanguageBadge(file.extension);

          return (
            <li key={file.path} className="atlas-tree-node file-node">
              <button
                type="button"
                className={`tree-row file-row ${isSelected ? "selected" : ""} ${isChanged ? "is-changed-root" : ""} ${isImpacted ? "is-impacted" : ""}`}
                style={{ paddingLeft: `${depth * 14 + 18}px` }}
                onClick={() => onSelectFile(file)}
                title={file.path}
              >
                <span className={`tree-lang-badge ${badge.colorClass}`}>
                  {badge.label}
                </span>
                <span className="file-name font-mono">{item.name}</span>

                <div className="file-row-meta">
                  {file.symbols.length > 0 && (
                    <span className="symbol-count-pill" title={`${file.symbols.length} symbols extracted`}>
                      {file.symbols.length}
                    </span>
                  )}

                  {isChanged && (
                    <span className="impact-indicator changed" title="Source of change impact">
                      ROOT
                    </span>
                  )}
                  {!isChanged && isImpacted && (
                    <span className="impact-indicator affected" title="Potentially impacted by change">
                      ●
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (filteredFiles.length === 0) {
    return (
      <div className="tree-empty-state">
        <p className="empty-hint">No matching files found</p>
        <small className="muted">Try adjusting your search query or language filter.</small>
      </div>
    );
  }

  return <div className="atlas-tree-container">{renderTree(rootNode)}</div>;
};
