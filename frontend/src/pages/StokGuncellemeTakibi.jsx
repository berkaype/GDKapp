import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function StokGuncellemeTakibi() {
  const [allPurchases, setAllPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().split('T')[0];
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(lastDayOfMonth);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() });
        if (r.ok) {
          setAllPurchases(await r.json());
        } else {
          throw new Error('Stok alım verileri alınamadı.');
        }
      } catch (err) {
        console.error(err);
        setError('Veriler yüklenirken bir hata oluştu.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredPurchases = useMemo(() => {
    return allPurchases.filter(p => {
      const purchaseDate = p.purchase_date.split('T')[0];
      if (startDate && purchaseDate < startDate) return false;
      if (endDate && purchaseDate > endDate) return false;

      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        const productName = p.product_name?.toLowerCase() || '';
        const stockCode = p.stock_code?.toLowerCase() || '';
        if (!productName.includes(lowerQuery) && !stockCode.includes(lowerQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [allPurchases, startDate, endDate, searchQuery]);

  const totalFilteredAmount = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);
  }, [filteredPurchases]);


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
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="endDate" className="text-sm font-medium">Bitiş:</label>
            <input
              type="date"
              id="endDate"
              className="border rounded px-3 py-2 w-full"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
              {filteredPurchases.map((p) => (
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
        {!loading && filteredPurchases.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Filtreye uygun kayıt bulunamadı.</p>
        )}
      </div>
    </div>
  );
}