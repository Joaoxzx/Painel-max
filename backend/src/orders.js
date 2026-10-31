const { randomUUID } = require('node:crypto');
const { transaction, getSetting, setSetting } = require('./db');

class ValidationError extends Error {}

// Cada ingrediente: { name, removed } para os do cardápio e { name, extra } para os adicionados no pedido.
function validateIngredients(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 40) throw new ValidationError('Confira os ingredientes dos itens.');
  return list.flatMap(ing => {
    if (!ing || typeof ing.name !== 'string') throw new ValidationError('Confira os ingredientes dos itens.');
    const name = ing.name.trim().slice(0, 80);
    if (!name || (ing.extra && ing.removed)) return [];
    return [{ name, removed: !!ing.removed, extra: !!ing.extra }];
  });
}

function validate(body) {
  if (!body || typeof body.customer !== 'string' || !body.customer.trim() || !Array.isArray(body.items) || !body.items.length) {
    throw new ValidationError('Informe o cliente e pelo menos um item.');
  }
  const items = body.items.map(i => {
    if (!i || typeof i.name !== 'string' || !i.name.trim() || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 999 ||
        !Number.isFinite(i.price) || i.price < 0 || i.price > 99999) {
      throw new ValidationError('Confira descrição, quantidade e preço dos itens.');
    }
    return {
      name: i.name.trim().slice(0, 200),
      qty: i.qty,
      price: Math.round(i.price * 100) / 100,
      notes: String(i.notes || '').trim().slice(0, 500),
      ingredients: validateIngredients(i.ingredients),
    };
  });
  const fee = Number(body.fee), discount = Number(body.discount);
  if (![fee, discount].every(n => Number.isFinite(n) && n >= 0 && n <= 99999)) throw new ValidationError('Taxa ou desconto inválido.');
  const subtotal = items.reduce((s, i) => s + Math.round(i.price * 100) * i.qty, 0) / 100;
  if (discount > subtotal + fee) throw new ValidationError('O desconto não pode exceder o valor do pedido.');
  const result = { items, fee, discount, subtotal, total: Math.round((subtotal + fee - discount) * 100) / 100 };
  for (const key of ['customer', 'phone', 'address', 'complement', 'reference', 'neighborhood', 'notes', 'payment', 'mode']) {
    result[key] = String(body[key] || '').trim().slice(0, 1000);
  }
  return result;
}

const FIELDS = ['customer', 'phone', 'address', 'complement', 'reference', 'neighborhood', 'notes', 'payment', 'mode'];

function toOrder(row, items) {
  const order = {
    items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price, notes: i.notes, ingredients: JSON.parse(i.ingredients) })),
    fee: row.fee,
    discount: row.discount,
    subtotal: row.subtotal,
    total: row.total,
    ...Object.fromEntries(FIELDS.map(k => [k, row[k]])),
    id: row.id,
    number: row.number,
    customerId: row.customer_id,
    createdAt: row.created_at,
  };
  if (row.updated_at) order.updatedAt = row.updated_at;
  return order;
}

// Pedidos no banco: tabela orders (cabeçalho) + order_items (itens, na ordem em que foram digitados).
function createStore(db) {
  const insertOrder = db.prepare(`INSERT INTO orders (id, number, customer_id, ${FIELDS.join(', ')}, fee, discount, subtotal, total, created_at, updated_at)
    VALUES (:id, :number, :customer_id, ${FIELDS.map(k => ':' + k).join(', ')}, :fee, :discount, :subtotal, :total, :created_at, :updated_at)`);
  const updateOrder = db.prepare(`UPDATE orders SET customer_id = :customer_id, ${FIELDS.map(k => k + ' = :' + k).join(', ')},
    fee = :fee, discount = :discount, subtotal = :subtotal, total = :total, updated_at = :updated_at WHERE id = :id`);
  const insertItem = db.prepare(`INSERT INTO order_items (order_id, position, name, qty, price, notes, ingredients)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare('SELECT * FROM orders WHERE id = ?');
  const itemsOf = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY position');

  const params = (data, extra) => ({
    ...Object.fromEntries(FIELDS.map(k => [k, data[k] ?? ''])),
    customer_id: data.customerId ?? null,
    fee: data.fee, discount: data.discount, subtotal: data.subtotal, total: data.total,
    updated_at: null,
    ...extra,
  });
  const saveItems = (orderId, items) => items.forEach((i, n) =>
    insertItem.run(orderId, n, i.name, i.qty, i.price, i.notes || '', JSON.stringify(i.ingredients || [])));

  // O número nunca se repete, nem depois de excluir o último pedido.
  const nextNumber = () => {
    const max = db.prepare('SELECT MAX(number) AS n FROM orders').get().n || 0;
    return Math.max(max, Number(getSetting(db, 'last_order_number')) || 0) + 1;
  };

  const store = {
    list() {
      const items = new Map();
      for (const i of db.prepare('SELECT * FROM order_items ORDER BY order_id, position').all()) {
        if (!items.has(i.order_id)) items.set(i.order_id, []);
        items.get(i.order_id).push(i);
      }
      return db.prepare('SELECT * FROM orders ORDER BY number DESC').all().map(row => toOrder(row, items.get(row.id) || []));
    },
    get(id) {
      const row = byId.get(id);
      return row ? toOrder(row, itemsOf.all(id)) : null;
    },
    // Também usado na importação dos JSON antigos, por isso aceita id, número e datas já existentes.
    add(data) {
      return transaction(db, () => {
        const id = data.id || randomUUID();
        const number = data.number || nextNumber();
        insertOrder.run(params(data, { id, number, created_at: data.createdAt || new Date().toISOString(), updated_at: data.updatedAt || null }));
        saveItems(id, data.items);
        if (number > (Number(getSetting(db, 'last_order_number')) || 0)) setSetting(db, 'last_order_number', number);
        return store.get(id);
      });
    },
    // Mantém id, número e data de criação; só troca o conteúdo do pedido.
    update(id, data) {
      if (!byId.get(id)) return null;
      return transaction(db, () => {
        updateOrder.run(params(data, { id, updated_at: new Date().toISOString() }));
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
        saveItems(id, data.items);
        return store.get(id);
      });
    },
    remove: id => db.prepare('DELETE FROM orders WHERE id = ?').run(id).changes > 0,
  };
  return store;
}

module.exports = { validate, createStore, ValidationError };
