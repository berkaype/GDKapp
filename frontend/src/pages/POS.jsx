import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const [positionsLocked, setPositionsLocked] = useState(true);
  const [productOrder, setProductOrder] = useState({});
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState({});
  const paymentInputRef = useRef(null);

  const getProductKey = (product) => {
    const category = product?.category || 'Diğer';
    let identifier = product?.product_name;
    if (!identifier) {
      if (product?.id !== undefined && product?.id !== null) {
        identifier = `#${product.id}`;
      } else if (product?.name) {
        identifier = product.name;
      } else {
        identifier = '';
      }
    }
    return `${category}::${identifier}`;
  };
  const drinkCategoryTokens = ['icecek', 'içecek', 'icecekler', 'içecekler'];

  useEffect(() => {
    fetchActiveOrders();
    fetchProducts();
  }, []);

  useEffect(() => {
    try {
      const storedLock = localStorage.getItem('posPositionsLocked');
      if (storedLock !== null) {
        setPositionsLocked(JSON.parse(storedLock));
      }
      const storedOrder = localStorage.getItem('posProductOrder');
      if (storedOrder) {
        setProductOrder(JSON.parse(storedOrder));
      }
      const storedCategories = localStorage.getItem('posCategoryOrder');
      if (storedCategories) {
        setCategoryOrder(JSON.parse(storedCategories));
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('posPositionsLocked', JSON.stringify(positionsLocked));
    } catch (error) {
      console.error(error);
    }
  }, [positionsLocked]);

  useEffect(() => {
    try {
      localStorage.setItem('posProductOrder', JSON.stringify(productOrder));
    } catch (error) {
      console.error(error);
    }
  }, [productOrder]);


  useEffect(() => {
    try {
      localStorage.setItem('posCategoryOrder', JSON.stringify(categoryOrder));
    } catch (error) {
      console.error(error);
    }
  }, [categoryOrder]);

  useEffect(() => {
    if (!selectionMode) {
      return;
    }
    if (!currentOrder?.items?.length) {
      setSelectedItems((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    setSelectedItems((prev) => {
      let changed = false;
      const next = {};
      const itemsMap = new Map((currentOrder.items || []).map((item) => [String(item.id), item]));
      Object.entries(prev).forEach(([key, qty]) => {
        const item = itemsMap.get(key);
        if (!item) {
          changed = true;
          return;
        }
        const safeQty = Math.min(qty, item.quantity);
        if (!safeQty) {
          changed = true;
          return;
        }
        next[key] = safeQty;
        if (safeQty !== qty) {
          changed = true;
        }
      });
      return changed || Object.keys(next).length !== Object.keys(prev).length ? next : prev;
    });
  }, [selectionMode, currentOrder?.items]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedItems({});
    setShowPayment(false);
    setPaymentAmount('');
  }, [currentOrder?.id]);

  useEffect(() => {
    if (!products.length) {
      setCategoryOrder([]);
      return;
    }
    const groups = products.reduce((acc, product) => {
      const category = product.category || 'Diğer';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(product);
      return acc;
    }, {});

    setCategoryOrder((prev) => {
      const categories = Object.keys(groups);
      const filtered = prev.filter((category) => categories.includes(category));
      const appended = categories.filter((category) => !filtered.includes(category));
      const next = [...filtered, ...appended];
      if (next.length !== prev.length || next.some((category, index) => category !== prev[index])) {
        return next;
      }
      return prev;
    });

    setProductOrder((prev) => {
      const next = { ...prev };
      let changed = false;

      Object.entries(groups).forEach(([category, list]) => {
        const stableIds = list.map((item) => getProductKey(item));
        const aliasMap = new Map();

        list.forEach((item) => {
          const stableKey = getProductKey(item);
          aliasMap.set(stableKey, stableKey);
          if (item?.id !== undefined && item?.id !== null) {
            aliasMap.set(`${category}::${item.id}`, stableKey);
            aliasMap.set(`${category}::#${item.id}`, stableKey);
          }
          if (item?.product_name) {
            aliasMap.set(`${category}::${item.product_name}`, stableKey);
          }
        });

        const existing = next[category];
        if (!existing) {
          next[category] = stableIds;
          changed = true;
          return;
        }

        const normalized = [];
        existing.forEach((key) => {
          const normalizedKey = aliasMap.get(key) || key;
          if (!normalized.includes(normalizedKey) && stableIds.includes(normalizedKey)) {
            normalized.push(normalizedKey);
          }
        });

        stableIds.forEach((key) => {
          if (!normalized.includes(key)) {
            normalized.push(key);
          }
        });

        if (normalized.length !== existing.length || normalized.some((key, index) => key !== existing[index])) {
          next[category] = normalized;
          changed = true;
        }
      });

      Object.keys(next).forEach((category) => {
        if (!groups[category]) {
          delete next[category];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [products]);
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
      if (r.ok) {
        const data = await r.json();
        setCurrentOrder(data);
        return data;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
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
  if (Number.isNaN(payment)) {
    return;
  }


  if (selectionMode && hasSelection) {
    const selectedDetails = (currentOrder.items || []).map((item) => {
      const qty = selectedItems[String(item.id)];
      if (!qty) {
        return null;
      }
      const unitPrice = Number(item.unit_price ?? item.price ?? 0) || 0;
      return {
        item_id: item.id,
        product_name: item.product_name,
        quantity: qty,
        unit_price: unitPrice,
        total_price: unitPrice * qty,
      };
    }).filter(Boolean);
    if (!selectedDetails.length) {
      alert('\u00d6deme i\u00e7in \u00fcr\u00fcn se\u00e7ilmedi.');
      return;
    }
    const selectedSum = selectedDetails.reduce((sum, detail) => sum + detail.total_price, 0);
    const targetAmount = Math.round((selectedTotal || selectedSum) * 100) / 100;
    const changeAmount = Math.round((payment - targetAmount) * 100) / 100;
    if (changeAmount < 0) {
      alert('\u00d6deme tutar\u0131 yetersiz!');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/orders/${currentOrder.id}/partial-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedDetails,
          amount: targetAmount,
          payment,
          change: changeAmount,
          table_number: currentOrder.table_number ?? null,
          order_type: currentOrder.order_type ?? 'table',
          description: currentOrder.description || null,
        }),
      });
      if (!response.ok) {
        throw new Error('partial-payment-failed');
      }
      await settleSelectedItems();
      setPaymentAmount('');
      setShowPayment(false);
      setSelectedItems({});
      const updated = await selectOrder(currentOrder.id);
      await fetchActiveOrders();
      if (onOrderClosed) {
        onOrderClosed();
      }
      if (changeAmount > 0) {
        alert(`Se\u00e7ili \u00fcr\u00fcnler i\u00e7in \u00f6deme al\u0131nd\u0131! Para \u00fcst\u00fc: ${formatCurrency(changeAmount)}`);
      } else {
        alert('Se\u00e7ili \u00fcr\u00fcnler i\u00e7in \u00f6deme al\u0131nd\u0131!');
      }
      if (!updated?.items?.length) {
        setCurrentOrder(null);
      }
    } catch (error) {
      console.error(error);
      alert('Se\u00e7ili \u00fcr\u00fcnler i\u00e7in \u00f6deme al\u0131namad\u0131');
    }
    return;
  }

  const changeAmount = payment - (currentOrder.total_amount || 0);
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

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedItems({});
      }
      setShowPayment(false);
      setPaymentAmount('');
      return next;
    });
  };

  const toggleItemSelection = (item) => {
    const key = String(item.id);
    setSelectedItems((prev) => {
      if (prev[key]) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      const maxQty = item.quantity ?? 0;
      if (maxQty <= 0) {
        return prev;
      }
      return { ...prev, [key]: maxQty };
    });
  };

  const adjustSelectedItemQuantity = (item, delta) => {
    const key = String(item.id);
    setSelectedItems((prev) => {
      const totalAvailable = item.quantity ?? 0;
      if (totalAvailable <= 0) {
        if (!prev[key]) {
          return prev;
        }
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      const current = prev[key] ?? totalAvailable;
      const nextQty = Math.min(totalAvailable, Math.max(0, current + delta));
      if (nextQty <= 0) {
        if (!prev[key]) {
          return prev;
        }
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      if (nextQty === current) {
        return prev;
      }
      return { ...prev, [key]: nextQty };
    });
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

  const isDrinkCategory = (category) => {
    if (!category) return false;
    const normalized = category.toLocaleLowerCase('tr-TR');
    return drinkCategoryTokens.some((token) => normalized.includes(token));
  };

  const getOrderedProducts = (category, list) => {
    const order = productOrder[category];
    if (!order || !Array.isArray(order) || !order.length) {
      return [...list];
    }
    const map = new Map();
    const used = new Set();

    list.forEach((item) => {
      const stableKey = getProductKey(item);
      map.set(stableKey, item);
      if (item?.id !== undefined && item?.id !== null) {
        map.set(`${category}::${item.id}`, item);
        map.set(`${category}::#${item.id}`, item);
      }
      if (item?.product_name) {
        map.set(`${category}::${item.product_name}`, item);
      }
    });

    const ordered = [];
    order.forEach((savedKey) => {
      const item = map.get(savedKey);
      if (item) {
        const stableKey = getProductKey(item);
        if (!used.has(stableKey)) {
          ordered.push(item);
          used.add(stableKey);
        }
      }
    });

    list.forEach((item) => {
      const stableKey = getProductKey(item);
      if (!used.has(stableKey)) {
        ordered.push(item);
        used.add(stableKey);
      }
    });

    return ordered;
  };

  const handleMoveCategory = (category, direction) => {
    setCategoryOrder((prev) => {
      const index = prev.indexOf(category);
      if (index === -1) {
        return prev;
      }
      const target = index + direction;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };


  const settleSelectedItems = async () => {
    if (!currentOrder || !Object.keys(selectedItems).length) {
      return;
    }
    const itemsMap = new Map((currentOrder.items || []).map((item) => [String(item.id), item]));
    for (const [itemId, qty] of Object.entries(selectedItems)) {
      const item = itemsMap.get(itemId);
      if (!item) {
        continue;
      }
      const remaining = (item.quantity ?? 0) - qty;
      const endpoint = `${API_BASE}/orders/${currentOrder.id}/items/${item.id}`;
      if (remaining <= 0) {
        const response = await fetch(endpoint, { method: 'DELETE' });
        if (!response.ok) {
          throw new Error('failed-to-remove-item');
        }
      } else {
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: remaining }),
        });
        if (!response.ok) {
          throw new Error('failed-to-update-item');
        }
      }
    }
  };


  const handleMoveProduct = (category, orderedKeys, productKey, direction) => {
    setProductOrder((prev) => {
      const existing = prev[category] ? prev[category].filter((id) => orderedKeys.includes(id)) : [...orderedKeys];
      orderedKeys.forEach((id) => {
        if (!existing.includes(id)) {
          existing.push(id);
        }
      });
      const index = existing.indexOf(productKey);
      if (index === -1) {
        return prev;
      }
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= existing.length) {
        return prev;
      }
      const updated = existing.slice();
      const temp = updated[index];
      updated[index] = updated[newIndex];
      updated[newIndex] = temp;
      return { ...prev, [category]: updated };
    });
  };

  const togglePositionLock = () => {
    setPositionsLocked((prev) => !prev);
  };


  const renderCategory = (category, list, isDrink, position) => {
    const orderedList = getOrderedProducts(category, list);
    const orderedKeys = orderedList.map((product) => getProductKey(product));
    const gridClasses = isDrink
      ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
      : 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3';
    const canMoveUp = position ? position.index > 0 : false;
    const canMoveDown = position ? position.index < position.last : false;

    return (
      <div key={category}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{category}</h3>
            {!positionsLocked && (
              <div className="flex flex-col rounded bg-white/90 shadow-sm">
                <button
                  type="button"
                  className="text-xs px-1 py-0.5 hover:text-blue-600 disabled:text-gray-300"
                  disabled={!canMoveUp}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleMoveCategory(category, -1);
                  }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="text-xs px-1 py-0.5 hover:text-blue-600 disabled:text-gray-300"
                  disabled={!canMoveDown}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleMoveCategory(category, 1);
                  }}
                >
                  ▼
                </button>
              </div>
            )}
          </div>
          {!positionsLocked && (
            <span className="text-xs text-gray-500">Sıralamak için okları kullanın</span>
          )}
        </div>
        <div className={gridClasses}>
          {orderedList.map((product, index) => {
            const productKey = orderedKeys[index];
            return (
              <div key={productKey} className="relative">
                <button
                  onClick={() => addProductToOrder(product)}
                  className="w-full p-4 bg-blue-100 hover:bg-blue-200 rounded-lg text-center h-full flex flex-col justify-between"
                >
                  <div className="font-medium text-sm mb-1">{product.product_name}</div>
                  <div className="text-blue-600 font-semibold">{formatCurrency(product.price)}</div>
                </button>
                {!positionsLocked && (
                  <div className="absolute top-2 right-2 flex flex-col rounded bg-white/90 shadow">
                    <button
                      type="button"
                      className="text-xs px-1 py-0.5 hover:text-blue-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleMoveProduct(category, orderedKeys, productKey, -1);
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="text-xs px-1 py-0.5 hover:text-blue-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleMoveProduct(category, orderedKeys, productKey, 1);
                      }}
                    >
                      ▼
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const grouped = products.reduce((acc, product) => {
    const category = product.category || 'Diğer';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {});
  const categories = Object.keys(grouped);
  const orderedCategoryNames = categoryOrder.length
    ? categoryOrder.filter((category) => grouped[category])
    : [];
  const orderedCategories = [
    ...orderedCategoryNames,
    ...categories.filter((category) => !orderedCategoryNames.includes(category)),
  ];
  const categoryPositions = new Map(
    orderedCategories.map((category, index) => [category, { index, last: orderedCategories.length - 1 }])
  );
  const orderedEntries = orderedCategories.map((category) => [category, grouped[category]]);
  const foodGroups = orderedEntries.filter(([category]) => !isDrinkCategory(category));
  const drinkGroups = orderedEntries.filter(([category]) => isDrinkCategory(category));
  const layoutClass = drinkGroups.length ? 'flex flex-col lg:flex-row gap-6' : 'flex flex-col gap-6';
  const foodColumnClass = drinkGroups.length ? 'space-y-6 lg:w-2/3' : 'space-y-6 w-full';

  const selectedTotal = useMemo(() => {
    if (!selectionMode || !currentOrder?.items?.length) {
      return 0;
    }
    return currentOrder.items.reduce((sum, item) => {
      const qty = selectedItems[String(item.id)] || 0;
      if (!qty) {
        return sum;
      }
      const unit = parseFloat(item.unit_price ?? item.price ?? 0) || 0;
      return sum + unit * qty;
    }, 0);
  }, [selectionMode, selectedItems, currentOrder?.items]);

  const hasSelection = selectionMode && Object.keys(selectedItems).length > 0;
  const canStartPayment = Boolean(currentOrder?.items?.length) && (!selectionMode || hasSelection);
  const paymentTarget = hasSelection ? selectedTotal : currentOrder?.total_amount || 0;
  const paymentButtonLabel = selectionMode && hasSelection ? 'Seçili Ödeme Al' : 'Ödeme Al';
  const paymentConfirmLabel = selectionMode && hasSelection ? 'Tahsil Et' : 'Kapat';
  const paymentValue = paymentAmount ? parseFloat(paymentAmount) : 0;
  const change = paymentAmount ? paymentValue - paymentTarget : 0;
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
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={togglePositionLock}
                  className={`px-4 py-2 rounded-lg border ${positionsLocked ? 'border-gray-300 text-gray-600' : 'border-blue-500 text-blue-600 bg-blue-50'}`}
                >
                  {positionsLocked ? 'Pozisyon Kilidini Aç' : 'Pozisyon Kilidini Kilitle'}
                </button>
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
              <div className={layoutClass}>
                <div className={foodColumnClass}>
                  {foodGroups.length > 0
                    ? foodGroups.map(([category, list]) => renderCategory(category, list, false, categoryPositions.get(category)))
                    : <div className="text-sm text-gray-500">Gösterilecek ürün bulunamadı.</div>}
                </div>
                {drinkGroups.length > 0 && (
                  <div className="space-y-6 lg:w-1/3">
                    {drinkGroups.map(([category, list]) => renderCategory(category, list, true, categoryPositions.get(category)))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {currentOrder && (
        <div className="w-80 bg-white shadow-lg">

<div className="p-4 border-b flex items-center justify-between">
  <h3 className="text-lg font-semibold">Adisyon</h3>
  {currentOrder.items?.length ? (
    <button
      onClick={toggleSelectionMode}
      className={`text-sm px-3 py-1 rounded border ${selectionMode ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
    >
      {selectionMode ? 'Tüm Adisyon' : 'Parça Ödeme'}
    </button>
  ) : null}
</div>

          <div className="flex-1 p-4 overflow-y-auto max-h-96">
            {!currentOrder.items?.length ? (
              <p className="text-gray-500 text-center py-8">Ürün eklenmedi</p>
            ) : (

              <div className="space-y-2">
                {currentOrder.items.map((item) => {
                  const itemKey = String(item.id);
                  const isSelected = !!selectedItems[itemKey];
                  const selectedQty = selectedItems[itemKey] || 0;
                  return (
                    <div
                      key={item.id}
                      onClick={() => { if (selectionMode) { toggleItemSelection(item); } }}
                      className={`p-2 border rounded transition-colors ${selectionMode ? 'cursor-pointer' : ''} ${selectionMode && isSelected ? 'border-green-500 bg-green-200 bg-opacity-70' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {selectionMode && (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={isSelected}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleItemSelection(item);
                            }}
                          />
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.product_name}</div>
                          <div className="text-xs text-gray-600">
                            {formatCurrency(item.unit_price)} x {item.quantity}
                          </div>
                          {selectionMode && isSelected && (
                            <div className="mt-1 text-xs text-gray-600">
                              Seçili: {selectedQty} adet
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(event) => { event.stopPropagation(); updateItemQuantity(item.id, item.quantity - 1); }}
                            className="w-6 h-6 bg-red-500 text-white rounded text-xs"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm">{item.quantity}</span>
                          <button
                            onClick={(event) => { event.stopPropagation(); updateItemQuantity(item.id, item.quantity + 1); }}
                            className="w-6 h-6 bg-green-500 text-white rounded text-xs"
                          >
                            +
                          </button>
                        </div>
                        <div className="font-semibold text-sm ml-2">{formatCurrency(item.total_price)}</div>
                      </div>
                      {selectionMode && isSelected && item.quantity > 1 && (
                        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-gray-600">
                          <span>Seçili adet:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100"
                              onClick={(event) => { event.stopPropagation(); adjustSelectedItemQuantity(item, -1); }}
                            >
                              -
                            </button>
                            <span className="w-10 text-center">{selectedQty}</span>
                            <button
                              type="button"
                              className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100"
                              onClick={(event) => { event.stopPropagation(); adjustSelectedItemQuantity(item, 1); }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="p-4 border-t">
            <div className="mb-2 flex justify-between text-sm text-gray-600">
              <span>Adisyon Toplamı:</span>
              <span>{formatCurrency(currentOrder.total_amount)}</span>
            </div>
            {selectionMode && (
              <div className="mb-2 flex justify-between text-sm font-medium text-blue-600">
                <span>Seçilen Tutar:</span>
                <span>{formatCurrency(selectedTotal)}</span>
              </div>
            )}
            <div className="mb-4 flex justify-between text-lg font-bold">
              <span>Ödenecek Tutar:</span>
              <span>{formatCurrency(paymentTarget)}</span>
            </div>
            {!showPayment ? (
              <button
                onClick={() => { setPaymentAmount(''); setShowPayment(true); }}
                disabled={!canStartPayment}
                className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                {paymentButtonLabel}
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
                    disabled={!paymentAmount || change < 0 || paymentTarget <= 0}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg disabled:bg-gray-400"
                  >
                    {paymentConfirmLabel}
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
