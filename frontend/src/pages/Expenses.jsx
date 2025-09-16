import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ expense_name: '', expense_date: new Date().toISOString().split('T')[0], amount: '' });

  const load = async () => { try { const r = await fetch(`${API_BASE}/business-expenses`, { headers: authHeaders() }); if (r.ok) setRows(await r.json()); } catch(e){ console.error(e);} };
  useEffect(()=>{ load(); },[]);

  const submit = async (e) => {
    e.preventDefault();
    try { const r = await fetch(`${API_BASE}/business-expenses`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ expense_name: form.expense_name, expense_date: form.expense_date, amount: parseFloat(form.amount) }) }); if (r.ok){ setForm({ expense_name:'', expense_date: new Date().toISOString().split('T')[0], amount:''}); load(); } } catch(e){ console.error(e);} };

  const total = rows.reduce((s,x)=>s+(x.amount||0),0);

  return (
    <div className="p-4">
      <div className="bg-white rounded p-4 shadow-sm mb-4">
        <h2 className="text-xl font-semibold mb-3">İşletme Giderleri</h2>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="border rounded px-3 py-2" placeholder="Gider Adı" value={form.expense_name} onChange={e=>setForm({...form, expense_name:e.target.value})} required />
          <input className="border rounded px-3 py-2" type="date" value={form.expense_date} onChange={e=>setForm({...form, expense_date:e.target.value})} required />
          <input className="border rounded px-3 py-2" placeholder="Tutar" type="number" value={form.amount} onChange={e=>setForm({...form, amount:e.target.value})} required />
          <button className="px-4 py-2 bg-blue-600 text-white rounded">Ekle</button>
        </form>
      </div>
      <div className="bg-white rounded p-4 shadow-sm">
        <div className="mb-3 font-semibold text-red-600">Toplam: {formatCurrency(total)}</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-2">Gider</th><th className="py-2">Tarih</th><th className="py-2">Tutar</th></tr></thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id} className="border-t"><td className="py-2">{e.expense_name}</td><td>{new Date(e.expense_date).toLocaleDateString('tr-TR')}</td><td>{formatCurrency(e.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
