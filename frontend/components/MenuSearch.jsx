'use client';

import { useState } from 'react';
import { money } from '../lib/format';

// Busca sem acento, hífen ou maiúsculas: "hamburguer bacon" acha "HAMBÚRGUER BACON" e "xtudo" acha "X-TUDO".
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const matchesAll = (words, text) => {
  const hay = norm(text), compact = hay.replace(/ /g, '');
  return words.every(w => hay.includes(w) || compact.includes(w));
};

export default function MenuSearch({ value, menu, onChange, onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const words = norm(value).split(/\s+/).filter(Boolean);
  const matches = words.length ? menu.filter(m => matchesAll(words, m.name + ' ' + m.category)).slice(0, 8) : [];
  const show = open && matches.length > 0;
  const pick = m => { onPick(m); setOpen(false); };

  function onKeyDown(e) {
    if (!show) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="menu-search">
      <input
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        aria-label="Descrição do item"
        placeholder="Digite para buscar no cardápio"
        required
        maxLength={200}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {show && (
        <ul className="menu-options" role="listbox">
          {matches.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={e => { e.preventDefault(); pick(m); }}
              onMouseEnter={() => setActive(i)}
            >
              <span><strong>{m.name}</strong><small>{m.ingredients.join(', ')}</small></span>
              <span>{money(m.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
