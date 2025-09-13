import React, { useEffect, useState } from 'react';
import { ChevronLeft, Users, DollarSign, Package, BarChart3, Settings, LogOut, Lock } from 'lucide-react';

import POS from './pages/POS.jsx';
import Personnel from './pages/Personnel.jsx';
import Expenses from './pages/Expenses.jsx';
import StockCodes from './pages/StockCodes.jsx';
import StockPurchase from './pages/StockPurchase.jsx';
import ProductPrices from './pages/ProductPrices.jsx';
import Reports from './pages/Reports.jsx';
import CiroGeçmişi from './pages/CiroGeçmişi.jsx';
import VeriYazdirma from './pages/VeriYazdirma.jsx';
import { formatCurrency } from './utils/format.js';
import { t } from './utils/i18n.js';
import { getApiBase } from './utils/api.js';

const API_BASE = getApiBase();

export default function App() {
  const [currentPage, setCurrentPage] = useState('pos');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginData, setLoginData] = useState({ username: 'admin', password: 'admin' });
  const [dailyRevenue, setDailyRevenue] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) { setIsAuthenticated(true); setUser(JSON.parse(userData)); }
    fetchDailyRevenue();
    const fn = () => fetchDailyRevenue();
    window.addEventListener('refresh-daily-revenue', fn);
    return () => window.removeEventListener('refresh-daily-revenue', fn);
  }, []);

  const fetchDailyRevenue = async () => {
    try {
      const r = await fetch(`${API_BASE}/daily-revenue`);
      const d = await r.json();
      setDailyRevenue(d.daily_revenue || 0);
    } catch (e) { console.error(e); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginData) });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setIsAuthenticated(true); setUser(data.user); setShowLogin(false);
      } else { alert('Gecersiz Kullanıcı adı veya Şifre'); }
    } catch (err) { alert('Giriş yaparken bir hata olustu'); }
  };

  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setIsAuthenticated(false); setUser(null); setCurrentPage('pos'); };
  const requireAuth = (page) => { if (!isAuthenticated) { setShowLogin(true); return; } setCurrentPage(page); };

  if (showLogin) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 w-96">
          <div className="text-center mb-6">
            <Lock className="icon-lg mx-auto text-blue-600 mb-4" />
            <h2 className="text-2xl font-bold">Admin Girişi</h2>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="text" value={loginData.username} onChange={(e) => setLoginData({ ...loginData, username: e.target.value })} className="w-full px-3 py-2 border rounded" placeholder="Kullanıcı adı" />
            <input type="password" value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} className="w-full px-3 py-2 border rounded" placeholder="Şifre" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowLogin(false)} className="flex-1 py-2 bg-gray-500 text-white rounded"></button>
              <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded">Giriş</button>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">Büfe Yönetim Sistemi</h1>
              {currentPage !== 'pos' && (
                <button onClick={() => setCurrentPage('pos')} className="flex items-center text-blue-600 hover:text-blue-800">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Ana Sayfa
                </button>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-600">Günlük Ciro</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(dailyRevenue)}</div>
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch(`${API_BASE}/end-of-day`, { method: 'POST', headers: { ...( { Authorization: `Bearer ${localStorage.getItem('token')}` } ) } });
                      if (r.ok) { window.dispatchEvent(new CustomEvent('refresh-daily-revenue')); alert('Günsonu Alındı'); }
                      else { alert('Günsonu Alınamadı'); }
                    } catch { alert('Günsonu Alınamadı'); }
                  }}
                  className="mt-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded mr-2"
                >
                  Günsonu Al
                </button>
              </div>
              {isAuthenticated && (
                <button onClick={handleLogout} className="flex items-center text-red-600">
                  <LogOut className="h-4 w-4 mr-1" /> Çıkış
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {currentPage === 'pos' ? (
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
                { id: 'product-prices', label: 'Ürün Fiyatları', icon: Settings },
                { id: 'reports', label: 'Ciro ve Net Kâr', icon: BarChart3 },
                { id: 'closings', label: 'Ciro Geçmişi', icon: BarChart3 },
                { id: 'export', label: 'Veri Yazdırma', icon: BarChart3 },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => requireAuth(id)} className={`w-full flex items-center px-4 py-3 text-left rounded-lg mb-2 ${currentPage===id?'bg-blue-100 text-blue-700':'text-gray-600 hover:bg-gray-100'}`}>
                  <Icon className="h-4 w-4" />
                  <span className="ml-3">{label}</span>
                </button>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-4">
            {currentPage === 'personnel' && <Personnel />}
            {currentPage === 'expenses' && <Expenses />}
            {currentPage === 'stock-codes' && <StockCodes />}
            {currentPage === 'stock-purchase' && <StockPurchase />}
            {currentPage === 'product-prices' && <ProductPrices />}
            {currentPage === 'reports' && <Reports />}
            {currentPage === 'closings' && <CiroGeçmişi />}
            {currentPage === 'export' && <VeriYazdirma />}
          </main>
        </div>
      )}
    </div>
  );
}









