'use client';

import { useState } from 'react';

// Ingredientes do cardápio podem ser tirados (e devolvidos) com um clique; adicionais podem ser incluídos e removidos.
export default function IngredientsEditor({ ingredients, onChange }) {
  const [draft, setDraft] = useState('');
  const toggle = i => onChange(ingredients.map((g, n) => (n === i ? { ...g, removed: !g.removed } : g)));
  const remove = i => onChange(ingredients.filter((_, n) => n !== i));
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    onChange([...ingredients, { name, removed: false, extra: true }]);
    setDraft('');
  };

  return (
    <div className="ingredients">
      <span className="ingredients-label">Ingredientes <small>clique para tirar ou devolver</small></span>
      <div className="ingredient-chips">
        {ingredients.map((g, i) => g.extra ? (
          <button type="button" key={i} className="ingredient extra" aria-label={`Remover adicional ${g.name}`} onClick={() => remove(i)}>
            + {g.name} <span aria-hidden="true">×</span>
          </button>
        ) : (
          <button type="button" key={i} className={'ingredient' + (g.removed ? ' removed' : '')} aria-pressed={!g.removed} onClick={() => toggle(i)}>
            {g.removed && 'sem '}{g.name}
          </button>
        ))}
        <input
          className="ingredient-add"
          aria-label="Adicionar ingrediente"
          placeholder="+ adicionar ingrediente"
          maxLength={80}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onBlur={add}
        />
      </div>
    </div>
  );
}
