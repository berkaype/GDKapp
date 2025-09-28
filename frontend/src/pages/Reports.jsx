import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();
const monthOptions = [
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

function startOfMonth(year, month) {
  return new Date(Number(year), Number(month) - 1, 1);
}

function endOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0);
}

function isWithinMonth(dateStr, start, end) {
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) {
    return false;
  }
  return dt >= start && dt <= end;
}

function BarChart({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const maxValue = data.reduce((max, item) => {
    const value = Number(item?.value) || 0;
    return value > max ? value : max;
  }, 0);
  const effectiveMax = maxValue > 0 ? maxValue : 1;

  // Rebuilt chart: fixed pixel calculus for reliability
  const plotHeight = 420; // vertical space for bars only
  const minBarPx = 12; // minimum visible height for non-zero values

  return (
    <div className="relative rounded-lg border border-gray-200 bg-white px-6 py-6 shadow-sm">
      <div
        className="relative w-full overflow-hidden rounded-md"
        style={{ height: `${plotHeight}px`, backgroundImage: 'repeating-linear-gradient(to top, rgba(0,0,0,0.06) 0 1px, transparent 1px 72px)' }}
      >
        <div className="relative z-10 h-full flex items-end justify-around gap-6">
          {data.map((item) => {
            const value = Number(item?.value) || 0;
            const isPositive = value > 0;
            const magnitude = isPositive ? value : 0;
            const px = isPositive ? Math.max(Math.round((magnitude / effectiveMax) * (plotHeight - 8)), minBarPx) : 0;
            const isNegative = value < 0;
            const barClass = item?.key === 'net' ? 'bg-green-600' : (isNegative ? 'bg-rose-500' : (item.color || 'bg-blue-500'));

            return (
              <div key={item.key || item.label} className="flex-1 min-w-[64px] flex items-end justify-center">
                <div className={`w-12 rounded-t-md transition-all duration-300 ${barClass}`} style={{ height: `${px}px` }} />
              </div>
            );
          })}
        </div>
      </div>
      {/* labels row under plot area */}
      <div className="mt-4 flex items-start justify-around gap-6">
        {data.map((item) => {
          const value = Number(item?.value) || 0;
          const isNegative = value < 0;
          const valueClass = item?.key === 'net' ? 'text-green-700' : (isNegative ? 'text-rose-600' : 'text-gray-900');
          return (
            <div key={`${item.key || item.label}-labels`} className="flex-1 min-w-[64px] flex flex-col items-center">
              <div className={`text-sm font-semibold text-center ${valueClass}`}>{formatCurrency(value)}</div>
              <div className="text-xs font-medium text-gray-600 text-center">{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Reports() {
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [data, setData] = useState({ revenue: 0, personnel: 0, expenses: 0, stock: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const start = startOfMonth(year, month);
      const end = endOfMonth(year, month);
      try {
        const [closingsRes, expensesRes, stockRes, personnelRes] = await Promise.all([
          fetch(`${API_BASE}/daily-closings?month=${month}&year=${year}`, { headers: authHeaders() }),
          fetch(`${API_BASE}/business-expenses`, { headers: authHeaders() }),
          fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() }),
          fetch(`${API_BASE}/personnel?month=${month}&year=${year}`, { headers: authHeaders() }),
        ]);

        if (closingsRes.status === 401) {
          throw new Error('Yetkisiz');
        }

        if (!closingsRes.ok) {
          throw new Error('Ciro bilgisi alınamadı');
        }

        const closings = await closingsRes.json();
        const expensesData = expensesRes.ok ? await expensesRes.json() : [];
        const stockData = stockRes.ok ? await stockRes.json() : [];
        const personnelPayload = personnelRes.ok ? await personnelRes.json() : [];

        const revenue = Array.isArray(closings)
          ? closings.reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0)
          : 0;

        const expenses = Array.isArray(expensesData)
          ? expensesData
              .filter((item) => item && isWithinMonth(item.expense_date, start, end))
              .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          : 0;

        const stock = Array.isArray(stockData)
          ? stockData
              .filter((item) => item && isWithinMonth(item.purchase_date, start, end))
              .reduce((sum, item) => sum + (Number(item.total_price) || 0), 0)
          : 0;

        const personnelRows = Array.isArray(personnelPayload?.rows)
          ? personnelPayload.rows
          : Array.isArray(personnelPayload)
          ? personnelPayload
          : [];

        const personnel = personnelRows.reduce(
          (sum, item) => sum + (Number(item.salary) || 0) + (Number(item.sgk_cost) || 0),
          0,
        );

        setData({ revenue, personnel, expenses, stock });
      } catch (err) {
        console.error(err);
        setError('Veriler getirilemedi. Lütfen tekrar deneyin.');
        setData({ revenue: 0, personnel: 0, expenses: 0, stock: 0 });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [month, year]);

  const totalCosts = useMemo(
    () => data.personnel + data.expenses + data.stock,
    [data.personnel, data.expenses, data.stock],
  );
  const net = useMemo(() => data.revenue - totalCosts, [data.revenue, totalCosts]);

  const chartData = useMemo(
    () => [
      { key: 'revenue', label: 'Ciro', value: data.revenue, color: 'bg-blue-500' },
      { key: 'personnel', label: 'Personel', value: data.personnel, color: 'bg-orange-500' },
      { key: 'expenses', label: 'İşletme Giderleri', value: data.expenses, color: 'bg-red-500' },
      { key: 'stock', label: 'Stok', value: data.stock, color: 'bg-yellow-500' },
      { key: 'net', label: 'Net Kâr', value: net, color: net >= 0 ? 'bg-green-600' : 'bg-rose-500' },
    ],
    [data.revenue, data.personnel, data.expenses, data.stock, net],
  );

  const summaryItems = useMemo(
    () => [
      { label: 'Toplam Ciro', value: data.revenue, accent: 'text-blue-600' },
      { label: 'Personel', value: data.personnel, accent: 'text-orange-600' },
      { label: 'İşletme Giderleri', value: data.expenses, accent: 'text-red-600' },
      { label: 'Stok', value: data.stock, accent: 'text-yellow-600' },
      { label: 'Net Kâr', value: net, accent: 'text-green-700' },
    ],
    [data.revenue, data.personnel, data.expenses, data.stock, net],
  );

  const currentMonthLabel = monthOptions.find((opt) => opt.value === month)?.label || '';
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, idx) => String(currentYear - idx));

  return (
    <div className="p-6">
      <div className="bg-white rounded p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-xl font-semibold">Ciro ve Net Kâr Raporu</h2>
          <div className="flex items-center gap-2">
            <select className="border rounded px-3 py-2" value={month} onChange={(event) => setMonth(event.target.value)}>
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select className="border rounded px-3 py-2" value={year} onChange={(event) => setYear(event.target.value)}>
              {yearOptions.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-sm text-gray-500">
          {currentMonthLabel && `${currentMonthLabel} ${year}`} dönemi için hesaplanan değerler gösterilmektedir.
        </div>

        {error && <div className="rounded bg-red-100 text-red-700 px-4 py-2">{error}</div>}

        {loading ? (
          <div className="text-sm text-gray-500">Veriler yükleniyor...</div>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="w-full space-y-4 lg:w-64">
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
                  <div className="text-sm text-gray-600">{item.label}</div>
                  <div className={`text-xl font-semibold ${item.accent}`}>{formatCurrency(item.value)}</div>
                </div>
              ))}
            </div>
            <div className="flex-1">
              <BarChart data={chartData} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
