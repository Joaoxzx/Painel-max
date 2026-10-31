import { money } from '../lib/format';

export default function Receipt({ order: o }) {
  const details = [
    ['Cliente', o.customer], ['Telefone', o.phone], ['Endereço', o.address], ['Complemento', o.complement],
    ['Referência', o.reference], ['Bairro', o.neighborhood], ['Observações', o.notes],
  ].filter(([, v]) => v);

  return (
    <article id="receipt">
      <img className="receipt-logo" src="/logo-print.png" alt="Lanchonete e Pizzaria Do Geovani" />
      <div className="rule" />
      <div className="receipt-row">
        <strong>PEDIDO {o.number ? '#' + String(o.number).padStart(4, '0') : '• PRÉVIA'}</strong>
        <span>{o.mode}</span>
      </div>
      <div>{new Date(o.createdAt || Date.now()).toLocaleString('pt-BR')}</div>
      <div className="rule" />
      {o.items.map((i, n) => (
        <div className="receipt-item" key={n}>
          <strong>{i.name || 'Descrição do item'}</strong>
          <div className="receipt-row"><span>{i.qty} un × {money(i.price)}</span><span>{money(i.qty * i.price)}</span></div>
          {i.notes && <div className="receipt-item-note">OBS.: {i.notes}</div>}
        </div>
      ))}
      <div className="rule" />
      <div className="receipt-row"><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
      {!!o.fee && <div className="receipt-row"><span>Entrega</span><span>{money(o.fee)}</span></div>}
      {!!o.discount && <div className="receipt-row"><span>Desconto</span><span>− {money(o.discount)}</span></div>}
      <div className="receipt-row total"><span>TOTAL</span><span>{money(o.total)}</span></div>
      <div className="receipt-detail">Pagamento: {o.payment}</div>
      <div className="rule" />
      <div className="center"><strong>({String(o.mode || '').toUpperCase()})</strong></div>
      {details.map(([k, v]) => <div className="receipt-detail" key={k}><strong>{k}:</strong> {v}</div>)}
      <div className="rule" />
      <div className="center">Obrigado pela preferência!</div>
    </article>
  );
}
