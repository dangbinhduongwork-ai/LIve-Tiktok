import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const COOKIE = 'live_admin_session';

export function loadAdminToken(file, configuredToken) {
  if (configuredToken?.trim()) return configuredToken.trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  }
  const token = fs.readFileSync(file, 'utf8').trim();
  if (!token) throw new Error('Admin token file is empty');
  return token;
}

export function createAdminAuth({ token, allowedOrigins, now = Date.now, sessionMs = 12 * 60 * 60 * 1000 }) {
  if (!token) throw new Error('Admin token is required');
  const tokenHash = crypto.createHash('sha256').update(token).digest();
  const sessions = new Map();
  const attempts = new Map();
  let socketServer;
  const originAllowed = origin => !origin || allowedOrigins.includes(origin);
  const tokenValid = value => typeof value === 'string' && crypto.timingSafeEqual(
    crypto.createHash('sha256').update(value).digest(), tokenHash
  );

  function sessionId(headers = {}) {
    const pair = String(headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='));
    return pair ? pair.slice(COOKIE.length + 1) : '';
  }

  function authorized(headers = {}, explicitToken) {
    if (explicitToken !== undefined) return tokenValid(explicitToken);
    if (headers.authorization?.startsWith('Bearer ')) return tokenValid(headers.authorization.slice(7));
    const id = sessionId(headers);
    const expires = sessions.get(id);
    if (!expires) return false;
    if (expires <= now()) { sessions.delete(id); return false; }
    return true;
  }

  function originGuard(req, res, next) {
    if (!originAllowed(req.headers.origin)) return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
    next();
  }

  function requireAdmin(req, res, next) {
    if (!authorized(req.headers)) return res.status(401).json({ error: 'ADMIN_AUTH_REQUIRED' });
    next();
  }

  function requirePage(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    if (!authorized(req.headers)) return res.redirect(303, '/login/');
    next();
  }

  function login(req, res) {
    const key = req.socket.remoteAddress || 'local';
    let attempt = attempts.get(key);
    if (!attempt || attempt.until <= now()) {
      attempt = { count: 0, until: now() + 60_000 };
      attempts.set(key, attempt);
    }
    if (attempt.count >= 10) return res.status(429).json({ error: 'Thử lại sau một phút.' });
    attempt.count += 1;
    if (!tokenValid(req.body?.token)) return res.status(401).json({ error: 'Mã quản trị không đúng.' });
    attempts.delete(key);
    for (const [id, expires] of sessions) if (expires <= now()) sessions.delete(id);
    if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
    const id = crypto.randomBytes(32).toString('hex');
    sessions.set(id, now() + sessionMs);
    res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: sessionMs, path: '/' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true });
  }

  function logout(req, res) {
    const id = sessionId(req.headers);
    sessions.delete(id);
    for (const socket of socketServer?.sockets.sockets.values() || []) {
      if (id && socket.data.adminSession === id) socket.disconnect(true);
    }
    res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict' });
    res.json({ success: true });
  }

  function attachSockets(io) {
    socketServer = io;
    io.use((socket, next) => {
      const auth = socket.handshake.auth || {};
      if ((auth.role === 'admin' || auth.token !== undefined) && !authorized(socket.request.headers, auth.token)) {
        return next(new Error('ADMIN_AUTH_REQUIRED'));
      }
      next();
    });
    io.on('connection', socket => {
      const auth = socket.handshake.auth || {};
      if (authorized(socket.request.headers, auth.token)) {
        socket.join('admin');
        const id = sessionId(socket.request.headers);
        socket.data.adminSession = id;
        if (auth.token === undefined && sessions.has(id)) {
          const timer = setTimeout(() => socket.disconnect(true), Math.max(0, sessions.get(id) - now()));
          timer.unref();
          socket.on('disconnect', () => clearTimeout(timer));
        }
      }
      socket.use(([event, ...args], next) => {
        if (typeof event === 'string' && event.startsWith('admin:') && !authorized(socket.request.headers, auth.token)) {
          socket.leave('admin');
          const error = { message: 'Cần đăng nhập quản trị.', code: 'ADMIN_AUTH_REQUIRED' };
          socket.emit('admin:error', error);
          const ack = args.at(-1);
          if (typeof ack === 'function') ack({ success: false, error: error.code });
          return;
        }
        next();
      });
    });
  }

  return { originAllowed, originGuard, requireAdmin, requirePage, login, logout, attachSockets };
}
