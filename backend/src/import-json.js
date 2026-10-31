const fs = require('node:fs');
const path = require('node:path');
const { transaction, getSetting, setSetting } = require('./db');
const { createStore } = require('./orders');
const { createMenuStore } = require('./menu');

const defaultMenu = path.join(__dirname, 'menu.json');

// Roda uma única vez: leva os pedidos e o cardápio dos arquivos JSON antigos para o banco.
// Se não houver cardápio salvo, usa o cardápio padrão. Depois renomeia os JSON para ".migrado" (ficam como garantia).
function importJson(db, { ordersFile, menuFile } = {}) {
  if (getSetting(db, 'json_imported')) return null;
  const read = file => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  const oldOrders = read(ordersFile) || [];
  const oldMenu = read(menuFile) || read(defaultMenu);

  transaction(db, () => {
    const orders = createStore(db);
    const customerExists = db.prepare('SELECT 1 FROM customers WHERE id = ?');
    for (const o of [...oldOrders].sort((a, b) => a.number - b.number)) {
      orders.add({
        ...o,
        items: (o.items || []).map(i => ({ ...i, notes: i.notes || '', ingredients: i.ingredients || [] })),
        fee: o.fee || 0,
        discount: o.discount || 0,
        customerId: o.customerId != null && customerExists.get(o.customerId) ? o.customerId : null,
      });
    }
    const menu = createMenuStore(db);
    for (const m of oldMenu) menu.add({ ...m, category: m.category || 'Outros', ingredients: m.ingredients || [] });
    setSetting(db, 'json_imported', new Date().toISOString());
  });

  for (const file of [ordersFile, menuFile]) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      fs.renameSync(file, file + '.migrado');
    } catch (err) {
      console.error(`Não foi possível renomear ${file}:`, err.message);
    }
  }
  return { orders: oldOrders.length, menu: oldMenu.length };
}

module.exports = { importJson };
