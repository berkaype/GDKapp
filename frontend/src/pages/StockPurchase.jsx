import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';
import { toLocalDateString } from '../utils/date.js';

const API_BASE = getApiBase();
const PAGE_SIZE = 50;

const createInitialForm = () => ({
  selected: null,
  purchase_date: toLocalDateString(),
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
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPurchaseAmount, setTotalPurchaseAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(() => createInitialForm());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [lastSelection, setLastSelection] = useState(null);
  const selectionRequestRef = useRef(0);

  const userRole = (() => {
    try {
      return JSON.parse(localStorage.getItem('user'))?.role || null;
    } catch {
      return null;
    }
  })();
  const isSuperAdmin = userRole === 'superadmin';

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      setRows([]);
      try {
        const r = await fetch(`${API_BASE}/stock-purchases?page=${page}&limit=${PAGE_SIZE}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const data = await r.json();
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotalCount(Number(data.total_count || 0));
        setTotalPurchaseAmount(Number(data.total_amount || 0));
        if (Number(data.page) > 0 && Number(data.page) !== page) {
          setPage(Number(data.page));
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error(err);
        setError('Stok alım geçmişi yüklenemedi.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [page, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      if (form.selected && query === form.selected.product_name) {
        setResults([]);
        return;
      }
      if (query.length < 2) {
        setResults([]);
        return;
      }
      try {
        const r = await fetch(`${API_BASE}/stock-codes/search?q=${encodeURIComponent(query)}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (r.ok) {
          setResults(await r.json());
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error(err);
      }
    }, 300);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, form.selected]);

  const selectStock = async (stock) => {
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    setLastSelection(null);
    setForm((prev) => ({
      ...prev,
      selected: stock,
    }));
    setResults([]);
    setQuery(stock.product_name);

    try {
      const response = await fetch(`${API_BASE}/stock-purchases/latest/${stock.id}`, {
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const last = await response.json();
      if (selectionRequestRef.current !== requestId) return;
      setLastSelection(last);
      setForm((prev) => {
        if (prev.selected?.id !== stock.id) return prev;
        return {
          ...prev,
          package_count: toFixedString(last?.package_count ?? prev.package_count),
          package_content: toFixedString(last?.package_content ?? prev.package_content),
          total_price: toFixedString(last?.total_price ?? prev.total_price),
        };
      });
    } catch (err) {
      console.error(err);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
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
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/stock-purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setForm((prev) => ({ ...createInitialForm(), purchase_date: prev.purchase_date }));
        setLastSelection(null);
        setQuery('');
        setPage(1);
        setReloadKey((current) => current + 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
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
        setReloadKey((current) => current + 1);
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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstVisibleRow = totalCount === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1;
  const lastVisibleRow = totalCount === 0 ? 0 : firstVisibleRow + rows.length - 1;

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
                onChange={(event) => {
                  selectionRequestRef.current += 1;
                  setQuery(event.target.value);
                  setLastSelection(null);
                  setForm((prev) => ({ ...prev, selected: null }));
                }}
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
            <button
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-gray-600">Toplam Alım Sayısı</div>
            <div className="text-2xl font-bold text-blue-600">{totalCount}</div>
          </div>
          <div>
            <div className="text-gray-600">Toplam Alım Tutarı</div>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalPurchaseAmount)}</div>
          </div>
        </div>
        {loading && <p className="mb-3 text-sm text-gray-500">Alım geçmişi yükleniyor...</p>}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {!loading && !error && (
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
        )}
        {!loading && !error && totalCount === 0 && (
          <p className="py-4 text-center text-sm text-gray-500">Henüz stok alımı bulunmuyor.</p>
        )}
        {!loading && !error && totalCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-sm text-gray-600">
              {firstVisibleRow}-{lastVisibleRow} / {totalCount} kayıt gösteriliyor
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page === 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Önceki
              </button>
              <span className="min-w-24 text-center text-sm text-gray-700">
                Sayfa {page} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page === totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
