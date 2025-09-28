import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function CiroGecmisi() {
  const [rows, setRows] = useState([]);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/daily-closings?month=${month}&year=${year}`, { headers: authHeaders() });
      if (r.ok) {
        const payload = await r.json();
        setRows(payload);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, [month, year]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    if (!rows.some((row) => row.closing_date === selectedDate)) {
      setSelectedDate(null);
      setSelectedItems([]);
      setItemsError(null);
      setItemsLoading(false);
    }
  }, [rows, selectedDate]);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedItems([]);
      setItemsError(null);
      setItemsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchItems = async () => {
      setItemsLoading(true);
      setItemsError(null);
      try {
        const res = await fetch(`${API_BASE}/analytics/daily?date=${selectedDate}`, { headers: authHeaders() });
        if (!res.ok) {
          throw new Error('items-fetch-failed');
        }
        const data = await res.json();
        if (cancelled) {
          return;
        }
        const items = Array.isArray(data?.items)
          ? data.items
              .map((item) => ({
                name: item?.name || 'Diğer Ürün',
                quantity: Number(item?.quantity || 0),
                revenue: Number(item?.revenue || 0),
              }))
              .sort((a, b) => {
                if (b.revenue !== a.revenue) return b.revenue - a.revenue;
                if (b.quantity !== a.quantity) return b.quantity - a.quantity;
                return a.name.localeCompare(b.name, 'tr');
              })
          : [];
        setSelectedItems(items);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setItemsError('Veriler getirilemedi. Lütfen tekrar deneyin.');
          setSelectedItems([]);
        }
      } finally {
        if (!cancelled) {
          setItemsLoading(false);
        }
      }
    };

    fetchItems();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const monthlyTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0),
    [rows],
  );

  const selectedClosing = useMemo(
    () => rows.find((row) => row.closing_date === selectedDate) || null,
    [rows, selectedDate],
  );

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return '';
    const dt = new Date(`${selectedDate}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? selectedDate : dt.toLocaleDateString('tr-TR');
  }, [selectedDate]);

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
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="py-2 px-3">Tarih</th>
                <th className="py-2 px-3 text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSelected = r.closing_date === selectedDate;
                const displayDate = new Date(`${r.closing_date}T00:00:00`).toLocaleDateString('tr-TR');
                return (
                  <React.Fragment key={r.closing_date}>
                    <tr
                      className={`border-t cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelectedDate(isSelected ? null : r.closing_date)}
                    >
                      <td className="py-2 px-3">{displayDate}</td>
                      <td className="py-2 px-3 text-right font-medium">{formatCurrency(r.total_amount)}</td>
                    </tr>
                    {isSelected && (
                      <tr className="bg-white">
                        <td colSpan={2} className="p-0">
                          <div className="border-t border-blue-100 bg-white px-4 py-4">
                            <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                              <span>
                                Seçilen Gün: <span className="font-medium text-gray-800">{selectedDateLabel}</span>
                              </span>
                              <span>
                                Günlük Ciro: <span className="font-semibold text-blue-600">{formatCurrency(selectedClosing?.total_amount || 0)}</span>
                              </span>
                            </div>
                            {itemsLoading && (
                              <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
                                Veriler yükleniyor...
                              </div>
                            )}
                            {itemsError && !itemsLoading && (
                              <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
                                {itemsError}
                              </div>
                            )}
                            {!itemsError && !itemsLoading && (
                              selectedItems.length ? (
                                <div className="mt-3 overflow-x-auto rounded border border-gray-200 bg-white shadow-sm">
                                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th scope="col" className="px-4 py-2 text-left font-semibold text-gray-700">Ürün</th>
                                        <th scope="col" className="px-4 py-2 text-right font-semibold text-gray-700">Adet</th>
                                        <th scope="col" className="px-4 py-2 text-right font-semibold text-gray-700">Ciro</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {selectedItems.map((item, idx) => (
                                        <tr key={`${item.name}-${idx}`}>
                                          <td className="px-4 py-2 text-gray-800">{item.name}</td>
                                          <td className="px-4 py-2 text-right text-gray-600">{item.quantity}</td>
                                          <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(item.revenue)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="mt-3 rounded border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                                  Seçilen gün için ürün satışı bulunamadı.
                                </div>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {!selectedDate && rows.length > 0 && (
          <div className="mt-3 text-sm text-gray-500">
            Bir gün seçerek satılan ürünleri görüntüleyebilirsiniz.
          </div>
        )}
      </div>
    </div>
  );
}
