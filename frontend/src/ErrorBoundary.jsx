import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      // eslint-disable-next-line no-console
      console.error('UI error:', error, info);
    } catch {}
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Bir hata oluştu</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b91c1c' }}>{String(error?.message || error)}</pre>
          <p style={{ fontSize: 12, color: '#475569' }}>Sayfayı yenilemeyi deneyin. Hata devam ederse geliştiriciye iletin.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

