// Called every minute (Netlify scheduled function, or an external cron as backup).
// Time reminders + daily auto-clear, in each family's own timezone.
const db = require('./db');
const fam = require('./family');
const { isActive } = require('./pass/content');

function localParts(tz, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}

// Runs a job once per family per day/time, even if the scheduler fires twice
// or a minute is skipped (catch-up window of 5 minutes).
async function runOnce(f, kind, hhmmTarget, job) {
  const now = new Date();
  for (let back = 0; back < 5; back++) {
    const { date, hhmm } = localParts(f.timezone, new Date(now - back * 60e3));
    if (hhmm !== hhmmTarget) continue;
    const key = `${kind}:${date}:${hhmm}`;
    let claimed = false;
    await db.updateFamily(f.id, x => {
      x.lastRuns = x.lastRuns || {};
      if (x.lastRuns[kind] === key) return false;
      x.lastRuns[kind] = key; claimed = true;
    });
    if (claimed) await job();
    return;
  }
}

async function tick() {
  const families = await db.allFamilies();
  let ran = 0;
  await Promise.all(families.filter(isActive).map(async f => {
    for (const t of f.reminderTimes || []) await runOnce(f, 'remind-' + t, t, async () => { await fam.timeReminder(f); ran++; });
    if (f.clearAt) await runOnce(f, 'clear', f.clearAt, async () => { await fam.clear(f); ran++; });
  }));
  return { families: families.length, ran };
}

module.exports = { tick, localParts };
