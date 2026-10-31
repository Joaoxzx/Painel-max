const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validate, createStore } = require('../src/orders');
const { createApp } = require('../src/server');

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

test('API salva e lista pedidos com numeração sequencial', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-'));
  const server = createApp(createStore(path.join(dir, 'orders.json'))).listen(0);
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
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
