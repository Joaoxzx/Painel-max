const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Cada posição é uma versão do banco; para mudar a estrutura, acrescente uma nova no fim (nunca altere as antigas).
const migrations = [
  `CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    search_name TEXT NOT NULL,
    phone TEXT UNIQUE,
    address TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    complement TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX customers_search_name ON customers(search_name);`,

  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    complement TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    payment TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT '',
    fee REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
  CREATE INDEX orders_created_at ON orders(created_at);
  CREATE INDEX orders_customer ON orders(customer_id);

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '[]' -- lista em JSON: [{ name, removed, extra }]
  );
  CREATE INDEX order_items_order ON order_items(order_id);

  CREATE TABLE menu_items (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    ingredients TEXT NOT NULL DEFAULT '[]' -- lista em JSON: ["Pão", "bife", ...]
  );`,
];

// Executa fn dentro de uma transação: ou tudo é salvo, ou nada.
// Usa SAVEPOINT para poder ser chamada dentro de outra transação (ex.: importação chamando store.add).
function transaction(db, fn) {
  db.exec('SAVEPOINT tx');
  try {
    const result = fn();
    db.exec('RELEASE tx');
    return result;
  } catch (err) {
    db.exec('ROLLBACK TO tx');
    db.exec('RELEASE tx');
    throw err;
  }
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // Modo de diário padrão: tudo fica dentro do próprio arquivo .db, então copiar o arquivo basta como backup.
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  for (let v = version; v < migrations.length; v++) {
    transaction(db, () => {
      db.exec(migrations[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

const getSetting = (db, key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
const setSetting = (db, key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

module.exports = { openDb, transaction, getSetting, setSetting };
