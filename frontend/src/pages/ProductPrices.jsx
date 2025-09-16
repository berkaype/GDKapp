import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function ProductPrices() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ product_name:'', category:'', price:'', effective_date: new Date().toISOString().split('T')[0] });
  const [updateFor, setUpdateFor] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async () => { try { const r = await fetch(`${API_BASE}/product-prices`); if (r.ok) setRows(await r.json()); } catch(e){ console.error(e);} };
  useEffect(()=>{ load(); },[]);

  const byCat = rows.reduce((acc,p)=>{ (acc[p.category] ||= []).push(p); return acc; },{});

  const add = async (e) => {
    e.preventDefault();
    try { const r = await fetch(`${API_BASE}/product-prices`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ product_name: form.product_name, category: form.category, price: parseFloat(form.price), effective_date: form.effective_date }) }); if(r.ok){ setForm({ product_name:'', category:'', price:'', effective_date: new Date().toISOString().split('T')[0] }); load(); } } catch(e){ console.error(e);} };

  const beginUpdate = (p) => { setUpdateFor(p); setForm({ product_name:p.product_name, category:p.category, price:'', effective_date: new Date().toISOString().split('T')[0] }); };
  const doUpdate = async (e) => { e.preventDefault(); if(!updateFor) return; try{ const r=await fetch(`${API_BASE}/product-prices/${updateFor.id}`, { method:'PUT', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ price: parseFloat(form.price), effective_date: form.effective_date }) }); if(r.ok){ setUpdateFor(null); setForm({ product_name:'', category:'', price:'', effective_date: new Date().toISOString().split('T')[0] }); load(); } } catch(e){ console.error(e);} };

  const showHistory = async (p) => { try{ const r = await fetch(`${API_BASE}/product-prices/${p.id}/history`); if(r.ok) setHistory(await r.json()); }catch(e){ console.error(e);} };
  const delRow = async (p) => { if(!confirm('Silinsin mi?')) return; try{ const r = await fetch(`${API_BASE}/product-prices/${p.id}`, { method:'DELETE', headers: authHeaders() }); if(r.ok) load(); }catch(e){ console.error(e);} };

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-3">Yeni Ürün Fiyatı</h2>
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="border rounded px-3 py-2" placeholder="Ürün Adı" value={form.product_name} onChange={e=>setForm({...form, product_name:e.target.value})} required />
          <input className="border rounded px-3 py-2" placeholder="Kategori" value={form.category} onChange={e=>setForm({...form, category:e.target.value})} required />
          <input className="border rounded px-3 py-2" placeholder="Fiyat" type="number" value={form.price} onChange={e=>setForm({...form, price:e.target.value})} required />
          <input className="border rounded px-3 py-2" type="date" value={form.effective_date} onChange={e=>setForm({...form, effective_date:e.target.value})} required />
          <div className="flex items-center"><button className="px-4 py-2 bg-blue-600 text-white rounded">Ekle</button></div>
        </form>
      </div>

      <div className="space-y-4">
        {Object.entries(byCat).map(([cat,list]) => (
          <div key={cat} className="bg-white rounded p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">{cat}</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500"><tr><th className="py-2">Ürün</th><th className="py-2">Fiyat</th><th className="py-2">Son Güncelleme</th><th /></tr></thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="py-2 font-medium">{p.product_name}</td>
                    <td className="py-2 text-green-600 font-semibold">{formatCurrency(p.price)}</td>
                    <td className="py-2 text-sm text-gray-500">{new Date(p.effective_date).toLocaleDateString('tr-TR')}</td>
                    <td className="py-2 text-right space-x-2">
                      <button onClick={()=>beginUpdate(p)} className="text-blue-600">Fiyat Güncelle</button>
                      <button onClick={()=>showHistory(p)} className="text-purple-600">Geçmiş</button>
                      <button onClick={()=>delRow(p)} className="text-red-600">Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {updateFor && (
        <div className="bg-white rounded p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Fiyat Güncelle: {updateFor.product_name}</h3>
          <form onSubmit={doUpdate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="border rounded px-3 py-2" placeholder="Yeni Fiyat" type="number" value={form.price} onChange={e=>setForm({...form, price:e.target.value})} required />
            <input className="border rounded px-3 py-2" type="date" value={form.effective_date} onChange={e=>setForm({...form, effective_date:e.target.value})} required />
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 bg-blue-600 text-white rounded">Güncelle</button>
              <button type="button" onClick={()=>setUpdateFor(null)} className="px-4 py-2 bg-gray-500 text-white rounded">İptal</button>
            </div>
          </form>
        </div>
      )}

      {history.length>0 && (
        <div className="bg-white rounded p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Fiyat Geçmişi</h3>
          <div className="grid gap-2">
            {history.map((h,i)=> (
              <div key={h.id} className="p-2 border rounded">
                <div className="font-medium">{formatCurrency(h.price)}</div>
                <div className="text-xs text-gray-500">{new Date(h.effective_date).toLocaleDateString('tr-TR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

      <div className="bg-white rounded p-4 shadow-sm">
        <button onClick={async()=>{ try{ await fetch(`${API_BASE}/maintenance/cleanup-prices`, { method:'POST', headers: authHeaders() }); load(); alert('Fazla fiyat geçmişi temizlendi.'); }catch(e){ alert('Temizlik sırasında hata oluştu'); } }} className="px-3 py-2 bg-red-600 text-white rounded">Fazla Geçmişi Temizle</button>
      </div>
