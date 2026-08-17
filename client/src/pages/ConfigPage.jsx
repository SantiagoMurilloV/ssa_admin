import { useEffect, useState } from 'react';
import { configApi, promotionsApi } from '../api/admin.api.js';

function PaymentChannelsPanel() {
  const [channels, setChannels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    configApi.getPaymentChannels().then(({ channels }) => setChannels(channels));
  }, []);

  if (!channels) return <p className="muted">Cargando canales…</p>;

  const set = (index, key, value) =>
    setChannels(channels.map((ch, i) => (i === index ? { ...ch, [key]: value } : ch)));

  const add = () =>
    setChannels([
      ...channels,
      { type: 'Nequi', label: '', account: '', holder: '', instructions: '', active: true }
    ]);

  const remove = (index) => setChannels(channels.filter((_, i) => i !== index));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { channels: next } = await configApi.updatePaymentChannels(
        channels.map(({ id, type, label, account, holder, instructions, active }) => ({
          ...(id ? { id } : {}),
          type,
          label,
          account,
          holder,
          instructions,
          active
        }))
      );
      setChannels(next);
      setMessage('Guardado ✓');
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setMessage(err.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2>Canales de pago (transferencia)</h2>
      <p className="muted">
        El comprador transfiere a uno de estos canales y sube la foto del comprobante. Solo se
        muestran en la tienda los canales activos con número de cuenta.
      </p>
      <div className="spacer" />
      <div className="form-stack">
        {channels.map((channel, index) => (
          <div className="row-card" key={channel.id ?? index} style={{ alignItems: 'stretch' }}>
            <div className="form-stack" style={{ flex: 1 }}>
              <div className="field-row">
                <div className="field">
                  <label>Tipo</label>
                  <select value={channel.type} onChange={(e) => set(index, 'type', e.target.value)}>
                    {['Nequi', 'Daviplata', 'Bancolombia', 'Davivienda', 'BBVA', 'Banco de Bogotá', 'Otro'].map(
                      (t) => (
                        <option key={t} value={t}>{t}</option>
                      )
                    )}
                  </select>
                </div>
                <div className="field">
                  <label>Nombre visible (ej: "Bancolombia · Ahorros")</label>
                  <input value={channel.label} onChange={(e) => set(index, 'label', e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Número de cuenta / celular</label>
                  <input value={channel.account} onChange={(e) => set(index, 'account', e.target.value)} />
                </div>
                <div className="field">
                  <label>Titular</label>
                  <input value={channel.holder} onChange={(e) => set(index, 'holder', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Instrucciones extra (opcional)</label>
                <input
                  value={channel.instructions}
                  onChange={(e) => set(index, 'instructions', e.target.value)}
                  placeholder="Ej: enviar comprobante con nombre completo"
                />
              </div>
              <div className="row-actions">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={channel.active}
                    onChange={(e) => set(index, 'active', e.target.checked)}
                  />
                  Activo
                </label>
                <button className="btn btn-danger btn-sm" onClick={() => remove(index)}>Quitar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <div className="row-actions">
        <button className="btn btn-ghost" onClick={add}>+ Agregar canal</button>
        <button className="btn btn-dark" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar canales'}
        </button>
        {message && <span className={message.includes('✓') ? 'form-ok' : 'form-error'}>{message}</span>}
      </div>
    </section>
  );
}

function ShippingPanel() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    configApi.getShipping().then(({ shipping }) => setConfig(shipping));
  }, []);

  if (!config) return <p className="muted">Cargando envíos…</p>;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { shipping } = await configApi.updateShipping({
        defaultFee: Number(config.defaultFee) || 0,
        cities: config.cities
          .filter((c) => c.name.trim() !== '')
          .map((c) => ({ name: c.name.trim(), fee: Number(c.fee) || 0 }))
      });
      setConfig(shipping);
      setMessage('Guardado ✓');
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setMessage(err.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2>Envíos</h2>
      <div className="form-stack">
        <div className="field" style={{ maxWidth: 260 }}>
          <label>Tarifa por defecto (COP)</label>
          <input
            type="number"
            min="0"
            value={config.defaultFee}
            onChange={(e) => setConfig({ ...config, defaultFee: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Tarifas por ciudad</label>
          {config.cities.map((city, index) => (
            <div className="field-row" key={index} style={{ marginBottom: 8 }}>
              <input
                value={city.name}
                placeholder="Ciudad"
                onChange={(e) =>
                  setConfig({
                    ...config,
                    cities: config.cities.map((c, i) => (i === index ? { ...c, name: e.target.value } : c))
                  })
                }
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  value={city.fee}
                  placeholder="Tarifa"
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cities: config.cities.map((c, i) => (i === index ? { ...c, fee: e.target.value } : c))
                    })
                  }
                />
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setConfig({ ...config, cities: config.cities.filter((_, i) => i !== index) })}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <div className="row-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfig({ ...config, cities: [...config.cities, { name: '', fee: config.defaultFee }] })}
            >
              + Agregar ciudad
            </button>
          </div>
        </div>
        <div className="row-actions">
          <button className="btn btn-dark" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar envíos'}
          </button>
          {message && <span className={message.includes('✓') ? 'form-ok' : 'form-error'}>{message}</span>}
        </div>
      </div>
    </section>
  );
}

function PromotionsPanel() {
  const [promotions, setPromotions] = useState(null);
  const [form, setForm] = useState({ name: '', discountPct: '', startsAt: '', endsAt: '' });
  const [message, setMessage] = useState(null);

  const load = () => promotionsApi.list().then(({ promotions }) => setPromotions(promotions));
  useEffect(() => {
    load();
  }, []);

  if (!promotions) return <p className="muted">Cargando promociones…</p>;

  const create = async () => {
    setMessage(null);
    try {
      await promotionsApi.create({
        name: form.name.trim(),
        discountPct: Number(form.discountPct),
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        active: true
      });
      setForm({ name: '', discountPct: '', startsAt: '', endsAt: '' });
      load();
    } catch (err) {
      setMessage(err.details?.[0]?.message ?? err.message ?? 'No se pudo crear');
    }
  };

  const toggle = async (promo) => {
    setMessage(null);
    try {
      await promotionsApi.update(promo.id, {
        name: promo.name,
        discountPct: promo.discount_pct,
        startsAt: String(promo.starts_at).slice(0, 10),
        endsAt: String(promo.ends_at).slice(0, 10),
        active: !promo.active
      });
      load();
    } catch (err) {
      setMessage(err.message ?? 'No se pudo actualizar la promoción');
    }
  };

  const remove = async (promo) => {
    if (!window.confirm(`¿Eliminar la promoción "${promo.name}"?`)) return;
    setMessage(null);
    try {
      await promotionsApi.remove(promo.id);
      load();
    } catch (err) {
      setMessage(err.message ?? 'No se pudo eliminar la promoción');
    }
  };

  return (
    <section className="panel">
      <h2>Promociones</h2>
      <p className="muted">El descuento activo se aplica a todos los productos del catálogo.</p>
      <div className="spacer" />
      {promotions.map((promo) => (
        <div className="row-card" key={promo.id}>
          <div className="row-main">
            <span className="row-title">{promo.name} · {promo.discount_pct}%</span>
            <div className="row-sub">
              {String(promo.starts_at).slice(0, 10)} → {String(promo.ends_at).slice(0, 10)}
            </div>
          </div>
          <div className="row-actions">
            <span className={`badge ${promo.active ? 'badge-paid' : 'badge-off'}`}>
              {promo.active ? 'Activa' : 'Inactiva'}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => toggle(promo)}>
              {promo.active ? 'Desactivar' : 'Activar'}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => remove(promo)}>Eliminar</button>
          </div>
        </div>
      ))}
      <div className="spacer" />
      <div className="field-row">
        <input
          placeholder="Nombre (ej: Semana lavanda)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="number"
          min="1"
          max="90"
          placeholder="% descuento"
          value={form.discountPct}
          onChange={(e) => setForm({ ...form, discountPct: e.target.value })}
        />
      </div>
      <div className="spacer" style={{ height: 10 }} />
      <div className="field-row">
        <div className="field">
          <label>Desde</label>
          <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </div>
      </div>
      <div className="spacer" style={{ height: 10 }} />
      <div className="row-actions">
        <button
          className="btn btn-dark btn-sm"
          onClick={create}
          disabled={!form.name.trim() || !form.discountPct || !form.startsAt || !form.endsAt}
        >
          Crear promoción
        </button>
        {message && <span className="form-error">{message}</span>}
      </div>
    </section>
  );
}

export default function ConfigPage() {
  return (
    <>
      <h1 className="page-title">Configuración</h1>
      <PaymentChannelsPanel />
      <ShippingPanel />
      <PromotionsPanel />
    </>
  );
}
