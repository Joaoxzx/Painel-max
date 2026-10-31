'use client';

import { useState } from 'react';
import { money } from '../lib/format';
import { matchesAll, searchWords } from '../lib/search';

export default function MenuSearch({ value, menu, onChange, onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const words = searchWords(value);
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
