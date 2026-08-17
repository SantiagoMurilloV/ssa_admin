import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, publicLimiter, orderLimiter } from '../middleware/rate-limiters.js';
import { uploadImageFile, uploadMediaFile } from '../middleware/upload.js';
import { AuthController } from '../controllers/auth.controller.js';
import { PublicController } from '../controllers/public.controller.js';
import { ProductsController } from '../controllers/products.controller.js';
import { OrdersController } from '../controllers/orders.controller.js';
import { ContentController } from '../controllers/content.controller.js';
import { ConfigController } from '../controllers/config.controller.js';
import { StatsController } from '../controllers/stats.controller.js';
import { EncargosController } from '../controllers/encargos.controller.js';
import { PromotionsController } from '../controllers/promotions.controller.js';
import { PushController } from '../controllers/push.controller.js';

export const router = Router();

// ── Público (consumido por las funciones serverless de la tienda) ──
router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.post('/events', publicLimiter, StatsController.recordEvent);
router.get('/public/catalog', publicLimiter, PublicController.catalog);
router.get('/public/site-content', publicLimiter, ContentController.publicContent);
router.post('/public/orders', orderLimiter, PublicController.createOrder);
router.post(
  '/public/orders/:reference/receipt',
  publicLimiter,
  uploadImageFile,
  PublicController.uploadReceipt
);
router.post('/public/encargos', orderLimiter, uploadImageFile, PublicController.createEncargo);
router.post('/public/subscribe', publicLimiter, PublicController.subscribe);

// ── Auth ──
router.post('/auth/login', loginLimiter, AuthController.login);
router.post('/auth/logout', AuthController.logout);

// ── Protegido ──
router.use(requireAuth);

router.get('/auth/me', AuthController.me);

router.get('/stats/dashboard', StatsController.dashboard);
router.get('/subscribers', StatsController.subscribers);

router.get('/orders', OrdersController.list);
router.patch('/orders/:id/status', OrdersController.updateStatus);

router.get('/products', ProductsController.list);
router.post('/products', ProductsController.create);
router.put('/products/:id', ProductsController.update);
router.delete('/products/:id', ProductsController.remove);
router.post('/products/:id/photos', uploadMediaFile, ProductsController.addPhoto);
router.delete('/products/:id/photos/:photoId', ProductsController.removePhoto);

router.get('/content', ContentController.get);
router.put('/content', ContentController.update);
router.post('/content/images/:section', uploadImageFile, ContentController.addImage);
router.delete('/content/images/:section', ContentController.removeImage);

router.get('/config/shipping', ConfigController.getShipping);
router.put('/config/shipping', ConfigController.updateShipping);
router.get('/config/payment-channels', ConfigController.getPaymentChannels);
router.put('/config/payment-channels', ConfigController.updatePaymentChannels);

router.get('/encargos', EncargosController.list);
router.patch('/encargos/:id/status', EncargosController.updateStatus);

router.get('/promotions', PromotionsController.list);
router.post('/promotions', PromotionsController.create);
router.put('/promotions/:id', PromotionsController.update);
router.delete('/promotions/:id', PromotionsController.remove);

router.get('/push/config', PushController.config);
router.post('/push/subscriptions', PushController.subscribe);
router.delete('/push/subscriptions', PushController.unsubscribe);
