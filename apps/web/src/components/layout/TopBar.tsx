import React, { useState, useEffect, useRef } from "react";
import type { ApiHealth, RepositoryItem } from "../../api";

interface TopBarProps {
  currentRepo: string;
  onSelectRepo: (repo: string) => void;
  availableRepos: RepositoryItem[];
  health: ApiHealth | null;
  apiError: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  stats?: {
    files: number;
    edges: number;
    symbols: number;
  } | null;
  onOpenAbout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentRepo,
  onSelectRepo,
  availableRepos,
  health,
  apiError,
  searchQuery,
  onSearchChange,
  stats,
  onOpenAbout,
}) => {
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
  const [customRepoInput, setCustomRepoInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRepoDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleCustomRepoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (customRepoInput.trim()) {
      onSelectRepo(customRepoInput.trim());
      setIsRepoDropdownOpen(false);
      setCustomRepoInput("");
    }
  }

  return (
    <header className="atlas-topbar">
      <div className="topbar-left">
        <a href="/" className="atlas-brand" title="RepoGraph: The Code Atlas">
          <div className="atlas-brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="18" r="3" />
              <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
              <circle cx="18" cy="6" r="3" />
              <line x1="18" y1="9" x2="18" y2="15" />
            </svg>
          </div>
          <div className="atlas-brand-text">
            <span className="brand-title">RepoGraph</span>
            <span className="brand-subtitle">THE CODE ATLAS</span>
          </div>
        </a>

        <div className="topbar-divider" />

        {/* Repository Switcher */}
        <div className="repo-switcher-container" ref={dropdownRef}>
          <button
            type="button"
            className="repo-switcher-button"
            onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
            aria-expanded={isRepoDropdownOpen}
          >
            <svg className="repo-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span className="repo-name font-mono">{currentRepo || "Select repository"}</span>
            <span className="branch-tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              main
            </span>
            <svg className="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isRepoDropdownOpen && (
            <div className="repo-dropdown-menu">
              <div className="dropdown-header">SWITCH REPOSITORY</div>
              <div className="dropdown-list">
                {availableRepos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    className={`dropdown-item ${repo.name === currentRepo ? "active" : ""}`}
                    onClick={() => {
                      onSelectRepo(repo.name);
                      setIsRepoDropdownOpen(false);
                    }}
                  >
                    <span className="font-mono">{repo.name}</span>
                    {repo.name === currentRepo && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              <form className="custom-repo-form" onSubmit={handleCustomRepoSubmit}>
                <div className="dropdown-header">CUSTOM PATH / DIRECTORY</div>
                <div className="custom-input-row">
                  <input
                    type="text"
                    value={customRepoInput}
                    onChange={(e) => setCustomRepoInput(e.target.value)}
                    placeholder="e.g. RepoGraph or ."
                    className="font-mono"
                  />
                  <button type="submit" className="custom-submit-btn">Load</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Global Quick Search */}
      <div className="topbar-center">
        <div className="atlas-global-search">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files, symbols, modules…"
            className="global-search-input"
          />
          {searchQuery ? (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => onSearchChange("")}
              title="Clear search"
            >
              ×
            </button>
          ) : (
            <kbd className="search-shortcut">⌘K</kbd>
          )}
        </div>
      </div>

      {/* Right Status Badges */}
      <div className="topbar-right">
        {stats && (
          <div className="atlas-stats-badge" title="Analyzed repository scale">
            <span className="stat-item">
              <strong>{stats.files}</strong> files
            </span>
            <span className="stat-separator">·</span>
            <span className="stat-item">
              <strong>{stats.edges}</strong> deps
            </span>
            <span className="stat-separator">·</span>
            <span className="stat-item">
              <strong>{stats.symbols}</strong> symbols
            </span>
          </div>
        )}

        <div className="connection-pill" title={health ? "Backend API connected and responsive" : apiError || "Connecting..."}>
          <span
            className={`status-indicator-dot ${
              health ? "online" : apiError ? "offline" : "pending"
            }`}
          />
          <span className="status-label">
            {health ? "Connected" : apiError ? "Offline" : "Connecting"}
          </span>
        </div>

        <button
          type="button"
          className="atlas-icon-btn"
          onClick={onOpenAbout}
          title="About RepoGraph: The Code Atlas"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>
    </header>
  );
};
