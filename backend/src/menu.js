const { randomUUID } = require('node:crypto');
const { ValidationError } = require('./orders');

function validateMenuItem(body) {
  if (!body || typeof body.name !== 'string' || !body.name.trim()) throw new ValidationError('Informe o nome do item.');
  const price = Number(body.price);
  if (body.price === '' || !Number.isFinite(price) || price < 0 || price > 99999) throw new ValidationError('Informe um preço válido.');
  if (!Array.isArray(body.ingredients) || body.ingredients.length > 40 || body.ingredients.some(i => typeof i !== 'string')) {
    throw new ValidationError('Confira os ingredientes.');
  }
  const ingredients = [...new Set(body.ingredients.map(i => i.trim().slice(0, 80)).filter(Boolean))];
  return {
    category: String(body.category || '').trim().slice(0, 60) || 'Outros',
    name: body.name.trim().replace(/\s+/g, ' ').slice(0, 200),
    price: Math.round(price * 100) / 100,
    ingredients,
  };
}

const toItem = row => ({ id: row.id, category: row.category, name: row.name, price: row.price, ingredients: JSON.parse(row.ingredients) });

// Cardápio no banco; a posição guarda a ordem em que os itens aparecem.
function createMenuStore(db) {
  const byId = db.prepare('SELECT * FROM menu_items WHERE id = ?');
  const checkName = (name, id) => {
    const same = db.prepare('SELECT id, name FROM menu_items').all().find(m => m.id !== id && m.name.toLowerCase() === name.toLowerCase());
    if (same) throw new ValidationError(`Já existe um item chamado "${name}".`);
  };
  const store = {
    list: () => db.prepare('SELECT * FROM menu_items ORDER BY position').all().map(toItem),
    // Também usado na importação, por isso aceita um id já existente.
    add(data) {
      checkName(data.name);
      const id = data.id || randomUUID();
      const position = (db.prepare('SELECT MAX(position) AS p FROM menu_items').get().p ?? -1) + 1;
      db.prepare('INSERT INTO menu_items (id, position, category, name, price, ingredients) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, position, data.category, data.name, data.price, JSON.stringify(data.ingredients));
      return toItem(byId.get(id));
    },
    update(id, data) {
      if (!byId.get(id)) return null;
      checkName(data.name, id);
      db.prepare('UPDATE menu_items SET category = ?, name = ?, price = ?, ingredients = ? WHERE id = ?')
        .run(data.category, data.name, data.price, JSON.stringify(data.ingredients), id);
      return toItem(byId.get(id));
    },
    remove: id => db.prepare('DELETE FROM menu_items WHERE id = ?').run(id).changes > 0,
  };
  return store;
}

module.exports = { createMenuStore, validateMenuItem };
