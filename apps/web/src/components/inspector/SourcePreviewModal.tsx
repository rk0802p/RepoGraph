import React, { useEffect, useState } from "react";
import { fetchFileContent, type FileContentResponse } from "../../api";

interface SourcePreviewModalProps {
  repositoryName: string;
  filePath: string;
  onClose: () => void;
}

export const SourcePreviewModal: React.FC<SourcePreviewModalProps> = ({
  repositoryName,
  filePath,
  onClose,
}) => {
  const [data, setData] = useState<FileContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFileContent(repositoryName, filePath)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file content.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryName, filePath]);

  // Handle Esc key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleCopy() {
    if (data?.content) {
      navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const lines = data?.content.split(/\r?\n/) ?? [];

  return (
    <div className="atlas-modal-backdrop" onClick={onClose}>
      <div className="atlas-source-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="eyebrow-tag">SOURCE PREVIEW</span>
            <h3 className="modal-file-path font-mono">{filePath}</h3>
            {data && (
              <span className="modal-meta-strip">
                {data.lines} lines · {(data.sizeBytes / 1024).toFixed(1)} KB · {data.extension}
              </span>
            )}
          </div>
          <div className="modal-header-actions">
            <button
              type="button"
              className="atlas-btn atlas-btn-secondary"
              onClick={handleCopy}
              disabled={!data}
            >
              {copied ? "Copied!" : "Copy Code"}
            </button>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="modal-loading-state">
              <span className="atlas-spinner-large" />
              <p>Loading file content…</p>
            </div>
          )}

          {error && (
            <div className="modal-error-state">
              <p className="error-title">Unable to preview file</p>
              <p className="error-details">{error}</p>
            </div>
          )}

          {data && (
            <div className="source-code-editor font-mono">
              <div className="line-numbers-col">
                {lines.map((_, i) => (
                  <span key={i + 1} className="line-num">
                    {i + 1}
                  </span>
                ))}
              </div>
              <pre className="code-content-col">
                <code>
                  {lines.map((line, i) => (
                    <div key={i} className="code-line">
                      {line || " "}
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
