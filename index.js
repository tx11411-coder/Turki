import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// الإعدادات المحددة
const TARGET_USER_ID = 51660277;
const CHANNEL_ID = 81889058;
const INTERVAL_MS = 63000; // 63 ثانية

client.on('ready', async () => {
    console.log("🚀 البوت متصل ومستعد!");
    await client.group.joinById(CHANNEL_ID);

    // بدء حلقة الأتمتة فور تشغيل البوت
    startAutomation();
});

// دالة الأتمتة (تكرار الأوامر)
async function startAutomation() {
    setInterval(async () => {
        try {
            console.log("⏳ جاري إرسال أوامر التمديد التلقائية...");
            
            // 1. إرسال أمر المهام
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
            
            // 2. انتظار ثانيتين (2000 مللي ثانية)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 3. إرسال أمر التحالف
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');
            
        } catch (err) {
            console.error("❌ خطأ أثناء إرسال الأوامر التلقائية:", err.message);
        }
    }, INTERVAL_MS);
}

client.on('groupMessage', async (message) => {
    // شرط: التأكد أن الرسالة من العضو المطلوب وفي القناة المطلوبة فقط
    if (message.sourceSubscriberId == TARGET_USER_ID && message.targetGroupId == CHANNEL_ID) {
        const imageUrl = message.body || (message.attachments && message.attachments[0]?.link);

        if (imageUrl && (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg') || imageUrl.endsWith('.png'))) {
            
            try {
                // محاولة الاستخراج (هذه الدالة ستفشل تلقائياً إذا لم تجد الإطار الأصفر)
                const code = await solveCaptcha(imageUrl);
                
                // إذا نجح الاستخراج، يرسل الرمز
                await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
                console.log(`✅ تم استخراج وإرسال الرمز: #${code}`);
                
            } catch (err) {
                // إذا لم تجد الدالة الإطار الأصفر (أو حدث خطأ)، سيقفز الكود هنا
                // نحن نتجاهل هذا الخطأ (لا نرسل شيئاً للقناة) لأن الصورة ليست كابتشا
                if (err.message !== "لم يتم العثور على الإطار الأصفر") {
                    console.error("⚠️ خطأ في معالجة الصورة:", err.message);
                }
            }
        }
    }
});

async function solveCaptcha(url) {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = 0, maxY = 0, found = false;

    // البحث عن الإطار الأصفر
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const idx = (y * info.width + x) * 4;
            // شرط اللون الأصفر (أحمر + أخضر عالي، أزرق منخفض)
            if (data[idx] > 200 && data[idx + 1] > 200 && data[idx + 2] < 100) {
                minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                found = true;
            }
        }
    }
    
    // إذا لم يجد الإطار، يتوقف هنا (يتجاهل الصورة)
    if (!found) throw new Error("لم يتم العثور على الإطار الأصفر");

    const margin = 8;
    const cropX = minX + margin;
    const cropY = minY + margin;
    const cropWidth = (maxX - minX) - (margin * 2);
    const cropHeight = (maxY - minY) - (margin * 2);

    if (cropWidth <= 0 || cropHeight <= 0) throw new Error("البطاقة صغيرة جداً");

    const processedBuffer = await sharp(buffer)
        .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
        .greyscale()
        .normalize()
        .linear(1.5, -0.2)
        .sharpen()
        .toBuffer();

    const worker = await createWorker('eng+ara');
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    const { data: { text } } = await worker.recognize(processedBuffer);
    await worker.terminate();

    const result = text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').trim();
    if (!result) throw new Error("لم يتم استخراج نص واضح");
    return result;
}

client.login(process.env.U_MAIL, process.env.U_PASS);
