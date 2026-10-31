// Busca sem acento, hífen ou maiúsculas: "hamburguer bacon" acha "HAMBÚRGUER BACON" e "xtudo" acha "X-TUDO".
export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const searchWords = q => norm(q).split(/\s+/).filter(Boolean);

export function matchesAll(words, text) {
  const hay = norm(text), compact = hay.replace(/ /g, '');
  return words.every(w => hay.includes(w) || compact.includes(w));
}
