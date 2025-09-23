export const getApiBase = () => {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    // Use same-origin + Vite proxy to reach backend during dev
    return '/api';
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin.replace(/\/$/, '')}/api`;
  }

  return '/api';
};

export const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const jsonFetch = async (url, options = {}) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
