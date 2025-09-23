const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'bufe_secret_key_2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database initialization
const db = new sqlite3.Database('./bufe.db', (err) => {
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

  // Insert default admin user
  const hashedPassword = bcrypt.hashSync('admin', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, 
    ['admin', hashedPassword, 'admin']);

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
  db.all('SELECT * FROM personnel WHERE is_active = 1 ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/personnel', authenticateToken, (req, res) => {
  const { name, salary, sgk_cost } = req.body;
  db.run('INSERT INTO personnel (name, salary, sgk_cost) VALUES (?, ?, ?)', 
    [name, salary, sgk_cost], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, name, salary, sgk_cost });
  });
});

app.put('/api/personnel/:id', authenticateToken, (req, res) => {
  const { name, salary, sgk_cost } = req.body;
  const { id } = req.params;
  
  db.run('UPDATE personnel SET name = ?, salary = ?, sgk_cost = ? WHERE id = ?', 
    [name, salary, sgk_cost, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Personnel updated successfully' });
  });
});

app.delete('/api/personnel/:id', authenticateToken, (req, res) => {
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

app.post('/api/business-expenses', authenticateToken, (req, res) => {
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

  // Stock Codes Routes
  app.get('/api/stock-codes', authenticateToken, (req, res) => {
    db.all('SELECT * FROM stock_codes WHERE is_active = 1 ORDER BY stock_code', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  app.post('/api/stock-codes', authenticateToken, (req, res) => {
    const { product_name, brand, unit } = req.body;
  
  // Get next stock code by taking max numeric part of all existing codes
  db.get("SELECT COALESCE(MAX(CAST(SUBSTR(stock_code, 4) AS INTEGER)), 0) AS maxnum FROM stock_codes", (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const nextNum = (row && row.maxnum ? row.maxnum : 0) + 1;
    let nextCode = `GDK${String(nextNum).padStart(4, '0')}`;

      db.run('INSERT INTO stock_codes (stock_code, product_name, brand, unit) VALUES (?, ?, ?, ?)', 
        [nextCode, product_name, brand || '', unit], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, stock_code: nextCode, product_name, brand, unit });
      });
    });
  });

  // Update a stock code
  app.put('/api/stock-codes/:id', authenticateToken, (req, res) => {
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
  app.delete('/api/stock-codes/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run('UPDATE stock_codes SET is_active = 0 WHERE id = ?', [id], function(err) {
      if (err) {
        // In rare case of race causing duplicate, try next few codes quickly
        if (err.code === 'SQLITE_CONSTRAINT') {
          let num = nextNum + 1;
          const tryNext = () => {
            const code = `GDK${String(num).padStart(4, '0')}`;
            db.run('INSERT INTO stock_codes (stock_code, product_name, brand, unit) VALUES (?, ?, ?, ?)',
              [code, product_name, brand || '', unit], function(e2) {
                if (e2 && e2.code === 'SQLITE_CONSTRAINT' && num < nextNum + 10) {
                  num += 1; tryNext();
                } else if (e2) {
                  return res.status(500).json({ error: e2.message });
                } else {
                  return res.json({ id: this.lastID, stock_code: code, product_name, brand, unit });
                }
              });
          };
          return tryNext();
        }
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

app.post('/api/stock-purchases', authenticateToken, (req, res) => {
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

app.delete('/api/stock-purchases/:id', authenticateToken, (req, res) => {
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

app.post('/api/product-prices', authenticateToken, (req, res) => {
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

app.put('/api/product-prices/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { price, effective_date } = req.body;
  
  // First get the current product details
  db.get('SELECT * FROM product_prices WHERE id = ?', [id], (err, currentProduct) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!currentProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Create new price entry (preserving price history)
    db.run(`INSERT INTO product_prices (product_name, category, price, effective_date) 
      VALUES (?, ?, ?, ?)`, 
      [currentProduct.product_name, currentProduct.category, price, effective_date], 
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ 
          id: this.lastID, 
          product_name: currentProduct.product_name, 
          category: currentProduct.category, 
          price, 
          effective_date 
        });
      });
  });
});

// Delete a product price entry (removes a single history row)
app.delete('/api/product-prices/:id', authenticateToken, (req, res) => {
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

app.put('/api/product-costs/:productName', authenticateToken, (req, res) => {
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
      });
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
    return res.status(400).json({ error: 'Parca ödeme için geçersiz ürün listesi' });
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
    return res.status(400).json({ error: 'Parca ödeme için geçersiz ürün bilgisi' });
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
    const paymentDescription = description || `Parca ödeme #${orderId}`;

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

            db.run(
              'UPDATE orders SET payment_received = COALESCE(payment_received, 0) + ? WHERE id = ?',
              [totalAmount, orderId],
              (updateErr) => {
                if (updateErr) {
                  return db.run('ROLLBACK', () => res.status(500).json({ error: updateErr.message }));
                }

                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    return res.status(500).json({ error: commitErr.message });
                  }

                  res.json({ partial_order_id: partialOrderId });
                });
              }
            );
          });
        }
      );
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
  });
}

// Daily Revenue
app.get('/api/daily-revenue', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.get('SELECT SUM(COALESCE(payment_received, 0) - COALESCE(change_given, 0)) as daily_revenue FROM orders WHERE DATE(order_date) = ? AND is_closed = 1 AND (accounted = 0 OR accounted IS NULL)',
    [today], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ daily_revenue: (row && row.daily_revenue) ? row.daily_revenue : 0 });
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

// End-of-day endpoint
app.post('/api/end-of-day', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
    db.serialize(() => {
        db.run('UPDATE orders SET is_closed = 1, payment_received = COALESCE(payment_received, total_amount), change_given = COALESCE(change_given, 0) WHERE DATE(order_date) = ? AND is_closed = 0', [today]);
        db.get('SELECT SUM(total_amount) as total FROM orders WHERE DATE(order_date) = ? AND (accounted = 0 OR accounted IS NULL)', [today], (err, row) => {
      if (err) { return res.status(500).json({ error: err.message }); }
      const total = row && row.total ? row.total : 0;
      db.run('INSERT INTO daily_closings (closing_date, total_amount) VALUES (?, ?)', [today, total], function(insErr) {
        if (insErr) { return res.status(500).json({ error: insErr.message }); }
          db.run('UPDATE orders SET accounted = 1 WHERE DATE(order_date) = ?', [today], (uErr) => {
          if (uErr) { return res.status(500).json({ error: uErr.message }); }
          db.run('UPDATE orders SET is_closed = 1, payment_received = COALESCE(payment_received, total_amount), change_given = COALESCE(change_given, 0), accounted = 1 WHERE DATE(order_date) = ? AND is_closed = 0', [today], (u2Err) => {
            if (u2Err) { return res.status(500).json({ error: u2Err.message }); }
            res.json({ message: 'Günsonu alindi', archived_amount: total });
          });
        });
      });
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
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

