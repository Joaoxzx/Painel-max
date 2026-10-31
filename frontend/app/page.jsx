'use client';

import { useEffect, useRef, useState } from 'react';
import Receipt from '../components/Receipt';
import { money } from '../lib/format';

const emptyForm = {
  customer: '', phone: '', mode: 'Delivery', neighborhood: '', address: '', complement: '', reference: '',
  payment: 'Pix', fee: '0', discount: '0', notes: '',
};
let itemKey = 0;
const newItem = () => ({ key: ++itemKey, name: '', qty: '1', price: '', notes: '' });

function buildOrder(form, items) {
  const order = {
    ...form,
    items: items.map(i => ({ name: i.name, qty: Number(i.qty), price: Number(i.price), notes: i.notes })),
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
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [printLabel, setPrintLabel] = useState('Imprimir prévia');
  const [printRequest, setPrintRequest] = useState(0);
  const [history, setHistory] = useState({ orders: [], error: '' });
  const [search, setSearch] = useState('');
  const [paper, setPaper] = useState('80');
  const [dark, setDark] = useState(false);
  const customerRef = useRef(null);

  useEffect(() => {
    setPaper(readStorage('paper') === '58' ? '58' : '80');
    setDark(document.documentElement.dataset.theme === 'dark');
    setMounted(true);
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
  const removeItem = key => { if (items.length > 1) { setItems(list => list.filter(i => i.key !== key)); edit(); } };
  const addItem = () => { setItems(list => [...list, newItem()]); edit(); };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOrder(form, items)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setViewOrder(data);
      setMessage('Pedido #' + data.number + ' salvo. Você pode reimprimir pelo histórico.');
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

  function clearOrder() {
    setView('editor');
    setForm(emptyForm);
    setItems([newItem()]);
    setViewOrder(null);
    setMessage('');
    setPrintLabel('Imprimir prévia');
    setTimeout(() => customerRef.current?.focus());
  }

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
        <button type="button" id="themeToggle" className="nav" aria-pressed={dark} onClick={() => setDark(d => !d)}>
          {dark ? '☀ Modo claro' : '☾ Modo escuro'}
        </button>
        <div className="aside-bottom">Feito para o seu balcão.<br /><small>Pedidos salvos neste computador</small></div>
      </aside>

      <main>
        <header>
          <div>
            <div className="eyebrow">LANCHONETE E PIZZARIA DO GEOVANI</div>
            <h1>Vamos preparar um pedido?</h1>
            <p>Preencha, confira e imprima a comanda.</p>
          </div>
          <span className="badge">● Atendimento local</span>
        </header>

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
                    <button className="secondary" onClick={() => { setViewOrder(o); setPrintLabel('Reimprimir pedido #' + o.number); }}>
                      Ver / imprimir
                    </button>
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
                <label>Nome do cliente *<input ref={customerRef} name="customer" required placeholder="Nome do cliente" value={form.customer} onChange={setField} /></label>
                <label>Telefone<input name="phone" placeholder="(00) 00000-0000" value={form.phone} onChange={setField} /></label>
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
                    <input aria-label="Descrição do item" placeholder="Ex.: Pizza calabresa grande" required maxLength={200} value={i.name} onChange={e => setItem(i.key, 'name', e.target.value)} />
                    <input aria-label="Quantidade" type="number" min="1" max="999" step="1" required value={i.qty} onChange={e => setItem(i.key, 'qty', e.target.value)} />
                    <input aria-label="Preço unitário" type="number" min="0" max="99999" step="0.01" required placeholder="0,00" value={i.price} onChange={e => setItem(i.key, 'price', e.target.value)} />
                    <button type="button" className="remove" aria-label="Remover item" onClick={() => removeItem(i.key)}>×</button>
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
              <button type="button" className="secondary" onClick={clearOrder}>Limpar / próximo pedido</button>
              <button type="submit" disabled={saving}>Salvar e imprimir pedido</button>
            </div>
          </form>
        </section>
      </main>

      <section className="preview">
        <div className="preview-header">
          <h2>Prévia da nota</h2>
          <select aria-label="Largura do papel" value={paper} onChange={e => setPaper(e.target.value)}>
            <option value="80">80 mm · útil 72,1 mm</option>
            <option value="58">58 mm</option>
          </select>
        </div>
        <p className="preview-hint">A nota será impressa em preto e branco.</p>
        {mounted ? <Receipt order={viewOrder || buildOrder(form, items)} /> : <article id="receipt" />}
        <button className="secondary" onClick={() => setPrintRequest(n => n + 1)}>{printLabel}</button>
        <p className="preview-hint">Documento não fiscal • impressão pelo navegador</p>
      </section>
      <style>{paperCss}</style>
    </>
  );
}
