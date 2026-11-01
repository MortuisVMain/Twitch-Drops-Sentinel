import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { installTranslator } from './i18n';
import { applyTextScale, getTextScale } from './utils/textScale';
import { installTruncationTitles } from './utils/truncationTitles';
import './fonts.css';
import './index.css';

interface RootErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, RootErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('RootErrorBoundary caught unhandled UI crash:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', backgroundColor: '#050608', color: '#F3F5F8',
          fontFamily: "'Inter Variable', 'Segoe UI', sans-serif", padding: '24px',
          boxSizing: 'border-box', textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '640px', backgroundColor: '#0E1218', border: '1px solid rgba(248, 113, 113, 0.4)',
            borderRadius: '16px', padding: '28px', boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <h2 style={{ color: '#F87171', fontSize: 'var(--fs-lg)', margin: '0 0 10px', fontWeight: 800 }}>
              Twitch Drops Sentinel — Сбой Инициализации UI
            </h2>
            <p style={{ color: '#9CA3B0', fontSize: 'var(--fs-sm)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Интерфейс Sentinel перехватил ошибку в React-дереве:
            </p>
            <pre style={{
              backgroundColor: '#050608', padding: '12px', borderRadius: '8px', fontSize: 'var(--fs-xs)',
              fontFamily: "'Inter Variable', 'Segoe UI', sans-serif", color: '#FCA5A5', textAlign: 'left',
              overflowX: 'auto', maxHeight: '180px', border: '1px solid rgba(255,255,255,0.08)',
              whiteSpace: 'pre-wrap'
            }}>
              {this.state.error?.stack || this.state.error?.message || 'Неизвестная ошибка'}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '18px', padding: '9px 22px', backgroundColor: '#3AD29F', color: '#04120C',
                border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: 'var(--fs-sm)', cursor: 'pointer'
              }}
            >
              Перезагрузить интерфейс
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

applyTextScale(getTextScale());
installTranslator();
installTruncationTitles();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
