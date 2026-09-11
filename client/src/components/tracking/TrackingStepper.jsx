import { TRACKING_STAGES, stageIndex, nextStage } from '../../config/tracking.js';
import StageIcon from './StageIcon.jsx';

// El viaje del pedido en una fila de pasos. Cada paso es un botón: tocarlo
// pone la guía en esa etapa (hacia adelante o hacia atrás, por si hubo error)
// y el cliente que siga el código recibe el aviso.
export default function TrackingStepper({ stage, onChange, busy = false, disabled = false, compact = false }) {
  const current = Math.max(0, stageIndex(stage));
  const progress = (current / (TRACKING_STAGES.length - 1)) * 100;
  const next = nextStage(stage);

  return (
    <div className={`trk ${compact ? 'trk-compact' : ''} ${busy ? 'is-busy' : ''}`} aria-label="Etapa del envío">
      <div className="trk-steps">
        <div className="trk-line" aria-hidden="true">
          <div className="trk-line-fill" style={{ width: `${progress}%` }} />
        </div>
        {TRACKING_STAGES.map((item, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <button
              type="button"
              key={item.key}
              className={`trk-step is-${state}`}
              title={`${item.label}${state === 'current' ? ' (actual)' : ''}`}
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={disabled || busy}
              onClick={() => state !== 'current' && onChange?.(item.key)}
            >
              <span className="trk-dot">
                <StageIcon stage={item.key} size={compact ? 12 : 14} />
              </span>
              <span className="trk-label">{item.short}</span>
            </button>
          );
        })}
      </div>
      {!compact && next && !disabled && (
        <button type="button" className="btn btn-ghost btn-sm trk-next" disabled={busy} onClick={() => onChange?.(next)}>
          {busy ? 'Guardando…' : `Avanzar a “${TRACKING_STAGES[current + 1].short}” →`}
        </button>
      )}
    </div>
  );
}
