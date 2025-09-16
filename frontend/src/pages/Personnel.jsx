import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function Personnel() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', salary: '', sgk_cost: '' });
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try { const r = await fetch(`${API_BASE}/personnel`, { headers: authHeaders() }); if (r.ok) setRows(await r.json()); } catch(e){ console.error(e);} }
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${API_BASE}/personnel/${editing}` : `${API_BASE}/personnel`;
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ name: form.name, salary: parseFloat(form.salary), sgk_cost: parseFloat(form.sgk_cost) }) });
      if (r.ok) { setForm({ name:'', salary:'', sgk_cost:'' }); setEditing(null); load(); }
    } catch(e){ console.error(e); }
  };
  const edit = (p) => { setEditing(p.id); setForm({ name: p.name, salary: String(p.salary), sgk_cost: String(p.sgk_cost) }); };
  const del = async (id) => { if(!confirm('Silinsin mi?')) return; try{ const r=await fetch(`${API_BASE}/personnel/${id}`, { method:'DELETE', headers: authHeaders() }); if(r.ok) load(); }catch(e){ console.error(e);} };

  return (
    <div className="p-4">
      <div className="bg-white rounded p-4 shadow-sm mb-4">
        <h2 className="text-xl font-semibold mb-3">Personel</h2>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="border rounded px-3 py-2" placeholder="İsim" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} required />
          <input className="border rounded px-3 py-2" placeholder="Maaş" type="number" value={form.salary} onChange={e=>setForm({...form, salary:e.target.value})} required />
          <input className="border rounded px-3 py-2" placeholder="SGK" type="number" value={form.sgk_cost} onChange={e=>setForm({...form, sgk_cost:e.target.value})} required />
          <div className="flex gap-2 items-center">
            <button className="px-4 py-2 bg-blue-600 text-white rounded">{editing?'Güncelle':'Ekle'}</button>
            {editing && <button type="button" onClick={()=>{setEditing(null); setForm({ name:'', salary:'', sgk_cost:'' });}} className="px-4 py-2 bg-gray-500 text-white rounded">İptal</button>}
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-2">İsim</th><th className="py-2">Maaş</th><th className="py-2">SGK</th><th /></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} className="border-t">
                <td className="py-2">{p.name}</td>
                <td>{formatCurrency(p.salary)}</td>
                <td>{formatCurrency(p.sgk_cost)}</td>
                <td className="text-right">
                  <button onClick={()=>edit(p)} className="text-blue-600 mr-3">Düzenle</button>
                  <button onClick={()=>del(p.id)} className="text-red-600">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
