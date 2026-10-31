const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../src/db');
const { createCustomerStore, validateCustomer, withOrderStats } = require('../src/customers');
const { createStore } = require('../src/orders');
const { createMenuStore } = require('../src/menu');
const { createApp } = require('../src/server');
const { backupNow } = require('../src/backup');

const maria = { name: 'Maria José', phone: '(11) 98765-4321', address: 'Rua A, 10', neighborhood: 'Centro' };

test('valida e limpa o cadastro', () => {
  const c = validateCustomer({ ...maria, name: '  Maria   José ' });
  assert.equal(c.name, 'Maria José');
  assert.equal(c.phone, '11987654321');
  assert.equal(c.complement, '');
  assert.equal(validateCustomer({ name: 'Ana' }).phone, null);
  assert.throws(() => validateCustomer({ name: ' ' }), /nome/);
  assert.throws(() => validateCustomer({ name: 'Ana', phone: '123' }), /Telefone/);
});

test('busca por nome sem acento e por trecho do telefone', () => {
  const customers = createCustomerStore(openDb(':memory:'));
  customers.add(validateCustomer(maria));
  customers.add(validateCustomer({ name: 'José Carlos', phone: '11 5555-1234' }));
  assert.deepEqual(customers.search('jose').map(c => c.name).sort(), ['José Carlos', 'Maria José']);
  assert.deepEqual(customers.search('MAR').map(c => c.name), ['Maria José']);
  assert.deepEqual(customers.search('4321').map(c => c.name), ['Maria José']);
  assert.deepEqual(customers.search('a'), []);
});

test('não deixa dois clientes com o mesmo telefone', () => {
  const customers = createCustomerStore(openDb(':memory:'));
  const a = customers.add(validateCustomer(maria));
  const b = customers.add(validateCustomer({ name: 'Outro', phone: '11 91111-2222' }));
  assert.throws(() => customers.add(validateCustomer({ name: 'X', phone: maria.phone })), /Maria José/);
  assert.throws(() => customers.update(b.id, validateCustomer({ name: 'Outro', phone: maria.phone })), /já está cadastrado/);
  assert.equal(customers.update(a.id, validateCustomer({ ...maria, address: 'Rua B' })).address, 'Rua B');
});

test('pedido cadastra, reaproveita pelo telefone e não apaga dados com campo em branco', () => {
  const customers = createCustomerStore(openDb(':memory:'));
  const id = customers.saveFromOrder({ customer: 'Maria', phone: '11987654321', address: 'Rua A', neighborhood: 'Centro' });
  assert.ok(id);
  assert.equal(customers.saveFromOrder({ customer: 'Maria José', phone: '(11) 98765-4321', address: '' }), id);
  const saved = customers.get(id);
  assert.equal(saved.name, 'Maria José');
  assert.equal(saved.address, 'Rua A');

  assert.equal(customers.saveFromOrder({ customer: 'Balcão sem telefone' }), null);
  assert.equal(customers.saveFromOrder({ customer: 'Maria J.', address: 'Rua Nova' }, id), id);
  assert.equal(customers.get(id).phone, '11987654321');
  assert.equal(customers.get(id).address, 'Rua Nova');
  assert.equal(customers.list().length, 1);
});

test('caixinha "Salvar cliente": desmarcada não mexe no cadastro, marcada cadastra mesmo sem telefone', () => {
  const customers = createCustomerStore(openDb(':memory:'));
  assert.equal(customers.saveFromOrder({ customer: 'João', phone: '11987654321' }, null, false), null);
  assert.equal(customers.list().length, 0);

  const id = customers.saveFromOrder({ customer: 'João', address: 'Rua A' }, null, true);
  assert.equal(customers.get(id).address, 'Rua A');
  // Escolhido mas desmarcado: o pedido continua vinculado e o cadastro fica como estava.
  assert.equal(customers.saveFromOrder({ customer: 'João Silva', address: 'Rua B' }, id, false), id);
  assert.deepEqual([customers.get(id).name, customers.get(id).address], ['João', 'Rua A']);
});

test('estatísticas juntam pedidos vinculados e antigos pelo telefone', () => {
  const [c] = withOrderStats([{ id: 1, phone: '11987654321' }], [
    { customerId: 1, total: 30, createdAt: '2026-10-01T10:00:00Z' },
    { phone: '(11) 98765-4321', total: 20, createdAt: '2026-10-05T10:00:00Z' },
    { customerId: 2, phone: '11987654321', total: 99, createdAt: '2026-10-09T10:00:00Z' },
  ]);
  assert.deepEqual([c.orders, c.totalSpent, c.lastOrderAt], [2, 50, '2026-10-05T10:00:00Z']);
});

test('API: salvar pedido vincula o cliente e a aba de clientes mostra os números', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clientes-'));
  const db = openDb(path.join(dir, 'painel.db'));
  const server = createApp(createStore(db), createMenuStore(db), createCustomerStore(db)).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const order = { customer: 'Maria', phone: '11987654321', address: 'Rua A', items: [{ name: 'Pizza', qty: 1, price: 40 }], fee: 5, discount: 0 };
    const first = await (await post('/orders', order)).json();
    assert.ok(first.customerId);
    const second = await (await post('/orders', { ...order, customerId: first.customerId, phone: '' })).json();
    assert.equal(second.customerId, first.customerId);
    // Telefone inválido não impede o pedido.
    assert.equal((await post('/orders', { ...order, phone: '12' })).status, 201);

    const [found] = await (await fetch(base + '/customers?q=mar')).json();
    assert.equal(found.address, 'Rua A');
    const [listed] = await (await fetch(base + '/customers')).json();
    assert.deepEqual([listed.orders, listed.totalSpent], [2, 90]);

    assert.equal((await post('/customers', { name: 'Outra', phone: '11987654321' })).status, 400);
    assert.equal((await fetch(base + '/customers/' + found.id, { method: 'DELETE' })).status, 204);
    assert.deepEqual(await (await fetch(base + '/customers')).json(), []);
  } finally {
    server.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backup diário copia banco e JSON e guarda só os últimos 30 dias', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
  const db = openDb(path.join(dir, 'painel.db'));
  try {
    createCustomerStore(db).add(validateCustomer(maria));
    const orders = path.join(dir, 'orders.json');
    fs.writeFileSync(orders, '[]');
    const backups = path.join(dir, 'backups');
    for (let d = 1; d <= 31; d++) fs.mkdirSync(path.join(backups, `2020-01-${String(d).padStart(2, '0')}`), { recursive: true });

    const target = backupNow(db, backups, [orders, path.join(dir, 'nao-existe.json')]);
    assert.ok(fs.existsSync(path.join(target, 'orders.json')));
    const copy = new DatabaseSync(path.join(target, 'painel.db'), { readOnly: true });
    assert.equal(copy.prepare('SELECT name FROM customers').get().name, 'Maria José');
    copy.close();
    assert.equal(backupNow(db, backups, [orders]), null); // só uma vez por dia
    assert.equal(fs.readdirSync(backups).length, 30);
    assert.ok(!fs.existsSync(path.join(backups, '2020-01-01')));
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
