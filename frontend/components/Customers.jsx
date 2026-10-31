'use client';

import { useEffect, useState } from 'react';
import { formatPhone, money } from '../lib/format';

const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FIELDS = [
  ['name', 'Nome *', 'Nome do cliente'],
  ['phone', 'Telefone', '(00) 00000-0000'],
  ['address', 'Endereço e número', 'Rua, avenida e número'],
  ['neighborhood', 'Bairro', 'Bairro'],
  ['complement', 'Complemento', 'Casa, apartamento...'],
  ['reference', 'Ponto de referência', 'Próximo a...'],
];

async function request(url, method, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (r.status === 204) return null;
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}

function CustomerForm({ customer, onSave, onCancel }) {
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, k === 'phone' ? formatPhone(customer[k]) : customer[k] || ''])));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar.');
      setSaving(false);
    }
  }

  return (
    <form className="menu-form" onSubmit={submit}>
      <div className="grid">
        {FIELDS.map(([key, label, placeholder], i) => (
          <label key={key} className={key === 'address' ? 'full' : ''}>{label}
            <input required={key === 'name'} autoFocus={i === 0} placeholder={placeholder} value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="menu-form-actions">
        <span role="status">{error}</span>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={saving}>Salvar cliente</button>
      </div>
    </form>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState(null);
  const [editing, setEditing] = useState(null); // id, 'new' ou null
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = () => request('/api/customers', 'GET')
    .then(setCustomers)
    .catch(() => setError('Não foi possível carregar os clientes.'));
  useEffect(() => { load(); }, []);

  async function save(data) {
    if (editing === 'new') await request('/api/customers', 'POST', data);
    else await request('/api/customers/' + editing, 'PUT', data);
    setEditing(null);
    await load(); // recarrega para vir com os números de pedidos atualizados
  }

  async function remove(c) {
    if (!window.confirm(`Excluir o cadastro de ${c.name}? Os pedidos dele continuam no histórico.`)) return;
    setError('');
    try {
      await request('/api/customers/' + c.id, 'DELETE');
      setCustomers(list => list.filter(x => x.id !== c.id));
    } catch (err) {
      setError(err.message || 'Não foi possível excluir o cliente.');
    }
  }

  const term = norm(search.trim());
  const digits = search.replace(/\D/g, '');
  const visible = (customers || []).filter(c =>
    norm([c.name, c.address, c.neighborhood].join(' ')).includes(term) || (digits.length >= 3 && c.phone.includes(digits)));

  return (
    <section className="menu-editor">
      <div className="card menu-toolbar">
        <input placeholder="Buscar por nome, telefone, endereço ou bairro" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="menu-count">{customers ? customers.length : '…'} clientes</span>
        <button type="button" onClick={() => setEditing('new')} disabled={editing === 'new'}>＋ Novo cliente</button>
      </div>

      {error && <p className="finance-error" role="alert">{error}</p>}

      {editing === 'new' && (
        <div className="card">
          <h2>Novo cliente</h2>
          <CustomerForm customer={{}} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      )}

      {customers && (
        <div className="card">
          {visible.length ? visible.map(c => editing === c.id ? (
            <div className="menu-row editing" key={c.id}>
              <CustomerForm customer={c} onSave={save} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <div className="menu-row" key={c.id}>
              <div className="menu-row-info">
                <strong>{c.name}{c.phone && <span className="customer-phone"> · {formatPhone(c.phone)}</span>}</strong>
                <small>{[c.address, c.complement, c.neighborhood].filter(Boolean).join(' · ') || 'Sem endereço'}{c.reference && ` (ref.: ${c.reference})`}</small>
              </div>
              <div className="customer-stats">
                {c.orders ? (
                  <>
                    <strong>{c.orders} {c.orders === 1 ? 'pedido' : 'pedidos'} · {money(c.totalSpent)}</strong>
                    <small>Último em {new Date(c.lastOrderAt).toLocaleDateString('pt-BR')}</small>
                  </>
                ) : <small>Nenhum pedido ainda</small>}
              </div>
              <div className="history-actions">
                <button type="button" className="secondary" onClick={() => setEditing(c.id)}>Editar</button>
                <button type="button" className="secondary danger" onClick={() => remove(c)}>Excluir</button>
              </div>
            </div>
          )) : (
            <p className="finance-empty">
              {customers.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Eles entram aqui ao salvar um pedido com telefone, ou pelo botão "Novo cliente".'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
