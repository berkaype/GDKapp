import React, { useEffect, useRef, useState } from 'react';
import { Settings, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '../utils/format.js';
import { getApiBase } from '../utils/api.js';

const API_BASE = getApiBase();

export default function POS({ onAdminClick, onOrderClosed }) {
  const [activeOrders, setActiveOrders] = useState([]);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [customProduct, setCustomProduct] = useState({ name: '', price: '' });
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  const paymentInputRef = useRef(null);

  useEffect(() => {
    fetchActiveOrders();
    fetchProducts();
  }, []);

  const fetchActiveOrders = async () => {
    try {
      const r = await fetch(`${API_BASE}/orders?status=open`);
      if (r.ok) setActiveOrders(await r.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async () => {
    try {
      const r = await fetch(`${API_BASE}/product-prices`);
      if (r.ok) setProducts(await r.json());
    } catch (e) {
      console.error(e);
    }
  };

  const createOrder = async (tableNumber, orderType) => {
    try {
      const r = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: tableNumber, order_type: orderType, description: '' }),
      });
      if (r.ok) {
        const o = await r.json();
        setCurrentOrder({ ...o, items: [] });
        fetchActiveOrders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectOrder = async (id) => {
    try {
      const r = await fetch(`${API_BASE}/orders/${id}`);
      if (r.ok) setCurrentOrder(await r.json());
    } catch (e) {
      console.error(e);
    }
  };

  const addProductToOrder = async (product) => {
    if (!currentOrder) return;
    try {
      const r = await fetch(`${API_BASE}/orders/${currentOrder.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_name: product.product_name, quantity: 1, unit_price: product.price }),
      });
      if (r.ok) {
        selectOrder(currentOrder.id);
        fetchActiveOrders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateItemQuantity = async (itemId, quantity) => {
    if (!currentOrder) return;
    if (quantity <= 0) {
      deleteItem(itemId);
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/orders/${currentOrder.id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      if (r.ok) {
        selectOrder(currentOrder.id);
        fetchActiveOrders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteItem = async (itemId) => {
    if (!currentOrder) return;
    try {
      const r = await fetch(`${API_BASE}/orders/${currentOrder.id}/items/${itemId}`, { method: 'DELETE' });
      if (r.ok) {
        selectOrder(currentOrder.id);
        fetchActiveOrders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const closeOrder = async () => {
    if (!currentOrder || !paymentAmount) return;
    const payment = parseFloat(paymentAmount);
    const changeAmount = payment - currentOrder.total_amount;
    if (changeAmount < 0) {
      alert('Ödeme tutarı yetersiz!');
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/orders/${currentOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_amount: currentOrder.total_amount,
          payment_received: payment,
          change_given: changeAmount,
          is_closed: true,
        }),
      });
      if (r.ok) {
        setCurrentOrder(null);
        setPaymentAmount('');
        setShowPayment(false);
        fetchActiveOrders();
        if (onOrderClosed) onOrderClosed();
        alert(`Adisyon kapatıldı! Para üstü: ${formatCurrency(changeAmount)}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const cancelOrder = async () => {
    if (!currentOrder) return;
    if (!confirm('Bu adisyonu iptal etmek istediğinizden emin misiniz?')) return;
    try {
      const r = await fetch(`${API_BASE}/orders/${currentOrder.id}`, { method: 'DELETE' });
      if (r.ok) {
        setCurrentOrder(null);
        fetchActiveOrders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePaymentInputChange = (raw) => {
    let next = (raw ?? '').replace(',', '.');
    if (!next) {
      setPaymentAmount('');
      return;
    }
    if (next === '.') {
      setPaymentAmount('0.');
      return;
    }
    if (/^[0-9]*\.?[0-9]*$/.test(next)) {
      setPaymentAmount(next);
    }
  };

  const addCustomProduct = async () => {
    if (!currentOrder || !customProduct.name || !customProduct.price) return;
    try {
      const r = await fetch(`${API_BASE}/orders/${currentOrder.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: customProduct.name,
          quantity: 1,
          unit_price: parseFloat(customProduct.price),
        }),
      });
      if (r.ok) {
        setCustomProduct({ name: '', price: '' });
        setShowCustomProduct(false);
        selectOrder(currentOrder.id);
        fetchActiveOrders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!currentOrder) return;

    const handleKeyDown = (event) => {
      const target = event.target;
      const editableTarget =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (editableTarget && target !== paymentInputRef.current) {
        return;
      }

      const isEnter = event.key === 'Enter' || event.code === 'NumpadEnter';
      if (isEnter) {
        event.preventDefault();
        if (!showPayment) {
          setShowPayment(true);
        } else {
          closeOrder();
        }
        return;
      }

      let key = event.key;
      if (event.code && event.code.startsWith('Numpad')) {
        if (event.key === 'Enter') {
          return;
        }
        if (event.key === 'Decimal') {
          key = '.';
        }
      }

      if (key === 'Decimal') {
        key = '.';
      }

      if (/^[0-9]$/.test(key) || key === '.' || key === ',') {
        const digit = key === ',' ? '.' : key;
        event.preventDefault();
        setShowPayment(true);
        setPaymentAmount((prev) => {
          const base = showPayment ? prev : '';
          const current = base || '';
          if (digit === '.') {
            if (!current) return '0.';
            if (current.includes('.')) return current;
            return `${current}.`;
          }
          if (!current || current === '0') {
            return digit;
          }
          return `${current}${digit}`;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentOrder, showPayment, closeOrder]);

  useEffect(() => {
    if (showPayment && paymentInputRef.current) {
      const el = paymentInputRef.current;
      el.focus();
      try {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch (err) {
        // ignore if selection APIs are unavailable
      }
    }
  }, [showPayment, paymentAmount]);

  const grouped = products.reduce((acc, product) => {
    (acc[product.category] ||= []).push(product);
    return acc;
  }, {});

  const change = paymentAmount ? parseFloat(paymentAmount) - (currentOrder?.total_amount || 0) : 0;
  const tables = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-80 bg-white shadow-lg">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Masalar</h2>
            <button onClick={onAdminClick} className="p-2 text-gray-600 hover:text-blue-600">
              <Settings className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {tables.map((n) => {
              const tableOrder = activeOrders.find(
                (o) => o.order_type === 'table' && o.table_number === n
              );
              return (
                <button
                  key={n}
                  onClick={() => (tableOrder ? selectOrder(tableOrder.id) : createOrder(n, 'table'))}
                  className={`p-3 rounded-lg text-sm font-medium ${
                    tableOrder
                      ? 'bg-red-100 text-red-800 border-2 border-red-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Masa {n}
                  {tableOrder && (
                    <div className="text-xs mt-1">{formatCurrency(tableOrder.total_amount)}</div>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => createOrder(null, 'takeaway')}
            className="w-full p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Paket Servis
          </button>
        </div>
        <div className="p-4">
          <h3 className="font-semibold mb-2">Paket Siparişler</h3>
          {activeOrders
            .filter((o) => o.order_type === 'takeaway')
            .map((o) => (
              <button
                key={o.id}
                onClick={() => selectOrder(o.id)}
                className="w-full p-2 bg-green-100 text-green-800 rounded-lg text-left text-sm mb-2"
              >
                Paket #{o.takeaway_seq || o.id} - {formatCurrency(o.total_amount)}
              </button>
            ))}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {!currentOrder ? (
          <div className="text-center py-20">
            <ShoppingCart className="mx-auto text-gray-400 mb-4 h-12 w-12" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Adisyon Seç</h3>
            <p className="text-gray-600">Başlamak için bir masa seçin</p>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                {currentOrder.order_type === 'table'
                  ? `Masa ${currentOrder.table_number}`
                  : `Paket #${currentOrder.takeaway_seq ?? currentOrder.id}`}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCustomProduct(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Diğer Ürün
                </button>
                <button
                  onClick={cancelOrder}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Adisyon İptal
                </button>
              </div>
            </div>
            <div className="space-y-6">
              {Object.entries(grouped).map(([category, list]) => (
                <div key={category}>
                  <h3 className="text-lg font-semibold mb-3">{category}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {list
                      .slice()
                      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addProductToOrder(p)}
                          className="p-4 bg-blue-100 hover:bg-blue-200 rounded-lg text-center"
                        >
                          <div className="font-medium text-sm mb-1">{p.product_name}</div>
                          <div className="text-blue-600 font-semibold">{formatCurrency(p.price)}</div>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {currentOrder && (
        <div className="w-80 bg-white shadow-lg">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold">Adisyon</h3>
          </div>
          <div className="flex-1 p-4 overflow-y-auto max-h-96">
            {!currentOrder.items?.length ? (
              <p className="text-gray-500 text-center py-8">Ürün eklenmedi</p>
            ) : (
              <div className="space-y-2">
                {currentOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-2 border rounded">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{item.product_name}</div>
                      <div className="text-xs text-gray-600">
                        {formatCurrency(item.unit_price)} x {item.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                        className="w-6 h-6 bg-red-500 text-white rounded text-xs"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                        className="w-6 h-6 bg-green-500 text-white rounded text-xs"
                      >
                        +
                      </button>
                    </div>
                    <div className="font-semibold text-sm ml-2">{formatCurrency(item.total_price)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 border-t">
            <div className="mb-4 flex justify-between text-lg font-bold">
              <span>Toplam:</span>
              <span>{formatCurrency(currentOrder.total_amount)}</span>
            </div>
            {!showPayment ? (
              <button
                onClick={() => setShowPayment(true)}
                disabled={!currentOrder.items?.length}
                className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                Ödeme Al
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Alınan Para:</label>
                  <input
                    ref={paymentInputRef}
                    type="text"
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => handlePaymentInputChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="0"
                  />
                </div>
                {paymentAmount && (
                  <div
                    className={`text-center p-2 rounded ${
                      change >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    Para Üstü: {formatCurrency(change)}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowPayment(false);
                      setPaymentAmount('');
                    }}
                    className="flex-1 py-2 bg-gray-500 text-white rounded-lg"
                  >
                    İptal
                  </button>
                  <button
                    onClick={closeOrder}
                    disabled={!paymentAmount || change < 0}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg disabled:bg-gray-400"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCustomProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-xl font-semibold mb-4">Diğer Ürün</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={customProduct.name}
                onChange={(e) => setCustomProduct({ ...customProduct, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Ürün adı"
              />
              <input
                type="number"
                value={customProduct.price}
                onChange={(e) => setCustomProduct({ ...customProduct, price: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Fiyat"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCustomProduct(false)}
                  className="flex-1 py-2 bg-gray-500 text-white rounded-lg"
                >
                  İptal
                </button>
                <button
                  onClick={addCustomProduct}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg"
                >
                  Ekle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
