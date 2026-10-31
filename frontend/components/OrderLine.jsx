'use client';

import { money } from '../lib/format';
import IngredientsEditor from './IngredientsEditor';
import MenuSearch from './MenuSearch';

// Resumo do que foi mudado no item: "sem cebola · + cheddar · obs.: bem passado".
function changes(item) {
  const parts = [
    ...item.ingredients.filter(g => g.removed).map(g => 'sem ' + g.name),
    ...item.ingredients.filter(g => g.extra).map(g => '+ ' + g.name),
  ];
  if (item.notes.trim()) parts.push('obs.: ' + item.notes.trim());
  return parts.join(' · ');
}

export default function OrderLine({ item, menu, expanded, onToggle, onChange, onPick, onRemove }) {
  const qty = Number(item.qty) || 0;
  const summary = changes(item);
  const setQty = n => onChange('qty', String(Math.min(999, Math.max(1, n))));

  return (
    <div className={'line' + (expanded ? ' open' : '')}>
      <div className="line-top">
        {item.custom ? (
          <MenuSearch value={item.name} menu={menu} onChange={v => onChange('name', v)} onPick={onPick} />
        ) : (
          <button type="button" className="line-name" aria-expanded={expanded} onClick={onToggle}>
            <strong>{item.name}</strong>
            {summary && <small>{summary}</small>}
          </button>
        )}
        <strong className="line-total">{money(qty * (Number(item.price) || 0))}</strong>
      </div>

      <div className="line-controls">
        <div className="stepper">
          <button type="button" aria-label="Diminuir quantidade" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
          <input aria-label="Quantidade" type="number" min="1" max="999" step="1" required value={item.qty} onChange={e => onChange('qty', e.target.value)} />
          <button type="button" aria-label="Aumentar quantidade" onClick={() => setQty(qty + 1)}>+</button>
        </div>
        <label className="line-price">
          <span>R$</span>
          <input aria-label="Preço unitário" type="number" min="0" max="99999" step="0.01" required placeholder="0,00" value={item.price} onChange={e => onChange('price', e.target.value)} />
        </label>
        <button type="button" className="ghost small" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Fechar' : 'Ajustar'}</button>
        <button type="button" className="ghost small danger" aria-label={`Remover ${item.name || 'item'}`} onClick={onRemove}>✕</button>
      </div>

      {expanded && (
        <div className="line-details">
          {item.ingredients.length > 0 && <IngredientsEditor ingredients={item.ingredients} onChange={list => onChange('ingredients', list)} />}
          <input aria-label="Observação do item" maxLength={500} placeholder="Observação deste item (ex.: bem passado)" value={item.notes} onChange={e => onChange('notes', e.target.value)} />
        </div>
      )}
    </div>
  );
}
