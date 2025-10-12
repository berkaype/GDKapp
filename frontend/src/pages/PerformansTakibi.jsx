import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api.js';
import { formatCurrency } from '../utils/format.js';

const API_BASE = getApiBase();

const MON_SAT_CYCLE = ['Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
const HOURS_IN_DAY = 24;
const MINUTES_PER_DAY = HOURS_IN_DAY * 60;
const cycleLabelForIndex = (index) => MON_SAT_CYCLE[index % MON_SAT_CYCLE.length];

const shiftHourlyBuckets = (buckets = []) => {
  if (!Array.isArray(buckets)) {
    return [];
  }
  const offsetMinutes = new Date().getTimezoneOffset();
  const wrapMinutes = HOURS_IN_DAY * 60;
  const base = Array.from({ length: HOURS_IN_DAY }, (_, hour) => ({
    hour: String(hour).padStart(2, '0'),
    transactions: 0,
    itemsSold: 0,
  }));

  buckets.forEach((bucket) => {
    if (!bucket || typeof bucket !== 'object') {
      return;
    }
    const rawHour = Number.parseInt(String(bucket.hour ?? bucket.Hour ?? ''), 10);
    if (Number.isNaN(rawHour)) {
      return;
    }

    const bucketMinutes = rawHour * 60;
    let localMinutes = bucketMinutes - offsetMinutes;
    localMinutes %= wrapMinutes;
    if (localMinutes < 0) {
      localMinutes += wrapMinutes;
    }

    const localHour = Math.floor(localMinutes / 60);
    const items = Number(bucket.itemsSold ?? bucket.items_sold ?? 0);
    const transactions = Number(bucket.transactions ?? 0);
    base[localHour].itemsSold += Number.isFinite(items) ? items : 0;
    base[localHour].transactions += Number.isFinite(transactions) ? transactions : 0;
  });

  return base;
};

const parseISODate = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normaliseMonSatSeries = (series = []) => {
  if (!Array.isArray(series)) {
    return [];
  }
  const sorted = series
    .filter((entry) => entry && typeof entry === 'object')
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const filtered = sorted.filter((entry) => {
    const date = parseISODate(entry.date);
    return !date || date.getDay() !== 0;
  });

  return filtered.map((entry, index) => ({
    ...entry,
    cycleDay: cycleLabelForIndex(index),
  }));
};

const buildMonSatHeatmap = (rawMatrix = []) => {
  if (!Array.isArray(rawMatrix) || rawMatrix.length === 0) {
    return MON_SAT_CYCLE.map(() => Array.from({ length: HOURS_IN_DAY }, () => 0));
  }

  const days = rawMatrix.length;
  const offsetMinutes = new Date().getTimezoneOffset();
  const wrapMinutes = Math.max(1, days) * MINUTES_PER_DAY;
  const shifted = Array.from({ length: days }, () => Array.from({ length: HOURS_IN_DAY }, () => 0));

  for (let day = 0; day < days; day += 1) {
    for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
      const value = Number(rawMatrix?.[day]?.[hour] ?? 0);
      const utcMinutes = day * MINUTES_PER_DAY + hour * 60;
      let localMinutes = utcMinutes - offsetMinutes;
      localMinutes %= wrapMinutes;
      if (localMinutes < 0) {
        localMinutes += wrapMinutes;
      }

      const localDay = Math.floor(localMinutes / MINUTES_PER_DAY);
      const localHour = Math.floor((localMinutes % MINUTES_PER_DAY) / 60);
      if (shifted[localDay]) {
        shifted[localDay][localHour] = value;
      }
    }
  }

  const baseIndex = days >= 7 ? 1 : 0;
  const result = [];
  for (let i = 0; i < MON_SAT_CYCLE.length; i += 1) {
    const sourceIndex = (baseIndex + i) % days;
    const row = shifted[sourceIndex] || Array.from({ length: HOURS_IN_DAY }, () => 0);
    result.push([...row]);
  }

  return result;
};

function Section({ title, children, actions }) {
  return (
    <div className="bg-white rounded p-6 shadow-sm mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

function SimpleBarChart({ labels = [], series = [], colorClass = 'bg-blue-600', height = 220, yTitle, formatTick = (n) => n, ticks = 5 }) {
  const max = useMemo(() => {
    const m = series.reduce((acc, v) => (v > acc ? v : acc), 0);
    return m > 0 ? m : 1;
  }, [series]);
  const tickValues = useMemo(() => {
    const arr = [];
    for (let i = 0; i < ticks; i++) {
      const t = (i / (ticks - 1)) * max;
      arr.push(Math.round(t));
    }
    return arr;
  }, [max, ticks]);

  return (
    <div className="w-full">
      <div className="grid" style={{ gridTemplateColumns: '56px 1fr', gap: 8 }}>
        {/* Y Axis */}
        <div className="relative" style={{ height }}>
          <div className="absolute left-0 top-0 text-[10px] text-gray-500">{yTitle}</div>
          {tickValues.map((v, i) => {
            const y = (v / max) * (height - 8);
            return (
              <div key={i} className="absolute left-0 -translate-y-1/2 text-[10px] text-gray-600" style={{ bottom: `${y}px` }}>
                {formatTick(v)}
              </div>
            );
          })}
        </div>
        {/* Plot area */}
        <div className="relative w-full overflow-hidden rounded" style={{ height }}>
          <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(to top, rgba(0,0,0,0.06) 0 1px, transparent 1px 48px)' }} />
          <div className="relative z-10 h-full flex items-end gap-2 px-1">
            {series.map((v, idx) => (
              <div key={idx} className="flex-1 flex items-end justify-center">
                <div className={`${colorClass} w-full max-w-[18px] rounded-t`} style={{ height: Math.max(4, Math.round((v / max) * (height - 8))) }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {labels.length > 0 && (
        <div className="mt-2 text-[10px] text-gray-600 grid whitespace-pre-line" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
          {labels.map((l, i) => (
            <div key={i} className="text-center truncate leading-tight">{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleLineChart({ points = [], height = 220, color = '#2563eb', yTitle, formatTick = (n) => n, ticks = 5 }) {
  if (!points.length) {
    return null;
  }

  const safePoints = points.map((p, index) => ({
    ...p,
    y: Number(p?.y) || 0,
    label: p?.label ?? `#${index + 1}`
  }));

  const gridId = useMemo(() => `line-grid-${Math.random().toString(36).slice(2, 8)}`, []);

  const maxY = Math.max(0, ...safePoints.map((p) => p.y));
  const minY = Math.min(0, ...safePoints.map((p) => p.y));

  const padLeft = 12;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 32;
  const baseStep = 80;
  const baseWidth = 640;
  const h = height;
  const span = safePoints.length > 1 ? (safePoints.length - 1) * baseStep : baseStep;
  const w = Math.max(baseWidth, padLeft + padRight + span);
  const range = Math.max(1e-6, maxY - minY);

  const toX = (idx) => {
    if (safePoints.length === 1) {
      return w / 2;
    }
    return padLeft + (idx * (w - padLeft - padRight)) / (safePoints.length - 1);
  };

  const toY = (value) => {
    const scaled = (value - minY) / range;
    return h - padBottom - scaled * (h - padTop - padBottom);
  };

  const pathD = safePoints.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(idx)} ${toY(point.y)}`).join(' ');

  const tickVals = ticks > 1
    ? Array.from({ length: ticks }, (_, i) => minY + ((maxY - minY) * i) / (ticks - 1))
    : [minY];

  return (
    <div className="grid" style={{ gridTemplateColumns: '56px 1fr', gap: 8 }}>
      <div className="relative" style={{ height: h }}>
        <div className="absolute left-0 top-0 text-[10px] text-gray-500">{yTitle}</div>
        {tickVals.map((tick, idx) => (
          <div
            key={idx}
            className="absolute left-0 -translate-y-1/2 text-[10px] text-gray-600"
            style={{ bottom: `${((tick - minY) / range) * (h - padTop - padBottom)}px` }}
          >
            {formatTick(Math.round(tick))}
          </div>
        ))}
      </div>
      <div className="relative" style={{ height: h }}>
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="rounded border border-gray-200 bg-white">
          <defs>
            <pattern id={gridId} width="1" height="48" patternUnits="userSpaceOnUse">
              <rect width="100%" height="1" fill="rgba(0,0,0,0.06)" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={w} height={h} fill={`url(#${gridId})`} />
          <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {safePoints.map((point, idx) => (
            <g key={idx}>
              <circle cx={toX(idx)} cy={toY(point.y)} r={3.5} fill={color} />
              <text
                x={toX(idx)}
                y={h - padBottom + 18}
                textAnchor="middle"
                fontSize="10"
                fill="#4b5563"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function PieChart({ slices = [], size = 200 }) {
  // slices: [{ label, value, color }]
  const total = slices.reduce((a, s) => a + (s.value || 0), 0) || 1;
  let acc = 0;
  const gradients = slices.map((s, i) => {
    const start = (acc / total) * 360;
    acc += s.value || 0;
    const end = (acc / total) * 360;
    return `${s.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
  });
  const bg = `conic-gradient(${gradients.join(', ')})`;
  return (
    <div className="flex items-center gap-6">
      <div className="rounded-full" style={{ width: size, height: size, background: bg }} />
      <div className="space-y-1 text-sm">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-gray-700">{s.label}</span>
            <span className="ml-auto font-semibold">{(total > 0 ? ((s.value / total) * 100) : 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ matrix, dayLabels = [] }) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const labels = Array.isArray(dayLabels) && dayLabels.length === rows.length
    ? dayLabels
    : rows.map((_, idx) => cycleLabelForIndex(idx));

  const flatMax = Math.max(0, ...rows.flat());
  const toColor = (v) => {
    const t = flatMax > 0 ? v / flatMax : 0;
    const hue = 210 - 210 * t; // blue -> red
    const alpha = 0.15 + 0.75 * t;
    return `hsla(${hue}, 85%, 50%, ${alpha})`;
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[840px]">
        <div className="grid" style={{ gridTemplateColumns: '120px repeat(24, 1fr)', gap: 2 }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={`h-${h}`} className="text-[10px] text-gray-500 text-center">{String(h).padStart(2, '0')}</div>
          ))}
          {rows.map((row, dow) => (
            <React.Fragment key={`r-${dow}`}>
              <div className="text-xs text-gray-700 flex items-center justify-end pr-2">{labels[dow] ?? ''}</div>
              {row.map((v, h) => (
                <div key={`c-${dow}-${h}`} className="h-6 rounded" title={`${labels[dow] ?? ''} ${String(h).padStart(2, '0')}:00 - ${v}`}
                     style={{ backgroundColor: toColor(v) }} />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PerformansTakibi() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(todayStr);
  const [weekEnd, setWeekEnd] = useState(todayStr); // Haftalık rapor için bitiş günü
  const [daily, setDaily] = useState({ byHour: [], totals: {}, items: [] });
  const [weekly, setWeekly] = useState({ byDay: [], revenueTrend: [], revenueDistribution: [], avgBasketSize: 0, trendComparison: {} });
  const [forecast, setForecast] = useState({ hourlyHeatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)), expectedCustomersTomorrow: 0, staffingRecommendation: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toISO = (d) => new Date(d).toISOString().split('T')[0];
  const addDays = (dStr, n) => {
    const d = new Date(dStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return toISO(d);
  };
  const getWeekStart = (endStr) => addDays(endStr, -6);

  const loadData = async (selectedDate, selectedWeekEnd) => {
    setLoading(true);
    setError(null);
    try {
      const start = getWeekStart(selectedWeekEnd || weekEnd);
      const end = selectedWeekEnd || weekEnd;
      const [dRes, wRes, fRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/daily?date=${encodeURIComponent(selectedDate)}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/analytics/weekly?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/analytics/forecast`, { headers: authHeaders() }),
      ]);
      if (!dRes.ok) throw new Error('Günlük veriler alınamadı');
      if (!wRes.ok) throw new Error('Haftalık veriler alınamadı');
      if (!fRes.ok) throw new Error('Tahmin verileri alınamadı');
      const d = await dRes.json();
      const w = await wRes.json();
      const f = await fRes.json();
      setDaily({ byHour: d.byHour || [], totals: d.totals || {}, items: d.items || [] });
      setWeekly({
        byDay: w.byDay || [],
        revenueTrend: w.revenueTrend || [],
        revenueDistribution: w.revenueDistribution || [],
        avgBasketSize: w.avgBasketSize || 0,
        trendComparison: w.trendComparison || {},
      });
      setForecast({
        hourlyHeatmap: f.hourlyHeatmap || Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
        expectedCustomersTomorrow: f.expectedCustomersTomorrow || 0,
        staffingRecommendation: f.staffingRecommendation || '',
      });
    } catch (e) {
      console.error(e);
      setError('Veriler getirilemedi. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(date, weekEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dailyItems = useMemo(() => {
    const source = Array.isArray(daily.items) ? daily.items : [];
    return source
      .map((item) => ({
        name: item?.name || 'Diğer Ürün',
        quantity: Number(item?.quantity || 0),
        revenue: Number(item?.revenue || 0),
      }))
      .sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return a.name.localeCompare(b.name, 'tr');
      });
  }, [daily.items]);

  const weeklyDaysMonSat = useMemo(() => normaliseMonSatSeries(weekly.byDay), [weekly.byDay]);

  const weeklyRevenueSummary = useMemo(() => {
    const total = weeklyDaysMonSat.reduce((sum, day) => sum + Number(day.revenue || 0), 0);
    const average = weeklyDaysMonSat.length ? total / weeklyDaysMonSat.length : 0;
    const peak = weeklyDaysMonSat.reduce((best, day) => (
      Number(day.revenue || 0) > Number(best.revenue || 0) ? day : best
    ), { revenue: 0, date: '', cycleDay: '' });

    return { total, average, peak };
  }, [weeklyDaysMonSat]);

  const dailyHourBuckets = useMemo(() => shiftHourlyBuckets(daily.byHour), [daily.byHour]);
  const hourLabels = useMemo(() => dailyHourBuckets.map((h) => h.hour), [dailyHourBuckets]);
  const itemsSeries = useMemo(() => dailyHourBuckets.map((h) => h.itemsSold), [dailyHourBuckets]);
  const txSeries = useMemo(() => dailyHourBuckets.map((h) => h.transactions), [dailyHourBuckets]);

  const busyDayLabels = useMemo(() => weeklyDaysMonSat.map((d) => {
    const lbl = d.date ? `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}` : '';
    return `${lbl}\n${d.cycleDay}`;
  }), [weeklyDaysMonSat]);
  const busyDayTx = useMemo(() => weeklyDaysMonSat.map((d) => d.transactions), [weeklyDaysMonSat]);

  const revenueLinePts = useMemo(() => weeklyDaysMonSat.map((d, i) => {
    const rawDate = d?.date || '';
    const baseLabel = rawDate && rawDate.length >= 10 ? `${rawDate.slice(8, 10)}.${rawDate.slice(5, 7)}` : `#${i + 1}`;
    return { x: i, y: Number(d?.revenue) || 0, label: `${baseLabel}\n${d.cycleDay}`.trim() };
  }), [weeklyDaysMonSat]);

  const pieSlices = useMemo(() => {
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
    const total = weeklyDaysMonSat.reduce((sum, day) => sum + Number(day.revenue || 0), 0);
    return weeklyDaysMonSat.map((day, idx) => {
      const baseDate = day.date ? `${day.date.slice(8, 10)}.${day.date.slice(5, 7)}` : day.cycleDay;
      const pct = total > 0 ? Number(((Number(day.revenue || 0) / total) * 100).toFixed(2)) : 0;
      return { label: `${baseDate} - ${day.cycleDay}`, value: pct, color: palette[idx % palette.length] };
    });
  }, [weeklyDaysMonSat]);

  const heatmapMatrix = useMemo(() => buildMonSatHeatmap(forecast.hourlyHeatmap), [forecast.hourlyHeatmap]);

  const summaryCards = [
    { label: 'İşlem Sayısı', value: daily.totals?.transactions || 0, fmt: (v) => v, color: 'text-blue-700' },
    { label: 'Satılan Ürün (Adet)', value: daily.totals?.itemsSold || 0, fmt: (v) => v, color: 'text-emerald-700' },
    { label: 'Ortalama Sepet (Adet/İşlem)', value: daily.totals?.avgBasketSize || 0, fmt: (v) => v.toFixed?.(2) ?? v, color: 'text-orange-700' },
    { label: 'Ortalama Fiş Tutarı', value: daily.totals?.avgTicket || 0, fmt: (v) => formatCurrency(v), color: 'text-fuchsia-700' },
    { label: 'Beklenen Müşteri (Bugün)', value: daily.totals?.expectedPeople || 0, fmt: (v) => v, color: 'text-rose-700' },
  ];

  return (
    <div className="p-6">
      <Section
        title="Günlük Performans"
        actions={(
          <div className="flex items-center gap-2">
            <input type="date" className="border rounded px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
            <button
              onClick={() => loadData(date, weekEnd)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              disabled={loading}
            >
              {loading ? 'Yükleniyor...' : 'Güncelle'}
            </button>
          </div>
        )}
      >
        {error && <div className="rounded bg-red-100 text-red-700 px-4 py-2 mb-4">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          {summaryCards.map((c) => (
            <div key={c.label} className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
              <div className="text-sm text-gray-600">{c.label}</div>
              <div className={`text-xl font-semibold ${c.color}`}>{c.fmt(c.value)}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Saat Bazlı Ürün Satış Dağılımı</div>
            <SimpleBarChart labels={hourLabels} series={itemsSeries} colorClass="bg-emerald-600" height={240} yTitle="Adet" />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Saat Bazlı İşlem Sayısı</div>
            <SimpleBarChart labels={hourLabels} series={txSeries} colorClass="bg-blue-600" height={240} yTitle="İşlem" />
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium text-gray-700 mb-2">Günlük Satılan Ürünler</div>
          {dailyItems.length ? (
            <div className="overflow-x-auto rounded border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-semibold text-gray-700">Ürün</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold text-gray-700">Adet</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold text-gray-700">Ciro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dailyItems.map((item, idx) => (
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
            <div className="rounded border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
              Seçilen gün için ürün satışı bulunamadı.
            </div>
          )}
        </div>
      </Section>

      <Section title="Haftalık Performans" actions={(
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            onClick={() => {
              const nextEnd = addDays(weekEnd, -7);
              setWeekEnd(nextEnd);
              loadData(date, nextEnd);
            }}
          >Önceki Hafta</button>
          <input
            type="date"
            className="border rounded px-3 py-2"
            value={weekEnd}
            onChange={(e) => {
              const val = e.target.value;
              setWeekEnd(val);
              loadData(date, val);
            }}
          />
          <button
            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
            onClick={() => {
              const nextEnd = addDays(weekEnd, 7);
              const capped = nextEnd > todayStr ? todayStr : nextEnd;
              setWeekEnd(capped);
              loadData(date, capped);
            }}
            disabled={weekEnd >= todayStr}
          >Sonraki Hafta</button>
        </div>
      )}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Günlere Göre İşlem Yoğunluğu</div>
            <SimpleBarChart labels={busyDayLabels} series={busyDayTx} colorClass="bg-blue-600" height={240} yTitle="İşlem" />
          </div>
          <div className="flex items-center justify-center">
            <div className="w-full">
              <div className="text-sm font-medium text-gray-700 mb-2 text-center">Haftalık Gelir Dağılımı (%)</div>
              <div className="flex items-center justify-center">
                <PieChart slices={pieSlices} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
          <div className="xl:col-span-2">
            <div className="text-sm font-medium text-gray-700 mb-2">Gelir Eğilimi (Günlük)</div>
            <SimpleLineChart points={revenueLinePts} height={240} yTitle="₺" formatTick={(n) => formatCurrency(n)} />
            <div className="mt-2 text-xs text-gray-600">
              {(() => {
                const { total, average, peak } = weeklyRevenueSummary;
                const peakText = peak?.date
                  ? `${peak.date.slice(5)} (${formatCurrency(peak.revenue)})${peak.cycleDay ? ` - ${peak.cycleDay}` : ''}`
                  : '-';
                return (
                  <span>
                    Toplam: <span className="font-semibold">{formatCurrency(total)}</span> · Ortalama/Gün: <span className="font-semibold">{formatCurrency(average)}</span> · Tepe Gün: <span className="font-semibold">{peakText}</span>
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
              <div className="text-sm text-gray-600">Ortalama Sepet (Adet/İşlem)</div>
              <div className="text-xl font-semibold text-orange-700">{weekly.avgBasketSize.toFixed ? weekly.avgBasketSize.toFixed(2) : weekly.avgBasketSize}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
              <div className="text-sm text-gray-600">Haftalık Trend Karşılaştırması</div>
              <div className="mt-2 text-sm space-y-1">
                <div className="flex justify-between"><span>İşlem</span><span className={Number(weekly.trendComparison?.transactionsWoW) >= 0 ? 'text-green-700 font-semibold' : 'text-rose-700 font-semibold'}>{weekly.trendComparison?.transactionsWoW ?? 0}%</span></div>
                <div className="flex justify-between"><span>Ürün</span><span className={Number(weekly.trendComparison?.itemsWoW) >= 0 ? 'text-green-700 font-semibold' : 'text-rose-700 font-semibold'}>{weekly.trendComparison?.itemsWoW ?? 0}%</span></div>
                <div className="flex justify-between"><span>Ciro</span><span className={Number(weekly.trendComparison?.revenueWoW) >= 0 ? 'text-green-700 font-semibold' : 'text-rose-700 font-semibold'}>{weekly.trendComparison?.revenueWoW ?? 0}%</span></div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Tahmini Yoğunluk ve Öngörüler">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="text-sm font-medium text-gray-700 mb-2">Saatlik Isı Haritası (Geçmiş ortalama, ürün adedi)</div>
            <Heatmap matrix={heatmapMatrix} dayLabels={MON_SAT_CYCLE} />
          </div>
          <div className="space-y-3">
            <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
              <div className="text-sm text-gray-600">Yarın Beklenen Müşteri</div>
              <div className="text-2xl font-bold text-blue-700">{forecast.expectedCustomersTomorrow}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
              <div className="text-sm text-gray-600">Personel Önerisi</div>
              <div className="text-sm font-medium text-gray-800">
                {forecast.staffingRecommendation || 'Yoğunluk verisi yetersiz.'}
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
