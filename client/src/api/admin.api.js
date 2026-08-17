import { http } from './http.js';

export const authApi = {
  login: (user, password) => http.post('/auth/login', { user, password }),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me')
};

export const statsApi = {
  dashboard: () => http.get('/stats/dashboard'),
  subscribers: () => http.get('/subscribers')
};

export const ordersApi = {
  list: (status) => http.get(status ? `/orders?status=${status}` : '/orders'),
  updateStatus: (id, payload) => http.patch(`/orders/${id}/status`, payload)
};

export const productsApi = {
  list: () => http.get('/products'),
  create: (product) => http.post('/products', product),
  update: (id, product) => http.put(`/products/${id}`, product),
  remove: (id) => http.delete(`/products/${id}`),
  addPhoto: (id, formData) => http.upload(`/products/${id}/photos`, formData),
  removePhoto: (id, photoId) => http.delete(`/products/${id}/photos/${photoId}`)
};

export const contentApi = {
  get: () => http.get('/content'),
  update: (patch) => http.put('/content', patch),
  addImage: (section, formData) => http.upload(`/content/images/${section}`, formData),
  removeImage: (section, publicId) => http.delete(`/content/images/${section}`, { publicId })
};

export const configApi = {
  getShipping: () => http.get('/config/shipping'),
  updateShipping: (shipping) => http.put('/config/shipping', shipping),
  getPaymentChannels: () => http.get('/config/payment-channels'),
  updatePaymentChannels: (channels) => http.put('/config/payment-channels', { channels })
};

export const encargosApi = {
  list: (status) => http.get(status ? `/encargos?status=${status}` : '/encargos'),
  updateStatus: (id, status) => http.patch(`/encargos/${id}/status`, { status })
};

export const pushApi = {
  config: () => http.get('/push/config'),
  subscribe: (subscription) => http.post('/push/subscriptions', subscription),
  unsubscribe: (endpoint) => http.delete('/push/subscriptions', { endpoint })
};

export const promotionsApi = {
  list: () => http.get('/promotions'),
  create: (promotion) => http.post('/promotions', promotion),
  update: (id, promotion) => http.put(`/promotions/${id}`, promotion),
  remove: (id) => http.delete(`/promotions/${id}`)
};
