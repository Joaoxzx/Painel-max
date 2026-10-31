'use client';

import { useEffect, useState } from 'react';
import { formatPhone } from '../lib/format';

// Campo de texto que sugere clientes cadastrados enquanto se digita (nome ou telefone).
export default function CustomerSearch({ onPick, inputRef, ...inputProps }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const value = inputProps.value;

  useEffect(() => {
    if (!open) return;
    const q = value.trim();
    if (q.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/customers?q=' + encodeURIComponent(q), { signal: controller.signal })
        .then(r => (r.ok ? r.json() : []))
        .then(setResults)
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, open]);

  const show = open && results.length > 0;
  const pick = c => { onPick(c); setOpen(false); };

  function onKeyDown(e) {
    if (!show) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="menu-search">
      <input
        ref={inputRef}
        {...inputProps}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        onChange={e => { inputProps.onChange(e); setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {show && (
        <ul className="menu-options" role="listbox">
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={e => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}>
              <span>
                <strong>{c.name}</strong>
                <small>{[formatPhone(c.phone), c.address, c.neighborhood].filter(Boolean).join(' · ') || 'Sem telefone ou endereço'}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
