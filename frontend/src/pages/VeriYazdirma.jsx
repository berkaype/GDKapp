import React, { useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { fromLocalDateString, toLocalDateString } from '../utils/date.js';

const API_BASE = getApiBase();

function endOfMonthStr(year, month){ return toLocalDateString(new Date(Number(year), Number(month), 0)); }
function startOfMonthStr(year, month){ return toLocalDateString(new Date(Number(year), Number(month)-1, 1)); }
function addDaysStr(dateStr, days){ const d=fromLocalDateString(dateStr); d.setDate(d.getDate()+days); return toLocalDateString(d); }

export default function VeriYazdirma(){
  const today = new Date();
  const [weekStart, setWeekStart] = useState(()=>{ const d=new Date(); const day=d.getDay(); const diff=(day===0?6:day-1); d.setDate(d.getDate()-diff); return toLocalDateString(d); });
  const [month, setMonth] = useState(String(today.getMonth()+1).padStart(2,'0'));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const fetchClosings = async (start, end) => {
    const r = await fetch(`${API_BASE}/daily-closings?start=${start}&end=${end}`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };
  const fetchExpenses = async (start, end) => {
    const r = await fetch(`${API_BASE}/business-expenses?start=${start}&end=${end}`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };
  const fetchStock = async (start, end) => {
    const r = await fetch(`${API_BASE}/stock-purchases?start=${start}&end=${end}`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };
  const fetchPersonnel = async () => {
    const r = await fetch(`${API_BASE}/personnel`, { headers: authHeaders() });
    if (!r.ok) return [];
    const payload = await r.json();
    return Array.isArray(payload?.rows) ? payload.rows : (Array.isArray(payload) ? payload : []);
  };

  const buildSummary = async (start, end) => {
    const [closings, expenses, stock, personnel] = await Promise.all([
      fetchClosings(start,end), fetchExpenses(start,end), fetchStock(start,end), fetchPersonnel()
    ]);
    const revenue = closings.reduce((s,x)=>s+(x.total_amount||0),0);
    const expSum = expenses.reduce((s,x)=>s+(x.amount||0),0);
    const stockSum = stock.reduce((s,x)=>s+(x.total_price||0),0);
    const personnelMonthly = personnel.reduce((s,x)=>s+(x.salary||0)+(x.sgk_cost||0),0);
    const days = (new Date(end) - new Date(start))/(1000*60*60*24) + 1;
    const personnelProrated = personnelMonthly * (days/30);
    const totalCosts = expSum + stockSum + personnelProrated;
    const net = revenue - totalCosts;
    return { revenue, expenses: expSum, stock: stockSum, personnel: personnelProrated, net };
  };

  const exportXlsx = async (range) => {
    if (exporting) return;
    setExporting(true);
    setError('');
    try {
    let start, end, label;
    if (range==='weekly'){
      start = weekStart; end = addDaysStr(weekStart, 6); label = `Haftalık_${start}_to_${end}`;
    } else {
      start = startOfMonthStr(year, month); end = endOfMonthStr(year, month); label = `Aylık_${year}-${month}`;
    }
    const [excelModule, summary] = await Promise.all([
      import('exceljs/dist/exceljs.min.js'),
      buildSummary(start, end),
    ]);
    const ExcelJS = excelModule.default;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Özet');

    // Header
    ws.addRow(['Kalem', 'Tutar']);
    // Rows
    ws.addRow(['Ciro', summary.revenue]);
    ws.addRow(['Personel (Oransal)', summary.personnel]);
    ws.addRow(['İşletme Giderleri', summary.expenses]);
    ws.addRow(['Stok', summary.stock]);
    ws.addRow(['Net', summary.net]);

    // Formatting
    ws.getRow(1).font = { bold: true };
    ws.columns = [
      { key: 'kalem', width: 24 },
      { key: 'tutar', width: 18 },
    ];
    for (let r = 2; r <= ws.rowCount; r++) {
      ws.getCell(r, 2).numFmt = '#,##0.00';
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError('Excel dosyası oluşturulamadı.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-3">Veri Yazdırma</h2>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Haftalık Özet</h3>
            <div className="flex gap-2 items-center">
              <input type="date" className="border rounded px-3 py-2" value={weekStart} onChange={e=>setWeekStart(e.target.value)} />
              <button disabled={exporting} onClick={()=>exportXlsx('weekly')} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">{exporting ? 'Hazırlanıyor...' : "Excel'e Yazdır"}</button>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Aylık Özet</h3>
            <div className="flex gap-2 items-center">
              <select className="border rounded px-3 py-2" value={month} onChange={e=>setMonth(e.target.value)}>
                {[...Array(12)].map((_,i)=>{ const m=String(i+1).padStart(2,'0'); return <option key={m} value={m}>{m}</option>; })}
              </select>
              <input className="border rounded px-3 py-2 w-24" value={year} onChange={e=>setYear(e.target.value)} />
              <button disabled={exporting} onClick={()=>exportXlsx('monthly')} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{exporting ? 'Hazırlanıyor...' : "Excel'e Yazdır"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

