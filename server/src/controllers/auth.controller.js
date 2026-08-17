import bcrypt from 'bcryptjs';
import { queryOne } from '../db/pool.js';
import { issueSession, clearSession } from '../middleware/auth.js';
import { loginSchema } from '../schemas/admin.schemas.js';
import { asyncHandler } from '../middleware/errors.js';

export const AuthController = {
  login: asyncHandler(async (req, res) => {
    const { user: identifier, password } = loginSchema.parse(req.body);
    // La columna se llama email pero guarda el usuario de acceso, que puede no
    // serlo (ver seedAdminUser en config/env.js).
    const user = await queryOne(
      'SELECT id, email, password_hash, display_name FROM admin_users WHERE email = $1',
      [identifier.toLowerCase()]
    );
    const valid = user && (await bcrypt.compare(password, user.password_hash));
    if (!valid) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    issueSession(res, user);
    res.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
  }),

  logout(req, res) {
    clearSession(res);
    res.json({ ok: true });
  },

  me: asyncHandler(async (req, res) => {
    const user = await queryOne('SELECT id, email, display_name FROM admin_users WHERE id = $1', [
      req.user.id
    ]);
    if (!user) return res.status(401).json({ error: 'Session expired' });
    res.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
  })
};
