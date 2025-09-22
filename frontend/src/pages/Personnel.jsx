import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

const now = new Date();
const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const toMonthInput = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

const parseMonthInput = (value) => {
  if (!value || typeof value !== 'string') return null;
  const [yearPart, monthPart] = value.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
};

const formatPeriodLabel = (year, month) => {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return '';
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
};

export default function Personnel() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', salary: '', sgk_cost: '' });
  const [editing, setEditing] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [currentPeriod, setCurrentPeriod] = useState(parseMonthInput(initialMonth));
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectivePeriod = currentPeriod || parseMonthInput(selectedMonth) || parseMonthInput(initialMonth);

  const fetchRows = async (monthValue = selectedMonth) => {
    const period = parseMonthInput(monthValue) || parseMonthInput(initialMonth);
    if (!period) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/personnel?month=${String(period.month).padStart(2, '0')}&year=${period.year}`,
        { headers: authHeaders() },
      );
      if (!response.ok) {
        throw new Error('load-failed');
      }
      const payload = await response.json();
      const receivedRows = Array.isArray(payload?.rows)
        ? payload.rows
        : Array.isArray(payload)
        ? payload
        : [];
      setRows(receivedRows);
      if (payload?.period) {
        const normalized = toMonthInput(payload.period.year, payload.period.month);
        setCurrentPeriod({ year: payload.period.year, month: payload.period.month });
        if (normalized !== selectedMonth) {
          setSelectedMonth(normalized);
        }
      } else {
        setCurrentPeriod(period);
      }
      if (Array.isArray(payload?.availablePeriods)) {
        setAvailablePeriods(payload.availablePeriods);
      }
    } catch (err) {
      console.error(err);
      setError('Personel bilgileri getirilemedi.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows(selectedMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const totals = useMemo(() => {
    const salarySum = rows.reduce((sum, person) => sum + (Number(person.salary) || 0), 0);
    const sgkSum = rows.reduce((sum, person) => sum + (Number(person.sgk_cost) || 0), 0);
    return { salary: salarySum, sgk: sgkSum, total: salarySum + sgkSum };
  }, [rows]);

  const periodShortcuts = useMemo(() => {
    const map = new Map();
    availablePeriods.forEach((period) => {
      const year = Number(period?.year);
      const month = Number(period?.month);
      if (!Number.isInteger(year) || !Number.isInteger(month)) return;
      const value = toMonthInput(year, month);
      if (!map.has(value)) {
        map.set(value, { value, year, month });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => {
        if (a.year === b.year) {
          return b.month - a.month;
        }
        return b.year - a.year;
      })
      .slice(0, 12)
      .map((item) => ({ value: item.value, label: formatPeriodLabel(item.year, item.month) }));
  }, [availablePeriods]);

  const submit = async (event) => {
    event.preventDefault();
    const trimmedName = form.name.trim();
    const salaryValue = Number(form.salary);
    const sgkValue = Number(form.sgk_cost);
    if (!trimmedName || !Number.isFinite(salaryValue) || !Number.isFinite(sgkValue)) {
      setError('Geçerli bir ad, maas ve SGK tutari girin.');
      return;
    }
    if (!effectivePeriod) return;

    const payload = {
      name: trimmedName,
      salary: salaryValue,
      sgk_cost: sgkValue,
      month: effectivePeriod.month,
      year: effectivePeriod.year,
    };

    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${API_BASE}/personnel/${editing}` : `${API_BASE}/personnel`;

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error('save-failed');
      }
      setForm({ name: '', salary: '', sgk_cost: '' });
      setEditing(null);
      setError(null);
      await fetchRows(toMonthInput(payload.year, payload.month));
    } catch (err) {
      console.error(err);
      setError('Personel kaydedilemedi.');
    }
  };

  const edit = (person) => {
    setEditing(person.id);
    setForm({
      name: person.name || '',
      salary: person.salary === 0 || person.salary ? String(person.salary) : '',
      sgk_cost: person.sgk_cost === 0 || person.sgk_cost ? String(person.sgk_cost) : '',
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ name: '', salary: '', sgk_cost: '' });
  };

  const del = async (id) => {
    if (!confirm('Silinsin mi?')) return;
    try {
      const response = await fetch(`${API_BASE}/personnel/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error('delete-failed');
      }
      await fetchRows(selectedMonth);
    } catch (err) {
      console.error(err);
      setError('Personel silinemedi.');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Personel</h2>
            {effectivePeriod && (
              <div className="text-sm text-gray-500">
                Seçili dönem: {formatPeriodLabel(effectivePeriod.year, effectivePeriod.month)}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="border rounded px-3 py-2"
            />
            {periodShortcuts.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {periodShortcuts.map((period) => (
                  <button
                    key={period.value}
                    type="button"
                    onClick={() => setSelectedMonth(period.value)}
                    className={`px-2 py-1 rounded border transition ${
                      period.value === selectedMonth ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-gray-600">
          <span>Toplam Maas: <strong className="text-gray-900">{formatCurrency(totals.salary)}</strong></span>
          <span>Toplam SGK: <strong className="text-gray-900">{formatCurrency(totals.sgk)}</strong></span>
          <span>Genel Toplam: <strong className="text-gray-900">{formatCurrency(totals.total)}</strong></span>
        </div>
        {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="border rounded px-3 py-2"
            placeholder="Isim"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Maas"
            type="number"
            value={form.salary}
            onChange={(event) => setForm({ ...form, salary: event.target.value })}
            required
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="SGK"
            type="number"
            value={form.sgk_cost}
            onChange={(event) => setForm({ ...form, sgk_cost: event.target.value })}
            required
          />
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 bg-blue-600 text-white rounded" disabled={loading}>
              {editing ? 'Güncelle' : 'Ekle'}
            </button>
            {editing && (
              <button type="button" onClick={cancelEdit} className="px-4 py-2 bg-gray-500 text-white rounded">
                Iptal
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded p-4 shadow-sm">
        {loading ? (
          <div className="text-sm text-gray-500">Veriler yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-500">Bu döneme ait personel verisi bulunamadi.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2">Isim</th>
                <th className="py-2">Maas</th>
                <th className="py-2">SGK</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => (
                <tr key={person.id} className="border-t">
                  <td className="py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{person.name}</span>
                      {person.is_inherited && (
                        <span className="text-xs text-gray-500">
                          {person.source_year && person.source_month
                            ? `Kaynak: ${formatPeriodLabel(person.source_year, person.source_month)}`
                            : 'Önceki dönem'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">{formatCurrency(person.salary)}</td>
                  <td className="py-2">{formatCurrency(person.sgk_cost)}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => edit(person)} className="text-blue-600 mr-3">Düzenle</button>
                    <button onClick={() => del(person.id)} className="text-red-600">Sil</button>
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






