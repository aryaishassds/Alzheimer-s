// Called every minute (Netlify scheduled function, or an external cron as backup).
// Time reminders + daily auto-clear, in each family's own timezone.
const db = require('./db');
const fam = require('./family');
const { isActive } = require('./pass/content');
const ev = require('./events');

const WINDOW = 15 * 60e3; // fire a missed trigger up to 15 minutes late, never older ones

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
    ran += await eventTick(f);
  }));
  return { families: families.length, ran };
}

// Dated events: day before (20:00), the morning of (09:00), and N hours before if there is a time.
async function eventTick(f, now = Date.now()) {
  let ran = 0;
  for (const e of f.events || []) {
    for (const [key, at, kind] of ev.triggers(e, f.timezone)) {
      if (at > now || now - at > WINDOW || (e.sent || {})[key]) continue;
      let claimed = false;
      await db.updateFamily(f.id, x => {
        const target = (x.events || []).find(y => y.id === e.id);
        if (!target || (target.sent || {})[key]) return false;
        target.sent = { ...(target.sent || {}), [key]: now };
        claimed = true;
      });
      if (claimed) { await fam.eventNotify(f, e.id, kind); ran++; }
    }
  }
  // Roll birthdays to next year, drop finished one-off events.
  if ((f.events || []).some(e => ev.eventEnd(e, f.timezone) <= now)) {
    await db.updateFamily(f.id, x => (ev.housekeeping(x, now) ? undefined : false));
  }
  return ran;
}

module.exports = { tick, localParts, eventTick };
