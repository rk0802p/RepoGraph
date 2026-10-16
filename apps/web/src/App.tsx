
import { useEffect, useState } from "react";
import { checkApiHealth } from "./api";
import "./App.css";

type ApiHealth = {
  status: string;
  message: string;
  timestamp: string;
};

function App() {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkApiHealth()
      .then((data: ApiHealth) => setHealth(data))
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Unable to connect to API"
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="app">
      <div className="status-card">
        <p className="eyebrow">DEVELOPER INTELLIGENCE PLATFORM</p>
        <h1>RepoGraph</h1>
        <p className="subtitle">
          Understand your codebase. Trace dependencies. Assess changes.
        </p>

        <div className="api-status">
          <span
            className={`status-dot ${
              health ? "online" : error ? "offline" : ""
            }`}
          />
          <span>
            {loading
              ? "Connecting to backend..."
              : health
                ? "Backend connected"
                : "Backend connection failed"}
          </span>
        </div>

        {health && (
          <section className="response">
            <h2>API response</h2>
            <p>{health.message}</p>
            <p>
              Status: <strong>{health.status}</strong>
            </p>
            <p className="timestamp">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
          </section>
        )}

        {error && (
          <p className="error-message">
            {error}. Make sure the backend is running on port 3000.
          </p>
        )}
      </div>
    </main>
  );
}

export default App;
