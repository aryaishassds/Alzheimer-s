// Draws the list, tasks and events as the card's strip image, so the front of the
// card can show many lines in a small font (Wallet text fields are one line each).
// Arabic is drawn right-to-left from the right edge, English left-to-right.
const { t } = require('../i18n');
const ev = require('../events');
const c = require('./content');

let canvasLib = null;
function lib() {
  if (canvasLib !== null) return canvasLib;
  try {
    const m = require('@napi-rs/canvas');
    const fonts = require('./fonts');
    m.GlobalFonts.register(Buffer.from(fonts.regular, 'base64'), 'CardFont');
    m.GlobalFonts.register(Buffer.from(fonts.bold, 'base64'), 'CardFontBold');
    canvasLib = m;
  } catch (e) {
    console.error('[strip] canvas unavailable:', e.message);
    canvasLib = false;
  }
  return canvasLib;
}

const W = 1125, H = 369; // 375 × 123 pt at @3x — Apple's strip size for store cards
const PAD = 48, LINE = 43, TITLE = 46;
const COLORS = { bg: '#fff7d1', ink: '#332e1c', label: '#856e24', rule: '#efe0a0' };

// Remove emoji: the card font has none, and they would show as boxes.
const noEmoji = s => String(s).replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();

function wrap(ctx, words, sepText, maxW) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + sepText + w : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function buildSections(f, ctx, maxW) {
  const L = c.lang(f);
  const sepText = L === 'ar' ? '، ' : ', ';
  const sections = [];

  ctx.font = '33px CardFont';
  const items = f.items.map(i => noEmoji(i.text)).filter(Boolean);
  sections.push({
    title: `${t(L, 'homeOrders')}${items.length ? ` (${items.length})` : ''}`,
    lines: items.length ? wrap(ctx, items, sepText, maxW) : [noEmoji(t(L, 'noOrders'))],
    total: items.length, priority: 1,
  });


  const evs = ev.upcoming(f.events, f.timezone).map(e =>
    noEmoji(e.raw || ev.undated(e) ? ev.display(e, L, f.timezone) : `${e.title || ev.label(e, L)} · ${ev.whenText(e, L, f.timezone, { withWeekday: true })}`));
  if (evs.length) sections.push({ title: `${t(L, 'events')} (${evs.length})`, lines: evs, total: evs.length, priority: 2 });
  const tasks = (f.tasks || []).map(x => noEmoji(x.text));
  if (tasks.length) sections.push({ title: `${t(L, 'tasks')} (${tasks.length})`, lines: wrap(ctx, tasks, sepText, maxW), total: tasks.length, priority: 3 });
  return sections;
}

// Share the available height: every section shows at least one line, then the
// home list, events and tasks get more lines in that order.
const sectionHeight = (take, first) => (first ? 0 : 6) + (TITLE - 8) + take * LINE + 8;
function fit(sections) {
  const shown = sections.map(s => ({ ...s, take: 0 }));
  const used = () => shown.reduce((h, s, i) => h + (s.take ? sectionHeight(s.take, i === 0) : 0), 0);
  const room = H - 10;
  const order = [...shown].sort((a, b) => a.priority - b.priority);
  for (const s of order) { s.take = 1; if (used() + 30 > room) { s.take = 0; } }
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of order) {
      if (!s.take || s.take >= s.lines.length) continue;
      s.take += 1;
      if (used() + 30 > room) s.take -= 1; else { grew = true; break; }
    }
  }
  return shown.filter(s => s.take > 0);
}

function render(f, scale = 3) {
  const m = lib();
  if (!m) return null;
  const L = c.lang(f);
  const rtl = L === 'ar';
  const canvas = m.createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  const x = rtl ? W - PAD : PAD;
  const maxW = W - PAD * 2;

  const sections = fit(buildSections(f, ctx, maxW));
  let y = 40;
  sections.forEach((s, i) => {
    if (i > 0) {
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(PAD, y - 30, W - PAD * 2, 2);
      y += 6;
    }
    ctx.fillStyle = COLORS.label;
    ctx.font = '27px CardFontBold';
    ctx.fillText(s.title, x, y);
    y += TITLE - 8;
    ctx.fillStyle = COLORS.ink;
    ctx.font = '33px CardFont';
    const rtlLocal = rtl;
    s.lines.slice(0, s.take).forEach((line, j) => {
      let text = line;
      const isLast = j === s.take - 1 && s.take < s.lines.length;
      if (isLast && s.priority === 1) text = rtlLocal ? `${line} …` : `${line} …`;
      ctx.fillText(text, x, y);
      y += LINE;
    });
    y += 8;
  });

  if (scale === 3) return canvas.toBuffer('image/png');
  const small = m.createCanvas(Math.round(W * scale / 3), Math.round(H * scale / 3));
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  return small.toBuffer('image/png');
}

// { 'strip.png', 'strip@2x.png', 'strip@3x.png' } or null if drawing isn't available
function stripImages(f) {
  const big = render(f, 3);
  if (!big) return null;
  return { 'strip@3x.png': big, 'strip@2x.png': render(f, 2), 'strip.png': render(f, 1) };
}

module.exports = { stripImages, render };
