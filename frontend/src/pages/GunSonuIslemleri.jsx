import React, { useState, useEffect, useCallback } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function GunSonuIslemleri() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchRecords = useCallback(async () => {
    if (!date) return;
    const [year, month] = date.split('-');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/credit-card-sales?month=${month}&year=${year}`, { headers: authHeaders() });
      if (response.ok) {
        const data = await response.json();
        setRecords(Array.isArray(data) ? data : []);
      } else {
        setRecords([]);
      }
    } catch (e) {
      console.error(e);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!date || !amount || Number(amount) < 0) {
      setError('Lütfen geçerli bir tarih ve tutar girin.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/credit-card-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ date, amount: Number(amount) }),
      });

      if (response.ok) {
        setSuccess('Kredi kartı cirosu başarıyla kaydedildi.');
        setAmount('');
        await fetchRecords();
      } else {
        const errData = await response.json();
        setError(errData.message || 'Kayıt sırasında bir hata oluştu.');
      }
    } catch (err) {
      console.error(err);
      setError('Sunucuya bağlanırken bir hata oluştu.');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Gün Sonu İşlemleri - Kredi Kartı Cirosu</h2>
        <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
          {error && <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>}
          {success && <div className="p-3 bg-green-100 text-green-700 rounded">{success}</div>}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700">Tarih</label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Kredi Kartı Ciro Tutarı</label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="Örn: 1500.50"
              step="0.01"
              min="0"
              required
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Kaydet</button>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Bu Ayın Kayıtları</h3>
        {loading ? <p>Yükleniyor...</p> : records.length > 0 ? (
          <ul className="space-y-2">
            {records.map(record => (
              <li key={record.date} className="flex justify-between p-2 border-b">
                <span>{new Date(record.date + 'T00:00:00').toLocaleDateString('tr-TR')}</span>
                <span className="font-medium">{formatCurrency(record.amount)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">Bu ay için kredi kartı ciro kaydı bulunamadı.</p>}
      </div>
    </div>
  );
}