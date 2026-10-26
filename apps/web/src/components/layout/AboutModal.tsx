import React, { useEffect } from "react";

interface AboutModalProps {
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="atlas-modal-backdrop" onClick={onClose}>
      <div className="atlas-about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="eyebrow-tag">ARCHITECTURAL GUIDE</span>
            <h2 className="modal-title font-serif">RepoGraph: The Code Atlas</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </div>

        <div className="modal-body about-modal-body">
          <p className="lead-text font-serif">
            A distinctive, editorial code-intelligence workspace designed to explore large codebases like an interactive geographic atlas.
          </p>

          <div className="about-grid">
            <div className="about-card">
              <span className="about-card-title">AST Tree-sitter Extraction</span>
              <p className="muted">
                Parses source files directly into concrete syntax trees to extract functions, classes, interfaces, and type declarations with exact line boundaries.
              </p>
            </div>

            <div className="about-card">
              <span className="about-card-title">Deterministic Import Resolution</span>
              <p className="muted">
                Resolves relative ES module and TypeScript imports to explicit canonical file paths inside validated workspace boundaries.
              </p>
            </div>

            <div className="about-card">
              <span className="about-card-title">Reverse BFS Impact Traversal</span>
              <p className="muted">
                When a file is modified, traces all reachable dependent consumers through a reverse breadth-first search, calculating distance hops and propagation chains.
              </p>
            </div>

            <div className="about-card">
              <span className="about-card-title">Warm Ivory Visual Identity</span>
              <p className="muted">
                Uses warm ivory surfaces, forest-green primary actions, burnt-orange impact highlights, and editorial typography for clarity and visual longevity.
              </p>
            </div>
          </div>

          <div className="shortcuts-section">
            <span className="section-heading">KEYBOARD SHORTCUTS & INTERACTIONS</span>
            <div className="shortcuts-grid font-mono">
              <div className="shortcut-row">
                <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd>
                <span>Focus global search input</span>
              </div>
              <div className="shortcut-row">
                <kbd>Esc</kbd>
                <span>Close modal or deselect current item</span>
              </div>
              <div className="shortcut-row">
                <kbd>Alt+1</kbd>
                <span>Toggle Explorer sidebar</span>
              </div>
              <div className="shortcut-row">
                <kbd>Alt+2</kbd>
                <span>Toggle Inspector panel</span>
              </div>
              <div className="shortcut-row">
                <kbd>Scroll</kbd> / <kbd>Pinch</kbd>
                <span>Smooth zoom graph canvas</span>
              </div>
              <div className="shortcut-row">
                <kbd>Drag</kbd>
                <span>Pan atlas viewport</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="atlas-btn atlas-btn-primary" onClick={onClose}>
            Back to Atlas
          </button>
        </div>
      </div>
    </div>
  );
};
