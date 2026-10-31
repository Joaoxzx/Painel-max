const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validate, createStore } = require('../src/orders');
const { createApp } = require('../src/server');
const { openDb } = require('../src/db');
const { createCustomerStore } = require('../src/customers');
const { createMenuStore } = require('../src/menu');
const { importJson } = require('../src/import-json');

const base = { customer: 'Lucas', items: [{ name: 'Pizza', qty: 2, price: 39.9 }], fee: 5, discount: 3 };

test('calcula total com entrega e desconto', () => { assert.equal(validate(base).total, 81.8); });
test('rejeita desconto maior que o pedido', () => { assert.throws(() => validate({ ...base, discount: 100 })); });
test('rejeita quantidade inválida', () => { assert.throws(() => validate({ ...base, items: [{ name: 'Pizza', qty: -1, price: 10 }] })); });
test('preserva observação por item sem alterar o total', () => {
  const o = validate({ ...base, items: [{ name: 'X BACON', qty: 1, price: 23, notes: ' Sem bacon ' }] });
  assert.equal(o.items[0].notes, 'Sem bacon');
  assert.equal(o.total, 25);
});
test('pedidos sem observação continuam válidos', () => { assert.equal(validate(base).items[0].notes, ''); });

test('guarda ingredientes retirados e adicionados', () => {
  const ingredients = [
    { name: ' Pão ' }, { name: 'cebola', removed: true }, { name: 'ovo', extra: true },
    { name: '   ' }, { name: 'bacon', extra: true, removed: true },
  ];
  const o = validate({ ...base, items: [{ name: 'X-TUDO', qty: 1, price: 25, ingredients }] });
  assert.deepEqual(o.items[0].ingredients, [
    { name: 'Pão', removed: false, extra: false },
    { name: 'cebola', removed: true, extra: false },
    { name: 'ovo', removed: false, extra: true },
  ]);
  assert.deepEqual(validate(base).items[0].ingredients, []);
  assert.throws(() => validate({ ...base, items: [{ name: 'X', qty: 1, price: 1, ingredients: 'cebola' }] }));
});

test('cardápio tem nomes únicos, preços e ingredientes', () => {
  const menu = require('../src/menu.json');
  assert.equal(new Set(menu.map(m => m.name)).size, menu.length);
  for (const m of menu) {
    assert.ok(m.price > 0, m.name);
    assert.ok(m.ingredients.length > 0, m.name);
  }
});

test('API salva e lista pedidos com numeração sequencial', async () => {
  const db = openDb(':memory:');
  const server = createApp(createStore(db), createMenuStore(db), createCustomerStore(db)).listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/orders`;
  try {
    const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const first = await post(base);
    assert.equal(first.status, 201);
    assert.equal((await first.json()).number, 1);
    assert.equal((await (await post(base)).json()).number, 2);
    const invalid = await post({ ...base, customer: '' });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /cliente/);
    const list = await (await fetch(url)).json();
    assert.deepEqual(list.map(o => o.number), [2, 1]);

    const send = (method, id, body) => fetch(`${url}/${id}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    const edited = await send('PUT', list[1].id, { ...base, customer: 'Maria', discount: 0 });
    assert.equal(edited.status, 200);
    const order = await edited.json();
    assert.equal(order.customer, 'Maria');
    assert.equal(order.total, 84.8);
    assert.equal(order.number, 1);
    assert.equal(order.createdAt, list[1].createdAt);
    assert.equal((await send('PUT', list[1].id, { ...base, customer: '' })).status, 400);

    assert.equal((await send('DELETE', list[0].id)).status, 204);
    assert.equal((await send('DELETE', list[0].id)).status, 404);
    assert.equal((await send('PUT', list[0].id, base)).status, 404);
    const after = await (await fetch(url)).json();
    assert.deepEqual(after.map(o => [o.number, o.customer]), [[1, 'Maria']]);

    // Excluir o último pedido não faz o número dele ser usado de novo.
    assert.equal((await (await post(base)).json()).number, 3);
  } finally {
    server.close();
  }
});

test('pedido guarda itens na ordem, ingredientes e cliente; excluir cliente não apaga o pedido', () => {
  const db = openDb(':memory:');
  const orders = createStore(db);
  const customers = createCustomerStore(db);
  const maria = customers.add({ name: 'Maria', phone: '11987654321', address: '', neighborhood: '', complement: '', reference: '' });
  const data = validate({ ...base, items: [
    { name: 'B', qty: 1, price: 10, ingredients: [{ name: 'cebola', removed: true }] },
    { name: 'A', qty: 3, price: 5 },
  ] });
  const order = orders.add({ ...data, customerId: maria.id });
  assert.deepEqual(order.items.map(i => i.name), ['B', 'A']);
  assert.deepEqual(order.items[0].ingredients, [{ name: 'cebola', removed: true, extra: false }]);
  assert.equal(order.customerId, maria.id);
  assert.equal(orders.update(order.id, { ...data, items: [data.items[1]] }).items.length, 1);
  customers.remove(maria.id);
  assert.equal(orders.get(order.id).customerId, null);
  assert.ok(orders.remove(order.id));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_items').get().n, 0);
});

test('importa pedidos e cardápio dos JSON antigos uma única vez', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'importar-'));
  try {
    const ordersFile = path.join(dir, 'orders.json'), menuFile = path.join(dir, 'menu.json');
    const old = [
      { id: 'b', number: 7, customer: 'Ana', phone: '', items: [{ name: 'Pizza', qty: 1, price: 40, notes: '' }], fee: 0, discount: 0, subtotal: 40, total: 40, createdAt: '2026-10-02T10:00:00.000Z', customerId: 99 },
      { id: 'a', number: 3, customer: 'Bia', items: [{ name: 'Suco', qty: 2, price: 8 }], fee: 5, discount: 0, subtotal: 16, total: 21, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T11:00:00.000Z' },
    ];
    fs.writeFileSync(ordersFile, JSON.stringify(old));
    fs.writeFileSync(menuFile, JSON.stringify([{ id: 'x', category: 'Bebidas', name: 'Suco', price: 8, ingredients: [] }]));

    const db = openDb(path.join(dir, 'painel.db'));
    assert.deepEqual(importJson(db, { ordersFile, menuFile }), { orders: 2, menu: 1 });
    const orders = createStore(db).list();
    assert.deepEqual(orders.map(o => [o.number, o.id, o.customer]), [[7, 'b', 'Ana'], [3, 'a', 'Bia']]);
    assert.equal(orders[0].customerId, null); // cliente que não existe vira "sem vínculo"
    assert.equal(orders[1].updatedAt, old[1].updatedAt);
    assert.deepEqual(orders[1].items[0].ingredients, []);
    assert.equal(createStore(db).add(validate(base)).number, 8);
    assert.deepEqual(createMenuStore(db).list(), [{ id: 'x', category: 'Bebidas', name: 'Suco', price: 8, ingredients: [] }]);

    assert.ok(!fs.existsSync(ordersFile) && fs.existsSync(ordersFile + '.migrado') && fs.existsSync(menuFile + '.migrado'));
    fs.writeFileSync(ordersFile, JSON.stringify(old));
    assert.equal(importJson(db, { ordersFile, menuFile }), null); // não importa de novo
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sem JSON antigo, o banco começa com o cardápio padrão', () => {
  const db = openDb(':memory:');
  assert.deepEqual(importJson(db), { orders: 0, menu: require('../src/menu.json').length });
  assert.equal(createMenuStore(db).list()[0].name, 'HAMBÚRGUER');
});
