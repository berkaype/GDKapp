const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const https = require('https');
require('dotenv').config();

const isPkg = typeof process.pkg !== 'undefined';
const executableDir = isPkg ? path.dirname(process.execPath) : __dirname;
const dataDir = isPkg ? path.join(executableDir, 'data') : __dirname;

if (isPkg && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const bundledDbPath = path.join(__dirname, 'bufe.db');
const dbPath = isPkg ? path.join(dataDir, 'bufe.db') : bundledDbPath;

if (isPkg && !fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
  fs.copyFileSync(bundledDbPath, dbPath);
}

const publicDir = path.join(__dirname, 'public');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'bufe_secret_key_2024';
const WEATHER_PROVIDER = process.env.WEATHER_PROVIDER || 'open-meteo';
const WEATHER_LAT = parseFloat(process.env.WEATHER_LAT || '41.015137');
const WEATHER_LON = parseFloat(process.env.WEATHER_LON || '28.979530');
const WEATHER_TIMEZONE = process.env.WEATHER_TIMEZONE || 'auto';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

// Role helpers
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.sendStatus(401);
    }
    if (!roles.includes(req.user.role)) {
      return res.sendStatus(403);
    }
    next();
  };
}

// Database initialization
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    db.run('PRAGMA foreign_keys = ON');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Personnel table
  db.run(`CREATE TABLE IF NOT EXISTS personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    salary REAL NOT NULL,
    sgk_cost REAL NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Personnel wages table to keep month based history
  db.run(`CREATE TABLE IF NOT EXISTS personnel_wages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personnel_id INTEGER NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    salary REAL NOT NULL,
    sgk_cost REAL NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(personnel_id, year, month),
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_personnel_wages_personnel ON personnel_wages(personnel_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_personnel_wages_period ON personnel_wages(year, month)');

  // Business expenses table
  db.run(`CREATE TABLE IF NOT EXISTS business_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_name TEXT NOT NULL,
    expense_date DATE NOT NULL,
    amount REAL NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Stock codes table
  db.run(`CREATE TABLE IF NOT EXISTS stock_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    brand TEXT,
    unit TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Stock purchases table
  db.run(`CREATE TABLE IF NOT EXISTS stock_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code_id INTEGER NOT NULL,
    package_count REAL NOT NULL,
    package_content REAL NOT NULL,
    total_price REAL NOT NULL,
    unit_price REAL NOT NULL,
    per_item_price REAL NOT NULL,
    purchase_date DATE NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_code_id) REFERENCES stock_codes(id)
  )`);

  // Product prices table
  db.run(`CREATE TABLE IF NOT EXISTS product_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    effective_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Orders table
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER,
    order_type TEXT NOT NULL, -- 'table' or 'takeaway'
    description TEXT,
    total_amount REAL NOT NULL,
    payment_received REAL,
    change_given REAL,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_closed BOOLEAN DEFAULT 0
  )`);

  // Order items table
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  // Product cost recipe tables
  db.run(`CREATE TABLE IF NOT EXISTS product_cost_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT UNIQUE NOT NULL,
    notes TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_cost_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    stock_code_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    unit_cost_override REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_id) REFERENCES product_cost_recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (stock_code_id) REFERENCES stock_codes(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS weather_daily (
    date TEXT PRIMARY KEY,
    t_min REAL,
    t_max REAL,
    precipitation REAL,
    precipitation_probability REAL,
    weather_code INTEGER,
    source TEXT,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // App settings (key-value JSON store)
  db.run(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ML models table (store simple regression models and metadata)
  db.run(`CREATE TABLE IF NOT EXISTS ml_models (
    name TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    meta TEXT,
    coefficients TEXT
  )`);

  // Insert default admin user
  const hashedPassword = bcrypt.hashSync('admin', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, 
    ['admin', hashedPassword, 'admin']);

  // Insert supervisory admin user
  try {
    const supHash = bcrypt.hashSync('Berk2219', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
      ['GDKP', supHash, 'superadmin']);
  } catch (e) {
    // ignore seeding error
  }

  // Insert initial personnel data
  const personnelData = [
  ["Ilyas", 56000, 8000],
  ["Cemal", 56000, 8000],
  ["Rustum", 50000, 8000],
  ["Yahya", 36000, 8000],
  ["Ozener", 21000, 8000]
 ];

  const seedTableIfEmpty = (tableName, insertFn) => {
    db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
      if (err) {
        console.error(`Error checking ${tableName} count:`, err);
        return;
      }
      if ((row?.count || 0) === 0) {
        insertFn();
      }
    });
  };

  seedTableIfEmpty('personnel', () => {
    const stmt = db.prepare('INSERT INTO personnel (name, salary, sgk_cost) VALUES (?, ?, ?)');
    personnelData.forEach((person) => {
      stmt.run(person);
    });
    stmt.finalize();
  });

  seedTableIfEmpty('personnel_wages', () => {
    db.all('SELECT id, salary, sgk_cost FROM personnel', (err, people) => {
      if (err) {
        console.error('Error seeding personnel wages:', err);
        return;
      }
      if (!people || people.length === 0) {
        return;
      }
      const now = new Date();
      const seedMonth = now.getMonth() + 1;
      const seedYear = now.getFullYear();
      const stmt = db.prepare('INSERT OR IGNORE INTO personnel_wages (personnel_id, month, year, salary, sgk_cost) VALUES (?, ?, ?, ?, ?)');
      people.forEach((person) => {
        if (person.salary == null || person.sgk_cost == null) {
          return;
        }
        stmt.run(person.id, seedMonth, seedYear, person.salary, person.sgk_cost);
      });
      stmt.finalize();
    });
  });

  // Insert initial stock codes
  const stockData = [
  ["GDK0001", "Tavuk Eti", "", "kg"],
  ["GDK0002", "Baget Ekmek", "", "adet"],
  ["GDK0003", "Kaymak", "", "kg"],
  ["GDK0004", "Hindi Etli Salam", "Turkmenzade", "kg"],
  ["GDK0005", "Macar Salam", "Turkmenzade", "kg"],
  ["GDK0006", "Dana Jambon", "Enfes", "kg"]
 ];

  seedTableIfEmpty('stock_codes', () => {
    const stmt = db.prepare('INSERT INTO stock_codes (stock_code, product_name, brand, unit) VALUES (?, ?, ?, ?)');
    stockData.forEach((stock) => {
      stmt.run(stock);
    });
    stmt.finalize();
  });

  // Insert initial product prices
  const productData = [
  ["Baget Karisik Sandvic", "Sandvic", 90, new Date().toISOString().split('T')[0]],
  ["Baget Karisik Sandvic EXTRA", "Sandvic Extra", 180, new Date().toISOString().split('T')[0]],
  ["Sandvic (Yarim Ekmek)", "Sandvic", 90, new Date().toISOString().split('T')[0]],
  ["Sandvic EXTRA (Yarim Ekmek)", "Sandvic Extra", 180, new Date().toISOString().split('T')[0]],
  ["Tost (Yarim Ekmek)", "Tost", 130, new Date().toISOString().split('T')[0]],
  ["Doner (Yarim Ekmek)", "Doner", 90, new Date().toISOString().split('T')[0]],
  ["Doner (Lavas)", "Doner", 110, new Date().toISOString().split('T')[0]],
  ["Doner Porsiyon", "Doner Porsiyon", 180, new Date().toISOString().split('T')[0]],
  ["Doner Porsiyon (Pilavli)", "Doner Porsiyon", 210, new Date().toISOString().split('T')[0]],
  ["Kahvalti Tabagi", "Kahvalti", 200, new Date().toISOString().split('T')[0]],
  ["Salata", "Salata", 80, new Date().toISOString().split('T')[0]],
  ["Omlet", "Omlet", 200, new Date().toISOString().split('T')[0]],
  ["Gazli Mesrubat", "Icecek", 50, new Date().toISOString().split('T')[0]],
  ["Portakal Suyu", "Icecek", 80, new Date().toISOString().split('T')[0]],
  ["Nar Suyu", "Icecek", 100, new Date().toISOString().split('T')[0]],
  ["Ayran (Buyuk)", "Icecek", 30, new Date().toISOString().split('T')[0]],
  ["Ayran (Kucuk)", "Icecek", 15, new Date().toISOString().split('T')[0]],
  ["Su", "Icecek", 20, new Date().toISOString().split('T')[0]],
  ["Cay (Buyuk)", "Icecek", 30, new Date().toISOString().split('T')[0]],
  ["Cay (Kucuk)", "Icecek", 20, new Date().toISOString().split('T')[0]]
 ];

  seedTableIfEmpty('product_prices', () => {
    const stmt = db.prepare('INSERT INTO product_prices (product_name, category, price, effective_date) VALUES (?, ?, ?, ?)');
    productData.forEach((product) => {
      stmt.run(product);
    });
    stmt.finalize();
  });

  cleanupDuplicates();
  console.log('Database initialized with sample data');
  });
}

// Ensure support columns/tables for end-of-day and takeaway numbering
db.serialize(() => {
  db.run("ALTER TABLE orders ADD COLUMN accounted INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE orders ADD COLUMN takeaway_seq INTEGER", () => {});
  db.run(`CREATE TABLE IF NOT EXISTS daily_closings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    closing_date DATE NOT NULL,
    total_amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Kredi kartı satışları için yeni tablo
  db.run(`CREATE TABLE IF NOT EXISTS credit_card_sales (
    date DATE PRIMARY KEY,
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function cleanupDuplicates() {
  // Deduplicate product prices on same name + effective_date (keep latest id)
  db.run(`DELETE FROM product_prices WHERE id NOT IN (
    SELECT MAX(id) FROM product_prices GROUP BY product_name, effective_date
  )`);
  // Deduplicate personnel rows with identical fields (keep earliest id)
  db.run(`DELETE FROM personnel WHERE id NOT IN (
    SELECT MIN(id) FROM personnel GROUP BY name, salary, sgk_cost
  )`);
}

// ===== Weather helpers for customer forecast =====

function fetchJSON(url, callback) {
  const req = https.get(url, (res) => {
    const statusCode = res.statusCode || 0;
    if (statusCode >= 400) {
      res.resume();
      return callback && callback(new Error(`weather-http-${statusCode}`));
    }
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      raw += chunk;
    });
    res.on('end', () => {
      try {
        const json = JSON.parse(raw);
        callback && callback(null, json);
      } catch (err) {
        callback && callback(err);
      }
    });
  });
  req.on('error', (err) => callback && callback(err));
}

function upsertWeatherRecords(records, callback) {
  if (!records || !records.length) return callback && callback(null);
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(`INSERT INTO weather_daily (date, t_min, t_max, precipitation, precipitation_probability, weather_code, source, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(date) DO UPDATE SET
        t_min = excluded.t_min,
        t_max = excluded.t_max,
        precipitation = excluded.precipitation,
        precipitation_probability = excluded.precipitation_probability,
        weather_code = excluded.weather_code,
        source = excluded.source,
        fetched_at = CURRENT_TIMESTAMP`);
    records.forEach((row) => {
      stmt.run([
        row.date,
        row.t_min,
        row.t_max,
        row.precipitation,
        row.precipitation_probability,
        row.weather_code,
        row.source || WEATHER_PROVIDER,
      ]);
    });
    stmt.finalize((err) => {
      if (err) {
        db.run('ROLLBACK');
        return callback && callback(err);
      }
      db.run('COMMIT', callback);
    });
  });
}

function fetchOpenMeteoRange(startDate, endDate, callback, options = {}) {
  if (WEATHER_PROVIDER !== 'open-meteo') return callback && callback(null, []);
  const lat = Number.isFinite(WEATHER_LAT) ? WEATHER_LAT : 0;
  const lon = Number.isFinite(WEATHER_LON) ? WEATHER_LON : 0;
  const dailyParams = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_mean,weathercode';
  const base = options.forecast
    ? 'https://api.open-meteo.com/v1/forecast'
    : 'https://archive-api.open-meteo.com/v1/era5';
  const url = `${base}?latitude=${lat}&longitude=${lon}&daily=${dailyParams}&start_date=${startDate}&end_date=${endDate}&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}`;
  fetchJSON(url, (err, data) => {
    if (err) return callback && callback(err);
    if (!data || !data.daily || !Array.isArray(data.daily.time)) {
      return callback && callback(new Error('weather-data-missing'));
    }
    const rows = data.daily.time.map((date, idx) => ({
      date,
      t_min: Number(data.daily.temperature_2m_min?.[idx] ?? 0),
      t_max: Number(data.daily.temperature_2m_max?.[idx] ?? 0),
      precipitation: Number(data.daily.precipitation_sum?.[idx] ?? 0),
      precipitation_probability: Number(
        data.daily.precipitation_probability_mean?.[idx] ??
        data.daily.precipitation_probability_max?.[idx] ??
        0,
      ),
      weather_code: Number(data.daily.weathercode?.[idx] ?? 0),
      source: 'open-meteo',
    }));
    callback && callback(null, rows);
  });
}

function ensureWeatherDataRange(startDate, endDate, callback) {
  if (!startDate || !endDate || WEATHER_PROVIDER !== 'open-meteo') {
    return callback && callback(null);
  }
  db.all('SELECT date FROM weather_daily WHERE date BETWEEN ? AND ?', [startDate, endDate], (err, rows) => {
    if (err) return callback && callback(err);
    const have = new Set((rows || []).map((r) => r.date));
    const missing = [];
    for (let d = new Date(startDate + 'T00:00:00'); d <= new Date(endDate + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split('T')[0];
      if (!have.has(iso)) missing.push(iso);
    }
    if (!missing.length) return callback && callback(null);
    const missingStart = missing[0];
    const missingEnd = missing[missing.length - 1];
    fetchOpenMeteoRange(missingStart, missingEnd, (fetchErr, records) => {
      if (fetchErr) return callback && callback(fetchErr);
      upsertWeatherRecords(records, callback);
    });
  });
}

function refreshWeatherForecast(callback) {
  if (WEATHER_PROVIDER !== 'open-meteo') return callback && callback(null);
  const today = new Date();
  const start = today.toISOString().split('T')[0];
  const future = new Date(today);
  future.setDate(future.getDate() + 6);
  const end = future.toISOString().split('T')[0];
  fetchOpenMeteoRange(start, end, (err, rows) => {
    if (err) return callback && callback(err);
    upsertWeatherRecords(rows, callback);
  }, { forecast: true });
}

function getWeatherMap(startDate, endDate, callback) {
  if (!startDate || !endDate) return callback && callback(null, new Map());
  db.all('SELECT date, t_min, t_max, precipitation, precipitation_probability, weather_code FROM weather_daily WHERE date BETWEEN ? AND ?', [startDate, endDate], (err, rows) => {
    if (err) return callback && callback(err);
    const map = new Map();
    (rows || []).forEach((row) => {
      map.set(row.date, {
        t_min: Number(row.t_min ?? 0),
        t_max: Number(row.t_max ?? 0),
        precipitation: Number(row.precipitation ?? 0),
        precipitation_probability: Number(row.precipitation_probability ?? 0),
        weather_code: Number(row.weather_code ?? 0),
      });
    });
    callback && callback(null, map);
  });
}

// ===== ML: Simple Ridge Regression for expected customers (transactions) =====
function getDailyAggregates(callback) {
  const sql = `SELECT date(order_date) AS d,
                      COUNT(DISTINCT id) AS transactions,
                      COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o2 ON oi.order_id = o2.id WHERE date(o2.order_date) = date(o.order_date)), 0) AS items
               FROM orders o
               GROUP BY date(order_date)
               ORDER BY date(order_date)`;
  db.all(sql, [], (err, rows) => {
    if (err) return callback(err);
    const list = (rows || []).map(r => ({ date: r.d, transactions: Number(r.transactions || 0), items: Number(r.items || 0) }));
    callback(null, list);
  });
}

function oneHot(index, length) {
  const v = Array.from({ length }, () => 0);
  if (index >= 0 && index < length) v[index] = 1;
  return v;
}

function buildDailyDataset(days, weatherMap = new Map()) {
  // days: [{date, transactions}...] sorted ASC by date
  const map = new Map(days.map(d => [d.date, d]));
  const getTx = (dateStr) => (map.get(dateStr)?.transactions ?? null);

  const toISO = (d) => new Date(d).toISOString().split('T')[0];
  const addDays = (dStr, n) => { const d = new Date(dStr + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };

  const rows = [];
  for (let i = 0; i < days.length; i++) {
    const cur = days[i];
    const prev1Date = addDays(cur.date, -1);
    const prev7Date = addDays(cur.date, -7);
    const prev1 = getTx(prev1Date);
    const prev7 = getTx(prev7Date);
    if (prev1 == null || prev7 == null) continue; // need basic lags

    // rolling averages
    let ma3 = 0, ma7 = 0, c3 = 0, c7 = 0;
    for (let k = 1; k <= 7; k++) {
      const tx = getTx(addDays(cur.date, -k));
      if (tx != null) {
        ma7 += tx; c7++;
        if (k <= 3) { ma3 += tx; c3++; }
      }
    }
    if (c3 === 0 || c7 === 0) continue;
    ma3 /= c3; ma7 /= c7;

    const dt = new Date(cur.date + 'T00:00:00');
    const dow = dt.getDay(); // 0..6
    const month = dt.getMonth(); // 0..11
    const dayOfYear = getDayOfYear(dt);

    const weather = weatherMap.get(cur.date) || {};
    const tMin = Number(weather?.t_min ?? 0);
    const tMax = Number(weather?.t_max ?? 0);
    const precip = Number(weather?.precipitation ?? 0);
    const precipProb = Number(weather?.precipitation_probability ?? 0);
    const weatherCode = Number(weather?.weather_code ?? 0);

    const seasonalSin = Math.sin((2 * Math.PI * dayOfYear) / 365);
    const seasonalCos = Math.cos((2 * Math.PI * dayOfYear) / 365);

    const features = [
      1, // intercept
      ...oneHot(dow, 7),
      ...oneHot(month, 12),
      prev1,
      prev7,
      ma3,
      ma7,
      seasonalSin,
      seasonalCos,
      tMin,
      tMax,
      precip,
      precipProb,
      weatherCode,
    ];
    rows.push({ x: features, y: cur.transactions });
  }

  if (!rows.length) {
    return { X: [], y: [], featureCount: 0 };
  }
  const featureCount = rows[0].x.length;
  const X = rows.map(r => r.x);
  const y = rows.map(r => r.y);
  return { X, y, featureCount };
}

function getDayOfYear(dateObj) {
  const start = new Date(dateObj.getFullYear(), 0, 0);
  const diff = dateObj - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function transpose(A) { return A[0].map((_, i) => A.map(row => row[i])); }
function matMul(A, B) {
  const rows = A.length, cols = B[0].length, inner = B.length;
  const out = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = A[i][k];
      for (let j = 0; j < cols; j++) {
        out[i][j] += aik * B[k][j];
      }
    }
  }
  return out;
}
function identity(n) { const I = Array.from({ length: n }, () => Array(n).fill(0)); for (let i = 0; i < n; i++) I[i][i] = 1; return I; }
function clone2D(A) { return A.map(r => r.slice()); }

function invertMatrix(M) {
  const n = M.length;
  const A = clone2D(M);
  const I = identity(n);
  for (let i = 0; i < n; i++) {
    // pivot
    let pivot = A[i][i];
    let pivotRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(pivot)) { pivot = A[r][i]; pivotRow = r; }
    }
    if (Math.abs(pivot) < 1e-8) return null; // singular
    if (pivotRow !== i) { const tmp = A[i]; A[i] = A[pivotRow]; A[pivotRow] = tmp; const tmpI = I[i]; I[i] = I[pivotRow]; I[pivotRow] = tmpI; }
    // normalize
    const invPivot = 1 / A[i][i];
    for (let j = 0; j < n; j++) { A[i][j] *= invPivot; I[i][j] *= invPivot; }
    // eliminate
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = A[r][i];
      if (factor === 0) continue;
      for (let j = 0; j < n; j++) {
        A[r][j] -= factor * A[i][j];
        I[r][j] -= factor * I[i][j];
      }
    }
  }
  return I;
}

function ridgeRegression(X, y, lambda = 1.0) {
  const n = X.length; if (!n) return null;
  const p = X[0].length;
  const XT = transpose(X);
  const XTX = matMul(XT, X);
  for (let i = 0; i < p; i++) { XTX[i][i] += lambda; }
  const inv = invertMatrix(XTX);
  if (!inv) return null;
  const XTy = matMul(XT, y.map(v => [v]));
  const beta = matMul(inv, XTy).map(row => row[0]);
  // metrics
  const preds = X.map((row) => row.reduce((s, v, i) => s + v * beta[i], 0));
  const err = preds.map((p, i) => p - y[i]);
  const mse = err.reduce((a, e) => a + e * e, 0) / n;
  const mae = err.reduce((a, e) => a + Math.abs(e), 0) / n;
  return { beta, lambda, mse, mae, samples: n };
}

function saveModel(name, payload, callback) {
  const version = 1;
  const meta = JSON.stringify({ type: 'ridge_regression_daily', version, stats: { mse: payload.mse, mae: payload.mae, samples: payload.samples } });
  const coefficients = JSON.stringify({ beta: payload.beta, lambda: payload.lambda });
  db.run(`INSERT INTO ml_models (name, version, trained_at, meta, coefficients)
          VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
          ON CONFLICT(name) DO UPDATE SET version=excluded.version, trained_at=CURRENT_TIMESTAMP, meta=excluded.meta, coefficients=excluded.coefficients`,
    [name, version, meta, coefficients], (err) => callback && callback(err));
}

function loadModel(name, callback) {
  db.get('SELECT * FROM ml_models WHERE name = ?', [name], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(null, null);
    try {
      const meta = row.meta ? JSON.parse(row.meta) : {};
      const coeff = row.coefficients ? JSON.parse(row.coefficients) : {};
      callback(null, { name: row.name, version: row.version, trained_at: row.trained_at, meta, coefficients: coeff });
    } catch (e) {
      callback(e);
    }
  });
}

function trainForecastModel(callback) {
  getDailyAggregates((err, days) => {
    if (err) return callback && callback(err);
    if (!days || !days.length) return callback && callback(new Error('insufficient-data'));
    const trainingDays = days.slice(-365);
    if (!trainingDays.length) return callback && callback(new Error('insufficient-data'));
    const startDate = trainingDays[0].date;
    const endDate = trainingDays[trainingDays.length - 1].date;
    ensureWeatherDataRange(startDate, endDate, (weatherErr) => {
      if (weatherErr) {
        console.error('weather-range-update-error', weatherErr.message);
      }
      getWeatherMap(startDate, endDate, (mapErr, weatherMap) => {
        if (mapErr) {
          console.error('weather-map-load-error', mapErr.message);
        }
        const { X, y } = buildDailyDataset(trainingDays, !mapErr && weatherMap ? weatherMap : new Map());
        if (!X.length) return callback && callback(new Error('insufficient-data'));
        const model = ridgeRegression(X, y, 5.0);
        if (!model) return callback && callback(new Error('training-failed'));
        saveModel('expected_customers_daily_v1', model, (saveErr) => {
          if (callback) callback(saveErr, model);
        });
      });
    });
  });
}

function predictTomorrowCustomers(callback) {
  // Build features for tomorrow using latest aggregates
  getDailyAggregates((err, days) => {
    if (err) return callback(err);
    if (!days.length) return callback(null, 0);
    loadModel('expected_customers_daily_v1', (mErr, model) => {
      if (mErr) return callback(mErr);
      if (!model || !model.coefficients || !Array.isArray(model.coefficients.beta)) {
        // fallback: average last 4 weeks
        const avg = days.slice(-28).reduce((a, r) => a + (r.transactions || 0), 0) / Math.max(1, Math.min(28, days.length));
        return callback(null, Math.round(avg));
      }
      const beta = model.coefficients.beta;
      const expectedFeatureLength = 1 + 7 + 12 + 4 + 2 + 5;
      if (beta.length !== expectedFeatureLength) {
        const avg = days.slice(-28).reduce((a, r) => a + (r.transactions || 0), 0) / Math.max(1, Math.min(28, days.length));
        return callback(null, Math.round(avg));
      }
      const toISO = (d) => new Date(d).toISOString().split('T')[0];
      const addDays = (dStr, n) => { const d = new Date(dStr + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };
      const lastDate = days[days.length - 1].date;
      const tomorrow = addDays(lastDate, 1);
      const map = new Map(days.map(d => [d.date, d.transactions]));
      const prev1 = map.get(addDays(tomorrow, -1)) ?? null;
      const prev7 = map.get(addDays(tomorrow, -7)) ?? null;
      let ma3 = 0, ma7 = 0, c3 = 0, c7 = 0;
      for (let k = 1; k <= 7; k++) {
        const v = map.get(addDays(tomorrow, -k));
        if (v != null) { ma7 += v; c7++; if (k <= 3) { ma3 += v; c3++; } }
      }
      if (prev1 == null || prev7 == null || c3 === 0 || c7 === 0) {
        const avg = days.slice(-28).reduce((a, r) => a + (r.transactions || 0), 0) / Math.max(1, Math.min(28, days.length));
        return callback(null, Math.round(avg));
      }
      ma3 /= c3; ma7 /= c7;
      ensureWeatherDataRange(lastDate, tomorrow, (weatherErr) => {
        if (weatherErr) {
          console.error('weather-range-update-error', weatherErr.message);
        }
        getWeatherMap(lastDate, tomorrow, (mapErr, weatherMap) => {
          if (mapErr) {
            console.error('weather-map-load-error', mapErr.message);
          }
          const dt = new Date(tomorrow + 'T00:00:00');
          const dow = dt.getDay();
          const month = dt.getMonth();
          const dayOfYear = getDayOfYear(dt);
          const weather = (!mapErr && weatherMap) ? weatherMap.get(tomorrow) || {} : {};
          const tMin = Number(weather?.t_min ?? 0);
          const tMax = Number(weather?.t_max ?? 0);
          const precip = Number(weather?.precipitation ?? 0);
          const precipProb = Number(weather?.precipitation_probability ?? 0);
          const weatherCode = Number(weather?.weather_code ?? 0);
          const seasonalSin = Math.sin((2 * Math.PI * dayOfYear) / 365);
          const seasonalCos = Math.cos((2 * Math.PI * dayOfYear) / 365);
          const x = [
            1,
            ...oneHot(dow, 7),
            ...oneHot(month, 12),
            prev1,
            prev7,
            ma3,
            ma7,
            seasonalSin,
            seasonalCos,
            tMin,
            tMax,
            precip,
            precipProb,
            weatherCode,
          ];
          if (beta.length !== x.length) {
            const avg = days.slice(-28).reduce((a, r) => a + (r.transactions || 0), 0) / Math.max(1, Math.min(28, days.length));
            return callback(null, Math.round(avg));
          }
          const yhat = x.reduce((s, v, i) => s + v * beta[i], 0);
          const clamped = Math.max(0, Math.round(yhat));
          callback(null, clamped);
        });
      });
    });
  });
}

// Debounced training trigger for frequent order updates
let __trainTimer = null;
function scheduleTrain() {
  try {
    if (__trainTimer) clearTimeout(__trainTimer);
    __trainTimer = setTimeout(() => trainForecastModel(() => {}), 60 * 1000);
  } catch (e) {
    // ignore
  }
}

function normalizeMonthYear(monthInput, yearInput) {
  const now = new Date();
  let month = Number(monthInput);
  let year = Number(yearInput);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    month = now.getMonth() + 1;
  }
  if (!Number.isInteger(year) || year < 1970) {
    year = now.getFullYear();
  }
  return { month, year };
}

function buildPersonnelResponse(personnelRows, wageRows, targetMonth, targetYear) {
  const wageMap = new Map();
  wageRows.forEach((row) => {
    if (!wageMap.has(row.personnel_id)) {
      wageMap.set(row.personnel_id, []);
    }
    wageMap.get(row.personnel_id).push(row);
  });
  wageMap.forEach((list) => {
    list.sort((a, b) => {
      if (a.year === b.year) {
        return a.month - b.month;
      }
      return a.year - b.year;
    });
  });
  return personnelRows
    .filter((row) => row.is_active !== 0)
    .map((person) => {
      const entries = wageMap.get(person.id) || [];
      const direct = entries.find((entry) => entry.year === targetYear && entry.month === targetMonth);
      const latest = entries.length > 0 ? entries[entries.length - 1] : null;
      const wage = direct || latest;
      const salary = wage ? Number(wage.salary) : Number(person.salary);
      const sgk = wage ? Number(wage.sgk_cost) : Number(person.sgk_cost);
      return {
        id: person.id,
        name: person.name,
        salary: Number.isFinite(salary) ? salary : 0,
        sgk_cost: Number.isFinite(sgk) ? sgk : 0,
        source_month: wage ? wage.month : null,
        source_year: wage ? wage.year : null,
        is_inherited: Boolean(!direct && wage),
      };
    });
}

function syncLatestPersonnelWage(personnelId, callback) {
  db.get(
    'SELECT salary, sgk_cost FROM personnel_wages WHERE personnel_id = ? ORDER BY year DESC, month DESC LIMIT 1',
    [personnelId],
    (err, row) => {
      if (err) {
        if (callback) callback(err);
        return;
      }
      if (!row) {
        if (callback) callback(null);
        return;
      }
      db.run(
        'UPDATE personnel SET salary = ?, sgk_cost = ? WHERE id = ?',
        [row.salary, row.sgk_cost, personnelId],
        (updateErr) => {
          if (callback) callback(updateErr);
        },
      );
    },
  );
}

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// Personnel Routes
app.get('/api/personnel', authenticateToken, (req, res) => {
  const { month: monthParam, year: yearParam } = req.query;
  const { month, year } = normalizeMonthYear(monthParam, yearParam);

  db.all('SELECT * FROM personnel WHERE is_active = 1 ORDER BY name', (err, personnelRows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    db.all(
      'SELECT personnel_id, month, year, salary, sgk_cost FROM personnel_wages WHERE (year < ? OR (year = ? AND month <= ?)) ORDER BY year, month',
      [year, year, month],
      (wErr, wageRows) => {
        if (wErr) {
          return res.status(500).json({ error: wErr.message });
        }

        db.all(
          'SELECT DISTINCT year, month FROM personnel_wages ORDER BY year DESC, month DESC',
          [],
          (pErr, periodRows) => {
            if (pErr) {
              return res.status(500).json({ error: pErr.message });
            }

            const rows = buildPersonnelResponse(personnelRows, wageRows, month, year);
            const availablePeriods = periodRows.map((row) => ({ year: row.year, month: row.month }));
            const hasRequested = availablePeriods.some((period) => period.year === year && period.month === month);
            if (!hasRequested) {
              availablePeriods.push({ year, month });
            }
            availablePeriods.sort((a, b) => {
              if (a.year === b.year) {
                return b.month - a.month;
              }
              return b.year - a.year;
            });

            res.json({
              period: { month, year },
              rows,
              availablePeriods,
            });
          },
        );
      },
    );
  });
});

app.post('/api/personnel', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { name, salary, sgk_cost, month, year } = req.body;
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const normalizedSalary = Number(salary);
  const normalizedSgk = Number(sgk_cost);

  if (!trimmedName || !Number.isFinite(normalizedSalary) || !Number.isFinite(normalizedSgk)) {
    return res.status(400).json({ error: 'Invalid personnel payload' });
  }

  const period = normalizeMonthYear(month, year);

  db.run(
    'INSERT INTO personnel (name, salary, sgk_cost) VALUES (?, ?, ?)',
    [trimmedName, normalizedSalary, normalizedSgk],
    function(insertErr) {
      if (insertErr) {
        return res.status(500).json({ error: insertErr.message });
      }
      const personnelId = this.lastID;
      db.run(
        'INSERT OR REPLACE INTO personnel_wages (personnel_id, month, year, salary, sgk_cost) VALUES (?, ?, ?, ?, ?)',
        [personnelId, period.month, period.year, normalizedSalary, normalizedSgk],
        (wageErr) => {
          if (wageErr) {
            return res.status(500).json({ error: wageErr.message });
          }
          syncLatestPersonnelWage(personnelId, (syncErr) => {
            if (syncErr) {
              return res.status(500).json({ error: syncErr.message });
            }
            res.status(201).json({
              id: personnelId,
              name: trimmedName,
              salary: normalizedSalary,
              sgk_cost: normalizedSgk,
              source_month: period.month,
              source_year: period.year,
              is_inherited: false,
            });
          });
        },
      );
    },
  );
});

app.put('/api/personnel/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { id } = req.params;
  const { name, salary, sgk_cost, month, year } = req.body;
  const personnelId = Number(id);
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const normalizedSalary = Number(salary);
  const normalizedSgk = Number(sgk_cost);

  if (!Number.isInteger(personnelId) || personnelId <= 0) {
    return res.status(400).json({ error: 'Invalid personnel id' });
  }

  if (!trimmedName || !Number.isFinite(normalizedSalary) || !Number.isFinite(normalizedSgk)) {
    return res.status(400).json({ error: 'Invalid personnel payload' });
  }

  const period = normalizeMonthYear(month, year);

  db.get('SELECT id FROM personnel WHERE id = ?', [personnelId], (lookupErr, existing) => {
    if (lookupErr) {
      return res.status(500).json({ error: lookupErr.message });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Personnel not found' });
    }

    db.serialize(() => {
      db.run(
        'UPDATE personnel SET name = ? WHERE id = ?',
        [trimmedName, personnelId],
        (nameErr) => {
          if (nameErr) {
            return res.status(500).json({ error: nameErr.message });
          }

          db.run(
            'INSERT OR REPLACE INTO personnel_wages (personnel_id, month, year, salary, sgk_cost) VALUES (?, ?, ?, ?, ?)',
            [personnelId, period.month, period.year, normalizedSalary, normalizedSgk],
            (wageErr) => {
              if (wageErr) {
                return res.status(500).json({ error: wageErr.message });
              }

              syncLatestPersonnelWage(personnelId, (syncErr) => {
                if (syncErr) {
                  return res.status(500).json({ error: syncErr.message });
                }

                res.json({ message: 'Personnel updated successfully' });
              });
            },
          );
        },
      );
    });
  });
});

app.delete('/api/personnel/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { id } = req.params;
  db.run('UPDATE personnel SET is_active = 0 WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Personnel deleted successfully' });
  });
});

// Business Expenses Routes
app.get('/api/business-expenses', authenticateToken, (req, res) => {
  const { month, year } = req.query;
  let query = 'SELECT * FROM business_expenses';
  let params = [];

  if (month && year) {
    query += ' WHERE month = ? AND year = ?';
    params = [month, year];
  }

  query += ' ORDER BY expense_date DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/business-expenses', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { expense_name, expense_date, amount } = req.body;
  const date = new Date(expense_date);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  db.run('INSERT INTO business_expenses (expense_name, expense_date, amount, month, year) VALUES (?, ?, ?, ?, ?)', 
    [expense_name, expense_date, amount, month, year], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, expense_name, expense_date, amount, month, year });
  });
});

app.put('/api/business-expenses/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { id } = req.params;
  const { expense_name, expense_date, amount } = req.body;
  const name = (expense_name || '').trim();
  const dateValue = expense_date ? new Date(expense_date) : null;
  const parsedAmount = Number(amount);

  if (!name || !dateValue || Number.isNaN(dateValue.getTime()) || !Number.isFinite(parsedAmount)) {
    return res.status(400).json({ error: 'invalid-expense' });
  }

  const month = dateValue.getMonth() + 1;
  const year = dateValue.getFullYear();

  db.run(
    'UPDATE business_expenses SET expense_name = ?, expense_date = ?, amount = ?, month = ?, year = ? WHERE id = ?',
    [name, expense_date, parsedAmount, month, year, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'expense-not-found' });
      }
      res.json({ id: Number(id), expense_name: name, expense_date, amount: parsedAmount, month, year });
    }
  );
});

app.delete('/api/business-expenses/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM business_expenses WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'expense-not-found' });
    }
    res.json({ success: true });
  });
});

  // Stock Codes Routes
  app.get('/api/stock-codes', authenticateToken, (req, res) => {
    db.all('SELECT * FROM stock_codes WHERE is_active = 1 ORDER BY stock_code', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  app.post('/api/stock-codes', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { product_name, brand, unit } = req.body;

  const reuseSql = "SELECT id, stock_code FROM stock_codes WHERE is_active = 0 ORDER BY CAST(SUBSTR(stock_code, 4) AS INTEGER) DESC, id DESC LIMIT 1";
  db.get(reuseSql, (reuseErr, inactive) => {
    if (reuseErr) {
      return res.status(500).json({ error: reuseErr.message });
    }

    if (inactive) {
      db.run(
        'UPDATE stock_codes SET product_name = ?, brand = ?, unit = ?, is_active = 1 WHERE id = ?',
        [product_name, brand || '', unit, inactive.id],
        function(updateErr) {
          if (updateErr) {
            return res.status(500).json({ error: updateErr.message });
          }
          res.json({ id: inactive.id, stock_code: inactive.stock_code, product_name, brand: brand || '', unit });
        }
      );
      return;
    }

    const nextSql = "SELECT stock_code FROM stock_codes WHERE stock_code LIKE 'GDK____' ORDER BY CAST(SUBSTR(stock_code, 4) AS INTEGER) DESC LIMIT 1";
    db.get(nextSql, (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      let nextNumber = 1;
      if (row && row.stock_code) {
        const numericPart = Number(row.stock_code.slice(3));
        if (!Number.isNaN(numericPart)) {
          nextNumber = numericPart + 1;
        }
      }

      const nextCode = `GDK${String(nextNumber).padStart(4, '0')}`;
      db.run(
        'INSERT INTO stock_codes (stock_code, product_name, brand, unit) VALUES (?, ?, ?, ?)',
        [nextCode, product_name, brand || '', unit],
        function(insertErr) {
          if (insertErr) {
            return res.status(500).json({ error: insertErr.message });
          }
          res.json({ id: this.lastID, stock_code: nextCode, product_name, brand: brand || '', unit });
        }
      );
    });
  });
});

  // Update a stock code
  app.put('/api/stock-codes/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
    const { id } = req.params;
    const { product_name, brand, unit } = req.body;
    db.run('UPDATE stock_codes SET product_name = ?, brand = ?, unit = ? WHERE id = ?',
      [product_name, brand || '', unit, id], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.json({ id: Number(id), product_name, brand, unit });
      });
  });

  // Soft delete a stock code
  app.delete('/api/stock-codes/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
    const { id } = req.params;
    db.run('UPDATE stock_codes SET is_active = 0 WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json({ message: 'Stock code removed' });
    });
  });

// Stock Purchases Routes
app.get('/api/stock-purchases', authenticateToken, (req, res) => {
  db.all(`SELECT sp.*, sc.stock_code, sc.product_name, sc.brand, sc.unit 
    FROM stock_purchases sp 
    JOIN stock_codes sc ON sp.stock_code_id = sc.id 
    ORDER BY sp.purchase_date DESC`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/stock-purchases', authenticateToken, authorizeRoles('admin','superadmin'), (req, res) => {
  const { stock_code_id, package_count, package_content, total_price, purchase_date } = req.body;
  
  // Calculate unit_price and per_item_price
  const unit_price = total_price / package_count;
  const per_item_price = total_price / (package_count * package_content);

  db.run(`INSERT INTO stock_purchases 
    (stock_code_id, package_count, package_content, total_price, unit_price, per_item_price, purchase_date) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`, 
    [stock_code_id, package_count, package_content, total_price, unit_price, per_item_price, purchase_date], 
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ 
        id: this.lastID, 
        stock_code_id, 
        package_count, 
        package_content, 
        total_price, 
        unit_price, 
        per_item_price, 
        purchase_date 
      });
    });
});

app.delete('/api/stock-purchases/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM stock_purchases WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Stock purchase deleted successfully' });
  });
});

// Search stock codes by name
app.get('/api/stock-codes/search', authenticateToken, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.json([]);
  }
  
  db.all(`SELECT * FROM stock_codes 
    WHERE is_active = 1 AND (
      product_name LIKE ? OR 
      brand LIKE ? OR 
      stock_code LIKE ?
    ) 
    ORDER BY product_name LIMIT 10`, 
    [`%${q}%`, `%${q}%`, `%${q}%`], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Product Prices Routes
app.get('/api/product-prices', (req, res) => {
  db.all(`SELECT p1.* FROM product_prices p1
    INNER JOIN (
      SELECT product_name, MAX(effective_date) as max_date 
      FROM product_prices 
      WHERE is_active = 1 
      GROUP BY product_name
    ) p2 ON p1.product_name = p2.product_name AND p1.effective_date = p2.max_date
    WHERE p1.is_active = 1
    ORDER BY p1.category, p1.product_name`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get product price history by latest product id
app.get('/api/product-prices/:id/history', (req, res) => {
  const { id } = req.params;
  // Find the product by id to get product_name
  db.get('SELECT product_name FROM product_prices WHERE id = ?', [id], (err, product) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    db.all('SELECT * FROM product_prices WHERE product_name = ? ORDER BY effective_date DESC, id DESC', [product.product_name], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });
});

app.post('/api/product-prices', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { product_name, category, price, effective_date } = req.body;
  
  db.run(`INSERT INTO product_prices (product_name, category, price, effective_date) 
    VALUES (?, ?, ?, ?)`, 
    [product_name, category, price, effective_date], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ 
      id: this.lastID, 
      product_name, 
      category, 
      price, 
      effective_date 
    });
  });
});

app.put('/api/product-prices/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { id } = req.params;
  const { price, effective_date } = req.body;

  const normalizedPrice = Number(price);
  if (Number.isNaN(normalizedPrice) || normalizedPrice <= 0) {
    return res.status(400).json({ error: 'Geçersiz fiyat' });
  }

  db.run(`UPDATE product_prices
      SET price = ?, effective_date = ?
      WHERE id = ?`,
    [normalizedPrice, effective_date, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      db.get('SELECT * FROM product_prices WHERE id = ?', [id], (selectErr, updatedRow) => {
        if (selectErr) {
          return res.status(500).json({ error: selectErr.message });
        }
        res.json(updatedRow);
      });
    });
});

// Delete a product price entry (removes a single history row)
app.delete('/api/product-prices/:id', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM product_prices WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product price not found' });
    }
    res.json({ message: 'Product price deleted successfully' });
  });
});

// Get categories
app.get('/api/product-categories', (req, res) => {
  db.all(`SELECT DISTINCT category FROM product_prices 
    WHERE is_active = 1 
    ORDER BY category`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows.map(row => row.category));
  });
});


// Product cost management routes
app.get('/api/product-costs/ingredients', authenticateToken, (req, res) => {
  getStockCostData((err, payload) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(payload.list);
  });
});

app.get('/api/product-costs', authenticateToken, (req, res) => {
  loadProductCostRecipes(null, (err, recipes) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(recipes);
  });
});

app.get('/api/product-costs/:productName', authenticateToken, (req, res) => {
  const { productName } = req.params;
  loadProductCostRecipes(productName, (err, recipe) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json(recipe);
  });
});

app.put('/api/product-costs/:productName', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { productName } = req.params;
  const payload = req.body || {};
  const notes = typeof payload.notes === 'string' ? payload.notes : '';
  const ingredients = Array.isArray(payload.ingredients) ? payload.ingredients : null;

  if (!Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'ingredients must be an array' });
  }

  const cleaned = [];
  for (const item of ingredients) {
    if (!item) continue;
    const stockId = Number(item.stock_code_id);
    const quantity = Number(item.quantity);
    if (!stockId || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    let override = null;
    if (item.unit_cost_override !== null && item.unit_cost_override !== undefined && item.unit_cost_override !== '') {
      const parsed = Number(item.unit_cost_override);
      if (!Number.isNaN(parsed)) {
        override = parsed;
      }
    }
    cleaned.push({ stock_code_id: stockId, quantity, unit_cost_override: override });
  }

  db.run(
    `INSERT INTO product_cost_recipes (product_name, notes, last_updated)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(product_name) DO UPDATE SET notes = excluded.notes, last_updated = CURRENT_TIMESTAMP`,
    [productName, notes],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT id FROM product_cost_recipes WHERE product_name = ?', [productName], (err2, row) => {
        if (err2 || !row) {
          return res.status(500).json({ error: err2 ? err2.message : 'Recipe lookup failed' });
        }
        const recipeId = row.id;
        db.run('DELETE FROM product_cost_ingredients WHERE recipe_id = ?', [recipeId], (err3) => {
          if (err3) {
            return res.status(500).json({ error: err3.message });
          }
          if (!cleaned.length) {
            return loadProductCostRecipes(productName, (err4, data) => {
              if (err4) {
                return res.status(500).json({ error: err4.message });
              }
              res.json(data || { product_name: productName, notes, ingredients: [], total_cost: 0 });
            });
          }
          const stmt = db.prepare('INSERT INTO product_cost_ingredients (recipe_id, stock_code_id, quantity, unit_cost_override) VALUES (?, ?, ?, ?)');
          let index = 0;
          const insertNext = () => {
            if (index >= cleaned.length) {
              return stmt.finalize((finalErr) => {
                if (finalErr) {
                  return res.status(500).json({ error: finalErr.message });
                }
                loadProductCostRecipes(productName, (err4, data) => {
                  if (err4) {
                    return res.status(500).json({ error: err4.message });
                  }
                  res.json(data);
                });
              });
            }
            const current = cleaned[index++];
            stmt.run([recipeId, current.stock_code_id, current.quantity, current.unit_cost_override], (runErr) => {
              if (runErr) {
                return stmt.finalize(() => res.status(500).json({ error: runErr.message }));
              }
              insertNext();
            });
          };
          insertNext();
        });
      });
    }
  );
});


function getStockCostData(callback) {
  db.all(`SELECT sc.id, sc.stock_code, sc.product_name, sc.brand, sc.unit,
                 AVG(sp.per_item_price) AS avg_cost,
                 (SELECT sp2.per_item_price FROM stock_purchases sp2 WHERE sp2.stock_code_id = sc.id ORDER BY sp2.purchase_date DESC, sp2.id DESC LIMIT 1) AS latest_cost
          FROM stock_codes sc
          LEFT JOIN stock_purchases sp ON sp.stock_code_id = sc.id
          WHERE sc.is_active = 1
          GROUP BY sc.id
          ORDER BY sc.product_name`, (err, rows) => {
    if (err) {
      return callback(err);
    }
    const map = new Map();
    const list = rows.map(row => {
      const avgCost = row.avg_cost !== null && row.avg_cost !== undefined ? Number(row.avg_cost) : null;
      const latestCost = row.latest_cost !== null && row.latest_cost !== undefined ? Number(row.latest_cost) : null;
      const defaultCost = latestCost !== null ? latestCost : (avgCost !== null ? avgCost : 0);
      const item = {
        id: row.id,
        stock_code_id: row.id,
        stock_code: row.stock_code,
        product_name: row.product_name,
        brand: row.brand,
        unit: row.unit,
        avg_cost: avgCost,
        latest_cost: latestCost,
        default_cost: Number(defaultCost),
        has_purchases: avgCost !== null || latestCost !== null
      };
      map.set(row.id, item);
      return item;
    });
    callback(null, { map, list });
  });
}

function loadProductCostRecipes(productName, callback) {
  let query = `SELECT id, product_name, notes, last_updated FROM product_cost_recipes`;
  const params = [];
  if (productName) {
    query += ` WHERE product_name = ?`;
    params.push(productName);
  } else {
    query += ` ORDER BY product_name`;
  }
  db.all(query, params, (err, recipes) => {
    if (err) {
      return callback(err);
    }
    if (!recipes.length) {
      return callback(null, productName ? null : []);
    }

    const baseResults = recipes.map(r => ({
      id: r.id,
      product_name: r.product_name,
      notes: r.notes || '',
      last_updated: r.last_updated,
      total_cost: 0,
      ingredients: []
    }));
    const recipeMap = new Map(baseResults.map(r => [r.id, r]));
    const recipeIds = baseResults.map(r => r.id);

    if (!recipeIds.length) {
      return callback(null, productName ? baseResults[0] : baseResults);
    }

    const placeholders = recipeIds.map(() => '?').join(',');
    db.all(
      `SELECT pci.id, pci.recipe_id, pci.stock_code_id, pci.quantity, pci.unit_cost_override,
              sc.stock_code, sc.product_name AS stock_name, sc.brand, sc.unit
       FROM product_cost_ingredients pci
       LEFT JOIN stock_codes sc ON sc.id = pci.stock_code_id
       WHERE pci.recipe_id IN (${placeholders})
       ORDER BY pci.id`,
      recipeIds,
      (err2, ingredientRows) => {
        if (err2) {
          return callback(err2);
        }
        getStockCostData((err3, costData) => {
          if (err3) {
            return callback(err3);
          }
          const costMap = costData.map;
          ingredientRows.forEach(row => {
            const recipe = recipeMap.get(row.recipe_id);
            if (!recipe) {
              return;
            }
            const costInfo = costMap.get(row.stock_code_id) || {};
            const avgCost = costInfo.avg_cost ?? null;
            const latestCost = costInfo.latest_cost ?? null;
            const defaultCost = costInfo.default_cost ?? 0;
            const overrideValue = row.unit_cost_override !== null && row.unit_cost_override !== undefined ? Number(row.unit_cost_override) : null;
            const quantity = Number(row.quantity) || 0;
            const effectiveUnit = overrideValue !== null && !Number.isNaN(overrideValue) ? overrideValue : Number(defaultCost);
            const lineCost = Number((quantity * effectiveUnit).toFixed(4));
            recipe.ingredients.push({
              id: row.id,
              stock_code_id: row.stock_code_id,
              stock_code: row.stock_code,
              stock_name: row.stock_name,
              brand: row.brand,
              unit: row.unit,
              quantity,
              unit_cost_override: overrideValue !== null && !Number.isNaN(overrideValue) ? overrideValue : null,
              avg_unit_cost: avgCost !== null ? Number(avgCost) : null,
              latest_unit_cost: latestCost !== null ? Number(latestCost) : null,
              default_unit_cost: Number(defaultCost),
              effective_unit_cost: Number(effectiveUnit),
              line_cost: lineCost
            });
            recipe.total_cost += lineCost;
          });
          const payload = baseResults.map(item => ({
            id: item.id,
            product_name: item.product_name,
            notes: item.notes,
            last_updated: item.last_updated,
            total_cost: Number(item.total_cost.toFixed(4)),
            ingredients: item.ingredients
          }));
          callback(null, productName ? payload[0] || null : payload);
        });
      }
    );
  });
}


// Orders Routes
app.get('/api/orders', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM orders';
  let params = [];

  if (status === 'open') {
    query += ' WHERE is_closed = 0';
  } else if (status === 'closed') {
    query += ' WHERE is_closed = 1';
  }

  query += ' ORDER BY order_date DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id], (err, items) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ ...order, items });
    });
  });
});

app.post('/api/orders', (req, res) => {
  const { table_number, order_type, description } = req.body;
  
    if (order_type === 'takeaway') {
      const today = new Date().toISOString().split('T')[0];
      // After end-of-day, accounted=1 for today's orders; restart seq from 1 by only considering unaccounted ones
      db.get('SELECT MAX(takeaway_seq) as maxseq FROM orders WHERE DATE(order_date) = ? AND (accounted = 0 OR accounted IS NULL)', [today], (err, row) => {
        if (err) { return res.status(500).json({ error: err.message }); }
        const nextSeq = (row && row.maxseq) ? (row.maxseq + 1) : 1;
        db.run(`INSERT INTO orders (table_number, order_type, description, total_amount, is_closed, takeaway_seq)
        VALUES (?, ?, ?, 0, 0, ?)`,
        [table_number, order_type, description || '', nextSeq], function(insErr) {
          if (insErr) { return res.status(500).json({ error: insErr.message }); }
          res.json({ 
            id: this.lastID, 
            table_number, 
            order_type, 
            description: description || '',
            total_amount: 0,
            is_closed: 0,
            takeaway_seq: nextSeq
          });
        });
    });
  } else {
    db.run(`INSERT INTO orders (table_number, order_type, description, total_amount, is_closed) 
      VALUES (?, ?, ?, 0, 0)`, 
      [table_number, order_type, description || ''], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ 
        id: this.lastID, 
        table_number, 
        order_type, 
        description: description || '',
        total_amount: 0,
        is_closed: 0
      });
    });
  }
});

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { total_amount, payment_received, change_given, is_closed } = req.body;

  const normalizedTotal = Number(total_amount) || 0;
  const paymentDelta = Number(payment_received) || 0;
  const changeDelta = Number(change_given) || 0;

  db.get('SELECT payment_received, change_given FROM orders WHERE id = ?', [id], (selectErr, current) => {
    if (selectErr) {
      return res.status(500).json({ error: selectErr.message });
    }

    if (!current) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const existingPayment = Number(current.payment_received) || 0;
    const existingChange = Number(current.change_given) || 0;
    const updatedPayment = Math.round((existingPayment + paymentDelta) * 100) / 100;
    const updatedChange = Math.round((existingChange + changeDelta) * 100) / 100;

    db.run(`UPDATE orders 
      SET total_amount = ?, payment_received = ?, change_given = ?, is_closed = ?
      WHERE id = ?`, 
      [normalizedTotal, updatedPayment, updatedChange, is_closed ? 1 : 0, id], 
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Order updated successfully' });
        scheduleTrain();
      });
  });
});

app.put('/api/orders/:id/note', (req, res) => {
  const { id } = req.params;
  const rawNote = typeof (req.body && req.body.note) === 'string' ? req.body.note : '';
  const normalized = rawNote.replace(/\r/g, '').slice(0, 500);
  db.run('UPDATE orders SET description = ? WHERE id = ?', [normalized, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ note: normalized });
  });
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  
  // Delete order items first
  db.run('DELETE FROM order_items WHERE order_id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Then delete the order
    db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Order deleted successfully' });
    });
  });
});

// Order Items Routes
app.post('/api/orders/:id/items', (req, res) => {
  const { id } = req.params;
  const { product_name, quantity, unit_price } = req.body;
  const total_price = quantity * unit_price;
  
  db.run(`INSERT INTO order_items (order_id, product_name, quantity, unit_price, total_price) 
    VALUES (?, ?, ?, ?, ?)`, 
    [id, product_name, quantity, unit_price, total_price], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Update order total
    updateOrderTotal(id);
    
    res.json({ 
      id: this.lastID, 
      order_id: id,
      product_name, 
      quantity, 
      unit_price, 
      total_price 
    });
  });
});

app.put('/api/orders/:orderId/items/:itemId', (req, res) => {
  const { orderId, itemId } = req.params;
  const { quantity } = req.body;
  
  // Get current item to calculate new total
  db.get('SELECT unit_price FROM order_items WHERE id = ?', [itemId], (err, item) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const total_price = quantity * item.unit_price;
    
    db.run(`UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?`, 
      [quantity, total_price, itemId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Update order total
      updateOrderTotal(orderId);
      
      res.json({ message: 'Item updated successfully' });
    });
  });
});

app.delete('/api/orders/:orderId/items/:itemId', (req, res) => {
  const { orderId, itemId } = req.params;
  
  db.run('DELETE FROM order_items WHERE id = ?', [itemId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Update order total
    updateOrderTotal(orderId);
    
    res.json({ message: 'Item deleted successfully' });
  });
});

app.post('/api/orders/:orderId/partial-payment', (req, res) => {
  const { orderId } = req.params;
  const { items, amount, payment, change, table_number, order_type, description } = req.body || {};

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Parça ödeme için geçersiz ürün listesi' });
  }

  const sanitizedItems = items
    .map((item) => {
      const productName = item.product_name || item.name;
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price != null ? item.unit_price : (item.price != null ? item.price : 0)) || 0;
      if (!productName || quantity <= 0) {
        return null;
      }
      const totalPrice = unitPrice * quantity;
      return { product_name: productName, quantity, unit_price: unitPrice, total_price: totalPrice };
    })
    .filter(Boolean);

  if (!sanitizedItems.length) {
    return res.status(400).json({ error: 'Parça ödeme için geçersiz ürün bilgisi' });
  }

  const computedTotal = sanitizedItems.reduce((sum, item) => sum + item.total_price, 0);
  const requestedAmount = Number(amount);
  const totalAmount = !Number.isNaN(requestedAmount) && requestedAmount > 0
    ? requestedAmount
    : Math.round(computedTotal * 100) / 100;
  const paymentValue = !Number.isNaN(Number(payment)) && Number(payment) > 0 ? Number(payment) : totalAmount;
  const changeValue = !Number.isNaN(Number(change)) ? Number(change) : (paymentValue - totalAmount);

  db.get('SELECT table_number, order_type FROM orders WHERE id = ?', [orderId], (err, orderRow) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!orderRow) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const baseTable = table_number != null ? table_number : orderRow.table_number;
    const baseType = order_type || orderRow.order_type;
    const paymentDescription = description || `Parça ödeme #${orderId}`;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run(
        `INSERT INTO orders (table_number, order_type, description, total_amount, payment_received, change_given, is_closed, accounted, order_date)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP)`,
        [baseTable, baseType, paymentDescription, totalAmount, paymentValue, changeValue],
        function(insertErr) {
          if (insertErr) {
            return db.run('ROLLBACK', () => res.status(500).json({ error: insertErr.message }));
          }

          const partialOrderId = this.lastID;
          const stmt = db.prepare('INSERT INTO order_items (order_id, product_name, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)');
          let hasError = false;

          sanitizedItems.forEach(({ product_name, quantity, unit_price, total_price }) => {
            stmt.run([partialOrderId, product_name, quantity, unit_price, total_price], (runErr) => {
              if (runErr && !hasError) {
                hasError = true;
                db.run('ROLLBACK', () => res.status(500).json({ error: runErr.message }));
              }
            });
          });

          stmt.finalize((finalizeErr) => {
            if (hasError) {
              return;
            }
            if (finalizeErr) {
              return db.run('ROLLBACK', () => res.status(500).json({ error: finalizeErr.message }));
            }

            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                return res.status(500).json({ error: commitErr.message });
              }

              res.json({ partial_order_id: partialOrderId });
            });
          });
        }
      );
    });
  });
});


app.post('/api/maintenance/cleanup-prices', authenticateToken, (req, res) => {
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run(`DELETE FROM product_prices
            WHERE id NOT IN (
              SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (PARTITION BY product_name ORDER BY effective_date DESC, id DESC) as rn
                FROM product_prices
              ) ranked
              WHERE ranked.rn <= 5
            )`, (err) => {
      if (err) {
        return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
      }
      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          return res.status(500).json({ error: commitErr.message });
        }
        res.json({ message: 'Fazla fiyat geçmişi temizlendi.' });
      });
    });
  });
});

// Helper function to update order total
function updateOrderTotal(orderId) {
  db.get('SELECT SUM(total_price) as total FROM order_items WHERE order_id = ?', 
    [orderId], (err, result) => {
    if (err) {
      console.error('Error calculating order total:', err);
      return;
    }
    
    const total = result.total || 0;
    db.run('UPDATE orders SET total_amount = ? WHERE id = ?', [total, orderId]);
    // Debounced model retrain after order total changes
    scheduleTrain();
  });
}

// Daily Revenue (sum of closed orders' totals, unaccounted)
app.get('/api/daily-revenue', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sql = `SELECT COALESCE(SUM(CASE
                   WHEN payment_received IS NOT NULL THEN payment_received - COALESCE(change_given, 0)
                   ELSE total_amount
                 END), 0) AS daily_revenue
               FROM orders
               WHERE DATE(order_date) = date(?)
                 AND is_closed = 1
                 AND (accounted = 0 OR accounted IS NULL)`;
  db.get(sql, [today], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ daily_revenue: Number(row?.daily_revenue || 0) });
  });
});

const isValidHexColor = (value) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);

function sanitizeProductStyles(styles) {
  if (!styles || typeof styles !== 'object') {
    return {};
  }
  const result = {};
  Object.entries(styles).forEach(([key, style]) => {
    if (!style || typeof style !== 'object') {
      return;
    }
    const entry = {};
    if (isValidHexColor(style.background)) {
      entry.background = style.background.toUpperCase();
    }
    if (isValidHexColor(style.text)) {
      entry.text = style.text.toUpperCase();
    }
    if (Object.keys(entry).length) {
      result[key] = entry;
    }
  });
  return result;
}

// POS layout settings (global)
app.get('/api/pos-layout', (req, res) => {
  db.get('SELECT value FROM app_settings WHERE key = ?', ['pos_layout'], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row || !row.value) {
      return res.json({ positionsLocked: true, productOrder: {}, categoryOrder: [], productStyles: {} });
    }
    try {
      const parsed = JSON.parse(row.value);
      res.json({
        positionsLocked: Boolean(parsed.positionsLocked),
        productOrder: parsed.productOrder && typeof parsed.productOrder === 'object' ? parsed.productOrder : {},
        categoryOrder: Array.isArray(parsed.categoryOrder) ? parsed.categoryOrder : [],
        productStyles: sanitizeProductStyles(parsed.productStyles),
      });
    } catch (e) {
      res.status(500).json({ error: 'invalid-layout-json' });
    }
  });
});

app.put('/api/pos-layout', authenticateToken, authorizeRoles('superadmin'), express.json(), (req, res) => {
  const payload = req.body || {};
  const positionsLocked = Boolean(payload.positionsLocked);
  const productOrder = payload.productOrder && typeof payload.productOrder === 'object' ? payload.productOrder : {};
  const categoryOrder = Array.isArray(payload.categoryOrder) ? payload.categoryOrder : [];
  const productStyles = sanitizeProductStyles(payload.productStyles);
  const value = JSON.stringify({ positionsLocked, productOrder, categoryOrder, productStyles });
  db.run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('pos_layout', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [value],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

// Table names settings
function defaultTableNames() {
  return Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `Masa ${i + 1}` }));
}

app.get('/api/table-names', (req, res) => {
  db.get('SELECT value FROM app_settings WHERE key = ?', ['table_names'], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row || !row.value) {
      return res.json({ tables: defaultTableNames() });
    }
    try {
      const parsed = JSON.parse(row.value);
      const list = Array.isArray(parsed?.tables) ? parsed.tables : defaultTableNames();
      res.json({ tables: list });
    } catch (e) {
      res.status(500).json({ error: 'invalid-table-names-json' });
    }
  });
});

app.put('/api/table-names', authenticateToken, authorizeRoles('superadmin'), express.json(), (req, res) => {
  const payload = req.body || {};
  const arr = Array.isArray(payload.tables) ? payload.tables : null;
  if (!arr) {
    return res.status(400).json({ error: 'tables must be an array' });
  }
  const cleaned = [];
  const seen = new Set();
  for (const item of arr) {
    if (!item) continue;
    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0 || id > 200) continue;
    if (seen.has(id)) continue;
    const raw = typeof item.name === 'string' ? item.name : '';
    const name = raw.trim().slice(0, 64);
    cleaned.push({ id, name: name || `Masa ${id}` });
    seen.add(id);
  }
  if (!cleaned.length) {
    return res.status(400).json({ error: 'no-valid-tables' });
  }
  cleaned.sort((a, b) => a.id - b.id);

  const value = JSON.stringify({ tables: cleaned });
  db.run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('table_names', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [value],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ tables: cleaned });
    }
  );
});

// Analytics: Daily summary (hourly breakdown)
app.get('/api/analytics/daily', authenticateToken, (req, res) => {
  const dateParam = (req.query.date || new Date().toISOString().split('T')[0]).slice(0, 10);

  const byHourSql = `
    SELECT strftime('%H', o.order_date) AS hour,
           COUNT(DISTINCT o.id) AS transactions,
           COALESCE(SUM(oi.quantity), 0) AS items_sold,
           COALESCE(SUM(oi.total_price), 0) AS revenue
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.order_date) = date(?)
    GROUP BY hour
    ORDER BY hour`;

  const totalsSql = `
    SELECT COUNT(DISTINCT o.id) AS transactions,
           COALESCE(SUM(oi.quantity), 0) AS items_sold,
           COALESCE(SUM(oi.total_price), 0) AS revenue
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.order_date) = date(?)`;

  db.all(byHourSql, [dateParam], (err, hourRows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get(totalsSql, [dateParam], (tErr, totals) => {
      if (tErr) return res.status(500).json({ error: tErr.message });

      const itemsSql = `
        SELECT
          COALESCE(oi.product_name, 'Diğer Ürün') AS name,
          SUM(oi.quantity) AS quantity,
          SUM(oi.total_price) AS revenue
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE date(o.order_date) = date(?)
        GROUP BY name
        ORDER BY revenue DESC, quantity DESC, name ASC`;

      db.all(itemsSql, [dateParam], (itemsErr, itemRows) => {
        if (itemsErr) return res.status(500).json({ error: itemsErr.message });

        const byHourMap = new Map((hourRows || []).map(r => [r.hour, r]));
        const byHour = Array.from({ length: 24 }, (_, h) => {
          const key = String(h).padStart(2, '0');
          const r = byHourMap.get(key) || {};
          return {
            hour: key,
            transactions: Number(r.transactions || 0),
            itemsSold: Number(r.items_sold || 0),
            revenue: Number(r.revenue || 0),
          };
        });

        const tr = Number(totals?.transactions || 0);
        const items = Number(totals?.items_sold || 0);
        const rev = Number(totals?.revenue || 0);
        const avgTicket = tr > 0 ? Number((rev / tr).toFixed(2)) : 0;
        const avgBasketSize = tr > 0 ? Number((items / tr).toFixed(2)) : 0;

        const itemsList = (itemRows || []).map((row) => ({
          name: row?.name || 'Diğer Ürün',
          quantity: Number(row?.quantity || 0),
          revenue: Number(row?.revenue || 0),
        }));

        res.json({
          date: dateParam,
          byHour,
          totals: {
            transactions: tr,
            itemsSold: items,
            revenue: rev,
            avgTicket,
            avgBasketSize,
            expectedPeople: tr, // approximate expected customers as transactions
          },
          items: itemsList,
        });
      });
    });
  });
});


// Analytics: Monthly product cost summary
app.get('/api/analytics/monthly-product-cost', authenticateToken, (req, res) => {
  const now = new Date();
  let { month, year } = req.query || {};
  const parsedMonth = Number(month);
  if (!parsedMonth || parsedMonth < 1 || parsedMonth > 12) {
    month = String(now.getMonth() + 1).padStart(2, '0');
  } else {
    month = String(parsedMonth).padStart(2, '0');
  }
  const parsedYear = Number(year);
  if (!parsedYear || parsedYear < 2000 || parsedYear > 9999) {
    year = String(now.getFullYear());
  } else {
    year = String(parsedYear);
  }

  const salesSql = `
    SELECT
      COALESCE(oi.product_name, 'Diğer Ürün') AS product_name,
      SUM(oi.quantity) AS quantity,
      SUM(oi.total_price) AS revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE strftime('%m', o.order_date) = ? AND strftime('%Y', o.order_date) = ?
    GROUP BY product_name
    ORDER BY revenue DESC, quantity DESC, product_name ASC`;

  db.all(salesSql, [month, year], (salesErr, salesRows = []) => {
    if (salesErr) {
      return res.status(500).json({ error: salesErr.message });
    }
    loadProductCostRecipes(null, (recipesErr, recipeList) => {
      if (recipesErr) {
        return res.status(500).json({ error: recipesErr.message });
      }

      const costMap = new Map();
      if (Array.isArray(recipeList)) {
        recipeList.forEach((recipe) => {
          const name = (recipe?.product_name || '').trim();
          if (!name) {
            return;
          }
          const normalized = name.toLowerCase();
          const costValue = Number(recipe?.total_cost);
          if (Number.isFinite(costValue)) {
            costMap.set(normalized, costValue);
          }
        });
      }

      const items = [];
      let totalQuantity = 0;
      let totalRevenue = 0;
      let totalCost = 0;
      let totalGrossProfit = 0;
      let revenueWithCost = 0;
      let revenueWithoutCost = 0;
      const missingSet = new Set();

      (salesRows || []).forEach((row) => {
        const productName = row?.product_name ? String(row.product_name) : 'Tanımsız Ürün';
        const quantity = Number(row?.quantity || 0);
        const revenue = Number(row?.revenue || 0);

        totalQuantity += quantity;
        totalRevenue += revenue;

        const normalizedName = productName.trim().toLowerCase();
        const hasCost = normalizedName ? costMap.has(normalizedName) : false;
        const unitCost = hasCost ? Number(costMap.get(normalizedName)) : null;

        let totalCostForItem = null;
        let grossProfitForItem = null;
        let marginForItem = null;

        if (hasCost) {
          const rawTotalCost = unitCost * quantity;
          totalCostForItem = Number(rawTotalCost.toFixed(2));
          const rawGrossProfit = revenue - rawTotalCost;
          grossProfitForItem = Number(rawGrossProfit.toFixed(2));
          if (revenue > 0) {
            marginForItem = Number(((rawGrossProfit / revenue) * 100).toFixed(2));
          }
          totalCost += rawTotalCost;
          totalGrossProfit += rawGrossProfit;
          revenueWithCost += revenue;
        } else {
          revenueWithoutCost += revenue;
          if (productName.trim()) {
            missingSet.add(productName.trim());
          }
        }

        const unitPrice = quantity > 0 ? Number((revenue / quantity).toFixed(2)) : null;
        const reportedUnitCost = unitCost !== null && Number.isFinite(unitCost) ? Number(unitCost.toFixed(4)) : null;

        items.push({
          product: productName,
          quantity,
          revenue: Number(revenue.toFixed(2)),
          unitPrice,
          unitCost: reportedUnitCost,
          totalCost: totalCostForItem,
          grossProfit: grossProfitForItem,
          margin: marginForItem,
          hasCost,
        });
      });

      const totals = {
        quantity: totalQuantity,
        revenue: Number(totalRevenue.toFixed(2)),
        cost: Number(totalCost.toFixed(2)),
        grossProfit: Number(totalGrossProfit.toFixed(2)),
        margin: revenueWithCost > 0 ? Number(((totalGrossProfit / revenueWithCost) * 100).toFixed(2)) : null,
        revenueWithCost: Number(revenueWithCost.toFixed(2)),
        revenueWithoutCost: Number(revenueWithoutCost.toFixed(2)),
      };

      res.json({
        month,
        year,
        items,
        totals,
        missingRecipes: Array.from(missingSet.values()),
      });
    });
  });
});

// Analytics: Weekly summary (by day, WoW trends)
app.get('/api/analytics/weekly', authenticateToken, (req, res) => {
  const endParam = (req.query.end || new Date().toISOString().split('T')[0]).slice(0, 10);
  // default start = 6 days before end (7-day window)
  const startParam = (req.query.start || new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).slice(0, 10);

  const byDaySql = `
    SELECT date(o.order_date) AS d,
           COUNT(DISTINCT o.id) AS transactions,
           COALESCE(SUM(oi.quantity), 0) AS items_sold,
           COALESCE(SUM(oi.total_price), 0) AS revenue
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.order_date) BETWEEN date(?) AND date(?)
    GROUP BY d
    ORDER BY d`;

  const prevByDaySql = `
    SELECT date(o.order_date) AS d,
           COUNT(DISTINCT o.id) AS transactions,
           COALESCE(SUM(oi.quantity), 0) AS items_sold,
           COALESCE(SUM(oi.total_price), 0) AS revenue
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.order_date) BETWEEN date(?, '-7 day') AND date(?, '-7 day')
    GROUP BY d
    ORDER BY d`;

  db.all(byDaySql, [startParam, endParam], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(prevByDaySql, [startParam, endParam], (pErr, prevRows) => {
      if (pErr) return res.status(500).json({ error: pErr.message });

      const sum = (list, key) => list.reduce((acc, r) => acc + Number(r[key] || 0), 0);
      const cur = {
        transactions: sum(rows || [], 'transactions'),
        items: sum(rows || [], 'items_sold'),
        revenue: sum(rows || [], 'revenue'),
      };
      const prev = {
        transactions: sum(prevRows || [], 'transactions'),
        items: sum(prevRows || [], 'items_sold'),
        revenue: sum(prevRows || [], 'revenue'),
      };

      const pct = (a, b) => (b > 0 ? Number((((a - b) / b) * 100).toFixed(2)) : (a > 0 ? 100 : 0));

      const byDay = (rows || []).map(r => ({
        date: r.d,
        transactions: Number(r.transactions || 0),
        itemsSold: Number(r.items_sold || 0),
        revenue: Number(r.revenue || 0),
      }));

      const tr = Number(cur.transactions || 0);
      const items = Number(cur.items || 0);
      const rev = Number(cur.revenue || 0);
      const avgBasketSize = tr > 0 ? Number((items / tr).toFixed(2)) : 0;

      const totalRev = byDay.reduce((acc, r) => acc + r.revenue, 0) || 0;
      const revenueDistribution = byDay.map(r => ({ date: r.date, pct: totalRev > 0 ? Number(((r.revenue / totalRev) * 100).toFixed(2)) : 0 }));

      res.json({
        start: startParam,
        end: endParam,
        byDay,
        revenueTrend: byDay.map(r => ({ date: r.date, revenue: r.revenue })),
        revenueDistribution,
        avgBasketSize,
        trendComparison: {
          transactionsWoW: pct(cur.transactions, prev.transactions),
          itemsWoW: pct(cur.items, prev.items),
          revenueWoW: pct(cur.revenue, prev.revenue),
        },
      });
    });
  });
});

// Analytics: Forecasts and heatmap based on last N days (default 28)
app.get('/api/analytics/forecast', authenticateToken, (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days || '28', 10), 7), 90);
  const endDate = new Date();
  const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  const endParam = endDate.toISOString().split('T')[0];
  const startParam = startDate.toISOString().split('T')[0];

  const heatSql = `
    SELECT CAST(strftime('%w', o.order_date) AS INTEGER) AS dow,
           strftime('%H', o.order_date) AS hour,
           COUNT(DISTINCT o.id) AS transactions,
           COALESCE(SUM(oi.quantity), 0) AS items_sold
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.order_date) BETWEEN date(?) AND date(?)
    GROUP BY dow, hour
    ORDER BY dow, hour`;

  const byDaySql = `
    SELECT date(o.order_date) AS d,
           COUNT(DISTINCT o.id) AS transactions,
           COALESCE(SUM(oi.quantity), 0) AS items_sold
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.order_date) BETWEEN date(?) AND date(?)
    GROUP BY d
    ORDER BY d`;

  db.all(heatSql, [startParam, endParam], (hErr, heatRows) => {
    if (hErr) return res.status(500).json({ error: hErr.message });
    db.all(byDaySql, [startParam, endParam], (dErr, byDayRows) => {
      if (dErr) return res.status(500).json({ error: dErr.message });

      // Count days per weekday in the window
      const daysPerDow = Array.from({ length: 7 }, () => 0);
      (byDayRows || []).forEach(r => {
        const dow = new Date(r.d + 'T00:00:00Z').getUTCDay();
        daysPerDow[dow] += 1;
      });

      const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
      (heatRows || []).forEach(r => {
        const dow = Number(r.dow || 0);
        const hour = Number(r.hour || 0);
        const denom = daysPerDow[dow] || 1;
        const avg = Number(r.items_sold || 0) / denom;
        matrix[dow][hour] = Number(avg.toFixed(2));
      });

      // Expected customers tomorrow = average transactions of same weekday
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowDow = tomorrow.getUTCDay();
      const tomorrowDates = (byDayRows || []).filter(r => new Date(r.d + 'T00:00:00Z').getUTCDay() === tomorrowDow);
      // Use trained model for expected customers if available; fallback to simple avg
      const useModel = (cb) => {
        predictTomorrowCustomers((predErr, val) => {
          if (predErr) {
            const fallback = tomorrowDates.length
              ? Math.round(tomorrowDates.reduce((a, r) => a + Number(r.transactions || 0), 0) / tomorrowDates.length)
              : 0;
            return cb(fallback);
          }
          cb(val);
        });
      };

      useModel((expectedCustomersTomorrow) => {
        // Pick the 2-hour window with the highest expected items
        const dowMatrix = matrix[tomorrowDow] || [];
        let bestStart = 10;
        let bestScore = -1;
        for (let h = 0; h < 23; h++) {
          const score = (dowMatrix[h] || 0) + (dowMatrix[h + 1] || 0);
          if (score > bestScore) {
            bestScore = score;
            bestStart = h;
          }
        }
        const pad = (n) => String(n).padStart(2, '0');
        const rec = `Expect ${(bestScore > 0 ? 'higher' : 'low')} traffic between ${pad(bestStart)}:00–${pad((bestStart + 2) % 24)}:00.`;

        res.json({
          window: { start: startParam, end: endParam, days },
          hourlyHeatmap: matrix, // 0=Sunday..6=Saturday, each with 24-hour averages (items)
          expectedCustomersTomorrow,
          staffingRecommendation: rec,
        });
      });
    });
  });
});

// Trigger model training on demand
app.post('/api/analytics/train', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  trainForecastModel((err, model) => {
    if (err) return res.status(500).json({ error: err.message || String(err) });
    res.json({ message: 'trained', stats: { mse: model.mse, mae: model.mae, samples: model.samples } });
  });
});

// Return current model metadata
app.get('/api/analytics/model', authenticateToken, (req, res) => {
  loadModel('expected_customers_daily_v1', (err, model) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!model) return res.json(null);
    res.json(model);
  });
});

// Daily closings history
app.get('/api/daily-closings', authenticateToken, (req, res) => {
  const { month, year, start, end } = req.query;
  let sql = 'SELECT closing_date, total_amount FROM daily_closings';
  const params = [];
  if (month && year) {
    sql += ' WHERE strftime("%m", closing_date) = ? AND strftime("%Y", closing_date) = ?';
    params.push(String(month).padStart(2, '0'));
    params.push(String(year));
  } else if (start && end) {
    sql += ' WHERE date(closing_date) BETWEEN date(?) AND date(?)';
    params.push(start);
    params.push(end);
  }
  sql += ' ORDER BY date(closing_date) DESC';
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Cleanup daily closings for a given period (month/year or start/end)
app.post('/api/daily-closings/cleanup', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const body = req.body || {};
  const { month, year, start, end } = body;

  let closingSql = '';
  let orderingSql = '';
  let closingParams = [];
  let orderParams = [];

  if (month && year) {
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);
    closingSql = 'strftime("%m", closing_date) = ? AND strftime("%Y", closing_date) = ?';
    orderingSql = 'strftime("%m", order_date) = ? AND strftime("%Y", order_date) = ?';
    closingParams = [monthStr, yearStr];
    orderParams = [monthStr, yearStr];
  } else if (start && end) {
    closingSql = 'date(closing_date) BETWEEN date(?) AND date(?)';
    orderingSql = 'date(order_date) BETWEEN date(?) AND date(?)';
    closingParams = [start, end];
    orderParams = [start, end];
  } else {
    return res.status(400).json({ error: 'invalid-range' });
  }

  const deleteClosingsSql = `DELETE FROM daily_closings WHERE ${closingSql}`;
  const deleteOrderItemsSql = `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE ${orderingSql})`;
  const deleteOrdersSql = `DELETE FROM orders WHERE ${orderingSql}`;

  db.serialize(() => {
    let closingsDeleted = 0;
    let orderItemsDeleted = 0;
    let ordersDeleted = 0;

    const rollback = (err) => {
      db.run('ROLLBACK', () => {
        res.status(500).json({ error: err.message || String(err) });
      });
    };

    db.run('BEGIN TRANSACTION');

    db.run(deleteClosingsSql, closingParams, function(err) {
      if (err) return rollback(err);
      closingsDeleted = this.changes || 0;

      db.run(deleteOrderItemsSql, orderParams, function(err2) {
        if (err2) return rollback(err2);
        orderItemsDeleted = this.changes || 0;

        db.run(deleteOrdersSql, orderParams, function(err3) {
          if (err3) return rollback(err3);
          ordersDeleted = this.changes || 0;

          db.run('COMMIT', (commitErr) => {
            if (commitErr) return rollback(commitErr);
            try {
              scheduleTrain();
            } catch (e) {
              console.error('schedule-train-error', e.message);
            }
            res.json({
              dailyClosingsDeleted: closingsDeleted,
              orderItemsDeleted,
              ordersDeleted,
            });
          });
        });
      });
    });
  });
});

// Credit Card Sales Routes
app.get('/api/credit-card-sales', authenticateToken, (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ message: 'Ay ve yıl bilgisi gereklidir.' });
  }

  const sql = `SELECT date, amount FROM credit_card_sales
               WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
               ORDER BY date ASC`;
  
  const params = [String(month).padStart(2, '0'), String(year)];

  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ message: 'Veritabanı hatası', error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/credit-card-sales', authenticateToken, authorizeRoles('superadmin'), (req, res) => {
  const { date, amount } = req.body;

  if (!date || amount === undefined || amount === null || Number(amount) < 0) {
    return res.status(400).json({ message: 'Geçerli bir tarih ve tutar girilmelidir.' });
  }

  const sql = `INSERT INTO credit_card_sales (date, amount, created_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(date) DO UPDATE SET amount = excluded.amount`;

  db.run(sql, [date, Number(amount)], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Kayıt sırasında veritabanı hatası oluştu.', error: err.message });
    }
    res.status(201).json({ date, amount: Number(amount) });
  });
});

// End-of-day endpoint
app.post('/api/end-of-day', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.serialize(() => {
    // Discard any still-open orders for today by closing them with zero payment.
    db.run(
      'UPDATE orders SET is_closed = 1, payment_received = 0, change_given = 0 WHERE DATE(order_date) = ? AND is_closed = 0',
      [today]
    );
    db.get(
      `SELECT COALESCE(SUM(CASE
        WHEN payment_received IS NOT NULL THEN payment_received - COALESCE(change_given, 0)
        ELSE total_amount
      END), 0) as total FROM orders WHERE DATE(order_date) = ? AND (accounted = 0 OR accounted IS NULL)`,
      [today],
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        const total = row && row.total ? row.total : 0;
        db.run(
          'INSERT INTO daily_closings (closing_date, total_amount) VALUES (?, ?)',
          [today, total],
          function(insErr) {
            if (insErr) {
              return res.status(500).json({ error: insErr.message });
            }
            db.run('UPDATE orders SET accounted = 1 WHERE DATE(order_date) = ?', [today], (uErr) => {
              if (uErr) {
                return res.status(500).json({ error: uErr.message });
              }
              db.run(
                'UPDATE orders SET is_closed = 1, payment_received = COALESCE(payment_received, total_amount), change_given = COALESCE(change_given, 0), accounted = 1 WHERE DATE(order_date) = ? AND is_closed = 0',
                [today],
                (u2Err) => {
                  if (u2Err) {
                    return res.status(500).json({ error: u2Err.message });
                  }
                  res.json({ message: 'Günsonu alındı', archived_amount: total });
                }
              );
            });
          }
        );
      }
    );
  });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Kick off initial model training and periodic retraining (hourly)
  try {
    setTimeout(() => trainForecastModel(() => {}), 5000);
    setInterval(() => trainForecastModel(() => {}), 60 * 60 * 1000);
    refreshWeatherForecast(() => {});
    setInterval(() => refreshWeatherForecast(() => {}), 6 * 60 * 60 * 1000);
  } catch (e) {
    // ignore training scheduling errors
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});
