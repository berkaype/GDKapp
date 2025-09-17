import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

const getDefaultDate = () => new Date().toISOString().split('T')[0];

const resolvePeriodKey = (row) => {
  if (!row) return null;
  const baseDate = row.expense_date ? new Date(row.expense_date) : null;
  const month = row.month ?? (baseDate ? baseDate.getMonth() + 1 : null);
  const year = row.year ?? (baseDate ? baseDate.getFullYear() : null);
  if (!month || !year) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
};

const formatPeriodLabel = (key) => {
  if (!key) return 'Tümü';
  const [yearPart, monthPart] = key.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart) - 1;
  if (!Number.isFinite(year) || month < 0) return key;
  return new Date(year, month, 1).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
};

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ expense_name: '', expense_date: getDefaultDate(), amount: '' });
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ expense_name: '', expense_date: getDefaultDate(), amount: '' });
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/business-expenses`, { headers: authHeaders() });
      if (!response.ok) {
        throw new Error('load-failed');
      }
      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
      setStatus(null);
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Gider listesi alınamadı.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const buckets = {};
    rows.forEach((row) => {
      const key = resolvePeriodKey(row);
      if (!key) return;
      if (!buckets[key]) {
        buckets[key] = [];
      }
      buckets[key].push(row);
    });
    Object.values(buckets).forEach((list) => {
      list.sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
    });
    return buckets;
  }, [rows]);

  const periods = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));
  }, [grouped]);

  useEffect(() => {
    if (!periods.length) {
      setSelectedPeriod((prev) => (prev === null ? prev : null));
      return;
    }
    setSelectedPeriod((prev) => (prev && periods.includes(prev) ? prev : periods[0]));
  }, [periods]);

  const filteredRows = useMemo(() => {
    if (!selectedPeriod) return [];
    return grouped[selectedPeriod] ? [...grouped[selectedPeriod]] : [];
  }, [grouped, selectedPeriod]);

  const monthlyTotal = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }, [filteredRows]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditFormChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      expense_name: form.expense_name.trim(),
      expense_date: form.expense_date,
      amount: Number(form.amount),
    };
    if (!payload.expense_name || !payload.expense_date || Number.isNaN(payload.amount) || payload.amount <= 0) {
      setStatus({ type: 'error', message: 'Geçerli bir gider adı ve tutar girin.' });
      return;
    }
    try {
      setActionPending(true);
      const response = await fetch(`${API_BASE}/business-expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error('create-failed');
      }
      setForm({ expense_name: '', expense_date: getDefaultDate(), amount: '' });
      setStatus({ type: 'success', message: 'Gider kaydedildi.' });
      await load();
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Gider eklenemedi.' });
    } finally {
      setActionPending(false);
    }
  };

  const beginEdit = (row) => {
    setEditingId(row.id);
    setEditForm({
      expense_name: row.expense_name || '',
      expense_date: row.expense_date ? row.expense_date.slice(0, 10) : getDefaultDate(),
      amount: String(row.amount ?? ''),
    });
    setStatus(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ expense_name: '', expense_date: getDefaultDate(), amount: '' });
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!editingId) return;
    const payload = {
      expense_name: editForm.expense_name.trim(),
      expense_date: editForm.expense_date,
      amount: Number(editForm.amount),
    };
    if (!payload.expense_name || !payload.expense_date || Number.isNaN(payload.amount) || payload.amount <= 0) {
      setStatus({ type: 'error', message: 'Geçerli bir gider adı ve tutar girin.' });
      return;
    }
    try {
      setActionPending(true);
      const response = await fetch(`${API_BASE}/business-expenses/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error('update-failed');
      }
      setStatus({ type: 'success', message: 'Gider güncellendi.' });
      setEditingId(null);
      setEditForm({ expense_name: '', expense_date: getDefaultDate(), amount: '' });
      await load();
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Gider güncellenemedi.' });
    } finally {
      setActionPending(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu gideri silmek istediğinize emin misiniz?')) {
      return;
    }
    try {
      setActionPending(true);
      const response = await fetch(`${API_BASE}/business-expenses/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error('delete-failed');
      }
      setStatus({ type: 'success', message: 'Gider silindi.' });
      await load();
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Gider silinemedi.' });
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded p-4 shadow-sm mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">İşletme Giderleri</h2>
          {periods.length > 0 && (
            <select
              className="border rounded px-3 py-2"
              value={selectedPeriod ?? ''}
              onChange={(event) => setSelectedPeriod(event.target.value)}
            >
              {periods.map((key) => (
                <option key={key} value={key}>
                  {formatPeriodLabel(key)}
                </option>
              ))}
            </select>
          )}
        </div>
        {status && (
          <div
            className={`rounded px-3 py-2 text-sm ${
              status.type === 'error'
                ? 'border border-red-300 bg-red-50 text-red-700'
                : 'border border-green-300 bg-green-50 text-green-700'
            }`}
          >
            {status.message}
          </div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="border rounded px-3 py-2"
            placeholder="Gider Adı"
            value={form.expense_name}
            onChange={(event) => handleFormChange('expense_name', event.target.value)}
            required
          />
          <input
            className="border rounded px-3 py-2"
            type="date"
            value={form.expense_date}
            onChange={(event) => handleFormChange('expense_date', event.target.value)}
            required
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Tutar"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => handleFormChange('amount', event.target.value)}
            required
          />
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-blue-300"
            type="submit"
            disabled={actionPending}
          >
            Ekle
          </button>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold text-red-600">Toplam: {formatCurrency(monthlyTotal)}</div>
          {selectedPeriod && (
            <div className="text-sm text-gray-500">{formatPeriodLabel(selectedPeriod)}</div>
          )}
        </div>
        {loading ? (
          <div className="text-sm text-gray-500">Veriler yükleniyor...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-gray-500">Bu ay için gider bulunamadı.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2">Gider</th>
                <th className="py-2">Tarih</th>
                <th className="py-2">Tutar</th>
                <th className="py-2 w-40">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="py-2">
                    {editingId === row.id ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editForm.expense_name}
                        onChange={(event) => handleEditFormChange('expense_name', event.target.value)}
                      />
                    ) : (
                      row.expense_name
                    )}
                  </td>
                  <td className="py-2">
                    {editingId === row.id ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        type="date"
                        value={editForm.expense_date}
                        onChange={(event) => handleEditFormChange('expense_date', event.target.value)}
                      />
                    ) : (
                      new Date(row.expense_date).toLocaleDateString('tr-TR')
                    )}
                  </td>
                  <td className="py-2 text-green-600 font-semibold">
                    {editingId === row.id ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.amount}
                        onChange={(event) => handleEditFormChange('amount', event.target.value)}
                      />
                    ) : (
                      formatCurrency(row.amount)
                    )}
                  </td>
                  <td className="py-2">
                    {editingId === row.id ? (
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1 bg-green-600 text-white rounded"
                          onClick={handleUpdate}
                          type="button"
                          disabled={actionPending}
                        >
                          Kaydet
                        </button>
                        <button
                          className="px-3 py-1 bg-gray-400 text-white rounded"
                          onClick={cancelEdit}
                          type="button"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1 bg-amber-500 text-white rounded"
                          onClick={() => beginEdit(row)}
                          type="button"
                          disabled={actionPending}
                        >
                          Düzenle
                        </button>
                        <button
                          className="px-3 py-1 bg-red-600 text-white rounded"
                          onClick={() => handleDelete(row.id)}
                          type="button"
                          disabled={actionPending}
                        >
                          Sil
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
