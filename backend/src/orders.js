const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class ValidationError extends Error {}

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

function createStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let orders = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  return {
    list: () => orders,
    add(data) {
      const order = {
        ...data,
        id: randomUUID(),
        number: orders.reduce((n, o) => Math.max(n, o.number), 0) + 1,
        createdAt: new Date().toISOString(),
      };
      const next = [order, ...orders];
      fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2));
      fs.renameSync(file + '.tmp', file);
      orders = next;
      return order;
    },
  };
}

module.exports = { validate, createStore, ValidationError };
