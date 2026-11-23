import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { db, ROOT_DIR, UPLOADS_DIR, GENERATED_DIR } from './db.ts';

export type UserRole = 'Admin' | 'Safety Officer' | 'Supervisor' | 'Viewer';

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  is_active: number;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionTokenHash?: string;
}

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: number): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  // Clean up expired sessions for hygiene
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());

  db.prepare(
    'INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(userId, tokenHash, expiresAt, now.toISOString());

  return { token, expiresAt };
}

export function revokeSession(tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function logAudit(
  userId: number | null,
  userEmail: string,
  action: string,
  entityType: string,
  entityId = '',
  details = '',
  ipAddress = ''
): void {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, userEmail, action, entityType, entityId, details, ipAddress, new Date().toISOString());
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export function ensureEnvBootstrapAdmin(): void {
  const envPass = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  if (!envPass) return;

  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'Admin' ORDER BY id ASC LIMIT 1")
    .get() as { id: number } | undefined;

  const now = new Date().toISOString();
  const hash = hashPassword(envPass);

  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, department, designation, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 'Admin', 'Corporate HSE', 'Chief Safety Administrator', 1, ?, ?)
    `).run('SURAJ HSE Admin', 'admin@surajhse.com', hash, now, now);
  } else {
    db.prepare('UPDATE users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?').run(
      hash,
      now,
      existingAdmin.id
    );
  }
}

export function isInitialSetupRequired(): boolean {
  const envPass = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  if (envPass) return false;
  const adminCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'Admin'").get() as { c: number }
  ).c;
  return adminCount === 0;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }

  const tokenHash = hashToken(token);
  const row = db
    .prepare(`
      SELECT s.expires_at, u.id, u.full_name, u.email, u.role, u.department, u.designation, u.is_active
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash) as (AuthUser & { expires_at: string }) | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    revokeSession(tokenHash);
    res.status(401).json({ error: 'Session has expired. Please sign in again.' });
    return;
  }

  if (!row.is_active) {
    revokeSession(tokenHash);
    res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    return;
  }

  req.user = {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    department: row.department,
    designation: row.designation,
    is_active: row.is_active,
  };
  req.sessionTokenHash = tokenHash;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Role '${req.user.role}' does not have permission for this action.`,
      });
      return;
    }
    next();
  };
}

export function resolveSafeAssetPath(relPath: string): string | null {
  if (!relPath || typeof relPath !== 'string') return null;
  const cleaned = relPath.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT_DIR, cleaned);
  const assetsImagesDir = path.resolve(ROOT_DIR, 'src', 'assets', 'images');

  const allowedBases = [UPLOADS_DIR, GENERATED_DIR, assetsImagesDir];
  for (const base of allowedBases) {
    if (resolved.startsWith(base + path.sep)) {
      return resolved;
    }
  }
  return null;
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '';
}
