// Un mismo número llega escrito de mil formas ("+57 300 123 4567", "3001234567").
// Solo los dígitos, sin el indicativo de Colombia, son la llave estable con la
// que se reconoce a un cliente y se arma el enlace de WhatsApp.
export const phoneDigits = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2);
  return digits;
};

// Para wa.me hace falta el indicativo: si el número es un celular colombiano
// de 10 dígitos se antepone el 57.
export const whatsappNumber = (value) => {
  const digits = phoneDigits(value);
  return digits.length === 10 ? `57${digits}` : digits;
};
