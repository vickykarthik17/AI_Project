// Serverless environment DOM polyfills for headless PDF and canvas engines
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_init?: any) {}
  };
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(w = 0, h = 0) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    constructor() {}
  };
}

import { createExpressApp } from '../../server';

let cachedApp: any = null;

async function getApp() {
  if (!cachedApp) {
    cachedApp = await createExpressApp();
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  try {
    const matchedPath =
      req.headers?.['x-matched-path'] ||
      req.headers?.['x-invoke-path'] ||
      req.originalUrl;
    if (req.url === '/api/index.js' || req.url === '/api/index' || req.url === '/api') {
      if (matchedPath && matchedPath !== '/api/index.js' && matchedPath !== '/api/index' && matchedPath !== '/api') {
        req.url = matchedPath;
      }
    }

    try {
      if (typeof req.body === 'string' && req.body.length > 0) {
        req.body = JSON.parse(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        req.body = JSON.parse(req.body.toString('utf8'));
      }
    } catch {
      // Safely catch if Vercel getter throws on malformed JSON
      try {
        req.body = {};
      } catch {}
    }

    const app = await getApp();

    return new Promise((resolve) => {
      res.on('finish', resolve);
      res.on('close', resolve);
      app(req, res, (err: any) => {
        if (err) {
          console.error('Unhandled Express error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
          }
        } else if (!res.headersSent) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Endpoint not found: ' + req.url }));
        }
        resolve(undefined);
      });
    });
  } catch (err: any) {
    console.error('Fatal Serverless Handler Error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Serverless initialization error',
        message: err?.message || String(err),
        stack: err?.stack,
      }));
    }
  }
}
