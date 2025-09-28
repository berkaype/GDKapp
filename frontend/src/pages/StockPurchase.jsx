import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

const createInitialForm = () => ({
  selected: null,
  purchase_date: new Date().toISOString().split('T')[0],
  package_count: '',
  package_content: '',
  total_price: '',
});

const toFixedString = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '';
  }
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : '';
};

export default function StockPurchase() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(() => createInitialForm());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const userRole = (() => {
    try {
      return JSON.parse(localStorage.getItem('user'))?.role || null;
    } catch {
      return null;
    }
  })();
  const isSuperAdmin = userRole === 'superadmin';

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() });
        if (r.ok) {
          setRows(await r.json());
        }
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      try {
        const r = await fetch(`${API_BASE}/stock-codes/search?q=${encodeURIComponent(query)}`, {
          headers: authHeaders(),
        });
        if (r.ok) {
          setResults(await r.json());
        }
      } catch (err) {
        console.error(err);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const lastPurchases = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.stock_code_id)) {
        map.set(row.stock_code_id, row);
      }
    });
    return map;
  }, [rows]);

  const selectStock = (stock) => {
    const last = lastPurchases.get(stock.id) || null;
    setForm((prev) => ({
      ...prev,
      selected: stock,
      package_count: toFixedString(last?.package_count ?? prev.package_count),
      package_content: toFixedString(last?.package_content ?? prev.package_content),
      total_price: toFixedString(last?.total_price ?? prev.total_price),
    }));
    setResults([]);
    setQuery(stock.product_name);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.selected) {
      alert('Lütfen bir ürün seçin');
      return;
    }
    const payload = {
      stock_code_id: form.selected.id,
      package_count: parseFloat(form.package_count),
      package_content: parseFloat(form.package_content),
      total_price: parseFloat(form.total_price),
      purchase_date: form.purchase_date,
    };
    if (Number.isNaN(payload.package_count) || Number.isNaN(payload.package_content) || Number.isNaN(payload.total_price)) {
      alert('Lütfen paket bilgilerini ve toplam fiyatı doldurun');
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/stock-purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setForm(createInitialForm());
        setQuery('');
        const refreshed = await fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() });
        if (refreshed.ok) {
          setRows(await refreshed.json());
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const remove = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) {
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/stock-purchases/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (r.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const unitPrice = useMemo(() => {
    const pkgCount = parseFloat(form.package_count);
    const totalPrice = parseFloat(form.total_price);
    if (Number.isFinite(pkgCount) && pkgCount > 0 && Number.isFinite(totalPrice)) {
      return (totalPrice / pkgCount).toFixed(2);
    }
    return '0.00';
  }, [form.package_count, form.total_price]);

  const perItemPrice = useMemo(() => {
    const pkgCount = parseFloat(form.package_count);
    const pkgContent = parseFloat(form.package_content);
    const totalPrice = parseFloat(form.total_price);
    if (
      Number.isFinite(pkgCount) && pkgCount > 0 &&
      Number.isFinite(pkgContent) && pkgContent > 0 &&
      Number.isFinite(totalPrice)
    ) {
      return (totalPrice / (pkgCount * pkgContent)).toFixed(2);
    }
    return '0.00';
  }, [form.package_count, form.package_content, form.total_price]);

  const totalPurchaseAmount = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.total_price) || 0), 0),
    [rows],
  );

  const lastSelection = form.selected ? lastPurchases.get(form.selected.id) : null;

  return (
    <div className="p-4">
      <div className="bg-white rounded p-4 shadow-sm mb-4">
        <h2 className="text-xl font-semibold mb-3">Stok Güncelleme / Mal Alımı</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Ara</label>
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder="Ürün adı veya stok kodu ile ara..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {results.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded shadow max-h-60 overflow-y-auto">
                  {results.map((stock) => (
                    <div
                      key={stock.id}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b"
                      onClick={() => selectStock(stock)}
                    >
                      <div className="font-medium">{stock.product_name}</div>
                      <div className="text-sm text-gray-600">
                        {stock.stock_code} • {stock.brand} • {stock.unit}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {form.selected && (
                <div className="mt-2 p-3 bg-blue-50 rounded">
                  <div className="font-medium text-blue-900">{form.selected.product_name}</div>
                  <div className="text-sm text-blue-700">
                    Stok Kodu: {form.selected.stock_code} • Birim: {form.selected.unit}
                    {form.selected.brand ? ` • Marka: ${form.selected.brand}` : ''}
                  </div>
                  {lastSelection && (
                    <div className="mt-2 text-xs text-blue-700">
                      Son alım: {new Date(lastSelection.purchase_date).toLocaleDateString('tr-TR')} —
                      Paket: {lastSelection.package_count || 0} {form.selected.unit}, İçerik: {lastSelection.package_content || 0} {form.selected.unit}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alım Tarihi</label>
              <input
                type="date"
                className="border rounded px-3 py-2 w-full"
                value={form.purchase_date}
                onChange={(event) => setForm({ ...form, purchase_date: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paket Adedi</label>
              <input
                type="number"
                step="any"
                className="border rounded px-3 py-2 w-full"
                value={form.package_count}
                onChange={(event) => setForm({ ...form, package_count: event.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paket İçeriği</label>
              <input
                type="number"
                step="any"
                className="border rounded px-3 py-2 w-full"
                value={form.package_content}
                onChange={(event) => setForm({ ...form, package_content: event.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Toplam Fiyat</label>
              <input
                type="number"
                step="any"
                className="border rounded px-3 py-2 w-full"
                value={form.total_price}
                onChange={(event) => setForm({ ...form, total_price: event.target.value })}
              />
            </div>
            <div className="text-sm text-gray-700 flex items-end">
              <span>Birim: {formatCurrency(unitPrice)} • Birim başı: {formatCurrency(perItemPrice)}</span>
            </div>
          </div>

          <div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded">Ekle</button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-gray-600">Toplam Alım Sayısı</div>
            <div className="text-2xl font-bold text-blue-600">{rows.length}</div>
          </div>
          <div>
            <div className="text-gray-600">Toplam Alım Tutarı</div>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalPurchaseAmount)}</div>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-2">Ürün</th>
              <th className="py-2">Stok Kodu</th>
              <th className="py-2">Paket</th>
              <th className="py-2">İçerik</th>
              <th className="py-2">Toplam</th>
              <th className="py-2">Birim</th>
              <th className="py-2">Tarih</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-2">
                  <div className="font-medium">{p.product_name}</div>
                  {p.brand && <div className="text-xs text-gray-500">{p.brand}</div>}
                </td>
                <td className="py-2 font-mono text-blue-700">{p.stock_code}</td>
                <td className="py-2">{p.package_count} {p.unit}</td>
                <td className="py-2">{p.package_content} {p.unit}</td>
                <td className="py-2 font-semibold">{formatCurrency(p.total_price)}</td>
                <td className="py-2">
                  <div>Paket: {formatCurrency(p.unit_price)}</div>
                  <div className="text-xs text-gray-500">{p.unit}: {formatCurrency(p.per_item_price)}</div>
                </td>
                <td className="py-2">{new Date(p.purchase_date).toLocaleDateString('tr-TR')}</td>
                <td className="py-2 text-right">
                  {isSuperAdmin ? (
                    <button onClick={() => remove(p.id)} className="text-red-600">
                      Sil
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
