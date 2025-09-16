import React, { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

function endOfMonthStr(year, month){ const d=new Date(Number(year), Number(month), 0); return d.toISOString().split('T')[0]; }
function startOfMonthStr(year, month){ const d=new Date(Number(year), Number(month)-1, 1); return d.toISOString().split('T')[0]; }
function addDaysStr(dateStr, days){ const d=new Date(dateStr); d.setDate(d.getDate()+days); return d.toISOString().split('T')[0]; }

export default function VeriYazdirma(){
  const today = new Date();
  const [weekStart, setWeekStart] = useState(()=>{ const d=new Date(); const day=d.getDay(); const diff=(day===0?6:day-1); d.setDate(d.getDate()-diff); return d.toISOString().split('T')[0]; });
  const [month, setMonth] = useState(String(today.getMonth()+1).padStart(2,'0'));
  const [year, setYear] = useState(String(today.getFullYear()));

  const fetchClosings = async (start, end) => {
    const r = await fetch(`${API_BASE}/daily-closings?start=${start}&end=${end}`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
  };
  const fetchExpenses = async (start, end) => {
    const r = await fetch(`${API_BASE}/business-expenses`, { headers: authHeaders() });
    const all = r.ok ? await r.json() : [];
    return all.filter(x=>{ const d=new Date(x.expense_date); const ds=d.toISOString().split('T')[0]; return ds>=start && ds<=end; });
  };
  const fetchStock = async (start, end) => {
    const r = await fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() });
    const all = r.ok ? await r.json() : [];
    return all.filter(x=>{ const ds=new Date(x.purchase_date).toISOString().split('T')[0]; return ds>=start && ds<=end; });
  };
  const fetchPersonnel = async () => {
    const r = await fetch(`${API_BASE}/personnel`, { headers: authHeaders() });
    return r.ok ? r.json() : [];
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
    let start, end, label;
    if (range==='weekly'){
      start = weekStart; end = addDaysStr(weekStart, 6); label = `Haftalık_${start}_to_${end}`;
    } else {
      start = startOfMonthStr(year, month); end = endOfMonthStr(year, month); label = `Aylık_${year}-${month}`;
    }
    const summary = await buildSummary(start, end);

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
  };

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-3">Veri Yazdırma</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Haftalık Özet</h3>
            <div className="flex gap-2 items-center">
              <input type="date" className="border rounded px-3 py-2" value={weekStart} onChange={e=>setWeekStart(e.target.value)} />
              <button onClick={()=>exportXlsx('weekly')} className="px-4 py-2 bg-green-600 text-white rounded">Excel'e Yazdır</button>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Aylık Özet</h3>
            <div className="flex gap-2 items-center">
              <select className="border rounded px-3 py-2" value={month} onChange={e=>setMonth(e.target.value)}>
                {[...Array(12)].map((_,i)=>{ const m=String(i+1).padStart(2,'0'); return <option key={m} value={m}>{m}</option>; })}
              </select>
              <input className="border rounded px-3 py-2 w-24" value={year} onChange={e=>setYear(e.target.value)} />
              <button onClick={()=>exportXlsx('monthly')} className="px-4 py-2 bg-blue-600 text-white rounded">Excel'e Yazdır</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

