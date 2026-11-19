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
  'los angeles': 'America/Los_Angeles', 'la': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', 'seattle': 'America/Los_Angeles',
  'miami': 'America/New_York', 'florida': 'America/New_York', 'boston': 'America/New_York', 'nj': 'America/New_York', 'new jersey': 'America/New_York',
  'detroit': 'America/Detroit', 'michigan': 'America/Detroit', 'dallas': 'America/Chicago', 'houston': 'America/Chicago',
  'denver': 'America/Denver', 'phoenix': 'America/Phoenix', 'eastern': 'America/New_York', 'central': 'America/Chicago',
  'mountain': 'America/Denver', 'pacific': 'America/Los_Angeles', 'london': 'Europe/London', 'uk': 'Europe/London',
  'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin', 'madrid': 'Europe/Madrid', 'rome': 'Europe/Rome', 'amsterdam': 'Europe/Amsterdam',
  'istanbul': 'Europe/Istanbul', 'dubai': 'Asia/Dubai', 'riyadh': 'Asia/Riyadh', 'cairo': 'Africa/Cairo', 'amman': 'Asia/Amman',
  'jerusalem': 'Asia/Jerusalem', 'toronto': 'America/Toronto', 'sydney': 'Australia/Sydney',
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
  const t = text.replace(/[إأآ]/g, 'ا').replace(/\s+/g, ' ');
  if (/^(ابدا|start|hi|hello|hey|مرحبا|اهلا|السلام عليكم)$/i.test(t)) return { cmd: 'start' };
  const join = toLatin(text).match(/^(?:انضمام|join)[\s-]*([0-9a-f]{4,})/i);
  if (join) return { cmd: 'join', code: join[1] };
  if (/^(english|انجليزي|الانجليزية|انكليزي)$/i.test(t)) return { cmd: 'lang', lang: 'en' };
  if (/^(عربي|العربية|arabic)$/i.test(t)) return { cmd: 'lang', lang: 'ar' };
  if (/^(مسح|امسح|clear|clear list)$/i.test(t)) return { cmd: 'clear' };
  if (/^(مساعدة|مساعده|help|commands|\?)$/i.test(t)) return { cmd: 'help' };
  if (/^(القائمة|القائمه|list|my list)$/i.test(t)) return { cmd: 'list' };
  if (/^(المناسبات|مناسبات|events|my events)$/i.test(t)) return { cmd: 'events' };
  if (/^(الكرت|كرت|card)$/i.test(t)) return { cmd: 'card' };
  if (/^(ايقاف العروض|stop|stop offers)$/i.test(t)) return { cmd: 'optout' };
  if (/^(حذف حسابي|احذف حسابي|delete my account|delete account)$/i.test(t)) return { cmd: 'deleteAsk' };
  if (/^(تاكيد الحذف|confirm delete)$/i.test(t)) return { cmd: 'deleteConfirm' };
  let m;
  if ((m = text.match(/^(?:توقيت|المدينة|مدينة|timezone|time zone|city)\s+(.+)$/i))) return { cmd: 'timezone', tz: cityTimezone(m[1]), name: m[1].trim() };
  if ((m = text.match(/^(?:حذف|احذف|الغاء|إلغاء)\s+(?:مناسبة|مناسبه|موعد|تذكير)\s+(.+)$/))) return { cmd: 'removeEvent', q: toLatin(m[1]) };
  if ((m = text.match(/^(?:remove|delete|cancel)\s+(?:event|reminder)\s+(.+)$/i))) return { cmd: 'removeEvent', q: m[1] };
  if ((m = text.match(/^(?:حذف|احذف)\s+موقع\s+(.+)$/))) return { cmd: 'removeLocation', name: m[1] };
  if ((m = text.match(/^(?:remove|delete)\s+place\s+(.+)$/i))) return { cmd: 'removeLocation', name: m[1] };
  if ((m = text.match(/^(?:حذف|احذف|شيل)\s+(.+)$/))) return { cmd: 'remove', text: stripFillers(m[1]) };
  if ((m = text.match(/^(?:remove|delete)\s+(.+)$/i))) return { cmd: 'remove', text: stripFillers(m[1]) };
  if (/^موقع\s*(البيت|المنزل)$/.test(t) || /^(home location|home|set home)$/i.test(t)) return { cmd: 'pendingLocation', name: /^[a-z]/i.test(t) ? 'Home' : 'البيت' };
  if ((m = text.match(/^(?:اضافة|إضافة|اضف|أضف)\s+موقع\s+(.+)$/))) return { cmd: 'pendingLocation', name: m[1].trim() };
  if ((m = text.match(/^add\s+(?:place|location)\s+(.+)$/i))) return { cmd: 'pendingLocation', name: m[1].trim() };
  if ((m = text.match(/^(?:وقت|الوقت|time|reminder time)\s+(.+)$/i))) {
    const times = parseTime(m[1]);
    if (times.length) return { cmd: 'time', times };
  }
  return null;
}

// "جيب خبز" → "خبز", "please get milk" → "milk"
const LEAD = /^(?:(?:و?جيب(?:ي|لي|لنا)?|جبلي|جيبو|هات(?:ي|لي|لنا)?|اشتر(?:ي|يلي|ولي)?|بدنا|بدي|بدها|بدو|نحتاج|محتاجين|ناقص(?:نا)?|خلص|لا\s*تنس[ىي](?:\s*تجيب)?|ما\s*تنس[ىي](?:\s*تجيب)?|ممكن|لو\s*سمحت|من\s*فضلك|please|pls|plz|get|buy|bring|grab|pick\s*up|we\s*need|need|we're\s*out\s*of|out\s*of|don'?t\s*forget(?:\s*to\s*(?:get|buy))?)\s+)+/i;
const TRAIL = /\s+(?:لو\s*سمحت|من\s*فضلك|معك|معاك|وانت\s*(?:جاي|راجع)|please|pls|plz|on\s*your\s*way(?:\s*home)?|thanks|thx)\s*[.!]*$/i;
function stripFillers(s) {
  return s.replace(LEAD, '').replace(TRAIL, '').replace(/[.!؟?]+$/, '').trim();
}

// Same item written differently: "الخبز" = "خبز", "حليبة" = "حليبه"
function normItem(s) {
  return String(s).toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/(^|\s)ال(?=\S{2,})/g, '$1')
    .replace(/^(the|some|a|an)\s+/, '')
    .replace(/\s+/g, ' ').trim();
}
const sameItem = (a, b) => normItem(a) === normItem(b);

function splitSimple(text) {
  return text
    .split(/\n|،|,|؛|;|\+|\s-\s/)
    .map(s => stripFillers(s.replace(/^\s*(?:[-•*–]|\d{1,2}[.)\-](?!\d))\s*/, '').trim()))
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
    return Array.isArray(arr) ? arr.map(x => stripFillers(String(x))).filter(Boolean) : splitSimple(text);
  } catch {
    return splitSimple(text);
  }
}

module.exports = { command, splitItems, splitSimple, parseTime, cityTimezone, stripFillers, sameItem, normItem };
