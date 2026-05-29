import { Component } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient.ts'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{children: any}, {error: any}> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: any) { return { error }; }
  componentDidCatch(error: any, info: any) { console.error('RENDER ERROR:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-title">Erreur de rendu React</div>
          <pre className="error-stack">
            {String(this.state.error?.message || this.state.error)}
            {'\n\n'}
            {String(this.state.error?.stack || '').split('\n').slice(0,15).join('\n')}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>,
)
