import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function CiroGecmisi() {
  const [rows, setRows] = useState([]);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/daily-closings?month=${month}&year=${year}`, { headers: authHeaders() });
      if (r.ok) setRows(await r.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const monthlyTotal = useMemo(() => rows.reduce((s, x) => s + (Number(x.total_amount) || 0), 0), [rows]);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Ciro Geçmişi</h2>
          <button
            className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded"
            onClick={async () => {
              const ok = confirm(`Seçili aydaki ciro kayıtlarını silmek istediğinize emin misiniz? ( ${month}/${year} )\nBu işlem geri alınamaz.`);
              if (!ok) return;
              try {
                const r = await fetch(`${API_BASE}/daily-closings/cleanup`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHeaders() },
                  body: JSON.stringify({ month, year }),
                });
                if (r.ok) {
                  const res = await r.json();
                  alert(`Temizlik tamamlandı. Silinen kayıt: ${res.deleted || 0}`);
                  await load();
                } else {
                  alert('Temizlik başarısız oldu.');
                }
              } catch (e) {
                alert('Temizlik işleminde hata oluştu.');
              }
            }}
          >
            Temizle
          </button>
        </div>

        <div className="flex gap-3 mb-3">
          <select className="border rounded px-3 py-2" value={month} onChange={(e) => setMonth(e.target.value)}>
            {[...Array(12)].map((_, i) => {
              const m = String(i + 1).padStart(2, '0');
              return (
                <option key={m} value={m}>
                  {m}
                </option>
              );
            })}
          </select>
          <input className="border rounded px-3 py-2 w-24" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>

        <div className="mb-2 font-semibold">Aylık Toplam: {formatCurrency(monthlyTotal)}</div>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-2">Tarih</th>
              <th className="py-2">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.closing_date} className="border-t">
                <td className="py-2">{new Date(r.closing_date).toLocaleDateString('tr-TR')}</td>
                <td>{formatCurrency(r.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

