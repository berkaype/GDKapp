import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';

const API_BASE = getApiBase();

export default function TableNames() {
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/table-names`);
        if (!res.ok) throw new Error('load-failed');
        const data = await res.json();
        setTables(Array.isArray(data?.tables) ? data.tables : []);
      } catch (e) {
        setError('Masa isimleri yüklenemedi.');
      }
    })();
  }, []);

  const updateName = (id, name) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const addTable = () => {
    const ids = tables.map((t) => t.id);
    let next = 1;
    while (ids.includes(next)) next += 1;
    setTables((prev) => [...prev, { id: next, name: `Masa ${next}` }].sort((a, b) => a.id - b.id));
  };

  const removeTable = (id) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { tables: tables.map((t) => ({ id: t.id, name: (t.name || '').trim() })) };
      const res = await fetch(`${API_BASE}/table-names`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save-failed');
      const data = await res.json();
      setTables(Array.isArray(data?.tables) ? data.tables : tables);
    } catch (e) {
      setError('Kaydedilemedi. Yetki veya sunucu hatası.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Masa İsimleri</h2>
          <div className="flex gap-2">
            <button onClick={addTable} className="px-3 py-2 border rounded hover:bg-gray-50">+ Masa Ekle</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60">
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-4">Masa ID</th>
                <th className="py-2 pr-4">İsim</th>
                <th className="py-2 pr-4 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="py-2 pr-4 w-24">{t.id}</td>
                  <td className="py-2 pr-4">
                    <input
                      className="border rounded px-2 py-1 w-full"
                      value={t.name || ''}
                      onChange={(e) => updateName(t.id, e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <button onClick={() => removeTable(t.id)} className="text-red-600 hover:underline">Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-gray-500 mt-3">Not: Masa ID siparişlerde kullanılır; mevcut açık adisyonlar etkilenmez.</div>
      </div>
    </div>
  );
}

