import { createExpressApp } from '../server';

let cachedApp: any = null;

export default async function handler(req: any, res: any) {
  // 1. Restore actual request path if invoked via Vercel rewrite
  const matchedPath =
    req.headers['x-matched-path'] ||
    req.headers['x-invoke-path'] ||
    req.originalUrl;
  if (req.url === '/api/index.ts' && matchedPath) {
    req.url = matchedPath;
  }

  // 2. Normalize pre-parsed JSON body from Vercel Node runtime
  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      req.body = JSON.parse(req.body);
    } catch {}
  } else if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString('utf8'));
    } catch {}
  }

  // 3. Lazy initialize Express app
  if (!cachedApp) {
    cachedApp = await createExpressApp();
  }

  // 4. Dispatch request to Express with finish/close guarantee
  return new Promise((resolve) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    cachedApp(req, res, (err: any) => {
      if (err) {
        console.error('Unhandled serverless Express error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: err.message || 'Internal server error' });
        }
      } else if (!res.headersSent) {
        res.status(404).json({ error: 'Endpoint not found: ' + req.url });
      }
      resolve(undefined);
    });
  });
}
