import { z } from 'zod';
import { SettingsModel, SETTINGS_KEYS } from '../models/settings.model.js';
import {
  mergeSiteContent,
  deepMergeContent,
  IMAGE_SECTIONS
} from '../config/default-site-content.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { storageEnabled, uploadImage, deleteImage } from '../config/storage.js';

// Permite guardar secciones sueltas: cualquier subconjunto de claves de texto.
const contentPatchSchema = z.record(z.string(), z.unknown());

const loadStored = () => SettingsModel.getJson(SETTINGS_KEYS.siteContent, {});

export const ContentController = {
  publicContent: asyncHandler(async (req, res) => {
    res.json({ content: mergeSiteContent(await loadStored()) });
  }),

  get: asyncHandler(async (req, res) => {
    res.json({ content: mergeSiteContent(await loadStored()) });
  }),

  update: asyncHandler(async (req, res) => {
    const patch = contentPatchSchema.parse(req.body ?? {});
    delete patch.images; // las imágenes solo se tocan por sus endpoints
    const stored = await loadStored();
    // Merge profundo: guardar {hero:{badge:'x'}} no debe borrar el resto del
    // hero que el admin ya había escrito (mergeSiteContent lo repondría con
    // los defaults, revirtiendo textos personalizados en silencio).
    const next = { ...deepMergeContent(stored, patch), images: stored.images ?? {} };
    await SettingsModel.setJson(SETTINGS_KEYS.siteContent, next);
    res.json({ content: mergeSiteContent(next) });
  }),

  addImage: asyncHandler(async (req, res) => {
    const { section } = req.params;
    if (!IMAGE_SECTIONS.includes(section)) throw new HttpError(404, 'Sección sin imágenes');
    if (!storageEnabled) throw new HttpError(503, 'La subida de archivos no está disponible');
    if (!req.file) throw new HttpError(400, 'Falta la imagen (campo image)');
    const uploaded = await uploadImage(req.file.buffer, {
      folder: `sections/${section}`,
      mimetype: req.file.mimetype
    });
    const stored = await loadStored();
    const images = { ...(stored.images ?? {}) };
    images[section] = [
      ...(Array.isArray(images[section]) ? images[section] : []),
      { publicId: uploaded.publicId, url: uploaded.url, label: req.body?.label ?? null }
    ];
    await SettingsModel.setJson(SETTINGS_KEYS.siteContent, { ...stored, images });
    res.status(201).json({ content: mergeSiteContent({ ...stored, images }) });
  }),

  removeImage: asyncHandler(async (req, res) => {
    const { section } = req.params;
    const { publicId } = req.body ?? {};
    if (!IMAGE_SECTIONS.includes(section)) throw new HttpError(404, 'Sección sin imágenes');
    if (typeof publicId !== 'string' || publicId === '') {
      throw new HttpError(422, 'Falta publicId');
    }
    const stored = await loadStored();
    const images = { ...(stored.images ?? {}) };
    const current = Array.isArray(images[section]) ? images[section] : [];

    // Solo se borra un archivo que esta sección tenga registrado. Si aceptáramos
    // cualquier publicId, un id ajeno borraría la foto de un producto — o, con
    // el almacenamiento local, un archivo fuera de uploads/ vía "../".
    const target = current.find((img) => img.publicId === publicId);
    if (!target) throw new HttpError(404, 'Imagen no encontrada en esta sección');

    images[section] = current.filter((img) => img.publicId !== publicId);
    await SettingsModel.setJson(SETTINGS_KEYS.siteContent, { ...stored, images });
    if (storageEnabled) await deleteImage(publicId).catch(() => {});
    res.json({ content: mergeSiteContent({ ...stored, images }) });
  })
};
