const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 4500),
  databaseUrl: required('DATABASE_URL', isProduction ? undefined : 'postgres://localhost:5432/ssa_admin'),
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : 'dev-secret-ssa-admin'),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Usuario de acceso al panel. No tiene que ser un correo: la columna se sigue
  // llamando email por compatibilidad con la migración inicial.
  seedAdminUser: process.env.SEED_ADMIN_USER ?? process.env.SEED_ADMIN_EMAIL ?? 'admin',
  // En producción no hay default: una contraseña conocida en el repo sería
  // acceso libre al panel.
  seedAdminPassword: required('SEED_ADMIN_PASSWORD', isProduction ? undefined : 'ssa-admin-dev'),
  // Secreto compartido con las funciones serverless de la tienda. Sin él, el
  // header X-Store-Client-IP no es confiable y el rate limit usa la IP real.
  storeProxySecret: process.env.STORE_PROXY_SECRET ?? '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? ''
  },
  // Correos transaccionales al comprador (Resend). Sin apiKey no se manda nada
  // y el resto del API sigue funcionando igual.
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    // Tiene que ser de un dominio verificado en Resend o la API responde 403.
    from: process.env.EMAIL_FROM ?? 'SSA Import <no-reply@ssaimport.com>',
    replyTo: process.env.EMAIL_REPLY_TO ?? '',
    // Para armar el enlace al estado del pedido en los correos
    storeUrl: (process.env.STORE_URL ?? 'https://ssaimport.com').replace(/\/+$/, '')
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@ssaimport.co'
  }
};
