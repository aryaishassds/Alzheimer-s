// Every minute: time reminders + daily auto-clear.
// Static imports so Netlify packs these dependencies into the function.
import 'passkit-generator';
import '@netlify/blobs';
import 'dotenv';
import scheduler from '../../src/scheduler.js';

export default async () => {
  const r = await scheduler.tick();
  console.log('[tick]', r);
  return new Response(JSON.stringify(r));
};

export const config = { schedule: '* * * * *' };
