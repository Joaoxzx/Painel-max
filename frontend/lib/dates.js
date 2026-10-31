// Datas no fuso local, no formato AAAA-MM-DD (o mesmo do <input type="date">).
export const toKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromKey = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const monthRange = (y, m) => ({ from: toKey(new Date(y, m, 1)), to: toKey(new Date(y, m + 1, 0)) });
export const shortDate = key => fromKey(key).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
export const fullDate = key => fromKey(key).toLocaleDateString('pt-BR');

export function presets(today = new Date()) {
  const t = toKey(today);
  return [
    { label: 'Hoje', from: t, to: t },
    { label: 'Últimos 7 dias', from: toKey(addDays(today, -6)), to: t },
    { label: 'Este mês', ...monthRange(today.getFullYear(), today.getMonth()) },
    { label: 'Mês passado', ...monthRange(today.getFullYear(), today.getMonth() - 1) },
  ];
}

// Se o período é exatamente um mês inteiro, devolve { year, month }.
export function wholeMonth({ from, to }) {
  const f = fromKey(from);
  const r = monthRange(f.getFullYear(), f.getMonth());
  return r.from === from && r.to === to ? { year: f.getFullYear(), month: f.getMonth() } : null;
}
