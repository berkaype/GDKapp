import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { getApiBase, authHeaders } from '../utils/api.js';

const API_BASE = getApiBase();

function endOfMonthStr(year, month) { const d = new Date(Number(year), Number(month), 0); return d.toISOString().split('T')[0]; }
function startOfMonthStr(year, month) { const d = new Date(Number(year), Number(month) - 1, 1); return d.toISOString().split('T')[0]; }
function addDaysStr(dateStr, days) { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; }

export default function VeriYazdirma() {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); const day = d.getDay(); const diff = (day === 0 ? 6 : day - 1); d.setDate(d.getDate() - diff); return d.toISOString().split('T')[0]; });
  const [month, setMonth] = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(today.getFullYear()));

  const fetchClosings = async (start, end) => {
    const r = await fetch(`${API_BASE}/daily-closings?start=${start}&end=${end}`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };
  const fetchExpenses = async () => {
    const r = await fetch(`${API_BASE}/business-expenses`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };
  const fetchStock = async () => {
    const r = await fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };
  const fetchPersonnel = async () => {
    const r = await fetch(`${API_BASE}/personnel`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };

  const buildSummary = async (start, end) => {
    const [closings, expensesAll, stockAll, personnel] = await Promise.all([
      fetchClosings(start, end), fetchExpenses(), fetchStock(), fetchPersonnel()
    ]);
    const revenue = closings.reduce((s, x) => s + (x.total_amount || 0), 0);
    const expenses = expensesAll
      .filter(x => { const ds = new Date(x.expense_date).toISOString().split('T')[0]; return ds >= start && ds <= end; })
      .reduce((s, x) => s + (x.amount || 0), 0);
    const stock = stockAll
      .filter(x => { const ds = new Date(x.purchase_date).toISOString().split('T')[0]; return ds >= start && ds <= end; })
      .reduce((s, x) => s + (x.total_price || 0), 0);
    const personnelMonthly = personnel.reduce((s, x) => s + (x.salary || 0) + (x.sgk_cost || 0), 0);
    const days = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24) + 1;
    const personnelProrated = personnelMonthly * (days / 30);
    const net = revenue - (expenses + stock + personnelProrated);
    return { revenue, expenses, stock, personnel: personnelProrated, net };
  };

  const exportXlsx = async (range) => {
    let start, end, label;
    if (range === 'weekly') {
      start = weekStart; end = addDaysStr(weekStart, 6); label = `Haftalik_${start}_to_${end}`;
    } else {
      start = startOfMonthStr(year, month); end = endOfMonthStr(year, month); label = `Aylik_${year}-${month}`;
    }
    const summary = await buildSummary(start, end);
    const data = [
      { Kalem: 'Ciro', Tutar: summary.revenue },
      { Kalem: 'Personel (Oransal)', Tutar: summary.personnel },
      { Kalem: 'Isletme Giderleri', Tutar: summary.expenses },
      { Kalem: 'Stok', Tutar: summary.stock },
      { Kalem: 'Net', Tutar: summary.net },
    ];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ozet');
    ws.columns = [
      { header: 'Kalem', key: 'Kalem', width: 24 },
      { header: 'Tutar', key: 'Tutar', width: 20 },
    ];
    ws.addRows(data);
    ws.getColumn('Tutar').numFmt = '#,##0.00';
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${label}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-3">Veri Yazdirma</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Haftalik Ozet</h3>
            <div className="flex gap-2 items-center">
              <input type="date" className="border rounded px-3 py-2" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
              <button onClick={() => exportXlsx('weekly')} className="px-4 py-2 bg-green-600 text-white rounded">Excel'e Yazdir</button>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Aylik Ozet</h3>
            <div className="flex gap-2 items-center">
              <select className="border rounded px-3 py-2" value={month} onChange={e => setMonth(e.target.value)}>
                {[...Array(12)].map((_, i) => { const m = String(i + 1).padStart(2, '0'); return <option key={m} value={m}>{m}</option>; })}
              </select>
              <input className="border rounded px-3 py-2 w-24" value={year} onChange={e => setYear(e.target.value)} />
              <button onClick={() => exportXlsx('monthly')} className="px-4 py-2 bg-blue-600 text-white rounded">Excel'e Yazdir</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

