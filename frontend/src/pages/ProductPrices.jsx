import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();
const DEFAULT_FORM = {
  product_name: '',
  category: '',
  price: '',
  effective_date: new Date().toISOString().split('T')[0],
};

export default function ProductPrices() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [updateFor, setUpdateFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/product-prices`);
      if (!response.ok) {
        throw new Error('load-failed');
      }
      const data = await response.json();
      setRows(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Fiyat listesi alınamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const byCategory = rows.reduce((acc, product) => {
    (acc[product.category] ||= []).push(product);
    return acc;
  }, {});

  const resetForm = () => setForm({ ...DEFAULT_FORM, effective_date: new Date().toISOString().split('T')[0] });

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        product_name: form.product_name.trim(),
        category: form.category.trim(),
        price: parseFloat(form.price),
        effective_date: form.effective_date,
      };
      if (!payload.product_name || !payload.category || Number.isNaN(payload.price)) {
        setError('Ürün adı, kategori ve fiyat zorunludur.');
        return;
      }
      const response = await fetch(`${API_BASE}/product-prices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error('create-failed');
      }
      resetForm();
      setError('');
      await load();
    } catch (err) {
      console.error(err);
      setError('Fiyat eklenemedi.');
    }
  };

  const beginUpdate = (product) => {
    setUpdateFor(product);
    setForm({
      product_name: product.product_name,
      category: product.category,
      price: String(product.price ?? ''),
      effective_date: new Date().toISOString().split('T')[0],
    });
    setHistory([]);
    setHistoryProduct(null);
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!updateFor) return;
    try {
      const payload = {
        price: parseFloat(form.price),
        effective_date: form.effective_date,
      };
      if (Number.isNaN(payload.price) || payload.price <= 0) {
        setError('Geçerli bir fiyat girin.');
        return;
      }
      const response = await fetch(`${API_BASE}/product-prices/${updateFor.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error('update-failed');
      }
      setUpdateFor(null);
      resetForm();
      setError('');
      await load();
    } catch (err) {
      console.error(err);
      setError('Fiyat güncellenemedi.');
    }
  };

  const showHistory = async (product) => {
    setHistory([]);
    setHistoryProduct({ id: product.id, name: product.product_name });
    try {
      const response = await fetch(`${API_BASE}/product-prices/${product.id}/history`);
      if (!response.ok) {
        throw new Error('history-failed');
      }
      const data = await response.json();
      setHistory(data);
      setError('');
    } catch (err) {
      console.error(err);
      setHistory([]);
      setError('Fiyat geçmişi alınamadı.');
    }
  };

  const removeRow = async (product) => {
    if (!window.confirm('Silinsin mi?')) return;
    try {
      const response = await fetch(`${API_BASE}/product-prices/${product.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error('delete-failed');
      }
      await load();
    } catch (err) {
      console.error(err);
      setError('Kayıt silinemedi.');
    }
  };

  const closeHistory = () => {
    setHistory([]);
    setHistoryProduct(null);
  };

  const cleanupHistory = async () => {
    try {
      const response = await fetch(`${API_BASE}/maintenance/cleanup-prices`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error('cleanup-failed');
      }
      await load();
      alert('Fazla fiyat geçmişi temizlendi.');
    } catch (err) {
      console.error(err);
      alert('Temizlik sırasında hata oluştu.');
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">Ürün Fiyatları</h2>
        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="bg-white rounded p-4 shadow-sm space-y-4">
        <div>
          <h3 className="text-xl font-semibold mb-3">Yeni Ürün Fiyatı</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input className="border rounded px-3 py-2" placeholder="Ürün Adı" value={form.product_name} onChange={(e) => handleChange('product_name', e.target.value)} required />
            <input className="border rounded px-3 py-2" placeholder="Kategori" value={form.category} onChange={(e) => handleChange('category', e.target.value)} required />
            <input className="border rounded px-3 py-2" placeholder="Fiyat" type="number" value={form.price} onChange={(e) => handleChange('price', e.target.value)} required />
            <input className="border rounded px-3 py-2" type="date" value={form.effective_date} onChange={(e) => handleChange('effective_date', e.target.value)} required />
            <div className="flex items-center">
              <button className="px-4 py-2 bg-blue-600 text-white rounded" disabled={loading}>Ekle</button>
            </div>
          </form>
        </div>

        {updateFor && (
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-2">Fiyat Güncelle: {updateFor.product_name}</h3>
            <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Yeni Fiyat" type="number" value={form.price} onChange={(e) => handleChange('price', e.target.value)} required />
              <input className="border rounded px-3 py-2" type="date" value={form.effective_date} onChange={(e) => handleChange('effective_date', e.target.value)} required />
              <div className="flex items-center gap-2">
                <button className="px-4 py-2 bg-blue-600 text-white rounded" disabled={loading}>Güncelle</button>
                <button type="button" onClick={() => { setUpdateFor(null); resetForm(); }} className="px-4 py-2 bg-gray-500 text-white rounded">İptal</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(byCategory).map(([category, list]) => (
          <div key={category} className="bg-white rounded p-4 shadow-sm">
            <h4 className="text-lg font-semibold mb-2">{category}</h4>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2">Ürün</th>
                  <th className="py-2">Fiyat</th>
                  <th className="py-2">Son Güncelleme</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((product) => (
                  <tr key={product.id} className="border-t">
                    <td className="py-2 font-medium">{product.product_name}</td>
                    <td className="py-2 text-green-600 font-semibold">{formatCurrency(product.price)}</td>
                    <td className="py-2 text-sm text-gray-500">{new Date(product.effective_date).toLocaleDateString('tr-TR')}</td>
                    <td className="py-2 text-right space-x-3">
                      <button onClick={() => beginUpdate(product)} className="text-blue-600 hover:underline">Fiyat Güncelle</button>
                      <button onClick={() => showHistory(product)} className="text-purple-600 hover:underline">Geçmiş</button>
                      <button onClick={() => removeRow(product)} className="text-red-600 hover:underline">Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {rows.length === 0 && !loading && (
          <div className="text-sm text-gray-500">Listelenecek ürün bulunamadı.</div>
        )}
      </div>

      {historyProduct && (
        <div className="bg-white rounded p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Fiyat Geçmişi: {historyProduct.name}</h3>
            <button onClick={closeHistory} className="text-sm text-gray-500 hover:text-gray-700">Kapat</button>
          </div>
          {history.length > 0 ? (
            <div className="grid gap-2">
              {history.map((entry) => (
                <div key={entry.id} className="p-2 border rounded">
                  <div className="font-medium">{formatCurrency(entry.price)}</div>
                  <div className="text-xs text-gray-500">{new Date(entry.effective_date).toLocaleDateString('tr-TR')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Bu ürüne ait geçmiş bulunamadı.</div>
          )}
        </div>
      )}

      <div className="bg-white rounded p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Bakım</h3>
        <button onClick={cleanupHistory} className="px-3 py-2 bg-red-600 text-white rounded">Fazla Geçmişi Temizle</button>
      </div>
    </div>
  );
}
