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

// الحالة العالمية
let botState = { 
    hasTimeDevice: false, 
    gold: 0, 
    silver: 0, 
    bronze: 0, 
    points: 0, 
    isReady: false 
};

let lastCommandTime = 0;

client.on('ready', async () => {
    console.log(`🚀 البوت يعمل الآن بكامل المزايا.`);
    await client.group.joinById(CHANNEL_TASKS);
    await client.group.joinById(CHANNEL_ALLIANCE);
    
    startStatusLoop(); 
    startTaskLoop();   
});

// 1. حلقة الحالة (كل 30 دقيقة)
async function startStatusLoop() {
    await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد حالة');
    setTimeout(startStatusLoop, 30 * 60 * 1000);
}

// 2. حلقة المهام (ديناميكية 63ث / 306ث)
async function startTaskLoop() {
    try {
        lastCommandTime = Date.now();
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد مهام');
        await sleep(1500);
        await client.messaging.sendGroupMessage(CHANNEL_ALLIANCE, '!مد تحالف ايداع كل');
        
        await manageBoxes();

        const interval = botState.hasTimeDevice ? 63000 : 306000;
        setTimeout(startTaskLoop, interval);
    } catch (err) {
        console.error("خطأ في المهام:", err.message);
        setTimeout(startTaskLoop, 10000);
    }
}

// 3. إدارة الصناديق (نظام Safe Side - التوقف عند 40 نقطة)
async function manageBoxes() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // تفعيل الضمان
    if (botState.isReady && !botState.hasTimeDevice) {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق ضمان وقت');
        await sleep(3000);
        return;
    }

    // وضع الأمان: إذا كان هناك زمني أو جاهز أو وصلنا لـ 40 نقطة، توقف
    if (botState.hasTimeDevice || botState.isReady || botState.points >= 40) {
        return; 
    }

    // فتح الصناديق
    if (botState.gold > 0) {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق فتح ذهبي');
        await sleep(3000);
    } else if (botState.silver > 0) {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق فتح فضي');
        await sleep(3000);
    } else if (botState.bronze > 0) {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق فتح برونزي');
        await sleep(3000);
    }
}

// 4. معالجة الرسائل
client.on('groupMessage', async (message) => {
    if (message.sourceSubscriberId != TARGET_USER_ID || message.type !== 'text/image_link') return;

    try {
        const response = await fetch(message.body);
        const buffer = Buffer.from(await response.arrayBuffer());

        if (await isCaptchaByColor(buffer)) {
            if (Date.now() - lastCommandTime <= 4000) {
                const name = await extractPlayerName(buffer);
                const regex = new RegExp(`\\b${TARGET_PLAYER_NAME}\\b`, 'i');
                
                if (regex.test(name)) {
                    const code = await solveCaptcha(buffer);
                    if (code) await client.messaging.sendGroupMessage(message.targetGroupId, `#${code}`);
                }
            }
        } else {
            botState = await parseStatusImage(buffer);
            console.log("📊 تحديث الحالة:", botState);
        }
    } catch (err) {
        console.error("خطأ في المعالجة:", err.message);
    }
});

// الدوائر البرمجية
async function isCaptchaByColor(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 120 && data[i] > (data[i+1]+30) && data[i] > (data[i+2]+30)) redPixels++;
    }
    return (redPixels / (info.width * info.height)) * 100 > 40;
}

async function extractPlayerName(buffer) {
    const worker = await createWorker('ara+eng');
    const processed = await sharp(buffer).greyscale().threshold(160).toBuffer();
    const { data: { text } } = await worker.recognize(processed);
    await worker.terminate();
    const match = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
    return match ? match[1].trim() : "";
}

// حل الكابتشا باستخدام OCR
async function solveCaptcha(buffer) {
    const worker = await createWorker('eng'); // الأرقام عادة بالإنجليزية
    // معالجة الصورة لتحسين قراءة الأرقام
    const processed = await sharp(buffer).greyscale().threshold(180).toBuffer();
    const { data: { text } } = await worker.recognize(processed);
    await worker.terminate();
    
    // استخراج الأرقام فقط
    const digits = text.replace(/\D/g, ''); 
    return digits.length > 0 ? digits : null;
}

async function parseStatusImage(buffer) {
    const worker = await createWorker('ara+eng');
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    
    return {
        hasTimeDevice: text.includes("الجهاز الزمني"),
        points: parseInt((text.match(/نقاط الضمان[:\s]+(\d+)\/50/) || [0, 0])[1]),
        isReady: text.includes("جاهز"),
        gold: parseInt((text.match(/ذهبي[:\s]+(\d+)/) || [0, 0])[1]),
        silver: parseInt((text.match(/فضي[:\s]+(\d+)/) || [0, 0])[1]),
        bronze: parseInt((text.match(/برونزي[:\s]+(\d+)/) || [0, 0])[1])
    };
}

client.login(process.env.U_MAIL, process.env.U_PASS);
