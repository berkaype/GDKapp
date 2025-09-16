import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';

const API_BASE = getApiBase();

export default function StockCodes() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ product_name: '', brand: '', unit: 'kg' });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ product_name: '', brand: '', unit: 'kg' });

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/stock-codes`, { headers: authHeaders() });
      if (r.ok) setRows(await r.json());
    } catch (e) { console.error(e); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await fetch(`${API_BASE}/stock-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(form)
      });
      if (!r.ok) { const err = await r.text(); alert(`Ekleme başarısız: ${err}`); return; }
      setForm({ product_name: '', brand: '', unit: 'kg' });
      load();
    } catch (e) { console.error(e); alert('Ekleme sırasında hata oluştu'); }
  };

  const startEdit = (row) => { setEditId(row.id); setEditForm({ product_name: row.product_name || '', brand: row.brand || '', unit: row.unit || 'kg' }); };
  const cancelEdit = () => { setEditId(null); };
  const saveEdit = async (id) => {
    try {
      const r = await fetch(`${API_BASE}/stock-codes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(editForm)
      });
      if (!r.ok) { const err = await r.text(); alert(`Güncelleme başarısız: ${err}`); return; }
      setEditId(null);
      load();
    } catch (e) { console.error(e); alert('Güncelleme sırasında hata oluştu'); }
  };
  const removeRow = async (id) => {
    if (!confirm('Bu stok kodunu silmek istiyor musunuz?')) return;
    try {
      const r = await fetch(`${API_BASE}/stock-codes/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) { const err = await r.text(); alert(`Silme başarısız: ${err}`); return; }
      load();
    } catch (e) { console.error(e); alert('Silme sırasında hata oluştu'); }
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded p-4 shadow-sm mb-4">
        <h2 className="text-xl font-semibold mb-3">Stok Kodu Listesi</h2>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input className="border rounded px-3 py-2" placeholder="Urun Adi" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} required />
          <input className="border rounded px-3 py-2" placeholder="Marka" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
          <select className="border rounded px-3 py-2" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
            <option value="kg">kg</option>
            <option value="adet">adet</option>
            <option value="litre">litre</option>
            <option value="paket">paket</option>
          </select>
          <div className="flex items-center">
            <button className="px-4 py-2 bg-blue-600 text-white rounded">Ekle</button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2">Stok Kodu</th>
              <th className="py-2">Urun</th>
              <th className="py-2">Marka</th>
              <th className="py-2">Birim</th>
              <th className="py-2 w-40">Islem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} className="border-t">
                <td className="py-2 font-mono text-blue-700">{s.stock_code}</td>
                {editId === s.id ? (
                  <>
                    <td className="py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.product_name} onChange={e => setEditForm({ ...editForm, product_name: e.target.value })} /></td>
                    <td className="py-2"><input className="border rounded px-2 py-1 w-full" value={editForm.brand} onChange={e => setEditForm({ ...editForm, brand: e.target.value })} /></td>
                    <td className="py-2">
                      <select className="border rounded px-2 py-1" value={editForm.unit} onChange={e => setEditForm({ ...editForm, unit: e.target.value })}>
                        <option value="kg">kg</option>
                        <option value="adet">adet</option>
                        <option value="litre">litre</option>
                        <option value="paket">paket</option>
                      </select>
                    </td>
                    <td className="py-2">
                      <button onClick={() => saveEdit(s.id)} className="px-3 py-1 bg-green-600 text-white rounded mr-2">Kaydet</button>
                      <button onClick={cancelEdit} className="px-3 py-1 bg-gray-400 text-white rounded">Iptal</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2">{s.product_name}</td>
                    <td className="py-2">{s.brand}</td>
                    <td className="py-2">{s.unit}</td>
                    <td className="py-2">
                      <button onClick={() => startEdit(s)} className="px-3 py-1 bg-amber-500 text-white rounded mr-2">Düzenle</button>
                      <button onClick={() => removeRow(s.id)} className="px-3 py-1 bg-red-600 text-white rounded">Sil</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

