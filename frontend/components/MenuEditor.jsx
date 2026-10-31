'use client';

import { useState } from 'react';
import { money } from '../lib/format';

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function ItemForm({ item, categories, onSave, onCancel }) {
  const [form, setForm] = useState({
    category: item.category || '',
    name: item.name || '',
    price: item.price != null ? String(item.price) : '',
    ingredients: item.ingredients || [],
  });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addIngredient = () => {
    const name = draft.trim();
    if (name && !form.ingredients.includes(name)) set('ingredients', [...form.ingredients, name]);
    setDraft('');
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Um ingrediente digitado e ainda não confirmado com Enter também entra.
      const pending = draft.trim();
      const ingredients = pending && !form.ingredients.includes(pending) ? [...form.ingredients, pending] : form.ingredients;
      await onSave({ ...form, price: form.price === '' ? '' : Number(form.price), ingredients });
    } catch (err) {
      setError(err.message || 'Não foi possível salvar.');
      setSaving(false);
    }
  }

  return (
    <form className="menu-form" onSubmit={submit}>
      <div className="menu-form-grid">
        <label>Nome *<input required maxLength={200} placeholder="Ex.: X-SALADA" value={form.name} onChange={e => set('name', e.target.value)} autoFocus /></label>
        <label>Categoria
          <input list="menu-categories" maxLength={60} placeholder="Ex.: Lanches" value={form.category} onChange={e => set('category', e.target.value)} />
        </label>
        <label>Preço (R$) *<input required type="number" min="0" max="99999" step="0.01" placeholder="0,00" value={form.price} onChange={e => set('price', e.target.value)} /></label>
      </div>
      <datalist id="menu-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
      <div className="ingredients">
        <span className="ingredients-label">Ingredientes <small>clique no × para remover</small></span>
        <div className="ingredient-chips">
          {form.ingredients.map(g => (
            <button type="button" key={g} className="ingredient" aria-label={`Remover ${g}`}
              onClick={() => set('ingredients', form.ingredients.filter(x => x !== g))}>
              {g} <span aria-hidden="true">×</span>
            </button>
          ))}
          <input className="ingredient-add" aria-label="Adicionar ingrediente" placeholder="+ adicionar ingrediente" maxLength={80}
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(); } }} />
        </div>
      </div>
      <div className="menu-form-actions">
        <span role="status">{error}</span>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={saving}>Salvar item</button>
      </div>
    </form>
  );
}

export default function MenuEditor({ menu, onMenuChange }) {
  const [editing, setEditing] = useState(null); // id do item, 'new' ou null
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [selected, setCategory] = useState(null); // null = todas

  const categories = [...new Set(menu.map(m => m.category))];
  // Se a categoria marcada ficou sem itens, volta para "Todas".
  const category = categories.includes(selected) ? selected : null;
  const term = norm(search.trim());
  const visible = menu.filter(m => (!category || m.category === category) && norm(m.name + ' ' + m.category + ' ' + m.ingredients.join(' ')).includes(term));
  const groups = [...new Set(visible.map(m => m.category))].map(c => [c, visible.filter(m => m.category === c)]);

  async function request(url, method, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    if (r.status === 204) return null;
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  }

  async function save(data) {
    if (editing === 'new') {
      const item = await request('/api/menu', 'POST', data);
      onMenuChange([...menu, item]);
    } else {
      const item = await request('/api/menu/' + editing, 'PUT', data);
      onMenuChange(menu.map(m => (m.id === item.id ? item : m)));
    }
    setEditing(null);
  }

  async function remove(m) {
    if (!window.confirm(`Remover "${m.name}" do cardápio?`)) return;
    setError('');
    try {
      await request('/api/menu/' + m.id, 'DELETE');
      onMenuChange(menu.filter(x => x.id !== m.id));
    } catch (err) {
      setError(err.message || 'Não foi possível remover o item.');
    }
  }

  return (
    <section className="menu-editor">
      <div className="card menu-toolbar">
        <input placeholder="Buscar por nome, categoria ou ingrediente" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="menu-count">{menu.length} itens</span>
        <button type="button" onClick={() => setEditing('new')} disabled={editing === 'new'}>＋ Novo item</button>
      </div>

      {error && <p className="finance-error" role="alert">{error}</p>}

      {editing === 'new' && (
        <div className="card">
          <h2>Novo item</h2>
          <ItemForm item={{ category: category || categories[0] }} categories={categories} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      )}

      {groups.map(([name, items]) => (
        <div className="card" key={name}>
          <h2>{name} <small className="menu-count">{items.length}</small></h2>
          {items.map(m => editing === m.id ? (
            <div className="menu-row editing" key={m.id}>
              <ItemForm item={m} categories={categories} onSave={save} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <div className="menu-row" key={m.id}>
              <div className="menu-row-info">
                <strong>{m.name}</strong>
                <small>{m.ingredients.length ? m.ingredients.join(', ') : 'Sem ingredientes cadastrados'}</small>
              </div>
              <span className="menu-row-price">{money(m.price)}</span>
              <div className="history-actions">
                <button type="button" className="secondary" onClick={() => setEditing(m.id)}>Editar</button>
                <button type="button" className="secondary danger" onClick={() => remove(m)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {!groups.length && <div className="card"><p className="finance-empty">Nenhum item encontrado.</p></div>}

      <nav className="category-footer" aria-label="Filtrar por categoria">
        <button type="button" className={'chip' + (!category ? ' active' : '')} aria-pressed={!category} onClick={() => setCategory(null)}>
          Todas <span>{menu.length}</span>
        </button>
        {categories.map(c => (
          <button type="button" key={c} className={'chip' + (category === c ? ' active' : '')} aria-pressed={category === c}
            onClick={() => { setCategory(category === c ? null : c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            {c} <span>{menu.filter(m => m.category === c).length}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
