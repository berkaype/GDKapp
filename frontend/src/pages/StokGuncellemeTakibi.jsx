import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';
import { toLocalDateString } from '../utils/date.js';

const API_BASE = getApiBase();
const PAGE_SIZE = 50;

export default function StokGuncellemeTakibi() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalFilteredAmount, setTotalFilteredAmount] = useState(0);

  const today = new Date();
  const firstDayOfMonth = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastDayOfMonth = toLocalDateString(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(lastDayOfMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      setRows([]);
      setTotalCount(0);
      setTotalFilteredAmount(0);
      try {
        const params = new URLSearchParams({
          start: startDate,
          end: endDate,
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (debouncedSearch) params.set('q', debouncedSearch);
        const r = await fetch(`${API_BASE}/stock-purchases?${params}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!r.ok) {
          throw new Error('Stok alım verileri alınamadı.');
        }
        const data = await r.json();
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotalCount(Number(data.total_count || 0));
        setTotalFilteredAmount(Number(data.total_amount || 0));
        if (Number(data.page) > 0 && Number(data.page) !== page) {
          setPage(Number(data.page));
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error(err);
        setError('Veriler yüklenirken bir hata oluştu.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [startDate, endDate, debouncedSearch, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstVisiblePurchase = totalCount === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1;
  const lastVisiblePurchase = totalCount === 0 ? 0 : firstVisiblePurchase + rows.length - 1;


  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-3">Stok Güncelleme Takibi</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="startDate" className="text-sm font-medium">Başlangıç:</label>
            <input
              type="date"
              id="startDate"
              className="border rounded px-3 py-2 w-full"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="endDate" className="text-sm font-medium">Bitiş:</label>
            <input
              type="date"
              id="endDate"
              className="border rounded px-3 py-2 w-full"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <input
            type="text"
            className="border rounded px-3 py-2"
            placeholder="Ürün adı veya kodu ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <div className="mb-3 font-semibold text-lg">
          Filtrelenen Toplam Tutar: <span className="text-blue-600">{formatCurrency(totalFilteredAmount)}</span>
        </div>
        {loading && <p>Yükleniyor...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!loading && !error && (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2">Ürün</th>
                <th className="py-2">Stok Kodu</th>
                <th className="py-2">Paket</th>
                <th className="py-2">İçerik</th>
                <th className="py-2">Toplam Fiyat</th>
                <th className="py-2">Birim Fiyat</th>
                <th className="py-2">Tarih</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!error && totalCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-sm text-gray-600">
              {firstVisiblePurchase}-{lastVisiblePurchase} / {totalCount} kayıt gösteriliyor
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
        {!loading && !error && totalCount === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Filtreye uygun kayıt bulunamadı.</p>
        )}
      </div>
    </div>
  );
}
