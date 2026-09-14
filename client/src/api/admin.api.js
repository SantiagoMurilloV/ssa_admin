import { http } from './http.js';

export const authApi = {
  login: (user, password) => http.post('/auth/login', { user, password }),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me')
};

export const statsApi = {
  // `month` es 'AAAA-MM'; sin él el API responde con el mes en curso
  dashboard: (month) => http.get(month ? `/stats/dashboard?month=${month}` : '/stats/dashboard'),
  subscribers: () => http.get('/subscribers')
};

export const ordersApi = {
  list: (status) => http.get(status ? `/orders?status=${status}` : '/orders'),
  updateStatus: (id, payload) => http.patch(`/orders/${id}/status`, payload),
  updateTracking: (id, payload) => http.patch(`/orders/${id}/tracking`, payload),
  remove: (id) => http.delete(`/orders/${id}`)
};

// Encargos creados desde el panel: cliente, abonos con desprendible y guía
export const pedidosApi = {
  list: (status) => http.get(status ? `/pedidos?status=${status}` : '/pedidos'),
  create: (formData) => http.upload('/pedidos', formData),
  update: (id, payload) => http.put(`/pedidos/${id}`, payload),
  setPhoto: (id, formData) => http.upload(`/pedidos/${id}/photo`, formData),
  removePhoto: (id) => http.delete(`/pedidos/${id}/photo`),
  addPayment: (id, formData) => http.upload(`/pedidos/${id}/payments`, formData),
  removePayment: (id, paymentId) => http.delete(`/pedidos/${id}/payments/${paymentId}`),
  updateTracking: (id, payload) => http.patch(`/pedidos/${id}/tracking`, payload),
  updateStatus: (id, status) => http.patch(`/pedidos/${id}/status`, { status }),
  remove: (id) => http.delete(`/pedidos/${id}`)
};

export const clientsApi = {
  list: (q) => http.get(q ? `/clients?q=${encodeURIComponent(q)}` : '/clients'),
  get: (id) => http.get(`/clients/${id}`),
  create: (client) => http.post('/clients', client),
  update: (id, client) => http.put(`/clients/${id}`, client),
  remove: (id) => http.delete(`/clients/${id}`)
};

export const productsApi = {
  list: () => http.get('/products'),
  create: (product) => http.post('/products', product),
  update: (id, product) => http.put(`/products/${id}`, product),
  remove: (id) => http.delete(`/products/${id}`),
  setOptions: (id, options) => http.put(`/products/${id}/options`, { options }),
  listVariants: (id) => http.get(`/products/${id}/variants`),
  addVariant: (id, variant) => http.post(`/products/${id}/variants`, variant),
  updateVariant: (id, variantId, variant) =>
    http.put(`/products/${id}/variants/${variantId}`, variant),
  removeVariant: (id, variantId) => http.delete(`/products/${id}/variants/${variantId}`),
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
