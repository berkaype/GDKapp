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
          fetch(`${API_BASE}/personnel`, { headers: authHeaders() }),
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
        const personnelData = personnelRes.ok ? await personnelRes.json() : [];

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

        const personnel = Array.isArray(personnelData)
          ? personnelData.reduce(
              (sum, item) => sum + (Number(item.salary) || 0) + (Number(item.sgk_cost) || 0),
              0,
            )
          : 0;

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

  const currentMonthLabel = monthOptions.find((opt) => opt.value === month)?.label || '';
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, idx) => String(currentYear - idx));

  return (
    <div className="p-6">
      <div className="bg-white rounded p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-xl font-semibold">Ciro ve Net Kâr Raporu</h2>
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
          {currentMonthLabel && `${currentMonthLabel} ${year}`} dönemi için hesaplanan değerler gösterilmektedir.
        </div>

        {error && (
          <div className="rounded bg-red-100 text-red-700 px-4 py-2">{error}</div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Veriler yükleniyor...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="text-gray-600">Toplam Ciro</div>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(data.revenue)}</div>
              </div>
              <div>
                <div className="text-gray-600">Personel</div>
                <div className="text-2xl font-bold text-orange-600">{formatCurrency(data.personnel)}</div>
              </div>
              <div>
                <div className="text-gray-600">İşletme Giderleri</div>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(data.expenses)}</div>
              </div>
              <div>
                <div className="text-gray-600">Stok</div>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(data.stock)}</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="text-gray-600">Net Kâr</div>
              <div className={`text-3xl font-bold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(net)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

