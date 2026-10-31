'use client';

import { useEffect, useState } from 'react';
import { money } from '../lib/format';
import { fromKey, fullDate, monthRange, presets, shortDate, wholeMonth } from '../lib/dates';

const compactMoney = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const percent = n => n.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Delta({ now, before }) {
  if (!before) return <small className="kpi-delta">{now ? 'Sem vendas no período anterior' : '—'}</small>;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <small className="kpi-delta">= igual ao período anterior</small>;
  return (
    <small className={'kpi-delta ' + (change > 0 ? 'up' : 'down')}>
      {change > 0 ? '▲' : '▼'} {percent(Math.abs(change))} vs. período anterior
    </small>
  );
}

function DailyChart({ days }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const max = Math.max(...days.map(d => d.revenue));
  const step = max > 0 ? niceStep(max / 4) : 25;
  const top = max > 0 ? Math.ceil(max / step) * step : 100;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = Math.ceil(days.length / 10);
  const h = hover != null ? days[hover] : null;
  const align = hover == null ? '' : hover < days.length * 0.15 ? 'start' : hover > days.length * 0.85 ? 'end' : '';

  return (
    <div className="card">
      <div className="finance-card-head">
        <h2>Faturamento por dia</h2>
        <button type="button" className="secondary small" onClick={() => setTable(t => !t)}>{table ? 'Ver gráfico' : 'Ver tabela'}</button>
      </div>
      {table ? (
        <table className="finance-table">
          <thead><tr><th>Dia</th><th>Pedidos</th><th>Faturamento</th></tr></thead>
          <tbody>
            {days.filter(d => d.orders).map(d => (
              <tr key={d.date}><td>{fullDate(d.date)}</td><td>{d.orders}</td><td>{money(d.revenue)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart">
          <div className="chart-y">
            {ticks.map(t => <span key={t} style={{ bottom: (t / top) * 100 + '%' }}>{compactMoney(t)}</span>)}
          </div>
          <div className="chart-plot" onMouseLeave={() => setHover(null)}>
            {ticks.map(t => <div key={t} className={'chart-grid' + (t === 0 ? ' base' : '')} style={{ bottom: (t / top) * 100 + '%' }} />)}
            <div className="chart-bars" style={{ gap: days.length > 62 ? 1 : 2 }}>
              {days.map((d, i) => (
                <div
                  key={d.date}
                  className={'chart-col' + (hover === i ? ' active' : '')}
                  tabIndex={0}
                  aria-label={`${fullDate(d.date)}: ${money(d.revenue)}, ${d.orders} pedidos`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  {d.revenue > 0 && <div className="chart-bar" style={{ height: `max(2px, ${(d.revenue / top) * 100}%)` }} />}
                </div>
              ))}
            </div>
            {h && (
              <div className={'chart-tip ' + align} style={{ left: ((hover + 0.5) / days.length) * 100 + '%' }}>
                <strong>{fromKey(h.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</strong>
                <span>{money(h.revenue)}</span>
                <small>{h.orders} {h.orders === 1 ? 'pedido' : 'pedidos'}</small>
              </div>
            )}
          </div>
          <div />
          <div className="chart-x">
            {days.map((d, i) => i % every === 0 && (
              <span key={d.date} style={{ left: ((i + 0.5) / days.length) * 100 + '%' }}>{shortDate(d.date)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Breakdown({ title, rows, total }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="breakdown">
        {rows.length ? rows.map(r => (
          <div className="breakdown-row" key={r.name}>
            <div className="breakdown-label"><strong>{r.name}</strong><span>{money(r.revenue)}</span></div>
            <div className="breakdown-track"><div style={{ width: (total ? (r.revenue / total) * 100 : 0) + '%' }} /></div>
            <small>{total ? percent(r.revenue / total) : '0%'} · {r.orders} {r.orders === 1 ? 'pedido' : 'pedidos'}</small>
          </div>
        )) : <p className="finance-empty">Sem vendas no período.</p>}
      </div>
    </div>
  );
}

export default function Finance() {
  const [range, setRange] = useState(() => presets()[2]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!range.from || !range.to) return;
    const controller = new AbortController();
    setError('');
    fetch(`/api/reports?from=${range.from}&to=${range.to}`, { signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setReport(data); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message || 'Não foi possível carregar o financeiro.'); });
    return () => controller.abort();
  }, [range.from, range.to]);

  const month = wholeMonth(range);
  const moveMonth = n => {
    const base = month ? new Date(month.year, month.month + n, 1) : fromKey(range.from);
    setRange(monthRange(base.getFullYear(), base.getMonth()));
  };
  const monthName = month && new Date(month.year, month.month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const monthLabel = monthName ? monthName[0].toUpperCase() + monthName.slice(1) : 'Período personalizado';

  const t = report?.totals, p = report?.previous.totals;

  return (
    <section className="finance">
      <div className="card finance-filters">
        <div className="month-nav">
          <button type="button" className="secondary" aria-label="Mês anterior" onClick={() => moveMonth(-1)}>‹</button>
          <strong>{monthLabel}</strong>
          <button type="button" className="secondary" aria-label="Próximo mês" onClick={() => moveMonth(1)}>›</button>
        </div>
        <div className="chips">
          {presets().map(p => (
            <button type="button" key={p.label} className={'chip' + (p.from === range.from && p.to === range.to ? ' active' : '')} onClick={() => setRange(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="range-inputs">
          <label>De<input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></label>
          <label>Até<input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></label>
        </div>
      </div>

      {error && <p className="finance-error" role="alert">{error}</p>}

      {report && (
        <>
          <p className="finance-period">
            {fullDate(report.from)} a {fullDate(report.to)} · comparando com {fullDate(report.previous.from)} a {fullDate(report.previous.to)}
          </p>
          <div className="kpis">
            <div className="kpi hero"><span>Faturamento</span><strong>{money(t.revenue)}</strong><Delta now={t.revenue} before={p.revenue} /></div>
            <div className="kpi"><span>Pedidos</span><strong>{t.orders}</strong><Delta now={t.orders} before={p.orders} /></div>
            <div className="kpi"><span>Ticket médio</span><strong>{money(t.averageTicket)}</strong><Delta now={t.averageTicket} before={p.averageTicket} /></div>
            <div className="kpi"><span>Itens vendidos</span><strong>{t.itemsSold}</strong></div>
            <div className="kpi"><span>Taxas de entrega</span><strong>{money(t.fees)}</strong></div>
            <div className="kpi"><span>Descontos dados</span><strong>{money(t.discounts)}</strong></div>
          </div>

          <DailyChart days={report.byDay} />

          <div className="finance-grid">
            <Breakdown title="Por forma de pagamento" rows={report.byPayment} total={t.revenue} />
            <Breakdown title="Por tipo de pedido" rows={report.byMode} total={t.revenue} />
          </div>

          <div className="card">
            <h2>Itens mais vendidos</h2>
            {report.topItems.length ? (
              <table className="finance-table">
                <thead><tr><th>Item</th><th>Qtd.</th><th>Valor em itens</th></tr></thead>
                <tbody>
                  {report.topItems.map(i => <tr key={i.name}><td>{i.name}</td><td>{i.qty}</td><td>{money(i.revenue)}</td></tr>)}
                </tbody>
              </table>
            ) : <p className="finance-empty">Sem vendas no período.</p>}
          </div>
        </>
      )}
    </section>
  );
}
