// Siempre same-origin: en dev Vite proxyea /api → :4500; en producción el
// rewrite de Vercel apunta a Railway. Así la cookie de sesión es first-party
// (crítico para Safari/iOS).
const API_BASE_URL = '';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, formData } = {}) {
  const options = { method, credentials: 'include', headers: {} };
  if (formData) {
    options.body = formData; // el navegador pone el content-type con boundary
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE_URL}/api${path}`, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* respuesta sin cuerpo */
  }
  if (!response.ok) {
    throw new ApiError(response.status, payload?.error ?? 'Error de red', payload?.details);
  }
  return payload;
}

export const http = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path, body) => request(path, { method: 'DELETE', body }),
  upload: (path, formData) => request(path, { method: 'POST', formData })
};
