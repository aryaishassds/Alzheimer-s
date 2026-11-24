// All user-facing text. To add a language: copy the `en` block, translate it,
// and add the language code to SUPPORTED. Missing keys fall back to English.
const cfg = require('./config');

const SUPPORTED = ['ar', 'en'];

const STR = {
  ar: {
    dir: 'rtl',
    brand: () => cfg.brandName,
    // card
    today: 'اليوم',
    homeOrders: 'طلبات البيت',
    list: 'القائمة',
    reminder: 'التذكير',
    nextEvent: 'المناسبة القادمة',
    noOrders: 'لا توجد طلبات ✨',
    count: n => (n === 1 ? 'غرض واحد' : n === 2 ? 'غرضان' : n <= 10 ? `${n} أغراض` : `${n} غرضاً`),
    fullListLink: n => `اضغط هنا لعرض كل الطلبات (${n})`,
    fullListLabel: 'القائمة كاملة',
    allOrders: n => `كل الطلبات (${n})`,
    emptyList: 'القائمة فارغة. أي رسالة تصل على واتساب ستظهر هنا.',
    lastAdded: 'آخر إضافة',
    added: '➕ أُضيف: %@',
    reminderLabel: 'تذكير',
    offers: 'عروض',
    events: 'المناسبات',
    noEvents: 'لا توجد مناسبات. أرسل مثلاً: عيد ميلاد سارة 25/12',
    places: 'المواقع',
    noPlaces: 'لم تُضف مواقع بعد. أرسل "موقع البيت" على واتساب.',
    home: 'البيت',
    commandsLabel: 'أوامر واتساب',
    commandsShort: 'خيارات · مسح · حذف خبز · القائمة · المهام · المناسبات · موقع البيت · وقت 5 مساء · English · مساعدة',
    // lock screen
    dontForget: items => `🛒 لا تنسَ: ${items}`,
    welcomeHome: '🏠 أهلاً بك في البيت',
    nearPlace: (place, items) => `🛒 أنت قريب من ${place}: ${items}`,
    beforeYouReturn: (day, items) => `⏰ ${day} – قبل ما ترجع: ${items}`,
    addedNotify: items => `➕ أُضيف: ${items}`,
    // events
    eventAdded: (e, when) => `📅 أُضيفت مناسبة: ${e} · ${when}`,
    eventTomorrow: e => `🔔 غداً: ${e}`,
    eventToday: e => `🔔 اليوم: ${e}`,
    eventSoon: (e, h) => `⏳ بعد ${h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h + ' ساعات'}: ${e}`,
    eventsList: list => (list ? `📅 المناسبات:\n${list}\n\nللحذف: حذف مناسبة 2` : 'لا توجد مناسبات بعد.\nمثال: عيد ميلاد سارة 25/12 أو طيارة 22/11 10:30'),
    eventRemoved: t => `🗑️ حُذفت: ${t}`,
    eventNotFound: 'لم أجد هذه المناسبة. اكتب "المناسبات" لرؤية القائمة.',
    yearly: 'كل سنة',
    // tasks & reminders
    tasks: 'المهام',
    noTasks: 'لا توجد مهام.',
    tasksCount: n => (n === 1 ? 'مهمة واحدة' : `${n} مهام`),
    tasksReminder: (day, list) => `✅ ${day} – مهام اليوم: ${list}`,
    taskAdded: x => `✅ مهمة جديدة: ${x}`,
    taskDone: x => `👏 تمت: ${x}`,
    taskNotFound: 'لم أجد هذه المهمة. اكتب "المهام" لرؤية القائمة.',
    tasksList: list => (list ? `✅ المهام:\n${list}\n\nعند الإنجاز اكتب: تم 1` : 'لا توجد مهام ✨'),
    reminderNow: e => `⏰ تذكير: ${e}`,
    reminderSet: (e, when) => `⏰ سأذكّرك: ${e} · ${when}`,
    eventSaved: e => `📅 تم الحفظ: ${e}`,
    reminderSaved: e => `⏰ تم الحفظ: ${e}`,
    // menu
    menuBody: 'شو بدك تضيف؟ اختر من القائمة 👇',
    menuButton: 'الخيارات',
    menuSection: 'إضافة',
    menuSection2: 'إدارة',
    mItem: ['🛒 طلب للبيت', 'رز، خبز، فوط…'],
    mEvent: ['📅 مناسبة بتاريخ', 'عيد ميلاد، عرس، طيارة'],
    mTask: ['✅ مهمة', 'شيء لازم ينعمل'],
    mReminder: ['⏰ تذكير بوقت', 'ذكرني الساعة 6…'],
    mLocation: ['📍 موقع', 'البيت أو سوبرماركت'],
    mList: ['📋 عرض الكل', 'الطلبات والمهام والمناسبات'],
    mClear: ['🧹 مسح الطلبات', 'تفريغ قائمة البيت'],
    mHelp: ['❓ مساعدة', 'كل الأوامر'],
    askItem: '🛒 اكتب الطلبات، كل غرض بسطر أو بينهم فاصلة.\nمثال: رز، خبز، فوط',
    askEvent: '📅 اكتب المناسبة مع التاريخ.\nمثال: عيد ميلاد سارة 25/12\nأو: عرس أحمد 5 يناير الساعة 8 مساء',
    askTask: '✅ اكتب المهمة.\nمثال: ادفع فاتورة الكهرباء',
    askReminder: '⏰ اكتب التذكير مع الوقت.\nمثال: اتصل بأمي الساعة 6 مساء\nأو: ادفع الإيجار بكرا 10 صباحا',
    askLocation: '📍 موقع ماذا؟',
    locHome: '🏠 البيت',
    locOther: '🛒 مكان آخر',
    askPlaceName: '🛒 اكتب اسم المكان (مثل: سوبرماركت، مخبز، صيدلية)',
    needDate: 'لم أفهم التاريخ 🤔 جرّب مثلاً: عيد ميلاد سارة 25/12',
    needTime: 'لم أفهم الوقت 🤔 جرّب مثلاً: اتصل بأمي الساعة 6 مساء',
    itemsAdded: list => `🛒 أُضيف: ${list}`,
    cleared: '🧹 تم مسح الطلبات.',
    overview: (items, tasks, events) => `📋 طلبات البيت:\n${items}\n\n✅ المهام:\n${tasks}\n\n📅 المناسبات:\n${events}`,
    none: '—',
    // bot
    welcome: (name, card, invite, trialLine) =>
      `أهلاً ${name} 👋 هذا ${cfg.brandName}.\n\n1️⃣ أضف الكرت لمحفظتك:\n${card}\n\n2️⃣ أرسل لعائلتك هذا الرابط، وكل ما يرسلونه يظهر في كرتك:\n${invite}\n\n3️⃣ اكتب "موقع البيت" ثم أرسل موقعك 📍\n\n📅 ولتذكير بمناسبة: عيد ميلاد سارة 25/12${trialLine ? '\n\n' + trialLine : ''}`,
    trial: (days, price, link) => `لديك ${days} أيام مجاناً، بعدها الاشتراك ${price}$ للسنة كاملة:\n${link}`,
    payLinkMissing: '(رابط الدفع غير مضبوط بعد)',
    inviteText: 'أرسلي طلبات البيت هنا وستصلني مباشرة 👇',
    joinedOwner: who => `✅ ${who} انضم/ت لقائمة البيت.`,
    joinedMember: card => `✅ تم! أي غرض تكتبه هنا يظهر فوراً في كرت العائلة.\nمثال: رز، خبز، فوط\n\nولترى القائمة أيضاً، أضف الكرت لمحفظتك:\n${card}`,
    badCode: 'الرمز غير صحيح. اطلب رابطاً جديداً.',
    expired: (price, link) => `انتهت فترة اشتراكك. جدّد بـ ${price}$ للسنة:\n${link}`,
    listEmpty: 'القائمة فارغة ✨',
    sendLocation: name => `📍 الآن أرسل موقع "${name}" من 📎 ← الموقع`,
    homeSaved: '🏠 تم حفظ موقع البيت. عند وصولك سيذكّرك الكرت بالأغراض، أو يرحب بك إن لم توجد طلبات.',
    placeSaved: name => `📍 تم حفظ موقع "${name}". سيذكّرك عندما تقترب منه وتوجد أغراض.`,
    placesFull: max => `وصلت للحد الأقصى (${max} مواقع). احذف موقعاً أولاً.`,
    locationFirst: 'لحفظ موقع اكتب أولاً: "موقع البيت" أو "إضافة موقع سوبرماركت"',
    placeRemoved: name => `تم حذف موقع "${name}"`,
    placeNotFound: 'لم أجد هذا الموقع.',
    timesSet: times => `⏰ التذكير اليومي: ${times} (فقط إذا وُجدت أغراض)`,
    tzSet: (name, now) => `🕐 تم ضبط التوقيت على ${name}. الساعة عندك الآن ${now}`,
    tzUnknown: 'لم أتعرف على المدينة. جرّب مثلاً: توقيت القاهرة، توقيت القدس، توقيت الرياض، توقيت نيويورك',
    optedOut: 'تم إيقاف العروض.',
    langSet: 'تم تغيير اللغة إلى العربية ✅',
    paid: date => `✅ تم الدفع. اشتراكك فعّال حتى ${date}. شكراً لك!`,
    deleteConfirm: 'لحذف حسابك وكل بياناتك نهائياً، اكتب: تأكيد الحذف',
    deleted: 'تم حذف حسابك وكل بياناتك. يمكنك حذف الكرت من المحفظة. شكراً لك 🌷',
    help: `الأوامر:
• اكتب أي غرض (مثل: رز، خبز) فيُضاف للكرت
• مسح ← تفريغ القائمة
• حذف خبز ← حذف غرض
• القائمة ← عرض القائمة
• موقع البيت ← ثم أرسل الموقع 📍
• إضافة موقع سوبرماركت ← ثم أرسل الموقع 📍 (حتى 5 مواقع)
• حذف موقع سوبرماركت
• وقت 5 مساء ← وقت التذكير
• عيد ميلاد سارة 25/12 ← تذكير بمناسبة
• طيارة 22/11 10:30 ← تذكير برحلة
• المناسبات ← عرض المناسبات
• مهمة ادفع الفاتورة ← إضافة مهمة
• المهام ← عرض المهام · تم 1 ← إنجاز مهمة
• ذكرني الساعة 6 اتصل بأمي ← تذكير بوقت
• خيارات ← قائمة الأزرار
• حذف مناسبة 2
• توقيت القاهرة ← ضبط توقيت مدينتك
• English ← تغيير اللغة
• الكرت ← رابط الكرت
• ايقاف العروض
• حذف حسابي`,
  },

  en: {
    dir: 'ltr',
    brand: () => cfg.brandNameEn,
    today: 'Today',
    homeOrders: 'Home list',
    list: 'List',
    reminder: 'Reminder',
    nextEvent: 'Next event',
    noOrders: 'Nothing needed ✨',
    count: n => (n === 1 ? '1 item' : `${n} items`),
    fullListLink: n => `Tap here to see the full list (${n})`,
    fullListLabel: 'Full list',
    allOrders: n => `All items (${n})`,
    emptyList: 'The list is empty. Anything sent on WhatsApp shows up here.',
    lastAdded: 'Last added',
    added: '➕ Added: %@',
    reminderLabel: 'Reminder',
    offers: 'Offers',
    events: 'Events',
    noEvents: 'No events yet. Send e.g.: Sara birthday 12/25',
    places: 'Places',
    noPlaces: 'No places yet. Send "home location" on WhatsApp.',
    home: 'Home',
    commandsLabel: 'WhatsApp commands',
    commandsShort: 'menu · clear · remove bread · list · tasks · events · home location · time 5 pm · عربي · help',
    dontForget: items => `🛒 Don't forget: ${items}`,
    welcomeHome: '🏠 Welcome home',
    nearPlace: (place, items) => `🛒 You're near ${place}: ${items}`,
    beforeYouReturn: (day, items) => `⏰ ${day} – before you head home: ${items}`,
    addedNotify: items => `➕ Added: ${items}`,
    eventAdded: (e, when) => `📅 Event added: ${e} · ${when}`,
    eventTomorrow: e => `🔔 Tomorrow: ${e}`,
    eventToday: e => `🔔 Today: ${e}`,
    eventSoon: (e, h) => `⏳ In ${h} hour${h === 1 ? '' : 's'}: ${e}`,
    eventsList: list => (list ? `📅 Events:\n${list}\n\nTo delete: remove event 2` : 'No events yet.\nExample: Sara birthday 12/25 or flight 11/22 10:30'),
    eventRemoved: t => `🗑️ Removed: ${t}`,
    eventNotFound: 'Event not found. Send "events" to see the list.',
    yearly: 'every year',
    tasks: 'Tasks',
    noTasks: 'No tasks.',
    tasksCount: n => (n === 1 ? '1 task' : `${n} tasks`),
    tasksReminder: (day, list) => `✅ ${day} – today's tasks: ${list}`,
    taskAdded: x => `✅ New task: ${x}`,
    taskDone: x => `👏 Done: ${x}`,
    taskNotFound: 'Task not found. Send "tasks" to see the list.',
    tasksList: list => (list ? `✅ Tasks:\n${list}\n\nWhen finished send: done 1` : 'No tasks ✨'),
    reminderNow: e => `⏰ Reminder: ${e}`,
    reminderSet: (e, when) => `⏰ I'll remind you: ${e} · ${when}`,
    eventSaved: e => `📅 Saved: ${e}`,
    reminderSaved: e => `⏰ Saved: ${e}`,
    menuBody: 'What would you like to add? Pick an option 👇',
    menuButton: 'Options',
    menuSection: 'Add',
    menuSection2: 'Manage',
    mItem: ['🛒 Home item', 'milk, bread, napkins…'],
    mEvent: ['📅 Dated event', 'birthday, wedding, flight'],
    mTask: ['✅ Task', 'something to get done'],
    mReminder: ['⏰ Timed reminder', 'remind me at 6…'],
    mLocation: ['📍 Place', 'home or a store'],
    mList: ['📋 Show all', 'items, tasks and events'],
    mClear: ['🧹 Clear items', 'empty the home list'],
    mHelp: ['❓ Help', 'all commands'],
    askItem: '🛒 Send the items, one per line or separated by commas.\nExample: milk, bread, napkins',
    askEvent: '📅 Send the event with its date.\nExample: Sara birthday 12/25\nor: wedding Jan 5 8 pm',
    askTask: '✅ Send the task.\nExample: pay the electric bill',
    askReminder: '⏰ Send the reminder with a time.\nExample: call mom at 6 pm\nor: pay rent tomorrow 10 am',
    askLocation: '📍 Which place?',
    locHome: '🏠 Home',
    locOther: '🛒 Another place',
    askPlaceName: '🛒 Send the place name (e.g. supermarket, bakery, pharmacy)',
    needDate: "I couldn't read the date 🤔 Try: Sara birthday 12/25",
    needTime: "I couldn't read the time 🤔 Try: call mom at 6 pm",
    itemsAdded: list => `🛒 Added: ${list}`,
    cleared: '🧹 Items cleared.',
    overview: (items, tasks, events) => `📋 Home list:\n${items}\n\n✅ Tasks:\n${tasks}\n\n📅 Events:\n${events}`,
    none: '—',
    welcome: (name, card, invite, trialLine) =>
      `Hi ${name} 👋 this is ${cfg.brandNameEn}.\n\n1️⃣ Add the card to your Wallet:\n${card}\n\n2️⃣ Send this link to your family. Anything they send shows up on your card:\n${invite}\n\n3️⃣ Send "home location" then share your location 📍\n\n📅 For a dated reminder: Sara birthday 12/25${trialLine ? '\n\n' + trialLine : ''}`,
    trial: (days, price, link) => `You have ${days} days free, then it's $${price} for the whole year:\n${link}`,
    payLinkMissing: '(payment link not set yet)',
    inviteText: 'Send home requests here and they reach me right away 👇',
    joinedOwner: who => `✅ ${who} joined your home list.`,
    joinedMember: card => `✅ Done! Anything you send here appears instantly on the family card.\nExample: rice, bread, napkins\n\nTo see the list too, add the card to your Wallet:\n${card}`,
    badCode: 'That code is not valid. Ask for a new link.',
    expired: (price, link) => `Your subscription has ended. Renew for $${price}/year:\n${link}`,
    listEmpty: 'The list is empty ✨',
    sendLocation: name => `📍 Now share the location of "${name}" from 📎 → Location`,
    homeSaved: '🏠 Home saved. When you arrive, the card reminds you of the list, or welcomes you home if there is nothing to buy.',
    placeSaved: name => `📍 "${name}" saved. You'll get a reminder near it when the list has items.`,
    placesFull: max => `You reached the limit (${max} places). Remove one first.`,
    locationFirst: 'To save a place, first send: "home location" or "add place supermarket"',
    placeRemoved: name => `Removed "${name}"`,
    placeNotFound: 'Place not found.',
    timesSet: times => `⏰ Daily reminder: ${times} (only when the list has items)`,
    tzSet: (name, now) => `🕐 Time zone set to ${name}. It's ${now} for you now.`,
    tzUnknown: 'City not recognized. Try: timezone New York, timezone Chicago, timezone London',
    optedOut: 'Offers turned off.',
    langSet: 'Language changed to English ✅',
    paid: date => `✅ Payment received. Your plan is active until ${date}. Thank you!`,
    deleteConfirm: 'To permanently delete your account and data, send: confirm delete',
    deleted: 'Your account and data have been deleted. You can remove the card from your Wallet. Thank you 🌷',
    help: `Commands:
• Send any item (e.g. rice, bread) to add it
• clear → empty the list
• remove bread → remove one item
• list → show the list
• home location → then share location 📍
• add place supermarket → then share location 📍 (up to 5)
• remove place supermarket
• time 5 pm → daily reminder time
• Sara birthday 12/25 → dated reminder
• flight 11/22 10:30 → flight reminder
• events → show events
• task pay the bill → add a task
• tasks → show tasks · done 1 → finish a task
• remind me at 6 pm call mom → timed reminder
• menu → options menu
• remove event 2
• timezone New York → set your city
• عربي → Arabic
• card → card link
• stop offers
• delete my account`,
  },
};

function t(lang, key, ...args) {
  const L = STR[SUPPORTED.includes(lang) ? lang : 'en'];
  const v = key in L ? L[key] : STR.en[key];
  return typeof v === 'function' ? v(...args) : v;
}

const hasArabic = s => /[؀-ۿ]/.test(s || '');
const detectLang = text => (hasArabic(text) ? 'ar' : 'en');
const locale = lang => (lang === 'ar' ? 'ar' : 'en-US');

module.exports = { t, detectLang, hasArabic, locale, SUPPORTED };
