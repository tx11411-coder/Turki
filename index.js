import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// الإعدادات
const TARGET_USER_ID = 51660277;
const CHANNEL_ID = 81889058;
const INTERVAL_MS = 63000;

client.on('ready', async () => {
    console.log("🚀 البوت متصل! جاهز للعمل (يتجاهل النصوص، يحلل الصور فقط)");
    await client.group.joinById(CHANNEL_ID);
    startAutomation();
});

// الأتمتة (تعمل بشكل مستقل تماماً عن الرسائل)
async function startAutomation() {
    setInterval(async () => {
        try {
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');
        } catch (err) {
            console.error("❌ خطأ في الأتمتة:", err.message);
        }
    }, INTERVAL_MS);
}

// معالج الرسائل
client.on('groupMessage', async (message) => {
    // 1. التحقق من المرسل والقناة
    if (message.sourceSubscriberId != TARGET_USER_ID || message.targetGroupId != CHANNEL_ID) return;

    // 2. تجاهل الرسائل النصية تماماً (لا تعالج إلا إذا كان هناك مرفقات/صور)
    if (!message.attachments || message.attachments.length === 0) return;

    const imageUrl = message.attachments[0].link;
    if (!imageUrl) return;

    try {
        const response = await fetch(imageUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // 3. الفحص الذكي: هل الصورة تحتوي على عبارة الاختبار؟
        const isCaptcha = await checkIsCaptcha(buffer);
        
        if (!isCaptcha) {
            console.log("⏭️ تم تجاهل صورة (ليست اختبار تحقق بشري).");
            return;
        }

        // 4. إذا كانت كابتشا حقيقية، نقوم بحلها
        console.log("🛡️ تم اكتشاف كابتشا! جاري الاستخراج...");
        const code = await solveCaptcha(buffer);
        
        if (code) {
            await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
            console.log(`✅ تم الإرسال: #${code}`);
        }
    } catch (err) {
        console.error("⚠️ خطأ في معالجة الصورة:", err.message);
    }
});

// دالة التحقق من العنوان
async function checkIsCaptcha(buffer) {
    try {
        // نأخذ الجزء العلوي من الصورة فقط للسرعة
        const headerBuffer = await sharp(buffer)
            .extract({ left: 0, top: 0, width: 1000, height: 250 })
            .greyscale()
            .threshold(150)
            .toBuffer();

        const worker = await createWorker('ara');
        const { data: { text } } = await worker.recognize(headerBuffer);
        await worker.terminate();

        // هل تحتوي على كلمة "اختبار" أو "تحقق"؟
        return text.includes('اختبار') || text.includes('تحقق');
    } catch (e) {
        return false;
    }
}

// دالة الحل (استخراج الكود من الإطار الأصفر)
async function solveCaptcha(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = 0, maxY = 0, found = false;

    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const idx = (y * info.width + x) * 4;
            if (data[idx] > 200 && data[idx + 1] > 200 && data[idx + 2] < 100) {
                minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                found = true;
            }
        }
    }
    if (!found) throw new Error("لم يتم العثور على الإطار الأصفر");

    const margin = 10;
    const processedBuffer = await sharp(buffer)
        .extract({ 
            left: minX + margin, 
            top: minY + margin, 
            width: (maxX - minX) - (margin * 2), 
            height: (maxY - minY) - (margin * 2) 
        })
        .greyscale()
        .normalize()
        .linear(1.5, -0.2)
        .sharpen()
        .toBuffer();

    const worker = await createWorker('eng+ara');
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    const { data: { text } } = await worker.recognize(processedBuffer);
    await worker.terminate();

    return text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').trim();
}

client.login(process.env.U_MAIL, process.env.U_PASS);
