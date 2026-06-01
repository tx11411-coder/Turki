import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TARGET_USER_ID = 76023604;
const CHANNEL_TASKS = 224;
const CHANNEL_ALLIANCE = 224;
const TARGET_PLAYER_NAME = 'cat';

// الحالة الحالية والسابقة للمقارنة
let botState = { hasTimeDevice: false, gold: 0, silver: 0, bronze: 0, points: 0, isReady: false };
let expectingUpdate = false; // البوابة: هل ننتظر صورة؟

// إرسال الأوامر مع تفعيل البوابة
async function sendCommand(channel, command) {
    expectingUpdate = true;
    console.log(`📡 أرسلت: ${command} | أنتظر الصورة...`);
    await client.messaging.sendGroupMessage(channel, command);
    
    // إغلاق البوابة بعد 40 ثانية تلقائياً في حال لم تأتِ الصورة
    setTimeout(() => { expectingUpdate = false; }, 40000);
}

// دالة لمقارنة التغييرات وطباعتها
function logChanges(oldState, newState) {
    console.log("--- 🔄 تحديث الحالة ---");
    for (let key in newState) {
        if (oldState[key] !== newState[key]) {
            console.log(`✅ تغيير في [${key}]: ${oldState[key]} -> ${newState[key]}`);
        }
    }
}

client.on('ready', async () => {
    console.log(`🚀 البوت يعمل بنظام المراقبة الذكية.`);
    await client.group.joinById(CHANNEL_TASKS);
    await client.group.joinById(CHANNEL_ALLIANCE);
});

// 1. حلقة الحالة
async function startStatusLoop() {
    await sendCommand(CHANNEL_TASKS, '!مد حالة');
    setTimeout(startStatusLoop, 30 * 60 * 1000);
}

// 2. حلقة المهام
async function startTaskLoop() {
    try {
        await sendCommand(CHANNEL_TASKS, '!مد مهام');
        await sleep(1000);
        await sendCommand(CHANNEL_ALLIANCE, '!مد تحالف ايداع كل');
        
        await manageBoxes();

        const interval = botState.hasTimeDevice ? 63000 : 306000;
        setTimeout(startTaskLoop, interval);
    } catch (err) {
        console.error("خطأ:", err.message);
        setTimeout(startTaskLoop, 10000);
    }
}

// 3. إدارة الصناديق
async function manageBoxes() {
    if (botState.isReady && !botState.hasTimeDevice) {
        await sendCommand(CHANNEL_TASKS, '!مد صندوق ضمان وقت');
        await sleep(3000);
        return;
    }

    if (botState.hasTimeDevice || botState.isReady || botState.points >= 40) return;

    if (botState.gold > 0) await sendCommand(CHANNEL_TASKS, '!مد صندوق فتح ذهبي');
    else if (botState.silver > 0) await sendCommand(CHANNEL_TASKS, '!مد صندوق فتح فضي');
    else if (botState.bronze > 0) await sendCommand(CHANNEL_TASKS, '!مد صندوق فتح برونزي');
    await sleep(3000);
}

// 4. معالجة الرسائل
client.on('groupMessage', async (message) => {
    if (message.sourceSubscriberId != TARGET_USER_ID) return;

    // أ) إذا كانت صورة
    if (message.type === 'text/image_link') {
        if (!expectingUpdate) {
            console.log("🚫 تجاهلت صورة: لم أطلب تحديثاً.");
            return;
        }

        try {
            const response = await fetch(message.body);
            const buffer = Buffer.from(await response.arrayBuffer());

            // هل هي كابتشا؟
            if (await isCaptchaByColor(buffer)) {
                const name = await extractPlayerName(buffer);
                if (new RegExp(`\\b${TARGET_PLAYER_NAME}\\b`, 'i').test(name)) {
                    console.log("⚠️ كابتشا مطلوبة! جاري الحل...");
                    const code = await solveCaptcha(buffer);
                    if (code) await client.messaging.sendGroupMessage(message.targetGroupId, `#${code}`);
                }
            } 
            // هل هي حالة؟
            else {
                const newState = await parseStatusImage(buffer);
                if (newState) {
                    logChanges(botState, newState); // طباعة التغييرات في الكونسول
                    botState = newState;
                    expectingUpdate = false; // تم التحديث بنجاح، أغلق البوابة
                }
            }
        } catch (err) {
            console.error("خطأ في المعالجة:", err.message);
        }
    }
});

// --- الدوال المساعدة ---
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

async function solveCaptcha(buffer) {
    const worker = await createWorker('eng');
    const processed = await sharp(buffer).greyscale().threshold(180).toBuffer();
    const { data: { text } } = await worker.recognize(processed);
    await worker.terminate();
    return text.replace(/\D/g, '');
}

async function parseStatusImage(buffer) {
    const worker = await createWorker('ara+eng');
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    
    const nameRegex = new RegExp(`\\b${TARGET_PLAYER_NAME}\\b`, 'i');
    if (!text.includes("نقاط الضمان") || !nameRegex.test(text)) return null;
    
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
                }
            }
        } 
        // ب) هل هي حالة؟ (مع التحقق من الاسم)
        else {
            const newState = await parseStatusImage(buffer);
            if (newState) {
                botState = newState;
                console.log("📊 تم تحديث الحالة:", botState);
            } else {
                console.log("🔍 تم تجاهل صورة: لا تطابق بيانات " + TARGET_PLAYER_NAME);
            }
        }
    } catch (err) {
        console.error("خطأ في المعالجة:", err.message);
    }
});

// --- الدوال المساعدة ---

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

async function solveCaptcha(buffer) {
    const worker = await createWorker('eng');
    const processed = await sharp(buffer).greyscale().threshold(180).toBuffer();
    const { data: { text } } = await worker.recognize(processed);
    await worker.terminate();
    const digits = text.replace(/\D/g, ''); 
    return digits.length > 0 ? digits : null;
}

async function parseStatusImage(buffer) {
    const worker = await createWorker('ara+eng');
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    
    // فلترة: لا تعالج إلا إذا كانت صورة حالة وتحمل اسم اللاعب
    const nameRegex = new RegExp(`\\b${TARGET_PLAYER_NAME}\\b`, 'i');
    if (!text.includes("نقاط الضمان") || !nameRegex.test(text)) {
        return null; // صورة غير صالحة أو ليست للاعب المطلوب
    }
    
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
