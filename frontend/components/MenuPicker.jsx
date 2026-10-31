'use client';

import { useState } from 'react';
import { money } from '../lib/format';
import { matchesAll, searchWords } from '../lib/search';

// Cardápio em blocos: um clique adiciona o item à comanda. Enter na busca adiciona o primeiro resultado.
export default function MenuPicker({ menu, counts, onAdd, searchRef }) {
  const [category, setCategory] = useState(null);
  const [query, setQuery] = useState('');
  const categories = [...new Set(menu.map(m => m.category))];
  const words = searchWords(query);
  const visible = menu.filter(m => (!category || m.category === category) && (!words.length || matchesAll(words, m.name + ' ' + m.ingredients.join(' '))));

  const add = m => { onAdd(m); setQuery(''); };

  return (
    <div className="card picker">
      <div className="picker-head">
        <h2>Cardápio</h2>
        <input
          ref={searchRef}
          className="picker-search"
          type="search"
          placeholder="Buscar item ou ingrediente (F2)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (visible[0]) add(visible[0]); }
            if (e.key === 'Escape') setQuery('');
          }}
        />
      </div>
      <div className="chips">
        <button type="button" className={'chip' + (!category ? ' active' : '')} onClick={() => setCategory(null)}>Todos</button>
        {categories.map(c => (
          <button type="button" key={c} className={'chip' + (category === c ? ' active' : '')} onClick={() => setCategory(category === c ? null : c)}>{c}</button>
        ))}
      </div>
      <div className="tiles">
        {visible.map(m => (
          <button type="button" key={m.id} className={'tile' + (counts[m.name] ? ' in-cart' : '')} title={m.ingredients.join(', ')} onClick={() => add(m)}>
            <strong>{m.name}</strong>
            <span className="tile-foot">
              <span>{money(m.price)}</span>
              {counts[m.name] > 0 && <span className="tile-count" aria-label={`${counts[m.name]} na comanda`}>{counts[m.name]}</span>}
            </span>
          </button>
        ))}
        {!visible.length && <p className="empty">{menu.length ? 'Nenhum item encontrado.' : 'Carregando cardápio…'}</p>}
      </div>
    </div>
  );
}
