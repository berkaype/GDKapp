import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();
const monthOptions = [
  { value: '01', label: 'Ocak' },
  { value: '02', label: 'Åžubat' },
  { value: '03', label: 'Mart' },
  { value: '04', label: 'Nisan' },
  { value: '05', label: 'Mayıs' },
  { value: '06', label: 'Haziran' },
  { value: '07', label: 'Temmuz' },
  { value: '08', label: 'AÄŸustos' },
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
    const value = Math.abs(Number(item?.value) || 0);
    return value > max ? value : max;
  }, 0) || 1;
  const ticks = Array.from({ length: 4 }, (_, idx) => idx + 1);

  return (
    <div className="relative rounded-lg border border-gray-200 bg-white px-6 py-6 shadow-sm">
      <div className="absolute inset-x-6 top-10 bottom-14 flex flex-col justify-between pointer-events-none">
        {ticks.map((tick) => (
          <div key={tick} className="border-t border-dashed border-gray-200" />
        ))}
      </div>
      <div className="flex items-end justify-around gap-6 h-64">
        {data.map((item) => {
          const value = Number(item?.value) || 0;
          const magnitude = Math.abs(value);
          const percent = Math.max((magnitude / maxValue) * 100, magnitude > 0 ? 8 : 0);
          const isNegative = value < 0;
          const barClass = isNegative ? 'bg-rose-500' : item.color || 'bg-blue-500';

          return (
            <div key={item.key || item.label} className="flex flex-col items-center flex-1 min-w-[64px]">
              <div className={`mb-3 text-sm font-semibold ${isNegative ? 'text-rose-600' : 'text-gray-900'}`}>
                {formatCurrency(value)}
              </div>
              <div className="relative flex h-48 w-full items-end justify-center">
                <div
                  className={`w-12 rounded-t-md transition-all duration-300 ${barClass}`}
                  style={{ height: `${percent}%` }}
                />
              </div>
              <div className="mt-3 text-xs font-medium text-gray-600 text-center">{item.label}</div>
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
          throw new Error('Ciro bilgisi alÄ±namadÄ±');
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
        setError('Veriler getirilemedi. LÃ¼tfen tekrar deneyin.');
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
      { key: 'revenue', label: 'Ciro', value: data.revenue, color: 'bg-emerald-500' },
      { key: 'personnel', label: 'Personel', value: data.personnel, color: 'bg-orange-500' },
      { key: 'expenses', label: 'İşletme Giderleri', value: data.expenses, color: 'bg-red-500' },
      { key: 'stock', label: 'Stok', value: data.stock, color: 'bg-blue-500' },
      { key: 'net', label: 'Net Kar', value: net, color: net >= 0 ? 'bg-emerald-700' : 'bg-rose-500' },
    ],
    [data.revenue, data.personnel, data.expenses, data.stock, net],
  );

  const summaryItems = useMemo(
    () => [
      { label: 'Toplam Ciro', value: data.revenue, accent: 'text-emerald-600' },
      { label: 'Personel', value: data.personnel, accent: 'text-orange-600' },
      { label: 'İşletme Giderleri', value: data.expenses, accent: 'text-red-600' },
      { label: 'Stok', value: data.stock, accent: 'text-blue-600' },
      { label: 'Net Kar', value: net, accent: net >= 0 ? 'text-emerald-700' : 'text-rose-600' },
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
          <h2 className="text-xl font-semibold">Ciro ve Net Kar Raporu</h2>
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-3 py-2"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-3 py-2"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            >
              {yearOptions.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-sm text-gray-500">
          {currentMonthLabel && `${currentMonthLabel} ${year}`} dÃ¶nemi iÃ§in hesaplanan deÄŸerler gÃ¶sterilmektedir.
        </div>

        {error && (
          <div className="rounded bg-red-100 text-red-700 px-4 py-2">{error}</div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Veriler yÃ¼kleniyor...</div>
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

