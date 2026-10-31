'use client';

import { useEffect, useRef, useState } from 'react';
import Receipt from '../components/Receipt';
import Finance from '../components/Finance';
import MenuEditor from '../components/MenuEditor';
import MenuSearch from '../components/MenuSearch';
import IngredientsEditor from '../components/IngredientsEditor';
import Segmented from '../components/Segmented';
import CustomerSearch from '../components/CustomerSearch';
import Customers from '../components/Customers';
import { formatPhone, money } from '../lib/format';

const emptyForm = {
  customer: '', phone: '', mode: 'Delivery', neighborhood: '', address: '', complement: '', reference: '',
  payment: 'Pix', fee: '0', discount: '0', notes: '',
};
const MODES = ['Delivery', 'Retirada', 'Balcão'];
const PAYMENTS = [
  { value: 'Pix', label: 'Pix' },
  { value: 'Dinheiro', label: 'Dinheiro' },
  { value: 'Cartão de crédito', label: 'Crédito' },
  { value: 'Cartão de débito', label: 'Débito' },
  { value: 'Não informado', label: 'Não informado' },
];
const VIEWS = [
  { id: 'editor', icon: '＋', label: 'Novo pedido' },
  { id: 'history', icon: '▤', label: 'Pedidos' },
  { id: 'finance', icon: '▥', label: 'Financeiro' },
  { id: 'menu', icon: '☰', label: 'Cardápio' },
  { id: 'customers', icon: '☺', label: 'Clientes' },
];
const HEADINGS = {
  history: ['Pedidos', 'Reimprima, edite ou exclua pedidos já salvos.'],
  finance: ['Financeiro', 'Acompanhe o faturamento do mês ou de qualquer período.'],
  menu: ['Cardápio', 'Adicione, edite ou remova itens. As mudanças valem para os próximos pedidos.'],
  customers: ['Clientes', 'Cadastros salvos neste computador, com o histórico de pedidos de cada um.'],
};

let itemKey = 0;
const newItem = fields => ({ key: ++itemKey, name: '', qty: '1', price: '', notes: '', ingredients: [], ...fields });
const pad = n => String(n).padStart(4, '0');

function buildOrder(form, items, customerId = null) {
  const order = {
    ...form,
    customerId,
    items: items.map(i => ({ name: i.name, qty: Number(i.qty), price: Number(i.price), notes: i.notes, ingredients: i.ingredients })),
    // Taxa de entrega só conta no delivery (o campo some nos outros tipos).
    fee: form.mode === 'Delivery' ? Number(form.fee) || 0 : 0,
    discount: Number(form.discount) || 0,
  };
  order.subtotal = order.items.reduce((s, i) => s + Math.round(i.qty * i.price * 100) / 100, 0);
  order.total = order.subtotal + order.fee - order.discount;
  return order;
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState('editor');
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState(() => [newItem()]);
  const [viewOrder, setViewOrder] = useState(null); // pedido salvo mostrado na nota
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [printRequest, setPrintRequest] = useState(0);
  const [history, setHistory] = useState({ orders: [], error: '' });
  const [search, setSearch] = useState('');
  const [paper, setPaper] = useState('80');
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState([]);
  const [customerId, setCustomerId] = useState(null); // cliente cadastrado escolhido no pedido
  const [saveCustomer, setSaveCustomer] = useState(true); // caixinha "Salvar cliente"
  const customerRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    setPaper(readStorage('paper') === '58' ? '58' : '80');
    setDark(document.documentElement.dataset.theme === 'dark');
    setMounted(true);
    fetch('/api/menu').then(r => (r.ok ? r.json() : [])).then(setMenu).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    writeStorage('theme', dark ? 'dark' : 'light');
  }, [dark, mounted]);

  useEffect(() => { if (mounted) writeStorage('paper', paper); }, [paper, mounted]);

  // Imprime só depois que a nota foi renderizada e o logo carregou.
  useEffect(() => {
    if (!printRequest) return;
    const images = [...document.querySelectorAll('#receipt img')];
    Promise.all(images.map(i => i.decode().catch(() => {}))).then(() => window.print());
  }, [printRequest]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Atalho: Ctrl+Enter salva e imprime.
  useEffect(() => {
    function onKey(e) {
      if (view !== 'editor') return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); formRef.current?.requestSubmit(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const notify = (text, kind = 'ok') => setToast({ text, kind, id: Date.now() });
  // Qualquer mudança no pedido faz a prévia voltar a mostrar o pedido em andamento.
  const edit = () => setViewOrder(null);
  const setField = e => { setForm(f => ({ ...f, [e.target.name]: e.target.value })); edit(); };
  const setValue = (name, value) => { setForm(f => ({ ...f, [name]: value })); edit(); };
  const setItem = (key, field, value) => { setItems(list => list.map(i => (i.key === key ? { ...i, [field]: value } : i))); edit(); };

  // Escolher um item do cardápio preenche nome, preço e ingredientes (tudo continua editável).
  const pickMenuItem = (key, m) => {
    setItems(list => list.map(i => (i.key === key ? {
      ...i,
      name: m.name,
      price: String(m.price),
      ingredients: m.ingredients.map(name => ({ name, removed: false, extra: false })),
    } : i)));
    edit();
  };
  const removeItem = key => { if (items.length > 1) { setItems(list => list.filter(i => i.key !== key)); edit(); } };
  const addItem = () => { setItems(list => [...list, newItem()]); edit(); };

  const pickCustomer = c => {
    setForm(f => ({
      ...f,
      customer: c.name,
      phone: formatPhone(c.phone),
      address: c.address,
      neighborhood: c.neighborhood,
      complement: c.complement,
      reference: c.reference,
    }));
    setCustomerId(c.id);
    edit();
  };

  function resetOrder() {
    setForm(emptyForm);
    setItems([newItem()]);
    setEditing(null);
    setCustomerId(null);
    setSaveCustomer(true);
  }

  function newOrder() {
    resetOrder();
    setViewOrder(null);
    setView('editor');
    setTimeout(() => customerRef.current?.focus());
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(editing ? '/api/orders/' + editing.id : '/api/orders', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildOrder(form, items, customerId), saveCustomer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      notify(`Pedido #${pad(data.number)} ${editing ? 'atualizado' : 'salvo'}. Imprimindo…`);
      // Já deixa a tela pronta para o próximo pedido; a nota impressa é a do pedido salvo.
      resetOrder();
      setViewOrder(data);
      setPrintRequest(n => n + 1);
      setTimeout(() => customerRef.current?.focus());
    } catch (err) {
      notify(err.message || 'Não foi possível salvar o pedido.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openHistory() {
    setView('history');
    try {
      const r = await fetch('/api/orders');
      if (!r.ok) throw new Error();
      setHistory({ orders: await r.json(), error: '' });
    } catch {
      setHistory({ orders: [], error: 'Não foi possível carregar os pedidos.' });
    }
  }

  function editOrder(o) {
    const text = v => String(v ?? '');
    setForm(Object.fromEntries(Object.keys(emptyForm).map(k => [k, text(o[k])])));
    setItems(o.items.map(i => newItem({ name: i.name, qty: text(i.qty), price: text(i.price), notes: text(i.notes), ingredients: i.ingredients || [] })));
    setEditing(o);
    setCustomerId(o.customerId ?? null);
    setSaveCustomer(true);
    setViewOrder(null);
    setView('editor');
  }

  async function deleteOrder(o) {
    if (!window.confirm(`Excluir o pedido #${pad(o.number)} de ${o.customer}? Isso não pode ser desfeito.`)) return;
    try {
      const r = await fetch('/api/orders/' + o.id, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error((await r.json()).error);
      setHistory(h => ({ ...h, orders: h.orders.filter(x => x.id !== o.id) }));
      if (viewOrder?.id === o.id) setViewOrder(null);
      if (editing?.id === o.id) setEditing(null);
      notify(`Pedido #${pad(o.number)} excluído.`);
    } catch (err) {
      notify(err.message || 'Não foi possível excluir o pedido.', 'error');
    }
  }


  // Trocar de aba não apaga a comanda em andamento; quem limpa é o botão "Limpar".
  const go = id => (id === 'history' ? openHistory() : setView(id));

  const order = buildOrder(form, items, customerId);
  const delivery = form.mode === 'Delivery';
  const wide = view === 'finance' || view === 'menu' || view === 'customers'; // telas sem a prévia da nota
  const term = search.toLowerCase();
  const filtered = history.orders.filter(o => (o.customer + ' ' + o.number).toLowerCase().includes(term));
  const small = paper === '58';
  const paperCss = `@page{size:${small ? '58' : '80'}mm 297mm;margin:3mm ${small ? '3' : '3.95'}mm}@media print{#receipt{width:${small ? '52' : '72.1'}mm}}`;
  const receiptOrder = viewOrder || { ...order, number: editing?.number, createdAt: editing?.createdAt };

  return (
    <div className="app">
      <aside className="sidebar">
        <img src="/logo.png" alt="Lanchonete e Pizzaria Do Geovani" />
        <nav>
          {VIEWS.map(v => (
            <button key={v.id} type="button" className={'nav' + (view === v.id ? ' active' : '')} aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}>
              <span aria-hidden="true">{v.icon}</span>{v.label}
            </button>
          ))}
        </nav>
        <button type="button" id="themeToggle" className="nav" aria-pressed={dark} onClick={() => setDark(d => !d)}>
          <span aria-hidden="true">{dark ? '☀' : '☾'}</span>{dark ? 'Modo claro' : 'Modo escuro'}
        </button>
      </aside>

      <main>
        {view !== 'editor' && (
          <header className="page-head">
            <h1>{HEADINGS[view][0]}</h1>
            <p>{HEADINGS[view][1]}</p>
          </header>
        )}

        {view === 'finance' && <Finance />}
        {view === 'menu' && <MenuEditor menu={menu} onMenuChange={setMenu} />}
        {view === 'customers' && <Customers />}

        {view === 'history' && (
          <section className="card" id="history">
            <input id="search" type="search" placeholder="Buscar por número ou cliente" value={search} onChange={e => setSearch(e.target.value)} />
            <div id="orderList">
              {history.error ? <p className="empty">{history.error}</p> : filtered.length ? filtered.map(o => (
                <div className="history-row" key={o.id}>
                  <div>
                    <strong>#{pad(o.number)} · {o.customer}</strong>
                    <small>{new Date(o.createdAt).toLocaleString('pt-BR')} · {o.mode} · {o.payment} · <b>{money(o.total)}</b></small>
                  </div>
                  <div className="history-actions">
                    <button type="button" className="secondary" onClick={() => setViewOrder(o)}>Ver / imprimir</button>
                    <button type="button" className="secondary" onClick={() => editOrder(o)}>Editar</button>
                    <button type="button" className="secondary danger" onClick={() => deleteOrder(o)}>Excluir</button>
                  </div>
                </div>
              )) : <p className="empty">Nenhum pedido encontrado.</p>}
            </div>
          </section>
        )}

        <form id="editor" ref={formRef} onSubmit={submit} hidden={view !== 'editor'}>
          {editing && (
            <div className="editing-banner">
              <span>Editando o pedido <strong>#{pad(editing.number)}</strong>. Salvar atualiza o pedido no histórico.</span>
              <button type="button" className="ghost small" onClick={newOrder}>Cancelar edição</button>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Cliente e entrega</h2>
              <Segmented label="Tipo de pedido" value={form.mode} options={MODES} onChange={v => setValue('mode', v)} />
            </div>
            <div className="grid">
              <label>Nome do cliente *
                <CustomerSearch inputRef={customerRef} name="customer" required placeholder="Digite o nome ou escolha um cliente" value={form.customer} onChange={setField} onPick={pickCustomer} />
              </label>
              <label>Telefone
                <CustomerSearch name="phone" placeholder="(00) 00000-0000" value={form.phone} onChange={setField} onPick={pickCustomer} />
              </label>
              {delivery && (
                <>
                  <label>Endereço e número<input name="address" placeholder="Rua, avenida e número" value={form.address} onChange={setField} /></label>
                  <label>Bairro<input name="neighborhood" placeholder="Bairro" value={form.neighborhood} onChange={setField} /></label>
                  <label>Complemento<input name="complement" placeholder="Casa, apartamento…" value={form.complement} onChange={setField} /></label>
                  <label>Ponto de referência<input name="reference" placeholder="Próximo a…" value={form.reference} onChange={setField} /></label>
                </>
              )}
              <div className="customer-hint full">
                <label className="check">
                  <input type="checkbox" checked={saveCustomer} onChange={e => setSaveCustomer(e.target.checked)} />
                  {customerId ? 'Atualizar o cadastro do cliente com estes dados' : 'Salvar na lista de clientes'}
                </label>
                {customerId && <span>✓ Cliente cadastrado · <button type="button" className="link" onClick={() => setCustomerId(null)}>não vincular</button></span>}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Itens do pedido</h2>
            <div className="item-head"><span>Descrição</span><span>Qtd.</span><span>Valor un.</span><span /></div>
            <div id="items">
              {items.map(i => (
                <div className="item" key={i.key}>
                  <MenuSearch value={i.name} menu={menu} onChange={v => setItem(i.key, 'name', v)} onPick={m => pickMenuItem(i.key, m)} />
                  <input aria-label="Quantidade" type="number" min="1" max="999" step="1" required value={i.qty} onChange={e => setItem(i.key, 'qty', e.target.value)} />
                  <input aria-label="Preço unitário" type="number" min="0" max="99999" step="0.01" required placeholder="0,00" value={i.price} onChange={e => setItem(i.key, 'price', e.target.value)} />
                  <button type="button" className="remove" aria-label="Remover item" disabled={items.length === 1} onClick={() => removeItem(i.key)}>✕</button>
                  {i.ingredients.length > 0 && <IngredientsEditor ingredients={i.ingredients} onChange={list => setItem(i.key, 'ingredients', list)} />}
                  <input className="item-notes" aria-label="Observação do item" maxLength={500} placeholder="Observação deste item (ex.: bem passado)" value={i.notes} onChange={e => setItem(i.key, 'notes', e.target.value)} />
                </div>
              ))}
            </div>
            <button type="button" className="secondary" onClick={addItem}>＋ Adicionar item</button>
          </div>

          <div className="card">
            <h2>Pagamento e observações</h2>
            <div className="grid">
              <div className="full">
                <Segmented label="Forma de pagamento" value={form.payment} options={PAYMENTS} onChange={v => setValue('payment', v)} />
              </div>
              {delivery && <label>Taxa de entrega (R$)<input name="fee" type="number" min="0" step="0.01" value={form.fee} onChange={setField} /></label>}
              <label>Desconto (R$)<input name="discount" type="number" min="0" step="0.01" value={form.discount} onChange={setField} /></label>
              <label className="full">Observações<textarea name="notes" rows={2} placeholder="Ex.: troco para R$ 100, pizza meio a meio…" value={form.notes} onChange={setField} /></label>
            </div>
          </div>

          <div className="actions-bar">
            <div className="actions-total">
              <span>Total</span>
              <strong>{money(order.total)}</strong>
            </div>
            <button type="button" className="secondary" onClick={newOrder}>{editing ? 'Cancelar edição' : 'Limpar / próximo pedido'}</button>
            <button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : editing ? 'Salvar alterações e imprimir' : 'Salvar e imprimir pedido'}
            </button>
          </div>
        </form>
      </main>

      <section className="preview" hidden={wide}>
        <div className="preview-header">
          <h2>Prévia da nota</h2>
          <select aria-label="Largura do papel" value={paper} onChange={e => setPaper(e.target.value)}>
            <option value="80">80 mm · útil 72,1 mm</option>
            <option value="58">58 mm</option>
          </select>
        </div>
        <p className="preview-hint">A nota será impressa em preto e branco.</p>
        {mounted ? <Receipt order={receiptOrder} /> : <article id="receipt" />}
        <button type="button" className="secondary" onClick={() => setPrintRequest(n => n + 1)}>
          {viewOrder ? 'Reimprimir pedido #' + viewOrder.number : 'Imprimir prévia'}
        </button>
        <p className="preview-hint">Documento não fiscal • impressão pelo navegador</p>
      </section>

      {toast && <div key={toast.id} className={'toast ' + toast.kind} role="status">{toast.text}</div>}
      <style>{paperCss}</style>
    </div>
  );
}
