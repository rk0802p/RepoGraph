import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled React Error Boundary Exception:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '12px' }}>⚠️ Something went wrong</h1>
          <p style={{ color: '#94a3b8', maxWidth: '500px', marginBottom: '24px' }}>
            RepoGraph encountered an unexpected client error while rendering the graph visualization or interface.
          </p>
          <pre style={{
            background: '#1e293b',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            color: '#f87171',
            maxWidth: '650px',
            overflowX: 'auto',
            marginBottom: '24px',
            textAlign: 'left'
          }}>
            {this.state.error?.message || 'Unknown render error'}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
