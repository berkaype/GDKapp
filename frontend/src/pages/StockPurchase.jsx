import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function StockPurchase() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ selected:null, purchase_date: new Date().toISOString().split('T')[0], package_count:'', package_content:'', total_price:'' });
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  const load = async () => { try { const r = await fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() }); if (r.ok) setRows(await r.json()); } catch(e){ console.error(e);} };
  useEffect(()=>{ load(); },[]);

  useEffect(()=>{ const go = setTimeout(async ()=>{ if(q.length<2){ setResults([]); return;} try{ const r=await fetch(`${API_BASE}/stock-codes/search?q=${encodeURIComponent(q)}`,{ headers: authHeaders()}); if(r.ok) setResults(await r.json()); }catch(e){ console.error(e);} },300); return ()=>clearTimeout(go); },[q]);

  const selectStock = (s) => { setForm({...form, selected:s}); setResults([]); setQ(`${s.product_name}`); };

  const submit = async (e) => {
    e.preventDefault(); if(!form.selected) { alert('Lütfen bir ürün seçin'); return; }
    const body = {
      stock_code_id: form.selected.id,
      package_count: parseFloat(form.package_count),
      package_content: parseFloat(form.package_content),
      total_price: parseFloat(form.total_price),
      purchase_date: form.purchase_date
    };
    try { const r = await fetch(`${API_BASE}/stock-purchases`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(body) }); if(r.ok){ setForm({ selected:null, purchase_date:new Date().toISOString().split('T')[0], package_count:'', package_content:'', total_price:''}); setQ(''); load(); } } catch(e){ console.error(e);} };

  const del = async (id) => { if(!confirm('Silinsin mi?')) return; try{ const r = await fetch(`${API_BASE}/stock-purchases/${id}`, { method:'DELETE', headers: authHeaders() }); if(r.ok) load(); }catch(e){ console.error(e);} };

  const unitPrice = form.package_count && form.total_price ? (parseFloat(form.total_price)/parseFloat(form.package_count)).toFixed(2) : '0.00';
  const perItem = form.package_count && form.package_content && form.total_price ? (parseFloat(form.total_price)/(parseFloat(form.package_count)*parseFloat(form.package_content))).toFixed(2) : '0.00';

  const total = rows.reduce((s,x)=>s+(x.total_price||0),0);

  return (
    <div className="p-4">
      <div className="bg-white rounded p-4 shadow-sm mb-4">
        <h2 className="text-xl font-semibold mb-3">Stok Güncelleme / Mal Alımı</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Ara</label>
              <input className="border rounded px-3 py-2 w-full" placeholder="Ürün adı veya stok kodu ile ara..." value={q} onChange={e=>setQ(e.target.value)} />
              {results.length>0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded shadow max-h-60 overflow-y-auto">
                  {results.map(s => (
                    <div key={s.id} className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b" onClick={()=>selectStock(s)}>
                      <div className="font-medium">{s.product_name}</div>
                      <div className="text-sm text-gray-600">{s.stock_code} • {s.brand} • {s.unit}</div>
                    </div>
                  ))}
                </div>
              )}
              {form.selected && (
                <div className="mt-2 p-3 bg-blue-50 rounded">
                  <div className="font-medium text-blue-900">{form.selected.product_name}</div>
                  <div className="text-sm text-blue-700">Stok Kodu: {form.selected.stock_code} • Birim: {form.selected.unit}{form.selected.brand?` • Marka: ${form.selected.brand}`:''}</div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alım Tarihi</label>
              <input type="date" className="border rounded px-3 py-2 w-full" value={form.purchase_date} onChange={e=>setForm({...form, purchase_date:e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paket Adedi</label>
              <input type="number" className="border rounded px-3 py-2 w-full" value={form.package_count} onChange={e=>setForm({...form, package_count:e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paket İçeriği</label>
              <input type="number" className="border rounded px-3 py-2 w-full" value={form.package_content} onChange={e=>setForm({...form, package_content:e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Toplam Fiyat</label>
              <input type="number" className="border rounded px-3 py-2 w-full" value={form.total_price} onChange={e=>setForm({...form, total_price:e.target.value})} />
            </div>
            <div className="text-sm text-gray-700 flex items-end">Birim: {formatCurrency(unitPrice)} • Birim başı: {formatCurrency(perItem)}</div>
          </div>
          <div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded">Ekle</button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-gray-600">Toplam Alım Sayısı</div>
            <div className="text-2xl font-bold text-blue-600">{rows.length}</div>
          </div>
          <div>
            <div className="text-gray-600">Toplam Alım Tutarı</div>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(total)}</div>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500"><tr><th className="py-2">Ürün</th><th className="py-2">Stok Kodu</th><th className="py-2">Paket</th><th className="py-2">İçerik</th><th className="py-2">Toplam</th><th className="py-2">Birim</th><th className="py-2">Tarih</th><th /></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} className="border-t">
                <td className="py-2">
                  <div className="font-medium">{p.product_name}</div>
                  {p.brand && <div className="text-xs text-gray-500">{p.brand}</div>}
                </td>
                <td className="py-2 font-mono text-blue-700">{p.stock_code}</td>
                <td className="py-2">{p.package_count} {p.unit}</td>
                <td className="py-2">{p.package_content} {p.unit}</td>
                <td className="py-2 font-semibold">{formatCurrency(p.total_price)}</td>
                <td className="py-2">
                  <div>Paket: {formatCurrency(p.unit_price)}</div>
                  <div className="text-xs text-gray-500">{p.unit}: {formatCurrency(p.per_item_price)}</div>
                </td>
                <td className="py-2">{new Date(p.purchase_date).toLocaleDateString('tr-TR')}</td>
                <td className="py-2 text-right"><button onClick={()=>del(p.id)} className="text-red-600">Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
