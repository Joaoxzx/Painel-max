const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/orders');
const { createMenuStore, validateMenuItem } = require('../src/menu');
const { createApp } = require('../src/server');
const { openDb } = require('../src/db');
const { createCustomerStore } = require('../src/customers');
const { importJson } = require('../src/import-json');
const defaults = require('../src/menu.json');

test('limpa e valida item do cardápio', () => {
  assert.deepEqual(
    validateMenuItem({ category: ' Lanches ', name: '  X  SALADA ', price: '18.5', ingredients: [' Pão ', '', 'alface', 'alface'] }),
    { category: 'Lanches', name: 'X SALADA', price: 18.5, ingredients: ['Pão', 'alface'] },
  );
  assert.equal(validateMenuItem({ name: 'Suco', price: 8, ingredients: [] }).category, 'Outros');
  assert.throws(() => validateMenuItem({ name: '', price: 10, ingredients: [] }), /nome/);
  assert.throws(() => validateMenuItem({ name: 'X', price: '', ingredients: [] }), /preço/);
  assert.throws(() => validateMenuItem({ name: 'X', price: -1, ingredients: [] }), /preço/);
  assert.throws(() => validateMenuItem({ name: 'X', price: 1, ingredients: 'pão' }), /ingredientes/);
});

test('API do cardápio: começa no padrão, adiciona, edita, remove e salva no banco', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardapio-'));
  const file = path.join(dir, 'painel.db');
  const db = openDb(file);
  importJson(db);
  const server = createApp(createStore(db), createMenuStore(db), createCustomerStore(db)).listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/menu`;
  const send = (method, suffix, body) => fetch(url + suffix, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  try {
    assert.equal((await (await fetch(url)).json()).length, defaults.length);

    const created = await send('POST', '', { category: 'Bebidas', name: 'Refrigerante 2L', price: 12, ingredients: [] });
    assert.equal(created.status, 201);
    const item = await created.json();
    assert.equal((await send('POST', '', { name: 'refrigerante 2l', price: 1, ingredients: [] })).status, 400);

    const edited = await send('PUT', '/' + item.id, { ...item, price: 13, ingredients: ['gelado'] });
    assert.deepEqual(await edited.json(), { ...item, price: 13, ingredients: ['gelado'] });
    assert.equal((await send('PUT', '/' + defaults[0].id, { ...defaults[0], name: 'Refrigerante 2L' })).status, 400);

    assert.equal((await send('DELETE', '/' + defaults[0].id)).status, 204);
    assert.equal((await send('DELETE', '/' + defaults[0].id)).status, 404);

    // Reabre o arquivo do banco para conferir que ficou salvo.
    const reopened = openDb(file);
    const saved = createMenuStore(reopened).list();
    assert.equal(saved.length, defaults.length);
    assert.equal(saved.at(-1).price, 13);
    assert.ok(!saved.some(m => m.id === defaults[0].id));
    reopened.close();
  } finally {
    server.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
