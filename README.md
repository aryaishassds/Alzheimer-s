# كرت الطلبات 🛒: دليل الرفع على Netlify خطوة بخطوة

الزوجة ترسل طلبات البيت على واتساب، فتظهر في كرت داخل Apple Wallet أو Google Wallet. والكرت يذكّر الزوج عند الوصول للبيت، أو عند المرور بالسوبرماركت، أو في وقت محدد. السعر **2$ للسنة**.

في كل الخطوات استبدل `homelist` باسم موقعك على Netlify.

---

## المرحلة 1: رفع المشروع (15 دقيقة)

### 1. GitHub
1. أنشئ حساباً: https://github.com/signup
2. أنشئ مستودعاً **خاصاً (Private)**: https://github.com/new
3. داخل المستودع اضغط **"uploading an existing file"**، واسحب كل محتويات مجلد المشروع **ما عدا** `node_modules`، ثم **Commit changes**.

### 2. Netlify
1. سجّل الدخول بحساب GitHub: https://app.netlify.com/signup
2. اضغط **Add new project ← Import an existing project ← GitHub** واختر المستودع.
3. الإعدادات تُقرأ تلقائياً من `netlify.toml`، فاضغط **Deploy**.
4. غيّر الاسم من **Project configuration ← General ← Change project name**، مثلاً `homelist`، فيصبح الرابط `https://homelist.netlify.app`.
5. افتح الرابط التالي، ويجب أن يظهر `{"ok":true,"price":2,"storage":"netlify-blobs"}`:
   `https://homelist.netlify.app/health`

### 3. المتغيرات الأساسية
من **Project configuration ← Environment variables ← Add a variable**:

| المتغير | القيمة |
|---|---|
| `BASE_URL` | `https://homelist.netlify.app` |
| `ADMIN_TOKEN` | كلمة سر طويلة للوحة التحكم |
| `CRON_SECRET` | كلمة عشوائية |
| `PRICE_USD` | `2` |
| `BRAND_NAME` | `كرت الطلبات` |

> ⚠️ **بعد أي تغيير في المتغيرات:** اذهب إلى **Deploys ← Trigger deploy ← Deploy project**.

---

## المرحلة 2: Apple Wallet (20 دقيقة)

### 4. Pass Type ID جديد
1. https://developer.apple.com/account/resources/identifiers/add/passTypeId
2. Description: `Home List`، وIdentifier: `pass.com.yourname.homelist`، ثم **Register**.

### 5. الشهادة (على الماك)
1. افتح **Keychain Access ← Certificate Assistant ← Request a Certificate From a Certificate Authority**، واكتب بريدك واختر **Saved to disk**.
2. https://developer.apple.com/account/resources/certificates/add ← **Pass Type ID Certificate** ← اختر الـ ID ← ارفع ملف الـ CSR ← حمّل ملف `.cer`.
3. افتح ملف `.cer` بالضغط المزدوج فيدخل Keychain، ثم اضغط عليه بزر الفأرة الأيمن ← **Export** ← `pass.p12`.
4. حمّل شهادة Apple الوسيطة WWDR G4: https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
5. في Terminal داخل نفس المجلد:
   ```bash
   openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem -legacy
   openssl pkcs12 -in pass.p12 -nocerts -nodes -out signerKey.pem -legacy
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
   إذا ظهر خطأ بسبب `-legacy`، احذفها وأعد الأمر.

### 6. متغيرات Apple في Netlify

| المتغير | القيمة |
|---|---|
| `APPLE_TEAM_ID` | من https://developer.apple.com/account ← Membership details |
| `APPLE_PASS_TYPE_ID` | `pass.com.yourname.homelist` |
| `APPLE_SIGNER_CERT` | الصق محتوى `signerCert.pem` كاملاً |
| `APPLE_SIGNER_KEY` | الصق محتوى `signerKey.pem` كاملاً |
| `APPLE_WWDR` | الصق محتوى `wwdr.pem` كاملاً |

ثم **Trigger deploy**.

> 🔒 لا ترفع ملفات `.pem` أو `.p12` إلى GitHub أبداً.

### 7. ✅ اختبار الكرت على الآيفون (بدون واتساب)
1. افتح `https://homelist.netlify.app/admin` وأدخل `ADMIN_TOKEN`.
2. في قسم **🧪 تجربة الكرت** اكتب رقمك واضغط **إنشاء كرت**.
3. افتح الرابط **من الآيفون (Safari)** ← **إضافة إلى Apple Wallet**.
4. اكتب "رز، خبز" ← **إضافة أغراض**. يجب أن يتحدث الكرت خلال ثوانٍ ويصلك إشعار.

**إذا لم يُفتح الكرت:** تأكد من الشهادات و`APPLE_TEAM_ID`.
**إذا فُتح لكنه لا يتحدث:** تأكد أن `BASE_URL` يبدأ بـ https، وراجع **Logs ← Functions ← api**.

---

## المرحلة 3: واتساب (30 دقيقة)

### 8. إنشاء التطبيق
1. https://developers.facebook.com/apps ← **Create app** ← نوع **Business**، واربطه بحساب Business.
2. أضف منتج **WhatsApp**.
3. من **WhatsApp ← API Setup** خذ:
   - **Phone number ID** ← `WA_PHONE_NUMBER_ID`
   - **Temporary access token** ← `WA_TOKEN` (للتجربة فقط، فهو ينتهي خلال 24 ساعة)
   - رقم الاختبار ← `WA_BOT_NUMBER` (أرقام فقط)
   - أضف رقمك في قائمة **To** لتستطيع التجربة.
4. من **App settings ← Basic ← App secret** خذ `WA_APP_SECRET`.
5. أضف `WA_VERIFY_TOKEN` بأي كلمة تختارها، ثم **Trigger deploy**.

### 9. ربط الـ Webhook
1. **WhatsApp ← Configuration ← Webhook ← Edit**
2. Callback URL: `https://homelist.netlify.app/webhook`
3. Verify token: نفس `WA_VERIFY_TOKEN` ← **Verify and save**
4. في **Webhook fields** فعّل **messages**.

### 10. ✅ اختبار
أرسل **ابدأ** لرقم البوت، فيجب أن يصلك رابط الكرت ورابط دعوة الزوجة.

### 11. توكن دائم ورقم حقيقي (قبل الإطلاق)
- التوكن الدائم: https://business.facebook.com/settings/system-users ← أضف System user بصلاحية Admin ← **Generate token** بالصلاحيتين `whatsapp_business_messaging` و`whatsapp_business_management` ← ضعه في `WA_TOKEN`.
- الرقم الحقيقي: من **WhatsApp Manager ← Phone numbers ← Add phone number**، ثم حدّث `WA_PHONE_NUMBER_ID` و`WA_BOT_NUMBER`.
- عدّل رقم البوت في `public/index.html` (المتغير `BOT_NUMBER`).

---

## المرحلة 4: الدفع بـ 2$ (10 دقائق)

### 12. Stripe
1. https://dashboard.stripe.com/register (يحتاج شركة أو حساباً في دولة يدعمها Stripe)
2. **Payment Links ← New** ← منتج "اشتراك سنة" بسعر **2.00 USD** دفعة واحدة ← انسخ الرابط إلى `STRIPE_PAYMENT_LINK`.
3. https://dashboard.stripe.com/webhooks ← **Add endpoint**:
   - URL: `https://homelist.netlify.app/stripe/webhook`
   - Event: `checkout.session.completed`
   - انسخ **Signing secret** إلى `STRIPE_WEBHOOK_SECRET`.
4. **Trigger deploy**.

---

## المرحلة 5: التذكير بالساعة والمسح اليومي

### 13. الوظيفة المجدولة
الوظيفة `tick` تعمل تلقائياً كل دقيقة. تأكد منها في **Logs ← Functions ← tick**.

إذا لم تعمل كل دقيقة (بعض الخطط تحدّها)، أضف مؤقتاً خارجياً مجانياً:
1. https://console.cron-job.org/signup
2. **Create cronjob** ← URL: `https://homelist.netlify.app/cron/tick?key=CRON_SECRET` ← **Every minute**.

التشغيل مرتين لا يسبب تكراراً، لأن النظام يمنع ذلك.

---

## المرحلة 6: Google Wallet (أندرويد)

### 14. الحسابات
1. https://pay.google.com/business/console ← **Google Wallet API** ← أنشئ Issuer ← انسخ **Issuer ID** إلى `GOOGLE_ISSUER_ID`.
2. https://console.cloud.google.com ← أنشئ مشروعاً ← **APIs & Services ← Enable APIs** ← فعّل **Google Wallet API**.
3. **IAM & Admin ← Service Accounts ← Create** ← افتحه ← **Keys ← Add key ← JSON** ← الصق محتوى الملف في `GOOGLE_SERVICE_ACCOUNT`.
4. في Google Pay & Wallet Console ← **Users** ← أضف بريد الـ Service Account بصلاحية **Developer**.
5. **Trigger deploy**. بعدها يظهر زر "إضافة إلى Google Wallet" في صفحة الكرت.
6. قبل الإطلاق للجمهور اطلب **Publishing access** من نفس الكونسول.

---

## الروابط المهمة لموقعك

| الصفحة | الرابط |
|---|---|
| الصفحة الرئيسية | `https://homelist.netlify.app` |
| لوحة التحكم | `https://homelist.netlify.app/admin` |
| فحص السيرفر | `https://homelist.netlify.app/health` |
| Webhook واتساب | `https://homelist.netlify.app/webhook` |
| Webhook الدفع | `https://homelist.netlify.app/stripe/webhook` |
| خدمة Apple (تلقائي) | `https://homelist.netlify.app/apple/v1/...` |

## أوامر واتساب للعميل
`ابدأ` · `مسح` · `حذف خبز` · `القائمة` · `موقع البيت` · `إضافة موقع سوبرماركت` · `حذف موقع سوبرماركت` · `وقت 5 مساء` · `الكرت` · `ايقاف العروض` · `مساعدة`

## قيود يجب معرفتها
- **Apple** تحدد مسافة تنبيه الموقع (حوالي 100–150 متراً)، والتنبيه يظهر بهدوء على شاشة القفل.
- **Google** يعرض نصاً عاماً في تنبيه الموقع، وحده 4 تنبيهات يومياً. تأكد من اسم حقل المواقع (`merchantLocations`) في وثائق Google.
- **رسائل واتساب التسويقية** لا تصل للأرقام الأمريكية، لذلك العروض تُرسل كتنبيه على الكرت من لوحة التحكم.
- التخزين في **Netlify Blobs**، وهو كافٍ للبداية. عند آلاف المشتركين يُفضّل نقله إلى قاعدة بيانات مثل Supabase.

## للمطورين
```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:8888
npm run embed          # بعد تغيير صور الكرت في public/assets
```
