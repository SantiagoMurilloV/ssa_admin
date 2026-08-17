import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import {
  cloudinaryEnabled,
  uploadImage as cloudinaryUploadImage,
  uploadVideo as cloudinaryUploadVideo,
  deleteImage as cloudinaryDeleteImage,
  deleteVideo as cloudinaryDeleteVideo
} from './cloudinary.js';

// En producción Cloudinary es obligatorio. En desarrollo, si no hay
// credenciales, se guarda en disco (server/uploads) para poder probar el
// flujo completo — el disco de Railway/Vercel es efímero, nunca sirve en prod.
export const localStorageFallback = !cloudinaryEnabled && !env.isProduction;
export const storageEnabled = cloudinaryEnabled || localStorageFallback;

export const UPLOADS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../uploads'
);
const PUBLIC_PREFIX = '/uploads';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm'
};

async function saveLocally(buffer, { folder, mimetype }) {
  const dir = path.join(UPLOADS_DIR, folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${EXTENSIONS[mimetype] ?? 'bin'}`;
  await writeFile(path.join(dir, name), buffer);
  const publicId = `${folder}/${name}`;
  return {
    publicId,
    url: `http://localhost:${env.port}${PUBLIC_PREFIX}/${publicId}`,
    duration: 0
  };
}

// Defensa en profundidad: aunque los llamadores validan el publicId, nunca
// dejamos que una ruta relativa escape de uploads/.
const deleteLocally = async (publicId) => {
  const target = path.resolve(UPLOADS_DIR, publicId);
  const root = path.resolve(UPLOADS_DIR) + path.sep;
  if (!target.startsWith(root)) return;
  await unlink(target).catch(() => {});
};

export const uploadImage = (buffer, options) =>
  cloudinaryEnabled ? cloudinaryUploadImage(buffer, options) : saveLocally(buffer, options);

export const uploadVideo = (buffer, options) =>
  cloudinaryEnabled ? cloudinaryUploadVideo(buffer, options) : saveLocally(buffer, options);

export const deleteImage = (publicId) =>
  cloudinaryEnabled ? cloudinaryDeleteImage(publicId) : deleteLocally(publicId);

export const deleteVideo = (publicId) =>
  cloudinaryEnabled ? cloudinaryDeleteVideo(publicId) : deleteLocally(publicId);
