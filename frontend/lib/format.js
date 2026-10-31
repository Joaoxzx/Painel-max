export const money = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatPhone(value) {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value || '';
}
