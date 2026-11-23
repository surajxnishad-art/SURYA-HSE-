import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GENERATED_DIR, UPLOADS_DIR, initDatabase } from './server/db.ts';
import { ensureEnvBootstrapAdmin } from './server/auth.ts';
import { registerApiRoutes } from './server/routes.ts';

async function startServer(): Promise<void> {
  initDatabase();
  ensureEnvBootstrapAdmin();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Serve uploaded & AI-generated safety photos safely with nosniff headers
  app.use('/uploads', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  }, express.static(UPLOADS_DIR));

  app.use('/generated', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  }, express.static(GENERATED_DIR));

  registerApiRoutes(app);

  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');

  if (!isProd || !fs.existsSync(distPath)) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`SURAJ HSE server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SURAJ HSE server:', err);
  process.exit(1);
});
