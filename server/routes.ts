import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { db, DB_PATH, UPLOADS_DIR } from './db.ts';
import {
  type AuthedRequest,
  type UserRole,
  createSession,
  getClientIp,
  hashPassword,
  isInitialSetupRequired,
  logAudit,
  requireAuth,
  requireRole,
  revokeSession,
  verifyPassword,
} from './auth.ts';
import {
  AiServiceError,
  analyzeSafetyPhoto,
  generateSafetyDocumentContent,
  generateSafetyImage,
} from './ai.ts';
import {
  buildExcelExport,
  buildFilteredObservationsPdf,
  buildInspectionPdf,
  buildObservationPdf,
  buildSafetyDocumentDocx,
  buildSafetyDocumentPdf,
} from './exports.ts';

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
      };
      const ext = extMap[file.mimetype] || '.jpg';
      cb(null, `site_${Date.now()}_${crypto.randomBytes(5).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, and WEBP image files are permitted.'));
      return;
    }
    cb(null, true);
  },
});

const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function nextSequentialCode(table: string, col: string, prefix: string): string {
  const year = new Date().getFullYear();
  const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
  let seq = (row?.c ?? 0) + 1;
  while (true) {
    const code = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
    const exists = db.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ?`).get(code);
    if (!exists) return code;
    seq += 1;
  }
}

function buildObservationWhereClause(query: Record<string, unknown>): {
  sqlWhere: string;
  params: unknown[];
  filterSummary: string;
} {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const summaryParts: string[] = [];

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    const like = `%${search}%`;
    clauses.push(
      '(obs_code LIKE ? OR title LIKE ? OR location LIKE ? OR agency_name LIKE ? OR job_executor LIKE ? OR details LIKE ? OR details_hi LIKE ? OR hazard LIKE ?)'
    );
    params.push(like, like, like, like, like, like, like, like);
    summaryParts.push(`Search: "${search}"`);
  }

  const dateFrom = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
  if (dateFrom) {
    clauses.push('substr(observed_at, 1, 10) >= ?');
    params.push(dateFrom);
    summaryParts.push(`From: ${dateFrom}`);
  }

  const dateTo = typeof query.dateTo === 'string' ? query.dateTo.trim() : '';
  if (dateTo) {
    clauses.push('substr(observed_at, 1, 10) <= ?');
    params.push(dateTo);
    summaryParts.push(`To: ${dateTo}`);
  }

  const location = typeof query.location === 'string' ? query.location.trim() : '';
  if (location && location !== 'All') {
    clauses.push('location LIKE ?');
    params.push(`%${location}%`);
    summaryParts.push(`Location: ${location}`);
  }

  const agency = typeof query.agency === 'string' ? query.agency.trim() : '';
  if (agency && agency !== 'All') {
    clauses.push('agency_name LIKE ?');
    params.push(`%${agency}%`);
    summaryParts.push(`Agency: ${agency}`);
  }

  const category = typeof query.category === 'string' ? query.category.trim() : '';
  if (category && category !== 'All') {
    clauses.push('category = ?');
    params.push(category);
    summaryParts.push(`Category: ${category}`);
  }

  const risk = typeof query.risk === 'string' ? query.risk.trim() : '';
  if (risk && risk !== 'All') {
    clauses.push('risk_level = ?');
    params.push(risk);
    summaryParts.push(`Risk: ${risk}`);
  }

  const status = typeof query.status === 'string' ? query.status.trim() : '';
  if (status && status !== 'All') {
    clauses.push('status = ?');
    params.push(status);
    summaryParts.push(`Status: ${status}`);
  }

  return {
    sqlWhere: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    filterSummary: summaryParts.length > 0 ? summaryParts.join(' | ') : 'All Records',
  };
}

export function registerApiRoutes(app: express.Express): void {
  const router = express.Router();

  // Origin check for authenticated mutations (defends against cross-site form/fetch CSRF)
  router.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          const allowedHost = Array.isArray(host) ? host[0] : host;
          if (originHost !== allowedHost) {
            res.status(403).json({ error: 'Cross-origin mutation blocked.' });
            return;
          }
        } catch {
          res.status(403).json({ error: 'Invalid request origin.' });
          return;
        }
      }
    }
    next();
  });

  // 1. AUTHENTICATION & SETUP
  router.get('/auth/status', (_req, res) => {
    res.json({
      needsSetup: isInitialSetupRequired(),
      envAdminConfigured: Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()),
    });
  });

  router.post('/auth/setup', (req, res) => {
    const { fullName, email, password, department, designation } = req.body ?? {};
    if (!fullName || !email || !password || String(password).length < 8) {
      res.status(400).json({
        error: 'Full name, valid email, and a password of at least 8 characters are required.',
      });
      return;
    }

    const emailNormalized = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const ip = getClientIp(req);
    const setupTx = db.transaction(() => {
      if (!isInitialSetupRequired()) {
        return null;
      }
      const now = new Date().toISOString();
      const hash = hashPassword(String(password));
      const info = db
        .prepare(`
          INSERT INTO users (full_name, email, password_hash, role, department, designation, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 'Admin', ?, ?, 1, ?, ?)
        `)
        .run(
          String(fullName).trim(),
          emailNormalized,
          hash,
          String(department || 'Corporate HSE').trim(),
          String(designation || 'Chief HSE Administrator').trim(),
          now,
          now
        );
      return Number(info.lastInsertRowid);
    });

    const userId = setupTx();
    if (!userId) {
      res.status(403).json({ error: 'Initial administrator account is already configured.' });
      return;
    }

    const session = createSession(userId);
    const user = db
      .prepare('SELECT id, full_name, email, role, department, designation, is_active FROM users WHERE id = ?')
      .get(userId);
    logAudit(userId, emailNormalized, 'ADMIN_BOOTSTRAP_SETUP', 'users', String(userId), 'Initial admin claimed', ip);
    res.status(201).json({ token: session.token, expiresAt: session.expiresAt, user });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const ip = getClientIp(req);
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const emailNormalized = String(email).trim().toLowerCase();
    const userRow = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(emailNormalized) as
      | {
          id: number;
          full_name: string;
          email: string;
          password_hash: string;
          role: UserRole;
          department: string;
          designation: string;
          is_active: number;
        }
      | undefined;

    if (!userRow || !verifyPassword(String(password), userRow.password_hash)) {
      logAudit(null, emailNormalized, 'LOGIN_FAILED', 'auth', '', 'Invalid credentials', ip);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!userRow.is_active) {
      logAudit(userRow.id, userRow.email, 'LOGIN_BLOCKED_INACTIVE', 'auth', '', 'Deactivated account', ip);
      res.status(403).json({ error: 'Account is deactivated. Contact your Administrator.' });
      return;
    }

    const session = createSession(userRow.id);
    logAudit(userRow.id, userRow.email, 'LOGIN_SUCCESS', 'auth', String(userRow.id), `Role: ${userRow.role}`, ip);

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: userRow.id,
        full_name: userRow.full_name,
        email: userRow.email,
        role: userRow.role,
        department: userRow.department,
        designation: userRow.designation,
        is_active: userRow.is_active,
      },
    });
  });

  router.post('/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.sessionTokenHash) {
      revokeSession(req.sessionTokenHash);
    }
    logAudit(req.user!.id, req.user!.email, 'LOGOUT', 'auth', String(req.user!.id), '', getClientIp(req));
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  router.post('/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword || String(newPassword).length < 8) {
      res.status(400).json({ error: 'Current password and a new password (min 8 characters) are required.' });
      return;
    }

    const userRow = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string } | undefined;

    if (!userRow || !verifyPassword(String(currentPassword), userRow.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const newHash = hashPassword(String(newPassword));
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      newHash,
      new Date().toISOString(),
      req.user!.id
    );
    logAudit(req.user!.id, req.user!.email, 'PASSWORD_CHANGED', 'users', String(req.user!.id), '', getClientIp(req));
    res.json({ ok: true });
  });

  // 2. USER MANAGEMENT & AUDIT LOGS (ADMIN ONLY)
  router.get('/users', requireAuth, requireRole('Admin'), (_req, res) => {
    const users = db
      .prepare('SELECT id, full_name, email, role, department, designation, is_active, created_at, updated_at FROM users ORDER BY id ASC')
      .all();
    res.json({ users });
  });

  router.post('/users', requireAuth, requireRole('Admin'), (req: AuthedRequest, res) => {
    const { fullName, email, password, role, department, designation } = req.body ?? {};
    const validRoles: UserRole[] = ['Admin', 'Safety Officer', 'Supervisor', 'Viewer'];
    if (!fullName || !email || !password || String(password).length < 8 || !validRoles.includes(role)) {
      res.status(400).json({ error: 'Valid name, email, role, and password (min 8 chars) are required.' });
      return;
    }

    const emailNormalized = String(email).trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNormalized);
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const now = new Date().toISOString();
    const info = db
      .prepare(`
        INSERT INTO users (full_name, email, password_hash, role, department, designation, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .run(
        String(fullName).trim(),
        emailNormalized,
        hashPassword(String(password)),
        role,
        String(department || 'Operations').trim(),
        String(designation || role).trim(),
        now,
        now
      );

    logAudit(req.user!.id, req.user!.email, 'USER_CREATED', 'users', String(info.lastInsertRowid), `Created ${emailNormalized} (${role})`, getClientIp(req));
    const created = db
      .prepare('SELECT id, full_name, email, role, department, designation, is_active, created_at FROM users WHERE id = ?')
      .get(info.lastInsertRowid);
    res.status(201).json({ user: created });
  });

  router.patch('/users/:id', requireAuth, requireRole('Admin'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | { id: number; email: string; role: UserRole; is_active: number }
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const { role, department, designation, is_active, newPassword } = req.body ?? {};
    const validRoles: UserRole[] = ['Admin', 'Safety Officer', 'Supervisor', 'Viewer'];
    if (role && !validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role.' });
      return;
    }

    if (id === req.user!.id && is_active === 0) {
      res.status(400).json({ error: 'You cannot deactivate your own active Admin account.' });
      return;
    }

    const now = new Date().toISOString();
    const nextRole = role || target.role;
    const nextActive = typeof is_active === 'number' || typeof is_active === 'boolean' ? (is_active ? 1 : 0) : target.is_active;

    db.prepare(`
      UPDATE users SET
        role = ?,
        department = COALESCE(?, department),
        designation = COALESCE(?, designation),
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `).run(nextRole, department ?? null, designation ?? null, nextActive, now, id);

    if (newPassword && String(newPassword).length >= 8) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(newPassword)), id);
    }
    if (!nextActive) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }

    logAudit(req.user!.id, req.user!.email, 'USER_UPDATED', 'users', String(id), `Role=${nextRole}, Active=${nextActive}`, getClientIp(req));
    const updated = db
      .prepare('SELECT id, full_name, email, role, department, designation, is_active, created_at FROM users WHERE id = ?')
      .get(id);
    res.json({ user: updated });
  });

  router.get('/audit-logs', requireAuth, requireRole('Admin'), (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all();
    res.json({ logs });
  });

  // 3. DASHBOARD KPI & CHARTS (REAL SQL QUERIES)
  router.get('/dashboard', requireAuth, (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    // Auto-mark open observations past target date as Overdue
    db.prepare("UPDATE observations SET status = 'Overdue' WHERE status = 'Open' AND target_date < ? AND target_date != ''").run(today);

    const totalObservations = (db.prepare('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    const openObservations = (db.prepare("SELECT COUNT(*) as c FROM observations WHERE status = 'Open'").get() as { c: number }).c;
    const closedObservations = (db.prepare("SELECT COUNT(*) as c FROM observations WHERE status = 'Closed'").get() as { c: number }).c;
    const overdueObservations = (db.prepare("SELECT COUNT(*) as c FROM observations WHERE status = 'Overdue'").get() as { c: number }).c;
    const highCriticalObservations = (
      db.prepare("SELECT COUNT(*) as c FROM observations WHERE risk_level IN ('High', 'Critical')").get() as { c: number }
    ).c;

    const totalInspections = (db.prepare('SELECT COUNT(*) as c FROM inspections').get() as { c: number }).c;
    const pendingInspections = (
      db.prepare("SELECT COUNT(*) as c FROM inspections WHERE overall_status IN ('Action Required', 'Fail')").get() as { c: number }
    ).c;
    const overdueInspections = (
      db.prepare("SELECT COUNT(*) as c FROM inspections WHERE overall_status IN ('Action Required', 'Fail') AND target_date < ? AND target_date != ''").get(today) as { c: number }
    ).c;

    const documentsGenerated = (db.prepare('SELECT COUNT(*) as c FROM safety_documents').get() as { c: number }).c;
    const incidentsCount = (db.prepare('SELECT COUNT(*) as c FROM incidents').get() as { c: number }).c;
    const trainingsCount = (db.prepare('SELECT COUNT(*) as c FROM trainings').get() as { c: number }).c;
    const auditsCount = (db.prepare('SELECT COUNT(*) as c FROM audits').get() as { c: number }).c;

    const monthlyObservations = db
      .prepare(`
        SELECT substr(observed_at, 1, 7) as month,
               COUNT(*) as total,
               SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed,
               SUM(CASE WHEN risk_level IN ('High', 'Critical') THEN 1 ELSE 0 END) as highCritical
        FROM observations
        GROUP BY substr(observed_at, 1, 7)
        ORDER BY month ASC
      `)
      .all();

    const riskBreakdown = db
      .prepare(`
        SELECT risk_level as name, COUNT(*) as value
        FROM observations
        GROUP BY risk_level
      `)
      .all();

    const statusBreakdown = db
      .prepare(`
        SELECT status as name, COUNT(*) as value
        FROM observations
        GROUP BY status
      `)
      .all();

    const categoryBreakdown = db
      .prepare(`
        SELECT category as name, COUNT(*) as count
        FROM observations
        GROUP BY category
        ORDER BY count DESC
        LIMIT 8
      `)
      .all();

    const recentActivities = db
      .prepare(`
        SELECT id, user_email, action, entity_type, entity_id, details, created_at
        FROM audit_logs
        ORDER BY id DESC
        LIMIT 10
      `)
      .all();

    const recentObservations = db
      .prepare('SELECT id, obs_code, title, location, risk_level, status, observed_at FROM observations ORDER BY id DESC LIMIT 5')
      .all();

    res.json({
      kpis: {
        totalObservations,
        openObservations,
        closedObservations,
        overdueObservations,
        highCriticalObservations,
        totalInspections,
        pendingCorrectiveActions: openObservations + overdueObservations + pendingInspections,
        overdueActions: overdueObservations + overdueInspections,
        documentsGenerated,
        incidentsCount,
        trainingsCount,
        auditsCount,
      },
      charts: {
        monthlyObservations,
        riskBreakdown,
        statusBreakdown,
        categoryBreakdown,
      },
      recentActivities,
      recentObservations,
    });
  });

  // 4. FILE UPLOADS
  router.post(
    '/upload',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    (req, res) => {
      upload.single('photo')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: 'No image file provided.' });
          return;
        }
        res.json({ path: `/uploads/${req.file.filename}`, filename: req.file.filename });
      });
    }
  );

  router.post(
    '/upload-base64',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    (req, res) => {
      const { dataUrl } = req.body ?? {};
      if (!dataUrl || typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Image data is required.' });
        return;
      }
      const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!match) {
        res.status(400).json({ error: 'Invalid image format. Only JPEG, PNG, and WEBP are supported.' });
        return;
      }
      const mime = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > MAX_UPLOAD_BYTES) {
        res.status(400).json({ error: 'Image exceeds 10MB maximum limit.' });
        return;
      }
      const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
      const filename = `cam_${Date.now()}_${crypto.randomBytes(5).toString('hex')}${ext}`;
      fs.writeFileSync(path.resolve(UPLOADS_DIR, filename), buffer);
      res.json({ path: `/uploads/${filename}`, filename });
    }
  );

  // 5. AI INTEGRATION ENDPOINTS
  router.post(
    '/ai/analyze-observation',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    async (req: AuthedRequest, res) => {
      try {
        const { imageDataUrl, existingPhotoPath, location, agencyName, jobExecutor, workActivity, category, language } =
          req.body ?? {};

        let base64 = '';
        let mimeType = 'image/jpeg';
        let savedPhotoPath = existingPhotoPath || '';

        if (imageDataUrl && typeof imageDataUrl === 'string') {
          const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
          if (!match) {
            res.status(400).json({
              error: 'Unsupported image format. Please upload JPEG, PNG, or WEBP.',
              hindiError: 'अमान्य छवि प्रारूप। कृपया JPEG, PNG या WEBP फोटो अपलोड करें।',
            });
            return;
          }
          mimeType = match[1];
          base64 = match[2];
          const buf = Buffer.from(base64, 'base64');
          if (buf.length > MAX_UPLOAD_BYTES) {
            res.status(400).json({
              error: 'Uploaded photo exceeds 10MB limit.',
              hindiError: 'अपलोड की गई फोटो 10MB की सीमा से अधिक है।',
            });
            return;
          }
          if (!savedPhotoPath) {
            const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
            const filename = `obs_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
            fs.writeFileSync(path.resolve(UPLOADS_DIR, filename), buf);
            savedPhotoPath = `/uploads/${filename}`;
          }
        } else {
          res.status(400).json({
            error: 'Please upload or capture a site photograph for AI analysis.',
            hindiError: 'AI विश्लेषण के लिए कृपया साइट की फोटो अपलोड या कैप्चर करें।',
          });
          return;
        }

        const analysis = await analyzeSafetyPhoto({
          imageBase64: base64,
          mimeType,
          location: String(location || ''),
          agencyName: String(agencyName || ''),
          jobExecutor: String(jobExecutor || ''),
          workActivity: String(workActivity || ''),
          category: String(category || 'Auto'),
          language: language === 'Hindi' || language === 'English' ? language : 'Bilingual',
        });

        logAudit(req.user!.id, req.user!.email, 'AI_ANALYZE_OBSERVATION', 'ai', savedPhotoPath, `Model: ${analysis.modelUsed}`, getClientIp(req));
        res.json({ analysis, photoPath: savedPhotoPath });
      } catch (err) {
        if (err instanceof AiServiceError) {
          res.status(err.statusCode).json({ error: err.message, hindiError: err.hindiMessage });
          return;
        }
        const msg = err instanceof Error ? err.message : 'AI analysis failed';
        res.status(500).json({ error: msg, hindiError: `AI विश्लेषण विफल रहा: ${msg}` });
      }
    }
  );

  router.post(
    '/ai/generate-image',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    async (req: AuthedRequest, res) => {
      try {
        const { prompt, category, aspectRatio } = req.body ?? {};
        if (!prompt || String(prompt).trim().length < 5) {
          res.status(400).json({
            error: 'Please enter a descriptive safety prompt (minimum 5 characters).',
            hindiError: 'कृपया सुरक्षा चित्र बनाने के लिए कम से कम 5 अक्षरों का विवरण लिखें।',
          });
          return;
        }

        const validAspect = ['1:1', '16:9', '4:3', '3:4'].includes(aspectRatio) ? aspectRatio : '16:9';
        const { imagePath, modelUsed } = await generateSafetyImage(
          String(prompt).trim(),
          String(category || 'General Safety'),
          validAspect
        );

        const now = new Date().toISOString();
        const info = db
          .prepare(`
            INSERT INTO generated_images (prompt, category, aspect_ratio, image_path, model_used, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(String(prompt).trim(), String(category || 'General Safety'), validAspect, imagePath, modelUsed, req.user!.id, now);

        const record = db.prepare('SELECT * FROM generated_images WHERE id = ?').get(info.lastInsertRowid);
        logAudit(req.user!.id, req.user!.email, 'AI_IMAGE_GENERATED', 'generated_images', String(info.lastInsertRowid), modelUsed, getClientIp(req));
        res.status(201).json({ record });
      } catch (err) {
        if (err instanceof AiServiceError) {
          res.status(err.statusCode).json({ error: err.message, hindiError: err.hindiMessage });
          return;
        }
        const msg = err instanceof Error ? err.message : 'Image generation failed';
        res.status(500).json({ error: msg, hindiError: `इमेज जनरेशन विफल रहा: ${msg}` });
      }
    }
  );

  router.get('/ai/generated-images', requireAuth, (_req, res) => {
    const images = db.prepare('SELECT * FROM generated_images ORDER BY id DESC LIMIT 50').all();
    res.json({ images });
  });

  router.delete('/ai/generated-images/:id', requireAuth, requireRole('Admin', 'Safety Officer'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM generated_images WHERE id = ?').run(id);
    logAudit(req.user!.id, req.user!.email, 'AI_IMAGE_DELETED', 'generated_images', String(id), '', getClientIp(req));
    res.json({ ok: true });
  });

  router.post(
    '/ai/generate-document',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    async (req: AuthedRequest, res) => {
      try {
        const { docType, title, location, department, language, contextNotes } = req.body ?? {};
        if (!docType || !title) {
          res.status(400).json({
            error: 'Document type and title are required.',
            hindiError: 'दस्तावेज़ का प्रकार और शीर्षक आवश्यक है।',
          });
          return;
        }

        const { content, modelUsed } = await generateSafetyDocumentContent({
          docType: String(docType),
          title: String(title),
          location: String(location || 'Industrial Plant Site'),
          department: String(department || 'HSE & Operations'),
          language: language === 'Hindi' || language === 'English' ? language : 'Bilingual',
          contextNotes: String(contextNotes || ''),
        });

        logAudit(req.user!.id, req.user!.email, 'AI_DOCUMENT_DRAFTED', 'safety_documents', '', `${docType} (${modelUsed})`, getClientIp(req));
        res.json({ content, modelUsed });
      } catch (err) {
        if (err instanceof AiServiceError) {
          res.status(err.statusCode).json({ error: err.message, hindiError: err.hindiMessage });
          return;
        }
        const msg = err instanceof Error ? err.message : 'Document generation failed';
        res.status(500).json({ error: msg, hindiError: `दस्तावेज़ निर्माण विफल रहा: ${msg}` });
      }
    }
  );

  // 6. OBSERVATIONS CRUD
  router.get('/observations', requireAuth, (req, res) => {
    const { sqlWhere, params } = buildObservationWhereClause(req.query as Record<string, unknown>);
    const observations = db
      .prepare(`SELECT * FROM observations ${sqlWhere} ORDER BY id DESC`)
      .all(...params);
    res.json({ observations });
  });

  router.post(
    '/observations',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    (req: AuthedRequest, res) => {
      const b = req.body ?? {};
      if (!b.title || !b.location || !b.hazard || !b.corrective_action) {
        res.status(400).json({ error: 'Title, location, hazard, and corrective action are required.' });
        return;
      }

      const now = new Date().toISOString();
      const obsCode = nextSequentialCode('observations', 'obs_code', 'OBS');
      const info = db
        .prepare(`
          INSERT INTO observations (
            obs_code, observed_at, location, agency_name, job_executor, work_activity,
            category, observation_type, title, photo_summary, details, details_hi,
            hazard, potential_consequence, risk_level, corrective_action, preventive_action,
            precaution, responsible_person, site_verification, target_date, status,
            photo_path, additional_photos_json, closure_remarks, closing_date,
            site_incharge_name, site_incharge_signature, site_supervisor_name, site_supervisor_signature,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          obsCode,
          b.observed_at || now,
          String(b.location).trim(),
          String(b.agency_name || 'In-House').trim(),
          String(b.job_executor || 'Site Team').trim(),
          String(b.work_activity || 'General Operations').trim(),
          String(b.category || 'General Industrial Safety').trim(),
          String(b.observation_type || 'Unsafe Condition').trim(),
          String(b.title).trim(),
          String(b.photo_summary || '').trim(),
          String(b.details || b.title).trim(),
          String(b.details_hi || '').trim(),
          String(b.hazard).trim(),
          String(b.potential_consequence || 'Potential injury').trim(),
          ['Low', 'Medium', 'High', 'Critical', 'Needs Verification'].includes(b.risk_level)
            ? b.risk_level
            : 'Medium',
          String(b.corrective_action).trim(),
          String(b.preventive_action || '').trim(),
          String(b.precaution || '').trim(),
          String(b.responsible_person || 'Site Supervisor').trim(),
          String(b.site_verification || '').trim(),
          String(b.target_date || now.slice(0, 10)),
          ['Open', 'Closed', 'Overdue'].includes(b.status) ? b.status : 'Open',
          String(b.photo_path || ''),
          JSON.stringify(Array.isArray(b.additional_photos) ? b.additional_photos : []),
          String(b.closure_remarks || ''),
          String(b.closing_date || ''),
          String(b.site_incharge_name || ''),
          String(b.site_incharge_signature || ''),
          String(b.site_supervisor_name || ''),
          String(b.site_supervisor_signature || ''),
          req.user!.id,
          now,
          now
        );

      const created = db.prepare('SELECT * FROM observations WHERE id = ?').get(info.lastInsertRowid);
      logAudit(req.user!.id, req.user!.email, 'OBSERVATION_CREATED', 'observations', obsCode, String(b.title), getClientIp(req));
      res.status(201).json({ observation: created });
    }
  );

  router.patch(
    '/observations/:id',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    (req: AuthedRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM observations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Observation not found.' });
        return;
      }

      const b = req.body ?? {};
      const now = new Date().toISOString();
      const nextStatus = ['Open', 'Closed', 'Overdue'].includes(b.status) ? b.status : existing.status;
      const closingDate = nextStatus === 'Closed' ? (b.closing_date || now.slice(0, 10)) : (b.closing_date ?? existing.closing_date);

      db.prepare(`
        UPDATE observations SET
          location = COALESCE(?, location),
          agency_name = COALESCE(?, agency_name),
          job_executor = COALESCE(?, job_executor),
          work_activity = COALESCE(?, work_activity),
          category = COALESCE(?, category),
          observation_type = COALESCE(?, observation_type),
          title = COALESCE(?, title),
          details = COALESCE(?, details),
          details_hi = COALESCE(?, details_hi),
          hazard = COALESCE(?, hazard),
          potential_consequence = COALESCE(?, potential_consequence),
          risk_level = COALESCE(?, risk_level),
          corrective_action = COALESCE(?, corrective_action),
          preventive_action = COALESCE(?, preventive_action),
          precaution = COALESCE(?, precaution),
          responsible_person = COALESCE(?, responsible_person),
          target_date = COALESCE(?, target_date),
          status = ?,
          closure_remarks = COALESCE(?, closure_remarks),
          closing_date = ?,
          site_incharge_name = COALESCE(?, site_incharge_name),
          site_incharge_signature = COALESCE(?, site_incharge_signature),
          site_supervisor_name = COALESCE(?, site_supervisor_name),
          site_supervisor_signature = COALESCE(?, site_supervisor_signature),
          updated_at = ?
        WHERE id = ?
      `).run(
        b.location ?? null,
        b.agency_name ?? null,
        b.job_executor ?? null,
        b.work_activity ?? null,
        b.category ?? null,
        b.observation_type ?? null,
        b.title ?? null,
        b.details ?? null,
        b.details_hi ?? null,
        b.hazard ?? null,
        b.potential_consequence ?? null,
        b.risk_level ?? null,
        b.corrective_action ?? null,
        b.preventive_action ?? null,
        b.precaution ?? null,
        b.responsible_person ?? null,
        b.target_date ?? null,
        nextStatus,
        b.closure_remarks ?? null,
        closingDate,
        b.site_incharge_name ?? null,
        b.site_incharge_signature ?? null,
        b.site_supervisor_name ?? null,
        b.site_supervisor_signature ?? null,
        now,
        id
      );

      const updated = db.prepare('SELECT * FROM observations WHERE id = ?').get(id);
      logAudit(req.user!.id, req.user!.email, 'OBSERVATION_UPDATED', 'observations', String(existing.obs_code), `Status=${nextStatus}`, getClientIp(req));
      res.json({ observation: updated });
    }
  );

  router.delete('/observations/:id', requireAuth, requireRole('Admin'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT obs_code FROM observations WHERE id = ?').get(id) as { obs_code: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Observation not found.' });
      return;
    }
    db.prepare('DELETE FROM observations WHERE id = ?').run(id);
    logAudit(req.user!.id, req.user!.email, 'OBSERVATION_DELETED', 'observations', existing.obs_code, '', getClientIp(req));
    res.json({ ok: true });
  });

  // 7. EQUIPMENT & SITE INSPECTIONS CRUD
  router.get('/inspections', requireAuth, (req, res) => {
    const { moduleType, status, search } = req.query as Record<string, string>;
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (moduleType && moduleType !== 'All') {
      clauses.push('module_type = ?');
      params.push(moduleType);
    }
    if (status && status !== 'All') {
      clauses.push('overall_status = ?');
      params.push(status);
    }
    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      clauses.push('(insp_code LIKE ? OR equipment_id LIKE ? OR location LIKE ? OR inspector_name LIKE ? OR remarks LIKE ?)');
      params.push(like, like, like, like, like);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const inspections = db.prepare(`SELECT * FROM inspections ${whereSql} ORDER BY id DESC`).all(...params);
    res.json({ inspections });
  });

  router.post(
    '/inspections',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    (req: AuthedRequest, res) => {
      const b = req.body ?? {};
      if (!b.module_type || !b.equipment_id || !b.location || !b.inspector_name) {
        res.status(400).json({ error: 'Module type, equipment ID, location, and inspector name are required.' });
        return;
      }

      const now = new Date().toISOString();
      const inspCode = nextSequentialCode('inspections', 'insp_code', 'INSP');
      const checklist = Array.isArray(b.checklist) ? b.checklist : [];
      const hasNonCompliant = checklist.some((c: { status: string }) => c.status === 'Non-Compliant');
      const overallStatus = b.overall_status || (hasNonCompliant ? 'Action Required' : 'Pass');

      const info = db
        .prepare(`
          INSERT INTO inspections (
            insp_code, module_type, equipment_id, location, inspector_name, inspection_date,
            checklist_json, overall_status, risk_level, remarks, photo_path,
            corrective_action, responsible_person, target_date, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          inspCode,
          String(b.module_type),
          String(b.equipment_id),
          String(b.location),
          String(b.inspector_name),
          String(b.inspection_date || now.slice(0, 10)),
          JSON.stringify(checklist),
          overallStatus,
          ['Low', 'Medium', 'High', 'Critical'].includes(b.risk_level) ? b.risk_level : 'Medium',
          String(b.remarks || ''),
          String(b.photo_path || ''),
          String(b.corrective_action || ''),
          String(b.responsible_person || ''),
          String(b.target_date || ''),
          req.user!.id,
          now,
          now
        );

      const created = db.prepare('SELECT * FROM inspections WHERE id = ?').get(info.lastInsertRowid);
      logAudit(req.user!.id, req.user!.email, 'INSPECTION_CREATED', 'inspections', inspCode, `${b.module_type} - ${b.equipment_id}`, getClientIp(req));
      res.status(201).json({ inspection: created });
    }
  );

  router.patch(
    '/inspections/:id',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    (req: AuthedRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM inspections WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Inspection not found.' });
        return;
      }
      const b = req.body ?? {};
      db.prepare(`
        UPDATE inspections SET
          overall_status = COALESCE(?, overall_status),
          remarks = COALESCE(?, remarks),
          corrective_action = COALESCE(?, corrective_action),
          responsible_person = COALESCE(?, responsible_person),
          target_date = COALESCE(?, target_date),
          updated_at = ?
        WHERE id = ?
      `).run(
        b.overall_status ?? null,
        b.remarks ?? null,
        b.corrective_action ?? null,
        b.responsible_person ?? null,
        b.target_date ?? null,
        new Date().toISOString(),
        id
      );
      const updated = db.prepare('SELECT * FROM inspections WHERE id = ?').get(id);
      logAudit(req.user!.id, req.user!.email, 'INSPECTION_UPDATED', 'inspections', String(existing.insp_code), '', getClientIp(req));
      res.json({ inspection: updated });
    }
  );

  router.delete('/inspections/:id', requireAuth, requireRole('Admin'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM inspections WHERE id = ?').run(id);
    logAudit(req.user!.id, req.user!.email, 'INSPECTION_DELETED', 'inspections', String(id), '', getClientIp(req));
    res.json({ ok: true });
  });

  // 8. SAFETY DOCUMENTS CRUD
  router.get('/documents', requireAuth, (_req, res) => {
    const documents = db.prepare('SELECT * FROM safety_documents ORDER BY id DESC').all();
    res.json({ documents });
  });

  router.post(
    '/documents',
    requireAuth,
    requireRole('Admin', 'Safety Officer', 'Supervisor'),
    (req: AuthedRequest, res) => {
      const b = req.body ?? {};
      if (!b.doc_type || !b.title) {
        res.status(400).json({ error: 'Document type and title are required.' });
        return;
      }
      const now = new Date().toISOString();
      const docCode = nextSequentialCode('safety_documents', 'doc_code', 'DOC');
      const info = db
        .prepare(`
          INSERT INTO safety_documents (
            doc_code, doc_type, title, language, location, department, prepared_by, content_json, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          docCode,
          String(b.doc_type),
          String(b.title),
          String(b.language || 'Bilingual'),
          String(b.location || 'Plant Site'),
          String(b.department || 'HSE'),
          String(b.prepared_by || req.user!.full_name),
          JSON.stringify(b.content || {}),
          req.user!.id,
          now,
          now
        );
      const created = db.prepare('SELECT * FROM safety_documents WHERE id = ?').get(info.lastInsertRowid);
      logAudit(req.user!.id, req.user!.email, 'DOCUMENT_SAVED', 'safety_documents', docCode, String(b.doc_type), getClientIp(req));
      res.status(201).json({ document: created });
    }
  );

  router.delete('/documents/:id', requireAuth, requireRole('Admin'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM safety_documents WHERE id = ?').run(id);
    logAudit(req.user!.id, req.user!.email, 'DOCUMENT_DELETED', 'safety_documents', String(id), '', getClientIp(req));
    res.json({ ok: true });
  });

  // 9. INCIDENTS, TRAININGS, AUDITS REGISTERS
  router.get('/registers/summary', requireAuth, (_req, res) => {
    res.json({
      incidents: db.prepare('SELECT * FROM incidents ORDER BY id DESC').all(),
      trainings: db.prepare('SELECT * FROM trainings ORDER BY id DESC').all(),
      audits: db.prepare('SELECT * FROM audits ORDER BY id DESC').all(),
    });
  });

  router.post('/incidents', requireAuth, requireRole('Admin', 'Safety Officer', 'Supervisor'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const code = nextSequentialCode('incidents', 'inc_code', 'INC');
    const info = db
      .prepare(`
        INSERT INTO incidents (inc_code, incident_date, location, agency_name, incident_type, severity, description, root_cause, corrective_action, responsible_person, target_date, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        b.incident_date || new Date().toISOString().slice(0, 10),
        b.location || 'Plant Site',
        b.agency_name || 'In-House',
        b.incident_type || 'Near Miss',
        b.severity || 'Medium',
        b.description || '',
        b.root_cause || '',
        b.corrective_action || '',
        b.responsible_person || '',
        b.target_date || new Date().toISOString().slice(0, 10),
        b.status || 'Open',
        req.user!.id,
        new Date().toISOString()
      );
    logAudit(req.user!.id, req.user!.email, 'INCIDENT_LOGGED', 'incidents', code, String(b.incident_type), getClientIp(req));
    res.status(201).json({ incident: db.prepare('SELECT * FROM incidents WHERE id = ?').get(info.lastInsertRowid) });
  });

  router.post('/trainings', requireAuth, requireRole('Admin', 'Safety Officer', 'Supervisor'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const code = nextSequentialCode('trainings', 'trn_code', 'TRN');
    const info = db
      .prepare(`
        INSERT INTO trainings (trn_code, training_date, topic, trainer_name, location, department, attendees_count, duration_hours, status, remarks, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        b.training_date || new Date().toISOString().slice(0, 10),
        b.topic || 'Safety Induction',
        b.trainer_name || req.user!.full_name,
        b.location || 'HSE Training Room',
        b.department || 'Operations',
        Number(b.attendees_count || 10),
        Number(b.duration_hours || 1),
        b.status || 'Completed',
        b.remarks || '',
        req.user!.id,
        new Date().toISOString()
      );
    logAudit(req.user!.id, req.user!.email, 'TRAINING_LOGGED', 'trainings', code, String(b.topic), getClientIp(req));
    res.status(201).json({ training: db.prepare('SELECT * FROM trainings WHERE id = ?').get(info.lastInsertRowid) });
  });

  router.post('/audits', requireAuth, requireRole('Admin', 'Safety Officer'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const code = nextSequentialCode('audits', 'aud_code', 'AUD');
    const info = db
      .prepare(`
        INSERT INTO audits (aud_code, audit_date, audit_type, location, lead_auditor, score_percent, findings_count, open_nc_count, status, summary, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        b.audit_date || new Date().toISOString().slice(0, 10),
        b.audit_type || 'Internal HSE Audit',
        b.location || 'Plant Site',
        b.lead_auditor || req.user!.full_name,
        Number(b.score_percent || 90),
        Number(b.findings_count || 0),
        Number(b.open_nc_count || 0),
        b.status || 'Open',
        b.summary || '',
        req.user!.id,
        new Date().toISOString()
      );
    logAudit(req.user!.id, req.user!.email, 'AUDIT_LOGGED', 'audits', code, String(b.audit_type), getClientIp(req));
    res.status(201).json({ audit: db.prepare('SELECT * FROM audits WHERE id = ?').get(info.lastInsertRowid) });
  });

  // 10. EXCEL, PDF, & DOCX EXPORTS
  router.get('/export/excel/:type', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const exportType = req.params.type;
      const validTypes = [
        'observations',
        'inspections',
        'corrective-actions',
        'trainings',
        'incidents',
        'audits',
        'monthly-hse',
      ];
      if (!validTypes.includes(exportType)) {
        res.status(400).json({ error: 'Invalid Excel export type.' });
        return;
      }

      const { sqlWhere, params, filterSummary } = buildObservationWhereClause(req.query as Record<string, unknown>);
      const observations = db.prepare(`SELECT * FROM observations ${sqlWhere} ORDER BY id DESC`).all(...params) as Record<string, unknown>[];
      const inspections = db.prepare('SELECT * FROM inspections ORDER BY id DESC').all() as Record<string, unknown>[];
      const incidents = db.prepare('SELECT * FROM incidents ORDER BY id DESC').all() as Record<string, unknown>[];
      const trainings = db.prepare('SELECT * FROM trainings ORDER BY id DESC').all() as Record<string, unknown>[];
      const audits = db.prepare('SELECT * FROM audits ORDER BY id DESC').all() as Record<string, unknown>[];

      const buffer = await buildExcelExport(exportType, {
        observations,
        inspections,
        incidents,
        trainings,
        audits,
        filterSummary,
      });

      const dateTag = new Date().toISOString().slice(0, 10);
      const filename = `SURAJ_HSE_${exportType.toUpperCase()}_${dateTag}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      logAudit(req.user!.id, req.user!.email, 'EXPORT_EXCEL', exportType, filename, '', getClientIp(req));
      res.send(buffer);
    } catch (err) {
      console.error('Excel export error:', err);
      res.status(500).json({ error: 'Failed to generate Excel workbook.' });
    }
  });

  router.get('/export/pdf/observation/:id', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const obs = db.prepare('SELECT * FROM observations WHERE id = ?').get(Number(req.params.id)) as Record<string, unknown> | undefined;
      if (!obs) {
        res.status(404).json({ error: 'Observation not found.' });
        return;
      }
      const pdfBuf = await buildObservationPdf(obs);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="SURAJ_HSE_${obs.obs_code}.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      console.error('PDF export error:', err);
      res.status(500).json({ error: 'Failed to generate observation PDF.' });
    }
  });

  router.get('/export/pdf/observations', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { sqlWhere, params, filterSummary } = buildObservationWhereClause(req.query as Record<string, unknown>);
      const observations = db.prepare(`SELECT * FROM observations ${sqlWhere} ORDER BY id DESC`).all(...params) as Record<string, unknown>[];
      const pdfBuf = await buildFilteredObservationsPdf(observations, filterSummary);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="SURAJ_HSE_OBSERVATIONS_REPORT.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      console.error('PDF summary error:', err);
      res.status(500).json({ error: 'Failed to generate observations PDF.' });
    }
  });

  router.get('/export/pdf/inspection/:id', requireAuth, async (req, res) => {
    try {
      const insp = db.prepare('SELECT * FROM inspections WHERE id = ?').get(Number(req.params.id)) as Record<string, unknown> | undefined;
      if (!insp) {
        res.status(404).json({ error: 'Inspection not found.' });
        return;
      }
      const pdfBuf = await buildInspectionPdf(insp);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="SURAJ_HSE_${insp.insp_code}.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      console.error('Inspection PDF error:', err);
      res.status(500).json({ error: 'Failed to generate inspection PDF.' });
    }
  });

  router.get('/export/pdf/document/:id', requireAuth, async (req, res) => {
    try {
      const docRec = db.prepare('SELECT * FROM safety_documents WHERE id = ?').get(Number(req.params.id)) as Record<string, unknown> | undefined;
      if (!docRec) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      const pdfBuf = await buildSafetyDocumentPdf(docRec);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="SURAJ_HSE_${docRec.doc_code}.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      console.error('Doc PDF error:', err);
      res.status(500).json({ error: 'Failed to generate document PDF.' });
    }
  });

  router.get('/export/docx/document/:id', requireAuth, async (req, res) => {
    try {
      const docRec = db.prepare('SELECT * FROM safety_documents WHERE id = ?').get(Number(req.params.id)) as Record<string, unknown> | undefined;
      if (!docRec) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      const docxBuf = await buildSafetyDocumentDocx(docRec);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="SURAJ_HSE_${docRec.doc_code}.docx"`);
      res.send(docxBuf);
    } catch (err) {
      console.error('DOCX export error:', err);
      res.status(500).json({ error: 'Failed to generate Word DOCX document.' });
    }
  });

  // 11. DATABASE BACKUP & RESTORE (ADMIN ONLY)
  router.get('/admin/backup', requireAuth, requireRole('Admin'), async (req: AuthedRequest, res) => {
    try {
      const backupFile = path.resolve(path.dirname(DB_PATH), `backup_${Date.now()}.db`);
      await db.backup(backupFile);
      const data = fs.readFileSync(backupFile);
      fs.unlinkSync(backupFile);
      logAudit(req.user!.id, req.user!.email, 'DATABASE_BACKUP', 'database', '', '', getClientIp(req));
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="suraj_hse_backup_${new Date().toISOString().slice(0, 10)}.db"`);
      res.send(data);
    } catch (err) {
      console.error('Backup error:', err);
      res.status(500).json({ error: 'Database backup failed.' });
    }
  });

  router.post(
    '/admin/restore',
    requireAuth,
    requireRole('Admin'),
    backupUpload.single('backup'),
    (req: AuthedRequest, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Please select a .db backup file.' });
        return;
      }
      const header = req.file.buffer.subarray(0, 16).toString('utf8');
      if (!header.startsWith('SQLite format 3')) {
        res.status(400).json({ error: 'Invalid SQLite database backup file.' });
        return;
      }
      const tempRestore = path.resolve(path.dirname(DB_PATH), `restore_${Date.now()}.db`);
      fs.writeFileSync(tempRestore, req.file.buffer);
      logAudit(req.user!.id, req.user!.email, 'DATABASE_RESTORE_UPLOADED', 'database', tempRestore, `${req.file.size} bytes`, getClientIp(req));
      res.json({
        ok: true,
        message: 'Backup file validated and staged safely. Contact system administrator to swap active database file if needed.',
      });
    }
  );

  app.use('/api', router);
}
