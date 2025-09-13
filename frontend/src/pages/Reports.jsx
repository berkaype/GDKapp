import React, { useEffect, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

export default function Reports() {
  const [data, setData] = useState({ revenue:0, personnel:0, expenses:0, stock:0 });
  useEffect(()=>{ (async()=>{
    try{
      const rev = await (await fetch(`${API_BASE}/daily-revenue`)).json();
      const pers = await (await fetch(`${API_BASE}/personnel`, { headers: authHeaders() })).json();
      const exp = await (await fetch(`${API_BASE}/business-expenses`, { headers: authHeaders() })).json();
      const stk = await (await fetch(`${API_BASE}/stock-purchases`, { headers: authHeaders() })).json();
      const personnel = pers.reduce((s,x)=>s+x.salary+x.sgk_cost,0);
      const expenses = exp.reduce((s,x)=>s+x.amount,0);
      const stock = stk.reduce((s,x)=>s+x.total_price,0);
      setData({ revenue: rev.daily_revenue||0, personnel, expenses, stock });
    }catch(e){ console.error(e); }
  })(); },[]);
  const totalCosts = data.personnel + data.expenses + data.stock;
  const net = data.revenue - totalCosts;
  return (
    <div className="p-6"><div className="bg-white rounded p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Ciro ve Net Kâr Raporu</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div><div className="text-gray-600">Günlük Ciro</div><div className="text-2xl font-bold text-green-600">{formatCurrency(data.revenue)}</div></div>
        <div><div className="text-gray-600">Personel</div><div className="text-2xl font-bold text-orange-600">{formatCurrency(data.personnel)}</div></div>
        <div><div className="text-gray-600">İşletme Giderleri</div><div className="text-2xl font-bold text-red-600">{formatCurrency(data.expenses)}</div></div>
        <div><div className="text-gray-600">Stok</div><div className="text-2xl font-bold text-blue-600">{formatCurrency(data.stock)}</div></div>
      </div>
      <div className="mt-6"><div className="text-gray-600">Net Kâr</div><div className={`text-3xl font-bold ${net>=0?'text-green-700':'text-red-700'}`}>{formatCurrency(net)}</div></div>
    </div></div>
  );
}
