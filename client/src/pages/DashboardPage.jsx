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

export default function DashboardPage() {
  const { data, status } = useApiResource(() => statsApi.dashboard(), { pollMs: 60000 });

  if (status === 'loading') return <p className="muted">Cargando panel…</p>;
  if (status === 'error' || !data) return <p className="form-error">No se pudo cargar el panel.</p>;

  const maxViews = Math.max(1, ...data.series.map((d) => d.views));
  const conversion =
    data.funnel.page_view > 0
      ? ((data.funnel.purchase / data.funnel.page_view) * 100).toFixed(1)
      : '0.0';

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
        <div className="kpi">
          <div className="kpi-label">Pedidos pendientes</div>
          <div className="kpi-value">{data.orders.pending}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ingresos del mes</div>
          <div className="kpi-value">{formatCOP(data.month.revenue)}</div>
          <div className="kpi-hint">{data.month.orders} pedidos · {data.month.units} unidades</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Suscriptores</div>
          <div className="kpi-value">{data.subscribers}</div>
        </div>
      </div>

      <div className="panel-grid two">
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
            Barra clara: visitas · barra lavanda: compras
          </p>
        </section>
        <section className="panel">
          <h2>Embudo</h2>
          <Funnel funnel={data.funnel} />
          <p className="muted" style={{ marginTop: 12 }}>Conversión visita → compra: {conversion}%</p>
        </section>
      </div>
    </>
  );
}
