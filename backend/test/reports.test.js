const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('../src/reports');

// Datas locais, como o balcão registra.
const at = (y, m, d, h = 20) => new Date(y, m - 1, d, h).toISOString();
const order = (createdAt, total, extra = {}) => ({
  createdAt, total, fee: 0, discount: 0, payment: 'Pix', mode: 'Delivery',
  items: [{ name: 'Pizza', qty: 1, price: total }], ...extra,
});

const orders = [
  order(at(2026, 2, 3), 999),                      // fora (antes)
  order(at(2026, 2, 4, 0), 50, { fee: 5 }),        // primeiro minuto do período
  order(at(2026, 2, 10), 30, { payment: 'Dinheiro', mode: 'Balcão', discount: 2 }),
  order(at(2026, 2, 10), 20, { items: [{ name: ' pizza ', qty: 2, price: 10 }] }),
  order(at(2026, 2, 28, 23), 100),                 // último dia do período
  order(at(2026, 3, 1), 999),                      // fora (depois)
  order(at(2026, 1, 20), 40),                      // período anterior
];

test('soma só os pedidos dentro do período, incluindo os dias das pontas', () => {
  const r = summarize(orders, '2026-02-04', '2026-02-28');
  assert.deepEqual(r.totals, { revenue: 200, orders: 4, averageTicket: 50, fees: 5, discounts: 2, itemsSold: 5 });
});

test('preenche todos os dias do período, mesmo sem vendas', () => {
  const r = summarize(orders, '2026-02-04', '2026-02-28');
  assert.equal(r.byDay.length, 25);
  assert.deepEqual(r.byDay.find(d => d.date === '2026-02-10'), { date: '2026-02-10', revenue: 50, orders: 2 });
  assert.equal(r.byDay.find(d => d.date === '2026-02-05').revenue, 0);
});

test('compara com o período anterior de mesmo tamanho', () => {
  const r = summarize(orders, '2026-02-04', '2026-02-28');
  assert.equal(r.previous.from, '2026-01-10');
  assert.equal(r.previous.to, '2026-02-03');
  assert.equal(r.previous.totals.revenue, 1039);
});

test('agrupa pagamento, tipo de pedido e itens', () => {
  const r = summarize(orders, '2026-02-04', '2026-02-28');
  assert.deepEqual(r.byPayment, [{ name: 'Pix', revenue: 170, orders: 3 }, { name: 'Dinheiro', revenue: 30, orders: 1 }]);
  assert.equal(r.byMode[1].name, 'Balcão');
  assert.deepEqual(r.topItems, [{ name: 'Pizza', qty: 5, revenue: 200 }]);
});

test('rejeita datas inválidas, invertidas ou período longo demais', () => {
  assert.throws(() => summarize(orders, '2026-02-30', '2026-03-01'), RangeError);
  assert.throws(() => summarize(orders, '2026-02-10', '2026-02-01'), RangeError);
  assert.throws(() => summarize(orders, '2024-01-01', '2026-01-01'), RangeError);
  assert.throws(() => summarize(orders, undefined, '2026-01-01'), RangeError);
});
