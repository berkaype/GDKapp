import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

function parsePositive(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num;
}

function resolveUnitCost(row) {
  if (row.unit_cost_override !== '' && row.unit_cost_override !== null && row.unit_cost_override !== undefined) {
    const parsed = Number(row.unit_cost_override);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Number(row.default_unit_cost) || 0;
}

function computeLineTotal(row) {
  const qty = Number(row.quantity);
  if (!Number.isFinite(qty)) {
    return 0;
  }
  return qty * resolveUnitCost(row);
}

export default function MaliyetHesaplama() {
  const [products, setProducts] = useState([]);
  const [stockOptions, setStockOptions] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [newIngredientId, setNewIngredientId] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newOverride, setNewOverride] = useState('');

  useEffect(() => {
    loadProducts();
    loadStockOptions();
  }, []);

  useEffect(() => {
    if (!selectedProduct) {
      setNotes('');
      setIngredients([]);
      return;
    }
    setStatus(null);
    setLoadingRecipe(true);
    const fetchRecipe = async () => {
      try {
        const res = await fetch(`${API_BASE}/product-costs/${encodeURIComponent(selectedProduct)}`, { headers: authHeaders() });
        if (res.status === 404) {
          setNotes('');
          setIngredients([]);
          return;
        }
        if (!res.ok) {
          throw new Error('Tarif alınamadı');
        }
        const data = await res.json();
        setNotes(data?.notes || '');
        const mapped = Array.isArray(data?.ingredients)
          ? data.ingredients.map((row) => ({
              key: `${row.stock_code_id}-${row.id ?? Math.random().toString(36).slice(2)}`,
              stock_code_id: row.stock_code_id,
              stock_code: row.stock_code || '—',
              stock_name: row.stock_name || 'Tanımsız',
              brand: row.brand || '',
              unit: row.unit || '',
              quantity: row.quantity !== undefined && row.quantity !== null ? String(row.quantity) : '',
              unit_cost_override: row.unit_cost_override !== null && row.unit_cost_override !== undefined ? String(row.unit_cost_override) : '',
              default_unit_cost: row.default_unit_cost !== undefined && row.default_unit_cost !== null ? Number(row.default_unit_cost) : 0,
              avg_unit_cost: row.avg_unit_cost !== undefined && row.avg_unit_cost !== null ? Number(row.avg_unit_cost) : null,
              latest_unit_cost: row.latest_unit_cost !== undefined && row.latest_unit_cost !== null ? Number(row.latest_unit_cost) : null,
            }))
          : [];
        setIngredients(mapped);
      } catch (err) {
        console.error(err);
        setStatus({ type: 'error', message: 'Tarif bilgisi alınamadı.' });
        setNotes('');
        setIngredients([]);
      } finally {
        setLoadingRecipe(false);
      }
    };
    fetchRecipe();
  }, [selectedProduct]);

  const selectedProductInfo = useMemo(() => {
    return products.find((p) => p.name === selectedProduct) || null;
  }, [products, selectedProduct]);

  const totalCost = useMemo(() => {
    return ingredients.reduce((sum, item) => sum + computeLineTotal(item), 0);
  }, [ingredients]);

  const profitEstimate = useMemo(() => {
    if (!selectedProductInfo) return null;
    return selectedProductInfo.price - totalCost;
  }, [selectedProductInfo, totalCost]);

  async function loadProducts() {
    try {
      const res = await fetch(`${API_BASE}/product-prices`, { headers: authHeaders() });
      if (!res.ok) {
        throw new Error('Ürün verisi alınamadı');
      }
      const data = await res.json();
      const latestByName = new Map();
      data.forEach((item) => {
        if (!item || !item.product_name) return;
        const existing = latestByName.get(item.product_name);
        if (!existing) {
          latestByName.set(item.product_name, item);
          return;
        }
        const currentDate = new Date(item.effective_date);
        const prevDate = new Date(existing.effective_date);
        if (currentDate > prevDate) {
          latestByName.set(item.product_name, item);
        }
      });
      const list = Array.from(latestByName.values())
        .map((item) => ({
          name: item.product_name,
          price: Number(item.price) || 0,
          category: item.category,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setProducts(list);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Ürün listesi alınamadı.' });
    }
  }

  async function loadStockOptions() {
    try {
      const res = await fetch(`${API_BASE}/product-costs/ingredients`, { headers: authHeaders() });
      if (!res.ok) {
        throw new Error('Stok maliyetleri alınamadı');
      }
      const data = await res.json();
      setStockOptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Stok maliyetleri alınamadı.' });
    }
  }

  const handleIngredientChange = (index, field, value) => {
    setIngredients((prev) => prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const handleRemoveIngredient = (index) => {
    setIngredients((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddIngredient = () => {
    if (!newIngredientId) {
      setStatus({ type: 'error', message: 'Lütfen stok kalemi seçin.' });
      return;
    }
    const option = stockOptions.find((opt) => String(opt.id ?? opt.stock_code_id) === String(newIngredientId));
    if (!option) {
      setStatus({ type: 'error', message: 'Stok kalemi bulunamadı.' });
      return;
    }
    const quantity = parsePositive(newQuantity || '');
    if (!quantity) {
      setStatus({ type: 'error', message: 'Miktar pozitif bir sayı olmalıdır.' });
      return;
    }
    let override = '';
    if (newOverride !== null && newOverride !== undefined && newOverride !== '') {
      const parsed = Number(newOverride);
      if (Number.isNaN(parsed)) {
        setStatus({ type: 'error', message: 'Manuel maliyet sayısal olmalıdır.' });
        return;
      }
      override = String(parsed);
    }
    setIngredients((prev) => {
      const stockId = option.id ?? option.stock_code_id;
      const existingIndex = prev.findIndex((row) => row.stock_code_id === stockId);
      if (existingIndex >= 0) {
        const copy = [...prev];
        const currentValue = Number(copy[existingIndex].quantity) || 0;
        copy[existingIndex] = {
          ...copy[existingIndex],
          quantity: String(currentValue + quantity),
          unit_cost_override: override,
        };
        return copy;
      }
      return [
        ...prev,
        {
          key: `${stockId}-${Date.now()}`,
          stock_code_id: stockId,
          stock_code: option.stock_code,
          stock_name: option.product_name,
          brand: option.brand || '',
          unit: option.unit || '',
          quantity: String(quantity),
          unit_cost_override: override,
          default_unit_cost: option.default_cost !== undefined && option.default_cost !== null ? Number(option.default_cost) : 0,
          avg_unit_cost: option.avg_cost !== undefined && option.avg_cost !== null ? Number(option.avg_cost) : null,
          latest_unit_cost: option.latest_cost !== undefined && option.latest_cost !== null ? Number(option.latest_cost) : null,
        },
      ];
    });
    setNewIngredientId('');
    setNewQuantity('');
    setNewOverride('');
    setStatus(null);
  };

  const handleSave = async () => {
    if (!selectedProduct) {
      setStatus({ type: 'error', message: 'Lütfen ürün seçin.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        notes,
        ingredients: ingredients.map((row) => ({
          stock_code_id: row.stock_code_id,
          quantity: Number(row.quantity) || 0,
          unit_cost_override:
            row.unit_cost_override !== '' && row.unit_cost_override !== null && row.unit_cost_override !== undefined
              ? Number(row.unit_cost_override)
              : null,
        })),
      };
      const res = await fetch(`${API_BASE}/product-costs/${encodeURIComponent(selectedProduct)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Kayıt başarısız');
      }
      const data = await res.json();
      setNotes(data?.notes || '');
      const mapped = Array.isArray(data?.ingredients)
        ? data.ingredients.map((row) => ({
            key: `${row.stock_code_id}-${row.id ?? Math.random().toString(36).slice(2)}`,
            stock_code_id: row.stock_code_id,
            stock_code: row.stock_code || '—',
            stock_name: row.stock_name || 'Tanımsız',
            brand: row.brand || '',
            unit: row.unit || '',
            quantity: row.quantity !== undefined && row.quantity !== null ? String(row.quantity) : '',
            unit_cost_override: row.unit_cost_override !== null && row.unit_cost_override !== undefined ? String(row.unit_cost_override) : '',
            default_unit_cost: row.default_unit_cost !== undefined && row.default_unit_cost !== null ? Number(row.default_unit_cost) : 0,
            avg_unit_cost: row.avg_unit_cost !== undefined && row.avg_unit_cost !== null ? Number(row.avg_unit_cost) : null,
            latest_unit_cost: row.latest_unit_cost !== undefined && row.latest_unit_cost !== null ? Number(row.latest_unit_cost) : null,
          }))
        : [];
      setIngredients(mapped);
      setStatus({ type: 'success', message: 'Maliyet bilgisi kaydedildi.' });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Maliyet bilgisi kaydedilemedi.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white rounded p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Maliyet Hesaplama</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Ürün</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={selectedProduct}
              onChange={(event) => setSelectedProduct(event.target.value)}
            >
              <option value="">Ürün seçin</option>
              {products.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {selectedProductInfo && (
            <div className="bg-slate-50 border border-slate-200 rounded p-3">
              <div className="text-sm text-slate-600">Satış Fiyatı</div>
              <div className="text-lg font-semibold">{formatCurrency(selectedProductInfo.price)}</div>
              <div className="mt-2 text-sm text-slate-600">Hesaplanan Maliyet</div>
              <div className="text-lg font-semibold">{formatCurrency(totalCost)}</div>
              {profitEstimate !== null && (
                <div className={`mt-2 text-sm font-semibold ${profitEstimate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Tahmini Kâr: {formatCurrency(profitEstimate)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {status && (
        <div
          className={`rounded px-4 py-2 ${status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
        >
          {status.message}
        </div>
      )}

      {selectedProduct && (
        <div className="bg-white rounded p-4 shadow-sm space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">Notlar</label>
            <textarea
              className="border rounded px-3 py-2 w-full"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Tarifle ilgili açıklamalar"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">İçindekiler</h3>
              <div className="text-sm text-slate-500">Manuel maliyet boş bırakılırsa son alım değeri kullanılır.</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <select
                className="border rounded px-3 py-2"
                value={newIngredientId}
                onChange={(event) => setNewIngredientId(event.target.value)}
              >
                <option value="">Stok kalemi seçin</option>
                {stockOptions.map((opt) => (
                  <option key={opt.id ?? opt.stock_code_id} value={opt.id ?? opt.stock_code_id}>
                    {opt.stock_code} - {opt.product_name}{opt.brand ? ` (${opt.brand})` : ''} [{opt.unit}]
                  </option>
                ))}
              </select>
              <input
                className="border rounded px-3 py-2"
                placeholder="Miktar"
                value={newQuantity}
                onChange={(event) => setNewQuantity(event.target.value)}
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Manuel birim maliyeti"
                value={newOverride}
                onChange={(event) => setNewOverride(event.target.value)}
              />
              <button
                onClick={handleAddIngredient}
                className="px-4 py-2 bg-blue-600 text-white rounded"
                type="button"
              >
                Kalem Ekle
              </button>
            </div>

            {loadingRecipe ? (
              <div className="text-sm text-slate-500">Tarif yükleniyor...</div>
            ) : ingredients.length === 0 ? (
              <div className="text-sm text-slate-500">Bu ürün için henüz tarif eklenmemiş.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2">Stok</th>
                      <th className="py-2">Miktar</th>
                      <th className="py-2">Varsayılan Maliyet</th>
                      <th className="py-2">Manuel Maliyet</th>
                      <th className="py-2">Satır Toplamı</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((row, idx) => {
                      const defaultCost = row.latest_unit_cost !== null && row.latest_unit_cost !== undefined
                        ? row.latest_unit_cost
                        : row.default_unit_cost;
                      const lineTotal = computeLineTotal(row);
                      return (
                        <tr key={row.key || `${row.stock_code_id}-${idx}`} className="border-t">
                          <td className="py-2 align-top">
                            <div className="font-medium">{row.stock_code}</div>
                            <div className="text-xs text-slate-500">{row.stock_name}{row.brand ? ` (${row.brand})` : ''}</div>
                            <div className="text-xs text-slate-400 mt-1">
                              Varsayılan: {formatCurrency(defaultCost)}{' '}
                              {row.avg_unit_cost !== null && (
                                <span className="ml-1">(Ortalama: {formatCurrency(row.avg_unit_cost)})</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 align-top">
                            <div className="flex items-center gap-2">
                              <input
                                className="border rounded px-2 py-1 w-24"
                                value={row.quantity}
                                onChange={(event) => handleIngredientChange(idx, 'quantity', event.target.value)}
                              />
                              <span className="text-xs text-slate-500">{row.unit}</span>
                            </div>
                          </td>
                          <td className="py-2 align-top">
                            <div>{formatCurrency(defaultCost)}</div>
                            {row.avg_unit_cost !== null && (
                              <div className="text-xs text-slate-500">Ortalama: {formatCurrency(row.avg_unit_cost)}</div>
                            )}
                          </td>
                          <td className="py-2 align-top">
                            <input
                              className="border rounded px-2 py-1 w-28"
                              value={row.unit_cost_override}
                              onChange={(event) => handleIngredientChange(idx, 'unit_cost_override', event.target.value)}
                              placeholder="Varsayılan"
                            />
                          </td>
                          <td className="py-2 align-top font-semibold">{formatCurrency(lineTotal)}</td>
                          <td className="py-2 align-top text-right">
                            <button
                              onClick={() => handleRemoveIngredient(idx)}
                              className="px-3 py-1 bg-red-500 text-white rounded"
                              type="button"
                            >
                              Sil
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
              type="button"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
