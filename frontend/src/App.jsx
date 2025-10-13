import React, { useEffect, useState } from 'react';
import { ChevronLeft, Users, DollarSign, Package, BarChart3, Settings, LogOut, Lock, Calculator, Coins, CreditCard } from 'lucide-react';

import POS from './pages/POS.jsx';
import Personnel from './pages/Personnel.jsx';
import Expenses from './pages/Expenses.jsx';
import StockCodes from './pages/StockCodes.jsx';
import StockPurchase from './pages/StockPurchase.jsx';
import ProductPrices from './pages/ProductPrices.jsx';
import Reports from './pages/Reports.jsx';
import PerformansTakibi from './pages/PerformansTakibi.jsx';
import CiroGecmisi from './pages/CiroGecmisi.jsx';
import VeriYazdirma from './pages/VeriYazdirma.jsx';
import MaliyetHesaplama from './pages/MaliyetHesaplama.jsx';
import GunSonuIslemleri from './pages/GunSonuIslemleri.jsx';
import AylikMasraf from './pages/AylikMasraf.jsx';
const TableNames = React.lazy(() => import('./pages/TableNames.jsx'));
import StokGuncellemeTakibi from './pages/StokGuncellemeTakibi.jsx';
import { formatCurrency } from './utils/format.js';
import { getApiBase } from './utils/api.js';

const API_BASE = getApiBase();

export default function App() {
  const [currentPage, setCurrentPage] = useState('pos');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginData, setLoginData] = useState({ username: 'admin', password: 'admin' });
  const [dailyRevenue, setDailyRevenue] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setIsAuthenticated(true);
      try {
        const parsed = JSON.parse(userData);
        setUser(parsed);
        if (parsed?.role === 'admin') {
          setCurrentPage('stock-purchase');
        }
      } catch (e) {
        // ignore parse error
      }
    }
    fetchDailyRevenue();
    const handler = () => fetchDailyRevenue();
    window.addEventListener('refresh-daily-revenue', handler);
    return () => window.removeEventListener('refresh-daily-revenue', handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchDailyRevenue = async () => {
    try {
      const response = await fetch(`${API_BASE}/daily-revenue`);
      const data = await response.json();
      setDailyRevenue(data.daily_revenue || 0);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setIsAuthenticated(true);
        setUser(data.user);
        setShowLogin(false);
        // Force junior admin to Stock Purchase page, others go to POS
        try {
          if (data?.user?.role === 'admin') {
            setCurrentPage('stock-purchase');
          } else {
            setCurrentPage('pos');
          }
        } catch (e) {
          setCurrentPage('pos');
        }
      } else {
        alert('Geçersiz Kullanıcı adı veya Şifre');
      }
    } catch (error) {
      alert('Giriş yaparken bir hata oluştu');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
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
      setShowLogin(true);
      return;
    }
    const role = user?.role;
    if (role === 'admin' && page !== 'stock-purchase') {
      setCurrentPage('stock-purchase');
      return;
    }
    setCurrentPage(page);
  };

  const role = user?.role || null;
  const isJuniorAdmin = role === 'admin';
  const effectivePage = isAuthenticated && isJuniorAdmin
    ? (currentPage === 'pos' ? 'pos' : 'stock-purchase')
    : currentPage;

  if (showLogin) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 w-96">
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
            />
            <input
              type="password"
              value={loginData.password}
              onChange={(event) => setLoginData({ ...loginData, password: event.target.value })}
              className="w-full px-3 py-2 border rounded"
              placeholder="Şifre"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowLogin(false)} className="flex-1 py-2 bg-gray-500 text-white rounded">
                İptal
              </button>
              <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded">
                Giriş
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-4">
              {effectivePage === 'pos' && (
                <div className="text-green-700 font-bold text-3xl md:text-4xl font-mono tabular-nums">
                  {now.toLocaleTimeString('tr-TR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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

      {effectivePage === 'pos' ? (
        <POS onAdminClick={() => requireAuth('personnel')} onOrderClosed={fetchDailyRevenue} />
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
            {effectivePage === 'personnel' && <Personnel />}
            {effectivePage === 'expenses' && <Expenses />}
            {effectivePage === 'stock-codes' && <StockCodes />}
            {effectivePage === 'stock-purchase' && <StockPurchase />}
            {effectivePage === 'stock-purchase-tracking' && <StokGuncellemeTakibi />}
            {effectivePage === 'product-prices' && <ProductPrices />}
            {effectivePage === 'table-names' && (
              <React.Suspense fallback={<div />}> 
                <TableNames />
              </React.Suspense>
            )}
            {effectivePage === 'costing' && <MaliyetHesaplama />}
            {effectivePage === 'monthly-cost' && <AylikMasraf />}
            {effectivePage === 'reports' && <Reports />}
            {effectivePage === 'performance' && <PerformansTakibi />}
            {effectivePage === 'closings' && <CiroGecmisi />}
            {effectivePage === 'end-of-day-ops' && <GunSonuIslemleri />}
            {effectivePage === 'export' && <VeriYazdirma />}
          </main>
        </div>
      )}
    </div>
  );
}
