import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { apiRouter } from './server/routes.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Support large image payloads (e.g. 50MB base64 camera photos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount REST API routes
app.use('/api/v1', apiRouter);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    system: 'FloraQ Intelligent Plant Trainer',
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  if (!isProduction) {
    // Mount Vite dev middleware in development
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[FloraQ] Vite middleware mounted for development.');
  } else {
    // Serve static files in production
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FloraQ] Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[FloraQ] Server startup failed:', err);
  process.exit(1);
});
