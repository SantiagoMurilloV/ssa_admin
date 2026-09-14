import { useState } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../api/admin.api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { formatCOP, formatDay } from '../utils/format.js';

function Funnel({ funnel }) {
  const steps = [
    ['Visitas', funnel.page_view],
    ['Vieron producto', funnel.product_view],
    ['Agregaron al carrito', funnel.add_to_cart],
    ['Compraron', funnel.purchase]
  ];
  const max = Math.max(1, ...steps.map(([, v]) => v));
  return (
    <div className="form-stack">
      {steps.map(([label, value]) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: 'rgba(42,42,53,.07)', marginTop: 4 }}>
            <div
              style={{
                height: '100%',
                width: `${Math.round((value / max) * 100)}%`,
                borderRadius: 6,
                background: 'var(--lavanda)'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Filas de dinero con barra proporcional al mayor valor del grupo
function MoneyRows({ rows }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="form-stack money-rows">
      {rows.map((row) => (
        <div key={row.label} className={row.accent ? `money-row-${row.accent}` : ''}>
          <div className="money-rows-head">
            <span>
              <span className="money-rows-label">{row.label}</span>
              {row.hint && <span className="money-rows-hint"> · {row.hint}</span>}
            </span>
            <strong>{formatCOP(row.value)}</strong>
          </div>
          <div className="money-bar money-bar-slim">
            <div className="money-rows-fill" style={{ width: `${Math.round((row.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// 'AAAA-MM' -> 'septiembre 2026'
const monthLabel = (key) => {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  const text = new Date(year, month - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// Meses entre el primero con movimiento y el actual, del más reciente al más viejo
const monthKeys = (first, current) => {
  if (!first || !current) return current ? [current] : [];
  const keys = [];
  let [y, m] = current.split('-').map(Number);
  const [fy, fm] = first.split('-').map(Number);
  while (y > fy || (y === fy && m >= fm)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    if (keys.length > 240) break;
  }
  return keys;
};

// Flechas y lista para moverse entre meses en el panel de dinero
function MonthPicker({ value, first, current, onChange }) {
  const keys = monthKeys(first, current);
  if (!keys.includes(value)) keys.push(value);
  const index = keys.indexOf(value);
  const newer = index > 0 ? keys[index - 1] : null;
  const older = index < keys.length - 1 ? keys[index + 1] : null;
  return (
    <div className="month-picker">
      <button type="button" className="month-picker-arrow" aria-label="Mes anterior" disabled={!older} onClick={() => onChange(older)}>
        ‹
      </button>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Mes">
        {keys.map((key) => (
          <option key={key} value={key}>
            {monthLabel(key)}
            {key === current ? ' · actual' : ''}
          </option>
        ))}
      </select>
      <button type="button" className="month-picker-arrow" aria-label="Mes siguiente" disabled={!newer} onClick={() => onChange(newer)}>
        ›
      </button>
    </div>
  );
}

// Los encargos entran al dashboard financiero: lo vendido y lo abonado en el
// mes se suman a los ingresos de la tienda, y lo que falta por pagar aparece
// como saldo por cobrar. Los valores nuevos tienen fallback porque el panel y
// el API se despliegan por separado.
export default function DashboardPage() {
  // null = mes en curso (lo decide el API en hora de Colombia)
  const [monthKey, setMonthKey] = useState(null);
  const { data, status } = useApiResource(() => statsApi.dashboard(monthKey), { pollMs: 60000, key: monthKey });

  if (status === 'error') return <p className="form-error">No se pudo cargar el panel.</p>;
  if (!data) return <p className="muted">Cargando panel…</p>;

  const maxViews = Math.max(1, ...data.series.map((d) => d.views));
  const conversion =
    data.funnel.page_view > 0
      ? ((data.funnel.purchase / data.funnel.page_view) * 100).toFixed(1)
      : '0.0';

  const month = data.month;
  const encargos = month.encargos ?? { count: 0, sales: 0, collected: 0, payments: 0, delivered: 0 };
  const income = month.income ?? month.revenue;
  // Histórico acumulado (tienda + abonos desde el primer registro)
  const total = data.total ?? { income, store: { revenue: month.revenue }, encargos };
  const receivable = data.receivable ?? { count: 0, balance: 0 };
  const pedidos = data.pedidos ?? { pending: 0, paid: 0, delivered: 0, cancelled: 0 };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const selectedMonth = month.key ?? monthKey;
  const isCurrentMonth = !month.current || selectedMonth === month.current;
  const monthName = isCurrentMonth ? 'del mes' : `de ${monthLabel(selectedMonth).toLowerCase()}`;
  const loadingMonth = status === 'loading';

  return (
    <>
      <h1 className="page-title">Inicio <em>últimos 7 días</em></h1>
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Visitas</div>
          <div className="kpi-value">{data.funnel.page_view}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Al carrito</div>
          <div className="kpi-value">{data.funnel.add_to_cart}</div>
        </div>
        <Link className="kpi kpi-link" to="/pedidos">
          <div className="kpi-label">Pedidos pendientes</div>
          <div className="kpi-value">{data.orders.pending}</div>
          <div className="kpi-hint">{plural(pedidos.pending, 'encargo con saldo', 'encargos con saldo')}</div>
        </Link>
        <div className="kpi kpi-accent">
          <div className="kpi-label">Ingresos históricos</div>
          <div className="kpi-value">{formatCOP(total.income)}</div>
          <div className="kpi-hint">
            Tienda {formatCOP(total.store.revenue)} · Encargos {formatCOP(total.encargos.collected)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ingresos {monthName}</div>
          <div className="kpi-value">{formatCOP(income)}</div>
          <div className="kpi-hint">
            Tienda {formatCOP(month.revenue)} · Encargos {formatCOP(encargos.collected)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Encargos {monthName}</div>
          <div className="kpi-value">{formatCOP(encargos.sales)}</div>
          <div className="kpi-hint">
            {plural(encargos.count, 'encargo', 'encargos')} · {encargos.delivered} entregados
          </div>
        </div>
        <Link className="kpi kpi-link" to="/pedidos">
          <div className="kpi-label">Por cobrar</div>
          <div className={`kpi-value ${receivable.balance > 0 ? 'money-balance' : ''}`}>
            {formatCOP(receivable.balance)}
          </div>
          <div className="kpi-hint">{plural(receivable.count, 'encargo con saldo', 'encargos con saldo')}</div>
        </Link>
        <div className="kpi">
          <div className="kpi-label">Suscriptores</div>
          <div className="kpi-value">{data.subscribers}</div>
        </div>
      </div>

      <div className="panel-grid two">
        <section className="panel">
          <div className="panel-head">
            <h2>Dinero</h2>
            {month.current && (
              <MonthPicker value={selectedMonth} first={month.first} current={month.current} onChange={setMonthKey} />
            )}
          </div>
          <div className={loadingMonth ? 'is-loading' : ''}>
          <h3 className="money-group-title">{isCurrentMonth ? 'Este mes' : monthLabel(selectedMonth)}</h3>
          <MoneyRows
            rows={[
              { label: `Ingresos ${monthName}`, hint: 'tienda + abonos', value: income, accent: 'total' },
              {
                label: 'Tienda · pedidos pagados',
                hint: `${plural(month.orders, 'pedido', 'pedidos')} · ${plural(month.units, 'unidad', 'unidades')}`,
                value: month.revenue,
                accent: 'store'
              },
              {
                label: 'Encargos · ventas registradas',
                hint: plural(encargos.count, 'encargo', 'encargos'),
                value: encargos.sales,
                accent: 'sales'
              },
              {
                label: 'Encargos · abonos recibidos',
                hint: plural(encargos.payments, 'abono', 'abonos'),
                value: encargos.collected,
                accent: 'store'
              }
            ]}
          />
          <h3 className="money-group-title">Histórico</h3>
          <MoneyRows
            rows={[
              {
                label: 'Ingresos recibidos',
                hint: `tienda ${formatCOP(total.store.revenue)} + ${plural(total.encargos.payments ?? 0, 'abono', 'abonos')}`,
                value: total.income,
                accent: 'total'
              },
              {
                label: 'Encargos · ventas registradas',
                hint: plural(total.encargos.count ?? 0, 'encargo', 'encargos'),
                value: total.encargos.sales,
                accent: 'sales'
              },
              {
                label: 'Por cobrar',
                hint: plural(receivable.count, 'encargo con saldo', 'encargos con saldo'),
                value: receivable.balance,
                accent: 'receivable'
              }
            ]}
          />
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            La tienda cobra completo al confirmar el pago; los encargos entran por abonos según la fecha de
            cada abono. El histórico suma todo desde el primer registro; el saldo por cobrar es lo que falta
            de todos los encargos abiertos.
          </p>
        </section>
        <section className="panel">
          <h2>Encargos por estado</h2>
          <div className="form-stack">
            {[
              ['Pago pendiente', pedidos.pending, 'var(--durazno)'],
              ['Pagados, en camino', pedidos.paid, 'var(--salvia)'],
              ['Entregados', pedidos.delivered, 'var(--lavanda)'],
              ['Cancelados', pedidos.cancelled, 'rgba(42,42,53,.35)']
            ].map(([label, value, color]) => {
              const total = Math.max(1, pedidos.pending + pedidos.paid + pedidos.delivered + pedidos.cancelled);
              return (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span className="muted">{label}</span>
                    <strong>{value}</strong>
                  </div>
                  <div style={{ height: 8, borderRadius: 6, background: 'rgba(42,42,53,.07)', marginTop: 4 }}>
                    <div style={{ height: '100%', width: `${Math.round((value / total) * 100)}%`, borderRadius: 6, background: color, transition: 'width .6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <Link className="btn btn-ghost btn-sm" to="/pedidos" style={{ marginTop: 16, display: 'inline-block' }}>
            Ver encargos →
          </Link>
        </section>
      </div>

      <div className="panel-grid two" style={{ marginTop: 18 }}>
        <section className="panel">
          <h2>Visitas · 14 días</h2>
          <div className="bar-chart">
            {data.series.map((d) => (
              <div className="bar-col" key={d.day} title={`${formatDay(d.day)}: ${d.views} visitas, ${d.purchases} compras`}>
                {d.purchases > 0 && (
                  <div className="bar accent" style={{ height: `${Math.max(4, (d.purchases / maxViews) * 100)}%` }} />
                )}
                <div className="bar" style={{ height: `${Math.max(2, (d.views / maxViews) * 100)}%` }} />
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Barra clara: visitas · barra lavanda: compras en la tienda
          </p>
        </section>
        <section className="panel">
          <h2>Embudo de la tienda</h2>
          <Funnel funnel={data.funnel} />
          <p className="muted" style={{ marginTop: 12 }}>Conversión visita → compra: {conversion}%</p>
        </section>
      </div>
    </>
  );
}
