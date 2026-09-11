// Un icono por etapa del viaje. Trazos finos, como el resto del panel.
const PATHS = {
  usa: (
    <path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" strokeLinejoin="round" />
  ),
  transit: (
    <path
      d="M21 15.5v-1.8l-8-5V3.6a1.5 1.5 0 0 0-3 0v5.1l-8 5v1.8l8-2.4v4.6l-2 1.5V21l3.5-1 3.5 1v-1.8l-2-1.5v-4.6z"
      fill="currentColor"
      stroke="none"
    />
  ),
  colombia: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 1 1 13 0C18.5 15.4 12 21 12 21z" strokeLinejoin="round" />
      <circle cx="12" cy="10.5" r="2.3" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" strokeLinejoin="round" />
      <path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" strokeLinejoin="round" />
    </>
  ),
  dispatched: (
    <>
      <path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="1.8" fill="var(--bg, #faf7f4)" />
      <circle cx="17" cy="17.5" r="1.8" fill="var(--bg, #faf7f4)" />
    </>
  ),
  delivered: <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
};

export default function StageIcon({ stage, size = 16, strokeWidth = 1.7, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    >
      {PATHS[stage] ?? PATHS.usa}
    </svg>
  );
}
