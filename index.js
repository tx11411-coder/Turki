import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// الإعدادات - يرجى التأكد من تطابقها مع بياناتك
const TARGET_GROUP_ID = 81889058 ; // رقم المجموعة من رسالتك
const TARGET_USER_ID = 51660277 ; // الرقم الذي يرسل الصور (يمكنك حذفه لاحقاً إذا أردت استقبال الصور من الجميع)
const INTERVAL_MS = 63000;

client.on('ready', async () => {
    console.log("🚀 البوت متصل! جاهز للعمل.");
    await client.group.joinById(TARGET_GROUP_ID);
    startAutomation();
});

// الأتمتة
async function startAutomation() {
    setInterval(async () => {
        try {
            await client.messaging.sendGroupMessage(TARGET_GROUP_ID, '!مد مهام');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await client.messaging.sendGroupMessage(TARGET_GROUP_ID, '!مد تحالف ايداع كل');
        } catch (err) {
            console.error("❌ خطأ في الأتمتة:", err.message);
        }
    }, INTERVAL_MS);
}

// معالج الرسائل المحدث بناءً على JSON الذي أرسلته
client.on('groupMessage', async (message) => {
    // 1. فلتر القناة
    if (message.targetGroupId != TARGET_GROUP_ID) return;

    // 2. تجاهل الرسائل النصية تماماً
    if (message.type === 'text/plain') return;

    // 3. إذا كانت الرسالة صورة (text/image_link)
    if (message.type === 'text/image_link') {
        const imageUrl = message.body; // الرابط هنا في الـ body
        
        console.log("🖼️ تم اكتشاف صورة! جاري المعالجة...");

        try {
            const response = await fetch(imageUrl);
            const buffer = Buffer.from(await response.arrayBuffer());

            // معالجة الصورة
            const code = await solveCaptcha(buffer);
            
            if (code) {
                await client.messaging.sendGroupMessage(TARGET_GROUP_ID, `#${code}`);
                console.log(`✅ تم استخراج وإرسال الرمز: #${code}`);
            }
        } catch (err) {
            if (err.message !== "لم يتم العثور على الإطار الأصفر") {
                console.error("⚠️ خطأ في المعالجة:", err.message);
            }
        }
    }
});

// دالة الحل (نفس التي تعمل معك)
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
