import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 76023604;
const CHANNEL_TASKS = 224;
const CHANNEL_ALLIANCE = 224;
const TARGET_PLAYER_NAME = 'cat';

// متغيرات التحكم في الأتمتة
let currentInterval = 306000; // الافتراضي 306 ثانية
let isWaitingForBoxStatus = false;
let lastBoxCommandTime = 0;
let resetTimer = null; // للمؤقت الخاص بإعادة السرعة للوضع الطبيعي

client.on('ready', async () => {
    console.log(`🚀 البوت متصل! يراقب القناتين: ${CHANNEL_TASKS} و ${CHANNEL_ALLIANCE}`);
    await client.group.joinById(CHANNEL_TASKS);
    await client.group.joinById(CHANNEL_ALLIANCE);
    startAutomation();
});

// --- الأتمتة ---
async function startAutomation() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 1. مهمة الصندوق فتح كل 5 دقائق
    setInterval(async () => {
        try {
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق فتح');
        } catch (err) {}
    }, 5 * 60 * 1000);

    // 2. مهمة صندوق ضمان وقت كل ساعة
    setInterval(async () => {
        try {
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق ضمان وقت');
        } catch (err) {}
    }, 60 * 60 * 1000);

    // 3. مهمة طلب حالة الصناديق كل 30 دقيقة
    setInterval(async () => {
        try {
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق');
            isWaitingForBoxStatus = true;
            lastBoxCommandTime = Date.now();
            // إلغاء الانتظار بعد 4 ثوانٍ
            setTimeout(() => { isWaitingForBoxStatus = false; }, 4000);
        } catch (err) {
            console.error("❌ خطأ في طلب الصندوق:", err.message);
        }
    }, 30 * 60 * 1000);

    // الحلقة الأساسية للأوامر الدورية
    while (true) {
        try {
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد مهام');
            await sleep(2000);
            await client.messaging.sendGroupMessage(CHANNEL_ALLIANCE, '!مد تحالف ايداع كل');
            
            console.log(`⏳ بانتظار ${currentInterval / 1000} ثانية للدورة التالية...`);
            await sleep(currentInterval);
        } catch (err) {
            console.error("❌ خطأ في الأتمتة:", err.message);
            await sleep(5000);
        }
    }
}

// --- معالجة الرسائل ---
client.on('groupMessage', async (message) => {
    // 1. معالجة حالة الجهاز الزمني (فقط إذا كان المستخدم المستهدف هو المرسل)
    if (message.sourceSubscriberId === TARGET_USER_ID && isWaitingForBoxStatus) {
        if (Date.now() - lastBoxCommandTime < 4000) {
            const body = message.body;
            const timeMatch = body.match(/الجهاز الزمني[:\s]+(.*)/);
            
            if (timeMatch) {
                const status = timeMatch[1].trim();
                
                // مسح أي مؤقت قديم إذا كان موجوداً
                if (resetTimer) clearTimeout(resetTimer);

                if (status.includes('غير نشط')) {
                    currentInterval = 306000;
                    console.log("⚠️ الجهاز الزمني غير نشط. الفاصل: 306 ثانية.");
                } else {
                    // استخراج الدقائق والثواني
                    const minMatch = status.match(/(\d+)د/);
                    const secMatch = status.match(/(\d+)ث/);
                    const totalSeconds = (minMatch ? parseInt(minMatch[1]) * 60 : 0) + (secMatch ? parseInt(secMatch[1]) : 0);
                    
                    if (totalSeconds > 0) {
                        currentInterval = 64000; // السرعة السريعة
                        console.log(`✅ الجهاز الزمني نشط (${status}). الفاصل: 64 ثانية.`);
                        
                        // إعادة الفاصل للوضع البطيء بعد انتهاء الوقت
                        resetTimer = setTimeout(() => {
                            currentInterval = 306000;
                            console.log("⏱️ انتهى وقت الجهاز الزمني. العودة للفاصل 306 ثانية.");
                        }, totalSeconds * 1000);
                    }
                }
            }
            isWaitingForBoxStatus = false;
        }
    }

    // 2. معالجة الكابتشا
    const isTargetChannel = (message.targetGroupId === CHANNEL_TASKS || message.targetGroupId === CHANNEL_ALLIANCE);
    if (!isTargetChannel || message.sourceSubscriberId != TARGET_USER_ID || message.type !== 'text/image_link') return;

    try {
        const response = await fetch(message.body);
        const buffer = Buffer.from(await response.arrayBuffer());

        if (!(await isCaptchaByColor(buffer))) return;

        const name = await extractPlayerName(buffer);
        if (name.toLowerCase().includes(TARGET_PLAYER_NAME.toLowerCase())) {
            const code = await solveCaptcha(buffer);
            if (code) {
                await client.messaging.sendGroupMessage(message.targetGroupId, `#${code}`);
            }
        }
    } catch (err) {
        console.error("⚠️ خطأ في معالجة الكابتشا:", err.message);
    }
});

// --- وظائف معالجة الصور ---
async function isCaptchaByColor(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    const totalPixels = info.width * info.height;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 120 && data[i] > (data[i + 1] + 30) && data[i] > (data[i + 2] + 30)) redPixels++;
    }
    return (redPixels / totalPixels) * 100 > 40;
}

async function extractPlayerName(buffer) {
    try {
        const processedBuffer = await sharp(buffer).greyscale().threshold(160).toBuffer();
        const worker = await createWorker('ara+eng');
        const { data: { text } } = await worker.recognize(processedBuffer);
        await worker.terminate();
        const match = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
        return match ? match[1].trim() : "لم يتم العثور";
    } catch (e) { return "خطأ"; }
}

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
    if (!found) return null;
    const margin = 10;
    const processedBuffer = await sharp(buffer)
        .extract({ left: minX + margin, top: minY + margin, width: (maxX - minX) - (margin * 2), height: (maxY - minY) - (margin * 2) })
        .greyscale().normalize().linear(1.5, -0.2).sharpen().toBuffer();
    const worker = await createWorker('eng+ara');
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    const { data: { text } } = await worker.recognize(processedBuffer);
    await worker.terminate();
    return text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').trim();
}

client.login(process.env.U_MAIL, process.env.U_PASS);
