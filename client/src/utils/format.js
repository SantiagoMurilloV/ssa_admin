export const formatCOP = (value) =>
  `$ ${Number(value ?? 0).toLocaleString('es-CO').replace(/,/g, '.')}`;

export const formatDate = (value) =>
  new Date(value).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

export const formatDay = (value) =>
  new Date(value).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

// Fechas AAAA-MM-DD (sin hora): se arman en local para que no se corran un día
export const formatDateOnly = (value) => {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export const todayISO = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// "hace 5 min", "hace 3 h", "ayer", o la fecha si ya pasó más de una semana
export const relativeTime = (value) => {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'justo ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return formatDay(value);
};

export const initials = (name) =>
  String(name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
