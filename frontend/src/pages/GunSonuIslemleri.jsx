import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';
import { Edit, Trash2 } from 'lucide-react';

const API_BASE = getApiBase();

const now = new Date();
const todayDate = now.toISOString().split('T')[0];
const todayTime = now.toTimeString().split(' ')[0].substring(0, 5);
const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
const currentYear = String(now.getFullYear());

export default function GunSonuIslemleri() {
  // Main page filters
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  // State for Credit Card Sales
  const [ccDate, setCcDate] = useState(todayDate);
  const [ccAmount, setCcAmount] = useState('');
  const [ccRecords, setCcRecords] = useState([]);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccError, setCcError] = useState(null);
  const [ccSuccess, setCcSuccess] = useState(null);
  const [editingCcDate, setEditingCcDate] = useState(null);

  // State for Manual Sales
  const [msDate, setMsDate] = useState(todayDate);
  const [msTime, setMsTime] = useState(todayTime);
  const [msProduct, setMsProduct] = useState('');
  const [msAmount, setMsAmount] = useState('');
  const [msRecords, setMsRecords] = useState([]);
  const [msLoading, setMsLoading] = useState(false);
  const [msError, setMsError] = useState(null);
  const [msSuccess, setMsSuccess] = useState(null);
  const [editingMsId, setEditingMsId] = useState(null);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch(`${API_BASE}/product-prices`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setAllProducts(Array.isArray(data) ? data.map(p => p.product_name) : []);
        }
      } catch (e) {
        console.error("Ürünler alınamadı:", e);
      }
    };
    fetchProducts();
  }, []);

  const fetchCcRecords = useCallback(async () => {
    setCcLoading(true);
    try {
      const response = await fetch(`${API_BASE}/credit-card-sales?month=${month}&year=${year}`, { headers: authHeaders() });
      if (response.ok) {
        const data = await response.json();
        setCcRecords(Array.isArray(data) ? data : []);
      } else {
        setCcRecords([]);
      }
    } catch (e) {
      console.error(e);
      setCcRecords([]);
    } finally {
      setCcLoading(false);
    }
  }, [month, year]);

  const fetchMsRecords = useCallback(async () => {
    setMsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/manual-sales?month=${month}&year=${year}`, { headers: authHeaders() });
      if (response.ok) {
        const data = await response.json();
        setMsRecords(Array.isArray(data) ? data : []);
      } else {
        setMsRecords([]);
      }
    } catch (e) {
      console.error(e);
      setMsRecords([]);
    } finally {
      setMsLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchCcRecords();
    fetchMsRecords();
  }, [fetchCcRecords, fetchMsRecords]);

  const handleProductSearch = (query) => {
    setMsProduct(query);
    if (!query.trim()) {
      setProductSuggestions([]);
      return;
    }
    const lowerQuery = query.toLowerCase();
    setProductSuggestions(allProducts.filter(p => p.toLowerCase().includes(lowerQuery)).slice(0, 5));
  };

  const selectProduct = (productName) => {
    setMsProduct(productName);
    setProductSuggestions([]);
  };

  const handleCcSubmit = async (e) => {
    e.preventDefault();
    setCcError(null);
    setCcSuccess(null);
    if (!ccDate || !ccAmount || Number(ccAmount) < 0) {
      setCcError('Lütfen geçerli bir tarih ve tutar girin.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/credit-card-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ date: ccDate, amount: Number(ccAmount) }),
      });

      if (response.ok) {
        setCcSuccess(`Kredi kartı cirosu başarıyla ${editingCcDate ? 'güncellendi' : 'kaydedildi'}.`);
        setCcAmount('');
        setEditingCcDate(null);
        await fetchCcRecords();
      } else {
        const errData = await response.json();
        setCcError(errData.message || 'Kayıt sırasında bir hata oluştu.');
      }
    } catch (err) {
      console.error(err);
      setCcError('Sunucuya bağlanırken bir hata oluştu.');
    }
  };

  const handleCcDelete = async (dateToDelete) => {
    if (!window.confirm(`${dateToDelete} tarihli kaydı silmek istediğinizden emin misiniz?`)) return;
    try {
      const response = await fetch(`${API_BASE}/credit-card-sales/${dateToDelete}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        setCcSuccess('Kayıt başarıyla silindi.');
        await fetchCcRecords();
      } else {
        const errData = await response.json();
        setCcError(errData.message || 'Silme işlemi başarısız.');
      }
    } catch (err) {
      setCcError('Sunucuya bağlanırken bir hata oluştu.');
    }
  };

  const startEditCc = (record) => {
    setEditingCcDate(record.date);
    setCcDate(record.date);
    setCcAmount(String(record.amount));
  };

  const handleMsSubmit = async (e) => {
    e.preventDefault();
    setMsError(null);
    setMsSuccess(null);
    if (!msDate || !msTime || !msProduct.trim() || !msAmount || Number(msAmount) <= 0) {
      setMsError('Lütfen tüm alanları doğru bir şekilde doldurun.');
      return;
    }

    const sale_datetime = `${msDate}T${msTime}:00`;
    const payload = { sale_datetime, product_name: msProduct.trim(), amount: Number(msAmount) };
    const url = editingMsId ? `${API_BASE}/manual-sales/${editingMsId}` : `${API_BASE}/manual-sales`;
    const method = editingMsId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setMsSuccess(`Satış başarıyla ${editingMsId ? 'güncellendi' : 'kaydedildi'}.`);
        setMsDate(todayDate);
        setMsTime(todayTime);
        setMsProduct('');
        setMsAmount('');
        setEditingMsId(null);
        await fetchMsRecords();
        window.dispatchEvent(new CustomEvent('refresh-daily-revenue'));
      } else {
        const errData = await response.json();
        setMsError(errData.message || 'İşlem sırasında bir hata oluştu.');
      }
    } catch (err) {
      console.error(err);
      setMsError('Sunucuya bağlanırken bir hata oluştu.');
    }
  };

  const handleMsDelete = async (id) => {
    if (!window.confirm(`Bu satışı silmek istediğinizden emin misiniz?`)) return;
    try {
      const response = await fetch(`${API_BASE}/manual-sales/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        setMsSuccess('Satış başarıyla silindi.');
        await fetchMsRecords();
        window.dispatchEvent(new CustomEvent('refresh-daily-revenue'));
      } else {
        const errData = await response.json();
        setMsError(errData.message || 'Silme işlemi başarısız.');
      }
    } catch (err) {
      setMsError('Sunucuya bağlanırken bir hata oluştu.');
    }
  };

  const startEditMs = (record) => {
    const dt = new Date(record.sale_datetime);
    setEditingMsId(record.id);
    setMsDate(dt.toISOString().split('T')[0]);
    setMsTime(dt.toTimeString().split(' ')[0].substring(0, 5));
    setMsProduct(record.product_name);
    setMsAmount(String(record.amount));
  };

  const cancelEditMs = () => {
    setEditingMsId(null);
    setMsDate(todayDate);
    setMsTime(todayTime);
    setMsProduct('');
    setMsAmount('');
  };

  const monthOptions = useMemo(() => [
    { value: '01', label: 'Ocak' }, { value: '02', label: 'Şubat' }, { value: '03', label: 'Mart' },
    { value: '04', label: 'Nisan' }, { value: '05', label: 'Mayıs' }, { value: '06', label: 'Haziran' },
    { value: '07', label: 'Temmuz' }, { value: '08', label: 'Ağustos' }, { value: '09', label: 'Eylül' },
    { value: '10', label: 'Ekim' }, { value: '11', label: 'Kasım' }, { value: '12', label: 'Aralık' },
  ], []);

  const yearOptions = useMemo(() => Array.from({ length: 5 }, (_, i) => String(currentYear - i)), []);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded p-4 shadow-sm flex items-center gap-4">
        <h2 className="text-lg font-semibold">Dönem Seçimi</h2>
        <select className="border rounded px-3 py-2" value={month} onChange={(e) => setMonth(e.target.value)}>
          {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select className="border rounded px-3 py-2" value={year} onChange={(e) => setYear(e.target.value)}>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Kredi Kartı Ciro Girişi</h2>
        <form onSubmit={handleCcSubmit} className="space-y-3 max-w-md">
          {ccError && <div className="p-3 bg-red-100 text-red-700 rounded">{ccError}</div>}
          {ccSuccess && <div className="p-3 bg-green-100 text-green-700 rounded">{ccSuccess}</div>}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700">Tarih</label>
            <input
              type="date"
              id="date"
              value={ccDate}
              onChange={(e) => setCcDate(e.target.value)}
              className="mt-1 block w-full border rounded px-3 py-2"
              required
              disabled={!!editingCcDate}
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Kredi Kartı Ciro Tutarı</label>
            <input
              type="number"
              id="amount"
              value={ccAmount}
              onChange={(e) => setCcAmount(e.target.value)}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="Örn: 1500.50"
              step="0.01"
              min="0"
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{editingCcDate ? 'Güncelle' : 'Kaydet'}</button>
            {editingCcDate && <button type="button" onClick={() => { setEditingCcDate(null); setCcAmount(''); setCcDate(todayDate); }} className="px-4 py-2 bg-gray-500 text-white rounded">İptal</button>}
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Kredi Kartı Ciro Kayıtları ({monthOptions.find(m => m.value === month)?.label} {year})</h3>
        {ccLoading ? <p>Yükleniyor...</p> : ccRecords.length > 0 ? (
          <ul className="space-y-2">
            {ccRecords.map(record => (
              <li key={record.date} className="flex justify-between items-center p-2 border-b">
                <div>
                  <span className="font-medium">{new Date(record.date + 'T00:00:00').toLocaleDateString('tr-TR')}</span>
                  <span className="ml-4">{formatCurrency(record.amount)}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => startEditCc(record)} className="text-blue-600 hover:text-blue-800"><Edit size={16} /></button>
                  <button onClick={() => handleCcDelete(record.date)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">Bu ay için kredi kartı ciro kaydı bulunamadı.</p>}
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Manuel Satış Girişi</h2>
        <form onSubmit={handleMsSubmit} className="space-y-3 max-w-lg">
          {msError && <div className="p-3 bg-red-100 text-red-700 rounded">{msError}</div>}
          {msSuccess && <div className="p-3 bg-green-100 text-green-700 rounded">{msSuccess}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="msDate" className="block text-sm font-medium text-gray-700">Tarih</label>
              <input type="date" id="msDate" value={msDate} onChange={(e) => setMsDate(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" required />
            </div>
            <div>
              <label htmlFor="msTime" className="block text-sm font-medium text-gray-700">Saat</label>
              <input type="time" id="msTime" value={msTime} onChange={(e) => setMsTime(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" required />
            </div>
          </div>
          <div>
            <label htmlFor="msProduct" className="block text-sm font-medium text-gray-700">Ürün Adı</label>
            <div className="relative">
              <input type="text" id="msProduct" value={msProduct} onChange={(e) => handleProductSearch(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" placeholder="Ürün adını yazın..." required autoComplete="off" />
              {productSuggestions.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border rounded mt-1 max-h-48 overflow-y-auto">
                  {productSuggestions.map(p => (
                    <li
                      key={p}
                      onClick={() => selectProduct(p)}
                      className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                    >{p}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="msAmount" className="block text-sm font-medium text-gray-700">Tutar</label>
            <input type="number" id="msAmount" value={msAmount} onChange={(e) => setMsAmount(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" placeholder="Örn: 90.00" step="0.01" min="0.01" required />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{editingMsId ? 'Güncelle' : 'Ekle'}</button>
            {editingMsId && <button type="button" onClick={cancelEditMs} className="px-4 py-2 bg-gray-500 text-white rounded">İptal</button>}
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Manuel Satış Kayıtları ({monthOptions.find(m => m.value === month)?.label} {year})</h3>
        {msLoading ? <p>Yükleniyor...</p> : msRecords.length > 0 ? (
          <ul className="space-y-2">
            {msRecords.map(record => (
              <li key={record.id} className="flex justify-between items-center p-2 border-b">
                <div>
                  <span className="font-medium">{new Date(record.sale_datetime).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className="ml-4 text-gray-700">{record.product_name}</span>
                  <span className="ml-4 font-semibold">{formatCurrency(record.amount)}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => startEditMs(record)} className="text-blue-600 hover:text-blue-800"><Edit size={16} /></button>
                  <button onClick={() => handleMsDelete(record.id)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">Bu ay için manuel satış kaydı bulunamadı.</p>}
      </div>
    </div>
  );
}