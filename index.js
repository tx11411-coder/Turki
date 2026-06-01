import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 76023604;
const CHANNEL_ID = 224;
const TARGET_PLAYER_NAME = 'cat';
let taskInterval = 306000; // القيمة الافتراضية

// مصفوفة لتتبع حالة الانتظار للكابتشا
const waitingStates = { [CHANNEL_ID]: { isWaiting: false, timer: null } };

// تهيئة الـ Worker (لحل الكابتشا بسرعة)
let worker = null;
async function initWorker() {
    worker = await createWorker('eng+ara');
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
}

client.on('ready', async () => {
    console.log(`🚀 البوت متصل!`);
    await initWorker();
    await client.group.joinById(CHANNEL_ID);
    
    // بدء الحلقات
    startCrateLoop();      // حلقة الصناديق
    startAutomationLoop(); // حلقة المهام
});

// --- حلقة الصناديق (كل 30 دقيقة) ---
function startCrateLoop() {
    client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق');
    setInterval(async () => {
        await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق');
    }, 30 * 60 * 1000);
}

// --- حلقة المهام الديناميكية ---
async function startAutomationLoop() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    while (true) {
        try {
            // تفعيل انتظار الكابتشا قبل إرسال المهام
            setWaitingState(CHANNEL_ID, true);
            
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
            await sleep(2000);
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');
            
            console.log(`✅ المهام مكتملة. الوضع الحالي: ${taskInterval === 60000 ? 'سريع (60 ثانية)' : 'عادي (306 ثانية)'}`);
            await sleep(taskInterval);
        } catch (err) {
            console.error("❌ خطأ:", err.message);
            await sleep(5000);
        }
    }
}

function setWaitingState(channelId, isActive) {
    if (waitingStates[channelId].timer) clearTimeout(waitingStates[channelId].timer);
    waitingStates[channelId].isWaiting = isActive;
    if (isActive) {
        waitingStates[channelId].timer = setTimeout(() => { waitingStates[channelId].isWaiting = false; }, 10000);
    }
}

// --- معالجة الرسائل ---
client.on('groupMessage', async (message) => {
    if (message.targetGroupId !== CHANNEL_ID || !message.body) return;

    // 1. فحص رسالة الصناديق لتحديث السرعة
    if (message.body.includes('حالة الصناديق')) {
        updateSpeedLogic(message.body);
    }

    // 2. فحص الكابتشا (فقط إذا كان المستخدم المستهدف وأرسلنا الأمر للتو)
    if (message.sourceSubscriberId == TARGET_USER_ID && message.type === 'text/image_link' && waitingStates[CHANNEL_ID].isWaiting) {
        try {
            const response = await fetch(message.body);
            const buffer = Buffer.from(await response.arrayBuffer());
            
            if (!(await isCaptchaByColor(buffer))) return;

            const name = await extractPlayerName(buffer);
            if (name.toLowerCase().includes(TARGET_PLAYER_NAME.toLowerCase())) {
                setWaitingState(CHANNEL_ID, false);
                const code = await solveCaptcha(buffer);
                if (code) {
                    await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
                    console.log(`✅ تم حل الكابتشا: #${code}`);
                }
            }
        } catch (err) {
            console.error("⚠️ خطأ في معالجة الكابتشا:", err.message);
        }
    }
});

// --- وظائف منطق السرعة ---
function updateSpeedLogic(text) {
    const isInactive = text.includes('الجهاز الزمني: غير نشط') || text.includes('الجهاز الزمني: —');
    taskInterval = isInactive ? 306000 : 60000;
    console.log(`⚡ تم تحديث التوقيت إلى: ${taskInterval / 1000} ثانية.`);
}

// --- وظائف الكابتشا ---
async function isCaptchaByColor(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 120 && data[i] > (data[i + 1] + 30) && data[i] > (data[i + 2] + 30)) redPixels++;
    }
    return (redPixels / (info.width * info.height)) * 100 > 40;
}

async function extractPlayerName(buffer) {
    try {
        const processedBuffer = await sharp(buffer).greyscale().threshold(160).toBuffer();
        const { data: { text } } = await worker.recognize(processedBuffer);
        const match = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
        return match ? match[1].trim() : "لم يتم العثور على اسم";
    } catch (e) { return "خطأ"; }
}

async function solveCaptcha(buffer) {
    const processedBuffer = await sharp(buffer).greyscale().normalize().linear(1.5, -0.2).sharpen().toBuffer();
    const { data: { text } } = await worker.recognize(processedBuffer);
    return text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').trim();
}

client.login(process.env.U_MAIL, process.env.U_PASS);
