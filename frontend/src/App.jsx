import React, { useEffect, useState } from 'react';
import { ChevronLeft, Users, DollarSign, Package, BarChart3, Settings, LogOut, Lock, Calculator, Coins, CreditCard } from 'lucide-react';

import { formatCurrency } from './utils/format.js';
import { getApiBase } from './utils/api.js';

const POS = React.lazy(() => import('./pages/POS.jsx'));
const Personnel = React.lazy(() => import('./pages/Personnel.jsx'));
const Expenses = React.lazy(() => import('./pages/Expenses.jsx'));
const StockCodes = React.lazy(() => import('./pages/StockCodes.jsx'));
const StockPurchase = React.lazy(() => import('./pages/StockPurchase.jsx'));
const ProductPrices = React.lazy(() => import('./pages/ProductPrices.jsx'));
const Reports = React.lazy(() => import('./pages/Reports.jsx'));
const PerformansTakibi = React.lazy(() => import('./pages/PerformansTakibi.jsx'));
const CiroGecmisi = React.lazy(() => import('./pages/CiroGecmisi.jsx'));
const MaliyetHesaplama = React.lazy(() => import('./pages/MaliyetHesaplama.jsx'));
const GunSonuIslemleri = React.lazy(() => import('./pages/GunSonuIslemleri.jsx'));
const AylikMasraf = React.lazy(() => import('./pages/AylikMasraf.jsx'));
const TableNames = React.lazy(() => import('./pages/TableNames.jsx'));
const VeriYazdirma = React.lazy(() => import('./pages/VeriYazdirma.jsx'));
const StokGuncellemeTakibi = React.lazy(() => import('./pages/StokGuncellemeTakibi.jsx'));

const API_BASE = getApiBase();
const JUNIOR_ADMIN_PAGES = new Set(['stock-purchase', 'stock-purchase-tracking']);

function getAdminLandingPage(role, requestedPage) {
  if (role === 'admin') {
    return JUNIOR_ADMIN_PAGES.has(requestedPage) ? requestedPage : 'stock-purchase';
  }
  return requestedPage && requestedPage !== 'pos' ? requestedPage : 'personnel';
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return now.toLocaleTimeString('tr-TR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('pos');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginData, setLoginData] = useState({ username: 'admin', password: 'admin' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [pendingPage, setPendingPage] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(() => (
    Boolean(localStorage.getItem('token') && localStorage.getItem('user'))
  ));
  const [dailyRevenue, setDailyRevenue] = useState(0);
  const [connectionError, setConnectionError] = useState('');
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const sessionController = new AbortController();
    let sessionTimeoutId;
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData);
        const restoreSession = async () => {
          try {
            sessionTimeoutId = setTimeout(() => sessionController.abort(), 8000);
            const response = await fetch(`${API_BASE}/auth/session`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: sessionController.signal,
            });
            if (response.status === 401 || response.status === 403) {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              setSessionError('Yönetim oturumunun süresi doldu. Lütfen yeniden giriş yapın.');
              setCurrentPage('pos');
              return;
            }
            if (!response.ok) {
              throw new Error(`Session check returned HTTP ${response.status}`);
            }
            const data = await response.json();
            if (cancelled) return;
            const restoredUser = data.user || parsed;
            localStorage.setItem('user', JSON.stringify(restoredUser));
            setIsAuthenticated(true);
            setUser(restoredUser);
            setSessionError('');
            setCurrentPage(getAdminLandingPage(restoredUser?.role));
          } catch (error) {
            if (cancelled) return;
            console.error('Could not restore session:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setIsAuthenticated(false);
            setUser(null);
            setCurrentPage('pos');
            setSessionError(error?.name === 'AbortError'
              ? 'Yönetim oturumu zaman aşımına uğradı. Sunucu bağlantısını kontrol edin.'
              : 'Yönetim oturumu doğrulanamadı. Lütfen yeniden giriş yapın.');
          } finally {
            clearTimeout(sessionTimeoutId);
            if (!cancelled) setIsRestoringSession(false);
          }
        };
        restoreSession();
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsRestoringSession(false);
      }
    } else {
      setIsRestoringSession(false);
    }
    let retryId;
    const poll = async () => {
      await fetchDailyRevenue();
      if (!cancelled) {
        retryId = setTimeout(poll, 15000);
      }
    };
    poll();
    const handler = () => fetchDailyRevenue();
    window.addEventListener('refresh-daily-revenue', handler);
    return () => {
      cancelled = true;
      sessionController.abort();
      clearTimeout(sessionTimeoutId);
      clearTimeout(retryId);
      window.removeEventListener('refresh-daily-revenue', handler);
    };
  }, []);

  const fetchDailyRevenue = async () => {
    try {
      const response = await fetch(`${API_BASE}/daily-revenue`);
      if (!response.ok) {
        throw new Error(`Backend returned HTTP ${response.status}`);
      }
      const data = await response.json();
      setDailyRevenue(data.daily_revenue || 0);
      setConnectionError('');
    } catch (error) {
      console.error(error);
      setConnectionError('Sunucu baglantisi kurulamadi. Backend ve Web UI baglantisini kontrol edin.');
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError('');
    const loginController = new AbortController();
    const loginTimeoutId = setTimeout(() => loginController.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
        signal: loginController.signal,
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setIsAuthenticated(true);
        setUser(data.user);
        setSessionError('');
        setShowLogin(false);
        setCurrentPage(getAdminLandingPage(data?.user?.role, pendingPage));
        setPendingPage(null);
      } else {
        setLoginError('Geçersiz kullanıcı adı veya şifre.');
      }
    } catch (error) {
      setLoginError(error?.name === 'AbortError'
        ? 'Giriş isteği zaman aşımına uğradı.'
        : 'Giriş sırasında sunucuya ulaşılamadı.');
    } finally {
      clearTimeout(loginTimeoutId);
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setSessionError('');
    setPendingPage(null);
    setCurrentPage('pos');
  };

  const handleEndOfDay = async () => {
    if (!window.confirm('Günsonu almak istediğinizden emin misiniz?')) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/end-of-day`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        window.dispatchEvent(new CustomEvent('refresh-daily-revenue'));
        alert('Günsonu alındı');
      } else {
        alert('Günsonu alınmadı');
      }
    } catch (error) {
      alert('Günsonu alınmadı');
    }
  };


  const requireAuth = (page) => {
    if (!isAuthenticated) {
      setPendingPage(page);
      setLoginError('');
      setShowLogin(true);
      return;
    }
    const role = user?.role;
    if (role === 'admin' && !JUNIOR_ADMIN_PAGES.has(page)) {
      setCurrentPage(getAdminLandingPage(role, page));
      return;
    }
    setCurrentPage(page);
  };

  const role = user?.role || null;
  const isJuniorAdmin = role === 'admin';
  const effectivePage = isAuthenticated && isJuniorAdmin
    ? (currentPage === 'pos' || JUNIOR_ADMIN_PAGES.has(currentPage) ? currentPage : 'stock-purchase')
    : currentPage;

  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-600">
        Yönetim oturumu yükleniyor...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {showLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 w-96 max-w-[calc(100vw-2rem)]">
            <div className="text-center mb-6">
              <Lock className="icon-lg mx-auto text-blue-600 mb-4" />
              <h2 className="text-2xl font-bold">Admin Girişi</h2>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                value={loginData.username}
                onChange={(event) => setLoginData({ ...loginData, username: event.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="Kullanıcı adı"
                autoComplete="username"
              />
              <input
                type="password"
                value={loginData.password}
                onChange={(event) => setLoginData({ ...loginData, password: event.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="Şifre"
                autoComplete="current-password"
              />
              {loginError && <p className="text-sm text-red-600">{loginError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={loginLoading}
                  onClick={() => {
                    setShowLogin(false);
                    setPendingPage(null);
                    setLoginError('');
                  }}
                  className="flex-1 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="flex-1 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  {loginLoading ? 'Giriş yapılıyor...' : 'Giriş'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <header className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-4">
              {effectivePage === 'pos' && (
                <div className="text-green-700 font-bold text-3xl md:text-4xl font-mono tabular-nums">
                  <LiveClock />
                </div>
              )}
              {effectivePage !== 'pos' && (
                <button
                  onClick={() => setCurrentPage('pos')}
                  className="flex items-center text-blue-600 hover:text-blue-800"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> POS'a Dön
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 ml-auto justify-end text-right">
              <div className="text-right">
                <div className="text-sm text-gray-600">Günlük Ciro</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(dailyRevenue)}</div>
              </div>
              <button
                onClick={handleEndOfDay}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Günsonu Al
              </button>
              {isAuthenticated && (
                <button onClick={handleLogout} className="flex items-center text-red-600">
                  <LogOut className="h-4 w-4 mr-1" /> Çıkış
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {connectionError && (
        <div role="alert" className="bg-red-100 border-b border-red-300 px-6 py-3 text-red-800">
          {connectionError}
        </div>
      )}

      {sessionError && (
        <div role="alert" className="bg-amber-100 border-b border-amber-300 px-6 py-3 text-amber-900">
          {sessionError}
        </div>
      )}

      {effectivePage === 'pos' ? (
        <React.Suspense fallback={<div className="p-6 text-gray-500">POS yükleniyor...</div>}>
          <POS
            onAdminClick={() => requireAuth('personnel')}
            onOrderClosed={fetchDailyRevenue}
            canManageLayout={user?.role === 'superadmin'}
          />
        </React.Suspense>
      ) : (
        <div className="flex">
          <aside className="w-64 bg-white shadow-sm min-h-screen">
            <nav className="p-4">
              {[
                { id: 'personnel', label: 'Personel Giderleri', icon: Users },
                { id: 'expenses', label: 'İşletme Giderleri', icon: DollarSign },
                { id: 'stock-codes', label: 'Stok Kodu Listesi', icon: Package },
                { id: 'stock-purchase', label: 'Stok Güncelleme', icon: Package },
                { id: 'stock-purchase-tracking', label: 'Stok Güncelleme Takibi', icon: BarChart3 },
                { id: 'product-prices', label: 'Ürün Fiyatları', icon: Settings },
                { id: 'costing', label: 'Maliyet Hesaplama', icon: Calculator },
                { id: 'monthly-cost', label: 'Aylık Masraf', icon: Coins },
                { id: 'reports', label: 'Ciro ve Net Kar Raporu', icon: BarChart3 },
                { id: 'performance', label: 'Performans Takibi', icon: BarChart3 },
                { id: 'closings', label: 'Ciro Geçmişi', icon: BarChart3 },
                { id: 'end-of-day-ops', label: 'Gün Sonu İşlemleri', icon: CreditCard },
                { id: 'export', label: 'Veri Yazdırma', icon: BarChart3 },
              ].filter(item => !isJuniorAdmin || ['stock-purchase', 'stock-purchase-tracking'].includes(item.id)).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => requireAuth(id)}
                  className={`w-full flex items-center px-4 py-3 text-left rounded-lg mb-2 ${effectivePage === id ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="ml-3">{label}</span>
                </button>
              ))}
            </nav>
            {!isJuniorAdmin && (
              <div className="p-4 pt-0">
                <button
                  onClick={() => requireAuth('table-names')}
                  className={`w-full flex items-center px-4 py-3 text-left rounded-lg mb-2 ${effectivePage === 'table-names' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Settings className="h-4 w-4" />
                  <span className="ml-3">Masa İsimleri</span>
                </button>
              </div>
            )}
          </aside>
          <main className="flex-1 p-4">
            <React.Suspense fallback={<div className="p-4 text-gray-500">Sayfa yükleniyor...</div>}>
              {effectivePage === 'personnel' && <Personnel />}
              {effectivePage === 'expenses' && <Expenses />}
              {effectivePage === 'stock-codes' && <StockCodes />}
              {effectivePage === 'stock-purchase' && <StockPurchase />}
              {effectivePage === 'stock-purchase-tracking' && <StokGuncellemeTakibi />}
              {effectivePage === 'product-prices' && <ProductPrices />}
              {effectivePage === 'table-names' && <TableNames />}
              {effectivePage === 'costing' && <MaliyetHesaplama />}
              {effectivePage === 'monthly-cost' && <AylikMasraf />}
              {effectivePage === 'reports' && <Reports />}
              {effectivePage === 'performance' && <PerformansTakibi />}
              {effectivePage === 'closings' && <CiroGecmisi />}
              {effectivePage === 'end-of-day-ops' && <GunSonuIslemleri />}
              {effectivePage === 'export' && <VeriYazdirma />}
            </React.Suspense>
          </main>
        </div>
      )}
    </div>
  );
}
