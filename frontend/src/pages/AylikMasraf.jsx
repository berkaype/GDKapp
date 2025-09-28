import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

const DEFAULT_TOTALS = {
  quantity: 0,
  revenue: 0,
  cost: 0,
  grossProfit: 0,
  margin: null,
  revenueWithCost: 0,
  revenueWithoutCost: 0,
};

const MONTH_OPTIONS = [
  { value: '01', label: 'Ocak' },
  { value: '02', label: 'Şubat' },
  { value: '03', label: 'Mart' },
  { value: '04', label: 'Nisan' },
  { value: '05', label: 'Mayıs' },
  { value: '06', label: 'Haziran' },
  { value: '07', label: 'Temmuz' },
  { value: '08', label: 'Ağustos' },
  { value: '09', label: 'Eylül' },
  { value: '10', label: 'Ekim' },
  { value: '11', label: 'Kasım' },
  { value: '12', label: 'Aralık' },
];

export default function AylikMasraf() {
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(DEFAULT_TOTALS);
  const [missingRecipes, setMissingRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month, year });
      const response = await fetch(`${API_BASE}/analytics/monthly-product-cost?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error('fetch-failed');
      }
      const payload = await response.json();
      setItems(Array.isArray(payload?.items) ? payload.items : []);
      setTotals({ ...DEFAULT_TOTALS, ...(payload?.totals || {}) });
      setMissingRecipes(Array.isArray(payload?.missingRecipes) ? payload.missingRecipes : []);
    } catch (err) {
      console.error(err);
      setError('Veriler getirilemedi. Lütfen tekrar deneyin.');
      setItems([]);
      setTotals({ ...DEFAULT_TOTALS });
      setMissingRecipes([]);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const enrichedItems = useMemo(() => {
    return items.map((item) => {
      const quantity = Number(item?.quantity || 0);
      const revenue = Number(item?.revenue || 0);
      const hasCost = Boolean(item?.hasCost);
      const unitPrice = item?.unitPrice !== null && item?.unitPrice !== undefined
        ? item.unitPrice
        : (quantity > 0 ? Number((revenue / quantity).toFixed(2)) : null);
      const margin = Number.isFinite(item?.margin) ? Number(item.margin) : null;
      return {
        ...item,
        quantity,
        revenue,
        unitPrice,
        hasCost,
        margin,
      };
    });
  }, [items]);

  const uncoveredRevenueRatio = useMemo(() => {
    const totalRevenue = Number(totals?.revenue || 0);
    const uncovered = Number(totals?.revenueWithoutCost || 0);
    if (totalRevenue <= 0) {
      return 0;
    }
    return (uncovered / totalRevenue) * 100;
  }, [totals]);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Aylık Masraf Analizi</h2>
            <p className="text-sm text-gray-500">Seçilen ayda satılan ürünlerden oluşan maliyet dağılımını görüntüleyin.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="border rounded px-3 py-2"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              className="border rounded px-3 py-2 w-24"
              value={year}
              onChange={(event) => setYear(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="Yıl"
            />
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              type="button"
            >
              Yenile
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Veriler yükleniyor...
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
            <div className="text-sm text-gray-600">Toplam Ciro</div>
            <div className="text-lg font-semibold text-blue-700">{formatCurrency(totals.revenue || 0)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
            <div className="text-sm text-gray-600">Ürün Maliyeti</div>
            <div className="text-lg font-semibold text-amber-700">{formatCurrency(totals.cost || 0)}</div>
            <div className="text-xs text-gray-500 mt-1">Tarifi bulunan ürünler için hesaplandı.</div>
          </div>
          <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
            <div className="text-sm text-gray-600">Brüt Kâr</div>
            <div className="text-lg font-semibold text-green-700">{formatCurrency(totals.grossProfit || 0)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
            <div className="text-sm text-gray-600">Kâr Marjı</div>
            <div className="text-lg font-semibold text-purple-700">
              {Number.isFinite(totals.margin) ? `${totals.margin.toFixed(2)}%` : '—'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Cirosu hesaplanan ürünler üzerinden.
            </div>
          </div>
        </div>

        {(totals.revenueWithoutCost || 0) > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tarif tanımı olmayan ürünlerden gelen ciro: <strong>{formatCurrency(totals.revenueWithoutCost)}</strong>
            {' '}({uncoveredRevenueRatio.toFixed(1)}% toplam cironun).
          </div>
        )}

        {missingRecipes.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Maliyet tarifine sahip olmayan ürünler: {missingRecipes.join(', ')}
          </div>
        )}
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Ürün Bazlı Maliyet Dağılımı</h3>
        {!loading && enrichedItems.length === 0 ? (
          <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Seçilen ay için satış verisi bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Ürün</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Satılan Adet</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Ciro</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Birim Satış</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Birim Maliyet</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Toplam Maliyet</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Brüt Kâr</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Marj</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrichedItems.map((item) => (
                  <tr key={item.product} className={!item.hasCost ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-2 font-medium text-gray-800">{item.product}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(item.revenue || 0)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {item.unitPrice !== null ? formatCurrency(item.unitPrice) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {item.unitCost !== null ? formatCurrency(item.unitCost) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {item.totalCost !== null ? formatCurrency(item.totalCost) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {item.grossProfit !== null ? formatCurrency(item.grossProfit) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {item.margin !== null ? `${item.margin.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
