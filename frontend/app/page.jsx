'use client';

import { useEffect, useRef, useState } from 'react';
import Receipt from '../components/Receipt';
import Finance from '../components/Finance';
import MenuEditor from '../components/MenuEditor';
import MenuSearch from '../components/MenuSearch';
import IngredientsEditor from '../components/IngredientsEditor';
import CustomerSearch from '../components/CustomerSearch';
import Customers from '../components/Customers';
import { formatPhone } from '../lib/format';
import { money } from '../lib/format';

const emptyForm = {
  customer: '', phone: '', mode: 'Delivery', neighborhood: '', address: '', complement: '', reference: '',
  payment: 'Pix', fee: '0', discount: '0', notes: '',
};
let itemKey = 0;
const newItem = () => ({ key: ++itemKey, name: '', qty: '1', price: '', notes: '', ingredients: [] });

function buildOrder(form, items, customerId = null) {
  const order = {
    ...form,
    customerId,
    items: items.map(i => ({ name: i.name, qty: Number(i.qty), price: Number(i.price), notes: i.notes, ingredients: i.ingredients })),
    fee: Number(form.fee) || 0,
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
  const [viewOrder, setViewOrder] = useState(null);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [printLabel, setPrintLabel] = useState('Imprimir prévia');
  const [printRequest, setPrintRequest] = useState(0);
  const [history, setHistory] = useState({ orders: [], error: '' });
  const [search, setSearch] = useState('');
  const [paper, setPaper] = useState('80');
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState([]);
  const [customerId, setCustomerId] = useState(null); // cliente cadastrado escolhido no pedido
  const [saveCustomer, setSaveCustomer] = useState(true); // caixinha "Salvar cliente"
  const customerRef = useRef(null);

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

  const edit = () => setViewOrder(null);
  const setField = e => { setForm(f => ({ ...f, [e.target.name]: e.target.value })); edit(); };
  const setItem = (key, field, value) => { setItems(list => list.map(i => (i.key === key ? { ...i, [field]: value } : i))); edit(); };
  const pickMenuItem = (key, m) => {
    setItems(list => list.map(i => (i.key === key ? {
      ...i,
      name: m.name,
      price: String(m.price),
      ingredients: m.ingredients.map(name => ({ name, removed: false, extra: false })),
    } : i)));
    edit();
  };
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
  const removeItem = key => { if (items.length > 1) { setItems(list => list.filter(i => i.key !== key)); edit(); } };
  const addItem = () => { setItems(list => [...list, newItem()]); edit(); };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(editing ? '/api/orders/' + editing.id : '/api/orders', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildOrder(form, items, customerId), saveCustomer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setViewOrder(data);
      setCustomerId(data.customerId ?? null);
      if (editing) setEditing(data);
      setMessage('Pedido #' + data.number + (editing ? ' atualizado.' : ' salvo. Você pode reimprimir pelo histórico.'));
      setPrintRequest(n => n + 1);
    } catch (err) {
      setMessage(err.message || 'Não foi possível salvar o pedido.');
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
      setHistory({ orders: [], error: 'Não foi possível carregar o histórico.' });
    }
  }

  function editOrder(o) {
    const text = v => String(v ?? '');
    setForm(Object.fromEntries(Object.keys(emptyForm).map(k => [k, text(o[k])])));
    setItems(o.items.map(i => ({ ...newItem(), name: i.name, qty: text(i.qty), price: text(i.price), notes: text(i.notes), ingredients: i.ingredients || [] })));
    setEditing(o);
    setCustomerId(o.customerId ?? null);
    setSaveCustomer(true);
    setViewOrder(null);
    setMessage('');
    setPrintLabel('Imprimir prévia');
    setView('editor');
  }

  async function deleteOrder(o) {
    if (!window.confirm(`Excluir o pedido #${String(o.number).padStart(4, '0')} de ${o.customer}? Isso não pode ser desfeito.`)) return;
    try {
      const r = await fetch('/api/orders/' + o.id, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error((await r.json()).error);
      setHistory(h => ({ ...h, orders: h.orders.filter(x => x.id !== o.id) }));
      if (viewOrder?.id === o.id) { setViewOrder(null); setPrintLabel('Imprimir prévia'); }
      if (editing?.id === o.id) setEditing(null);
    } catch (err) {
      setHistory(h => ({ ...h, error: err.message || 'Não foi possível excluir o pedido.' }));
    }
  }

  function clearOrder() {
    setView('editor');
    setForm(emptyForm);
    setItems([newItem()]);
    setViewOrder(null);
    setEditing(null);
    setCustomerId(null);
    setSaveCustomer(true);
    setMessage('');
    setPrintLabel('Imprimir prévia');
    setTimeout(() => customerRef.current?.focus());
  }

  const wide = view === 'finance' || view === 'menu' || view === 'customers'; // telas sem a prévia da nota
  const term = search.toLowerCase();
  const filtered = history.orders.filter(o => (o.customer + ' ' + o.number).toLowerCase().includes(term));
  const small = paper === '58';
  const paperCss = `@page{size:${small ? '58' : '80'}mm 297mm;margin:3mm ${small ? '3' : '3.95'}mm}@media print{#receipt{width:${small ? '52' : '72.1'}mm}}`;

  return (
    <>
      <aside>
        <img src="/logo.png" alt="Lanchonete e Pizzaria Do Geovani" />
        <div className="brand">PAINEL DA PIZZARIA</div>
        <button className={'nav' + (view === 'editor' ? ' active' : '')} onClick={clearOrder}>＋ Novo pedido</button>
        <button className={'nav' + (view === 'history' ? ' active' : '')} onClick={openHistory}>▤ Histórico de pedidos</button>
        <button className={'nav' + (view === 'finance' ? ' active' : '')} onClick={() => setView('finance')}>▥ Financeiro</button>
        <button className={'nav' + (view === 'menu' ? ' active' : '')} onClick={() => setView('menu')}>☰ Cardápio</button>
        <button className={'nav' + (view === 'customers' ? ' active' : '')} onClick={() => setView('customers')}>☺ Clientes</button>
        <button type="button" id="themeToggle" className="nav" aria-pressed={dark} onClick={() => setDark(d => !d)}>
          {dark ? '☀ Modo claro' : '☾ Modo escuro'}
        </button>
        <div className="aside-bottom">Feito para o seu balcão.<br /><small>Pedidos salvos neste computador</small></div>
      </aside>

      <main className={wide ? 'wide' : ''}>
        <header>
          <div>
            <div className="eyebrow">LANCHONETE E PIZZARIA DO GEOVANI</div>
            {view === 'finance' ? (
              <>
                <h1>Financeiro</h1>
                <p>Acompanhe o faturamento do mês ou de qualquer período.</p>
              </>
            ) : view === 'customers' ? (
              <>
                <h1>Clientes</h1>
                <p>Cadastros salvos neste computador, com o histórico de pedidos de cada um.</p>
              </>
            ) : view === 'menu' ? (
              <>
                <h1>Cardápio</h1>
                <p>Adicione, edite ou remova itens. As mudanças valem para os próximos pedidos.</p>
              </>
            ) : (
              <>
                <h1>{editing ? `Editando pedido #${String(editing.number).padStart(4, '0')}` : 'Vamos preparar um pedido?'}</h1>
                <p>{editing ? 'Altere o que precisar e salve para atualizar o histórico.' : 'Preencha, confira e imprima a comanda.'}</p>
              </>
            )}
          </div>
          <span className="badge">● Atendimento local</span>
        </header>

        {view === 'finance' && <Finance />}
        {view === 'menu' && <MenuEditor menu={menu} onMenuChange={setMenu} />}
        {view === 'customers' && <Customers />}

        {view === 'history' && (
          <section id="history">
            <div className="card">
              <h2>Histórico de pedidos</h2>
              <input id="search" placeholder="Buscar por número ou cliente" value={search} onChange={e => setSearch(e.target.value)} />
              <div id="orderList">
                {history.error ? history.error : filtered.length ? filtered.map(o => (
                  <div className="history-row" key={o.id}>
                    <div>
                      <strong>#{String(o.number).padStart(4, '0')} · {o.customer}</strong>
                      <small>{new Date(o.createdAt).toLocaleString('pt-BR')} · {money(o.total)}</small>
                    </div>
                    <div className="history-actions">
                      <button className="secondary" onClick={() => { setViewOrder(o); setPrintLabel('Reimprimir pedido #' + o.number); }}>
                        Ver / imprimir
                      </button>
                      <button className="secondary" onClick={() => editOrder(o)}>Editar</button>
                      <button className="secondary danger" onClick={() => deleteOrder(o)}>Excluir</button>
                    </div>
                  </div>
                )) : <p>Nenhum pedido encontrado.</p>}
              </div>
            </div>
          </section>
        )}

        <section id="editor" hidden={view !== 'editor'}>
          <form onSubmit={submit}>
            <div className="card">
              <div className="section-title"><span className="step">01</span><h2>Cliente e entrega</h2></div>
              <div className="grid">
                <label>Nome do cliente *
                  <CustomerSearch inputRef={customerRef} name="customer" required placeholder="Digite o nome ou escolha um cliente" value={form.customer} onChange={setField} onPick={pickCustomer} />
                </label>
                <label>Telefone
                  <CustomerSearch name="phone" placeholder="(00) 00000-0000" value={form.phone} onChange={setField} onPick={pickCustomer} />
                </label>
                <div className="customer-hint full">
                  <label className="check">
                    <input type="checkbox" checked={saveCustomer} onChange={e => setSaveCustomer(e.target.checked)} />
                    {customerId ? 'Atualizar o cadastro do cliente com estes dados' : 'Salvar cliente na lista de clientes'}
                  </label>
                  {customerId && <> ✓ Cliente cadastrado. <button type="button" className="link" onClick={() => setCustomerId(null)}>Não vincular</button></>}
                </div>
                <label>Tipo de pedido
                  <select name="mode" value={form.mode} onChange={setField}>
                    <option>Delivery</option><option>Retirada</option><option>Balcão</option>
                  </select>
                </label>
                <label>Bairro<input name="neighborhood" placeholder="Bairro" value={form.neighborhood} onChange={setField} /></label>
                <label className="full">Endereço e número<input name="address" placeholder="Rua, avenida e número" value={form.address} onChange={setField} /></label>
                <label>Complemento<input name="complement" placeholder="Casa, apartamento..." value={form.complement} onChange={setField} /></label>
                <label>Ponto de referência<input name="reference" placeholder="Próximo a..." value={form.reference} onChange={setField} /></label>
              </div>
            </div>

            <div className="card">
              <div className="section-title"><span className="step">02</span><h2>Itens do pedido</h2></div>
              <div className="item-head"><span>Descrição</span><span>Qtd.</span><span>Valor un.</span><span /></div>
              <div id="items">
                {items.map(i => (
                  <div className="item" key={i.key}>
                    <MenuSearch value={i.name} menu={menu} onChange={v => setItem(i.key, 'name', v)} onPick={m => pickMenuItem(i.key, m)} />
                    <input aria-label="Quantidade" type="number" min="1" max="999" step="1" required value={i.qty} onChange={e => setItem(i.key, 'qty', e.target.value)} />
                    <input aria-label="Preço unitário" type="number" min="0" max="99999" step="0.01" required placeholder="0,00" value={i.price} onChange={e => setItem(i.key, 'price', e.target.value)} />
                    <button type="button" className="remove" aria-label="Remover item" onClick={() => removeItem(i.key)}>×</button>
                    {i.ingredients.length > 0 && <IngredientsEditor ingredients={i.ingredients} onChange={list => setItem(i.key, 'ingredients', list)} />}
                    <label className="item-notes">Observação deste item
                      <input aria-label="Observação do item" maxLength={500} placeholder="Ex.: sem bacon, sem cebola..." value={i.notes} onChange={e => setItem(i.key, 'notes', e.target.value)} />
                    </label>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary" onClick={addItem}>＋ Adicionar item</button>
            </div>

            <div className="card">
              <div className="section-title"><span className="step">03</span><h2>Pagamento e observações</h2></div>
              <div className="grid">
                <label>Forma de pagamento
                  <select name="payment" value={form.payment} onChange={setField}>
                    <option>Pix</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>iFood</option>
                  </select>
                </label>
                <label>Taxa de entrega (R$)<input name="fee" type="number" min="0" step="0.01" required value={form.fee} onChange={setField} /></label>
                <label>Desconto (R$)<input name="discount" type="number" min="0" step="0.01" required value={form.discount} onChange={setField} /></label>
                <label className="full">Observações<textarea name="notes" placeholder="Ex.: sem cebola, pizza meio a meio, troco para R$ 100..." value={form.notes} onChange={setField} /></label>
              </div>
            </div>

            <div className="actions">
              <span role="status">{message}</span>
              <button type="button" className="secondary" onClick={clearOrder}>{editing ? 'Cancelar edição / novo pedido' : 'Limpar / próximo pedido'}</button>
              <button type="submit" disabled={saving}>{editing ? 'Salvar alterações e imprimir' : 'Salvar e imprimir pedido'}</button>
            </div>
          </form>
        </section>
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
        {mounted
          ? <Receipt order={viewOrder || { ...buildOrder(form, items, customerId), number: editing?.number, createdAt: editing?.createdAt }} />
          : <article id="receipt" />}
        <button className="secondary" onClick={() => setPrintRequest(n => n + 1)}>{printLabel}</button>
        <p className="preview-hint">Documento não fiscal • impressão pelo navegador</p>
      </section>
      <style>{paperCss}</style>
    </>
  );
}
