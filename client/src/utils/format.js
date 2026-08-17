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
