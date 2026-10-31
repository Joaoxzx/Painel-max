const { ValidationError } = require('./orders');

const FIELDS = ['address', 'neighborhood', 'complement', 'reference'];
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digits = s => String(s || '').replace(/\D/g, '');

function validateCustomer(body) {
  if (!body || typeof body.name !== 'string' || !body.name.trim()) throw new ValidationError('Informe o nome do cliente.');
  const phone = digits(body.phone);
  if (phone && (phone.length < 8 || phone.length > 13)) throw new ValidationError('Telefone inválido.');
  const customer = { name: body.name.trim().replace(/\s+/g, ' ').slice(0, 200), phone: phone || null };
  for (const key of FIELDS) customer[key] = String(body[key] || '').trim().slice(0, 1000);
  return customer;
}

const toJson = row => row && ({
  id: row.id,
  name: row.name,
  phone: row.phone || '',
  address: row.address,
  neighborhood: row.neighborhood,
  complement: row.complement,
  reference: row.reference,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function createCustomerStore(db) {
  const byId = db.prepare('SELECT * FROM customers WHERE id = ?');
  const byPhone = db.prepare('SELECT * FROM customers WHERE phone = ?');
  const insert = db.prepare(`INSERT INTO customers (name, search_name, phone, address, neighborhood, complement, reference, created_at, updated_at)
    VALUES (:name, :search_name, :phone, :address, :neighborhood, :complement, :reference, :now, :now)`);
  const update = db.prepare(`UPDATE customers SET name = :name, search_name = :search_name, phone = :phone, address = :address,
    neighborhood = :neighborhood, complement = :complement, reference = :reference, updated_at = :now WHERE id = :id`);

  const checkPhone = (phone, id) => {
    const other = phone && byPhone.get(phone);
    if (other && other.id !== id) throw new ValidationError(`O telefone já está cadastrado para ${other.name}.`);
  };
  const params = (data, extra) => ({ ...data, search_name: norm(data.name), now: new Date().toISOString(), ...extra });

  const store = {
    list: () => db.prepare('SELECT * FROM customers ORDER BY search_name').all().map(toJson),
    get: id => toJson(byId.get(Number(id))),

    // Busca pelo começo de qualquer parte do nome ou por qualquer trecho do telefone.
    search(q, limit = 8) {
      const text = norm(q), phone = digits(q);
      if (text.length < 2) return [];
      const rows = db.prepare(`SELECT * FROM customers
        WHERE search_name LIKE :start OR search_name LIKE :word ${phone.length >= 3 ? 'OR phone LIKE :phone' : ''}
        ORDER BY updated_at DESC LIMIT :limit`)
        .all({ start: text + '%', word: '% ' + text + '%', ...(phone.length >= 3 && { phone: '%' + phone + '%' }), limit });
      return rows.map(toJson);
    },

    add(data) {
      checkPhone(data.phone);
      const { lastInsertRowid } = insert.run(params(data));
      return store.get(lastInsertRowid);
    },

    update(id, data) {
      if (!byId.get(Number(id))) return null;
      checkPhone(data.phone, Number(id));
      update.run(params(data, { id: Number(id) }));
      return store.get(id);
    },

    remove: id => db.prepare('DELETE FROM customers WHERE id = ?').run(Number(id)).changes > 0,

    // Ao salvar um pedido: atualiza o cliente escolhido, ou acha pelo telefone, ou cadastra um novo.
    // save = false (caixinha "Salvar cliente" desmarcada): não mexe no cadastro, só mantém o vínculo com o cliente escolhido.
    // save = true: cadastra mesmo sem telefone. Sem a opção, pedidos sem telefone e sem cliente escolhido não criam
    // cadastro (evita encher a lista de "João" do balcão).
    saveFromOrder(order, customerId, save) {
      const chosen = customerId != null && byId.get(Number(customerId));
      if (save === false) return chosen ? chosen.id : null;
      const data = validateCustomer({ ...order, name: order.customer });
      if (chosen) {
        // Campos deixados em branco no pedido não apagam o que já estava cadastrado.
        for (const key of [...FIELDS, 'phone']) if (!data[key]) data[key] = chosen[key];
        return store.update(chosen.id, data).id;
      }
      if (!data.phone) return save ? store.add(data).id : null;
      const existing = byPhone.get(data.phone);
      if (existing) {
        for (const key of FIELDS) if (!data[key]) data[key] = existing[key];
        return store.update(existing.id, data).id;
      }
      return store.add(data).id;
    },
  };
  return store;
}

// Junta ao cliente os números dos pedidos dele (pedidos antigos, sem cliente vinculado, entram pelo telefone).
function withOrderStats(customers, orders) {
  return customers.map(c => {
    const mine = orders.filter(o => (o.customerId != null ? o.customerId === c.id : c.phone && digits(o.phone) === c.phone));
    return {
      ...c,
      orders: mine.length,
      totalSpent: Math.round(mine.reduce((s, o) => s + o.total, 0) * 100) / 100,
      lastOrderAt: mine.reduce((last, o) => (o.createdAt > last ? o.createdAt : last), '') || null,
    };
  });
}

module.exports = { createCustomerStore, validateCustomer, withOrderStats };
