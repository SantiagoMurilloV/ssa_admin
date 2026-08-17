import { app } from './app.js';
import { env } from './config/env.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { pool } from './db/pool.js';
import { localStorageFallback } from './config/storage.js';

await migrate();
await seed();

const server = app.listen(env.port, () => {
  console.log(`[ssa-admin] API listening on :${env.port}`);
  if (localStorageFallback) {
    console.warn(
      '[ssa-admin] Sin credenciales de Cloudinary: las imágenes se guardan en server/uploads (solo desarrollo).'
    );
  }
});

const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
