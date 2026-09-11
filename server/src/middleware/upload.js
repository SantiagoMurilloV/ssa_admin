import multer from 'multer';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (IMAGE_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported image type'));
  }
});

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  // 20 MB: por encima de eso la subida falla antes de llegar al API
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (IMAGE_TYPES.has(file.mimetype) || VIDEO_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported media type'));
  }
});

export const uploadImageFile = imageUpload.single('image');
// Crear un encargo trae dos imágenes distintas de una vez: la foto del
// producto y el desprendible del abono inicial. Ambas opcionales.
export const uploadPedidoFiles = imageUpload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'receipt', maxCount: 1 }
]);
export const uploadMediaFile = mediaUpload.single('image');
export const isVideoMime = (mimetype) => VIDEO_TYPES.has(mimetype);
