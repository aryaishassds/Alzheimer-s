// Turn a WhatsApp message into a command or a list of items.
const cfg = require('./config');

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatin = s => s.replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));

function parseTime(text) {
  // "5 مساء" "5:30 م" "17:00" "8 صباحا"
  const out = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(صباحا|صباحاً|ص|مساء|مساءً|م|am|pm)?/gi;
  let m;
  const t = toLatin(text);
  while ((m = re.exec(t))) {
    let h = Number(m[1]); const min = Number(m[2] || 0); const p = (m[3] || '').toLowerCase();
    if (/مساء|^م$|pm/.test(p) && h < 12) h += 12;
    if (/صباح|^ص$|am/.test(p) && h === 12) h = 0;
    if (h < 24 && min < 60) out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return [...new Set(out)].slice(0, 3);
}

const CITY_TZ = {
  'القاهرة': 'Africa/Cairo', 'مصر': 'Africa/Cairo', 'الاسكندرية': 'Africa/Cairo',
  'القدس': 'Asia/Jerusalem', 'فلسطين': 'Asia/Hebron', 'رام الله': 'Asia/Hebron', 'نابلس': 'Asia/Hebron',
  'الخليل': 'Asia/Hebron', 'غزة': 'Asia/Gaza', 'جنين': 'Asia/Hebron', 'الناصرة': 'Asia/Jerusalem', 'حيفا': 'Asia/Jerusalem',
  'عمان الاردن': 'Asia/Amman', 'الاردن': 'Asia/Amman', 'الرياض': 'Asia/Riyadh', 'جدة': 'Asia/Riyadh', 'السعودية': 'Asia/Riyadh',
  'دبي': 'Asia/Dubai', 'ابوظبي': 'Asia/Dubai', 'الامارات': 'Asia/Dubai', 'الكويت': 'Asia/Kuwait', 'الدوحة': 'Asia/Qatar', 'قطر': 'Asia/Qatar',
  'البحرين': 'Asia/Bahrain', 'مسقط': 'Asia/Muscat', 'عمان': 'Asia/Muscat', 'بيروت': 'Asia/Beirut', 'بغداد': 'Asia/Baghdad',
  'اسطنبول': 'Europe/Istanbul', 'لندن': 'Europe/London', 'برلين': 'Europe/Berlin',
  'نيويورك': 'America/New_York', 'ميشيغان': 'America/Detroit', 'ديترويت': 'America/Detroit', 'فلوريدا': 'America/New_York',
  'شيكاغو': 'America/Chicago', 'تكساس': 'America/Chicago', 'هيوستن': 'America/Chicago', 'دالاس': 'America/Chicago',
  'كاليفورنيا': 'America/Los_Angeles', 'لوس انجلوس': 'America/Los_Angeles', 'new york': 'America/New_York',
  'texas': 'America/Chicago', 'california': 'America/Los_Angeles', 'chicago': 'America/Chicago',
};
const norm = s => s.trim().toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة$/,'ة');
function cityTimezone(name) {
  const n = norm(name);
  for (const [k, v] of Object.entries(CITY_TZ)) if (norm(k) === n) return v;
  if (/^[A-Za-z]+\/[A-Za-z_]+$/.test(name.trim())) {
    try { new Intl.DateTimeFormat('en', { timeZone: name.trim() }); return name.trim(); } catch {}
  }
  return null;
}

function command(raw) {
  const text = raw.trim();
  const t = text.replace(/[إأآ]/g, 'ا');
  if (/^(ابدا|ابدأ|start|hi|hello|مرحبا|السلام عليكم)$/i.test(t)) return { cmd: 'start' };
  const join = toLatin(text).match(/^(?:انضمام|join)[\s-]*([0-9a-f]{4,})/i);
  if (join) return { cmd: 'join', code: join[1] };
  if (/^(مسح|امسح|clear)$/i.test(t)) return { cmd: 'clear' };
  if (/^(مساعدة|مساعده|help)$/i.test(t)) return { cmd: 'help' };
  if (/^(القائمة|القائمه|list)$/i.test(t)) return { cmd: 'list' };
  if (/^(الكرت|كرت|card)$/i.test(t)) return { cmd: 'card' };
  if (/^(ايقاف العروض|stop)$/i.test(t)) return { cmd: 'optout' };
  let m;
  if ((m = text.match(/^(?:توقيت|المدينة|مدينة)\s+(.+)$/))) return { cmd: 'timezone', tz: cityTimezone(m[1]), name: m[1].trim() };
  if ((m = text.match(/^حذف\s+موقع\s+(.+)$/))) return { cmd: 'removeLocation', name: m[1] };
  if ((m = text.match(/^حذف\s+(.+)$/))) return { cmd: 'remove', text: m[1] };
  if (/^موقع\s*(البيت|المنزل)$/.test(t)) return { cmd: 'pendingLocation', name: 'البيت' };
  if ((m = text.match(/^(?:اضافة|إضافة|اضف|أضف)\s+موقع\s+(.+)$/))) return { cmd: 'pendingLocation', name: m[1].trim() };
  if ((m = text.match(/^(?:وقت|الوقت|تذكير)\s+(.+)$/))) {
    const times = parseTime(m[1]);
    if (times.length) return { cmd: 'time', times };
  }
  return null;
}

function splitSimple(text) {
  return text
    .split(/\n|،|,|؛|;|\+|\s-\s/)
    .map(s => s.replace(/^[\s\-•*–\d.)]+/, '').trim())
    .filter(s => s.length >= 2 && s.length <= 60);
}

// Optional AI split (understands "هات رز وخبز وكيس سكر") when ANTHROPIC_API_KEY is set.
async function splitItems(text) {
  if (!cfg.anthropicKey) return splitSimple(text);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-5-5', max_tokens: 300,
        system: 'Extract shopping/household items from the message. Keep quantities with the item. Reply ONLY with a JSON array of short strings in the original language. If there are no items, reply [].',
        messages: [{ role: 'user', content: text }],
      }),
    });
    const j = await r.json();
    const arr = JSON.parse(j.content[0].text);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : splitSimple(text);
  } catch {
    return splitSimple(text);
  }
}

module.exports = { command, splitItems, splitSimple, parseTime, cityTimezone };
