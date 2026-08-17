import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

export const cloudinaryEnabled = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true
  });
}

const ROOT_FOLDER = 'ssaimport';

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });

export async function uploadImage(buffer, { folder }) {
  const result = await uploadBuffer(buffer, {
    folder: `${ROOT_FOLDER}/${folder}`,
    resource_type: 'image'
  });
  return { publicId: result.public_id, url: result.secure_url };
}

export async function uploadVideo(buffer, { folder }) {
  const result = await uploadBuffer(buffer, {
    folder: `${ROOT_FOLDER}/${folder}`,
    resource_type: 'video'
  });
  return { publicId: result.public_id, url: result.secure_url, duration: result.duration ?? 0 };
}

export const deleteImage = (publicId) =>
  cloudinary.uploader.destroy(publicId, { resource_type: 'image' });

export const deleteVideo = (publicId) =>
  cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
