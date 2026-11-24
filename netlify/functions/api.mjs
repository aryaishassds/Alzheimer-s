// All dynamic routes. Netlify runs this as a serverless function.
// Static imports so Netlify packs these dependencies into the function.
import 'passkit-generator';
import '@netlify/blobs';
import 'dotenv';
import '@napi-rs/canvas';
import app from '../../src/app.js';

export default async (req, context) => {
  try {
    return await app.handle(req);
  } catch (e) {
    console.error(e);
    return new Response('Server error', { status: 500 });
  }
};

export const config = {
  path: ['/webhook', '/card/*', '/apple/*', '/stripe/*', '/admin/api/*', '/cron/*', '/health'],
};
