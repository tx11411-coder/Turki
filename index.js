import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 51660277 ; // مُرسل الصور
const CHANNEL_ID = 81889058 ;     // القناة
const DELAY_MS = 63000;  
const TARGET_PLAYER_NAME = 'king'; // الاسم الذي تريد البوت أن يجاوب له فقط

client.on('ready', async () => {
    console.log(`🚀 البوت متصل! سأجاوب فقط إذا كان اسم اللاعب يحتوي على: ${TARGET_PLAYER_NAME}`);
    await client.group.joinById(CHANNEL_ID);
    startAutomation();
});

async function startAutomation() {
    // دالة تقوم بتنفيذ الخطوات بالترتيب
    const runTask = async () => {
        try {
            // 1. انتظار ثانية واحدة قبل البدء
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 2. إرسال أمر المهام
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
            console.log("✅ تم إرسال !مد مهام");

            // 3. انتظار ثانيتين
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 4. إرسال أمر الإيداع
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');
            console.log("✅ تم إرسال !مد تحالف ايداع كل");

        } catch (err) {
            console.error("❌ خطأ في الأتمتة:", err.message);
        }

        // 5. انتظار 63 ثانية ثم إعادة تشغيل الدالة بالكامل
        console.log("⏳ بانتظار 63 ثانية للبدء من جديد...");
        setTimeout(runTask, 65000);
    };

    // تشغيل أول دورة
    runTask();
}



// دالة فحص نسبة اللون الأحمر
async function isCaptchaByColor(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    const totalPixels = info.width * info.height;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 120 && data[i] > (data[i + 1] + 30) && data[i] > (data[i + 2] + 30)) redPixels++;
    }
    const percentage = (redPixels / totalPixels) * 100;
    return percentage > 40;
}

// دالة استخراج اسم اللاعب
async function extractPlayerName(buffer) {
    try {
        const processedBuffer = await sharp(buffer)
            .greyscale()
            .threshold(160) 
            .toBuffer();

        const worker = await createWorker('ara+eng');
        const { data: { text } } = await worker.recognize(processedBuffer);
        await worker.terminate();

        const match = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
        return match ? match[1].trim() : "لم يتم العثور على اسم";
    } catch (e) {
        return "خطأ في القراءة";
    }
}

client.on('groupMessage', async (message) => {
    if (message.targetGroupId != CHANNEL_ID || message.sourceSubscriberId != TARGET_USER_ID) return;
    if (message.type !== 'text/image_link') return;

    const imageUrl = message.body;
    
    try {
        const response = await fetch(imageUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // 1. الفحص: هل هي صورة كابتشا؟
        if (!(await isCaptchaByColor(buffer))) return;

        // 2. استخراج الاسم
        const playerName = extractPlayerName(buffer); // (سأقوم بانتظارها في السطر التالي)
        const name = await playerName;
        console.log(`👤 اللاعب المكتشف: ${name}`);

        // 3. فلتر اسم اللاعب (الشرط الجديد)
        if (!name.toLowerCase().includes(TARGET_PLAYER_NAME.toLowerCase())) {
            console.log(`⏭️ تم تجاهل البطاقة: الاسم "${name}" لا يطابق المطلوب.`);
            return;
        }

        // 4. إذا تطابق الاسم، نحل الكابتشا
        console.log(`✅ الاسم يطابق (${name})، جاري حل الكابتشا...`);
        const code = await solveCaptcha(buffer);
        
        if (code) {
            await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
            console.log(`✅ تم الإرسال: #${code}`);
        }
    } catch (err) {
        console.error("⚠️ خطأ في المعالجة:", err.message);
    }
});

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
    
    if (!found) throw new Error("لا يوجد إطار أصفر للحل");

    const margin = 10;
    const processedBuffer = await sharp(buffer)
        .extract({ left: minX + margin, top: minY + margin, width: (maxX - minX) - (margin * 2), height: (maxY - minY) - (margin * 2) })
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
