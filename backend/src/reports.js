const MAX_DAYS = 366;
const DAY = 24 * 60 * 60 * 1000;

// Datas trabalham no fuso local do computador do balcão, no formato AAAA-MM-DD.
function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const cents = n => Math.round(n * 100) / 100;

function totals(orders) {
  const revenue = cents(orders.reduce((s, o) => s + o.total, 0));
  return {
    revenue,
    orders: orders.length,
    averageTicket: orders.length ? cents(revenue / orders.length) : 0,
    fees: cents(orders.reduce((s, o) => s + o.fee, 0)),
    discounts: cents(orders.reduce((s, o) => s + o.discount, 0)),
    itemsSold: orders.reduce((s, o) => s + o.items.reduce((q, i) => q + i.qty, 0), 0),
  };
}

function groupBy(orders, key) {
  const groups = new Map();
  for (const o of orders) {
    const name = o[key] || 'Não informado';
    const g = groups.get(name) || { name, revenue: 0, orders: 0 };
    g.revenue += o.total;
    g.orders++;
    groups.set(name, g);
  }
  return [...groups.values()].map(g => ({ ...g, revenue: cents(g.revenue) })).sort((a, b) => b.revenue - a.revenue);
}

function topItems(orders, limit = 10) {
  const items = new Map();
  for (const o of orders) for (const i of o.items) {
    const id = i.name.trim().toLowerCase();
    const g = items.get(id) || { name: i.name.trim(), qty: 0, revenue: 0 };
    g.qty += i.qty;
    g.revenue += i.qty * i.price;
    items.set(id, g);
  }
  return [...items.values()].map(g => ({ ...g, revenue: cents(g.revenue) }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, limit);
}

function summarize(allOrders, fromValue, toValue) {
  const from = parseDate(fromValue), to = parseDate(toValue);
  if (!from || !to) throw new RangeError('Informe as datas no formato AAAA-MM-DD.');
  if (to < from) throw new RangeError('A data final precisa ser depois da inicial.');
  const length = Math.round((to - from) / DAY) + 1;
  if (length > MAX_DAYS) throw new RangeError(`Escolha um período de até ${MAX_DAYS} dias.`);

  const inRange = (start, end) => allOrders.filter(o => {
    const key = dayKey(new Date(o.createdAt));
    return key >= dayKey(start) && key <= dayKey(end);
  });
  const orders = inRange(from, to);
  const previousFrom = addDays(from, -length), previousTo = addDays(from, -1);

  const days = new Map();
  for (let i = 0; i < length; i++) days.set(dayKey(addDays(from, i)), { date: dayKey(addDays(from, i)), revenue: 0, orders: 0 });
  for (const o of orders) {
    const d = days.get(dayKey(new Date(o.createdAt)));
    d.revenue = cents(d.revenue + o.total);
    d.orders++;
  }

  return {
    from: dayKey(from),
    to: dayKey(to),
    totals: totals(orders),
    previous: { from: dayKey(previousFrom), to: dayKey(previousTo), totals: totals(inRange(previousFrom, previousTo)) },
    byDay: [...days.values()],
    byPayment: groupBy(orders, 'payment'),
    byMode: groupBy(orders, 'mode'),
    topItems: topItems(orders),
  };
}

module.exports = { summarize };
