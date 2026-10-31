'use client';

import { useEffect, useRef, useState } from 'react';
import Receipt from '../components/Receipt';
import Finance from '../components/Finance';
import MenuEditor from '../components/MenuEditor';
import MenuPicker from '../components/MenuPicker';
import OrderLine from '../components/OrderLine';
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
  { value: 'iFood', label: 'iFood' },
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
const fromMenu = m => newItem({ name: m.name, price: String(m.price), ingredients: m.ingredients.map(name => ({ name, removed: false, extra: false })) });
const untouched = i => !i.custom && !i.notes.trim() && i.ingredients.every(g => !g.removed && !g.extra);
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
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(null); // key do item com ajustes abertos
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
  const searchRef = useRef(null);
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

  // Atalhos: Ctrl+Enter salva, F2 vai para a busca do cardápio.
  useEffect(() => {
    function onKey(e) {
      if (view !== 'editor') return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); formRef.current?.requestSubmit(); }
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
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

  // Clicar de novo num item igual (sem ajustes) só aumenta a quantidade.
  function addFromMenu(m) {
    const same = items.find(i => i.name === m.name && Number(i.price) === m.price && untouched(i));
    if (same) setItem(same.key, 'qty', String(Math.min(999, Number(same.qty) + 1)));
    else { setItems(list => [...list, fromMenu(m)]); edit(); }
  }
  const addCustom = () => {
    const item = newItem({ custom: true });
    setItems(list => [...list, item]);
    setExpanded(item.key);
    edit();
  };
  const pickForLine = (key, m) => { setItems(list => list.map(i => (i.key === key ? { ...fromMenu(m), key } : i))); edit(); };
  const removeItem = key => { setItems(list => list.filter(i => i.key !== key)); edit(); };

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
    setItems([]);
    setExpanded(null);
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
    if (!items.length) { notify('Adicione pelo menos um item à comanda.', 'error'); return; }
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
    setExpanded(null);
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
  const counts = {};
  for (const i of items) counts[i.name] = (counts[i.name] || 0) + (Number(i.qty) || 0);
  const itemCount = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
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

        <form id="editor" ref={formRef} onSubmit={submit} hidden={view !== 'editor'} className="order-layout">
          <div className="order-main">
            {editing && (
              <div className="editing-banner">
                <span>Editando o pedido <strong>#{pad(editing.number)}</strong>. Salvar atualiza o pedido no histórico.</span>
                <button type="button" className="ghost small" onClick={newOrder}>Cancelar edição</button>
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <h2>Cliente</h2>
                <Segmented label="Tipo de pedido" value={form.mode} options={MODES} onChange={v => setValue('mode', v)} />
              </div>
              <div className="grid">
                <label>Nome *
                  <CustomerSearch inputRef={customerRef} name="customer" required placeholder="Nome ou busque um cliente" value={form.customer} onChange={setField} onPick={pickCustomer} />
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

            <MenuPicker menu={menu} counts={counts} onAdd={addFromMenu} searchRef={searchRef} />
          </div>

          <aside className="ticket" aria-label="Comanda">
            <div className="ticket-head">
              <h2>{editing ? `Pedido #${pad(editing.number)}` : 'Comanda'}</h2>
              <span>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
            </div>

            <div className="ticket-body">
              {items.length ? items.map(i => (
                <OrderLine
                  key={i.key}
                  item={i}
                  menu={menu}
                  expanded={expanded === i.key}
                  onToggle={() => setExpanded(expanded === i.key ? null : i.key)}
                  onChange={(field, value) => setItem(i.key, field, value)}
                  onPick={m => pickForLine(i.key, m)}
                  onRemove={() => removeItem(i.key)}
                />
              )) : <p className="empty ticket-empty">Clique nos itens do cardápio para montar o pedido.</p>}
              <button type="button" className="ghost small add-custom" onClick={addCustom}>＋ Item fora do cardápio</button>

              <div className="ticket-section">
                <span className="section-label">Pagamento</span>
                <Segmented label="Forma de pagamento" value={form.payment} options={PAYMENTS} onChange={v => setValue('payment', v)} />
                <div className="grid">
                  {delivery && <label>Taxa de entrega<input name="fee" type="number" min="0" step="0.01" value={form.fee} onChange={setField} /></label>}
                  <label>Desconto<input name="discount" type="number" min="0" step="0.01" value={form.discount} onChange={setField} /></label>
                  <label className="full">Observações<textarea name="notes" rows={2} placeholder="Troco para R$ 100, pizza meio a meio…" value={form.notes} onChange={setField} /></label>
                </div>
              </div>
            </div>

            <div className="ticket-foot">
              <dl className="totals">
                <div><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
                {order.fee > 0 && <div><dt>Entrega</dt><dd>{money(order.fee)}</dd></div>}
                {order.discount > 0 && <div><dt>Desconto</dt><dd>− {money(order.discount)}</dd></div>}
                <div className="grand"><dt>Total</dt><dd>{money(order.total)}</dd></div>
              </dl>
              <button type="submit" className="save" disabled={saving || !items.length}>
                {saving ? 'Salvando…' : editing ? 'Salvar alterações e imprimir' : 'Salvar e imprimir'}
                <kbd>Ctrl+Enter</kbd>
              </button>
              <div className="ticket-actions">
                <button type="button" className="ghost small" onClick={newOrder}>{editing ? 'Cancelar edição' : 'Limpar / próximo pedido'}</button>
              </div>
            </div>
          </aside>
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
