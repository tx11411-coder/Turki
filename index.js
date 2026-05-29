import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 76023604; 
const CHANNEL_TASKS = 19287488;       // قناة المهام
const CHANNEL_ALLIANCE = 224;    // قناة التحالف (غير الرقم حسب رغبتك)
const TARGET_PLAYER_NAME = 'cat'; 

client.on('ready', async () => {
    console.log(`🚀 البوت متصل! يراقب القناتين: ${CHANNEL_TASKS} و ${CHANNEL_ALLIANCE}`);
    await client.group.joinById(CHANNEL_TASKS);
    await client.group.joinById(CHANNEL_ALLIANCE);
    startAutomation();
});

// --- الأتمتة ---
async function startAutomation() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    while (true) {
        try {
            // 1. إرسال أمر المهام للقناة الأولى
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد مهام');
            console.log(`✅ تم إرسال "!مد مهام" للقناة ${CHANNEL_TASKS}`);

            // انتظار ثانيتين بين الأمرين
            await sleep(2000);

            // 2. إرسال أمر الإيداع للقناة الثانية
            await client.messaging.sendGroupMessage(CHANNEL_ALLIANCE, '!مد تحالف ايداع كل');
            console.log(`✅ تم إرسال "!مد تحالف ايداع كل" للقناة ${CHANNEL_ALLIANCE}`);

            // 3. انتظار 64 ثانية للدورة التالية
            console.log("⏳ بانتظار 64 ثانية للبدء من جديد...");
            await sleep(64000);

        } catch (err) {
            console.error("❌ خطأ في الأتمتة:", err.message);
            await sleep(5000); // انتظار 5 ثواني عند الخطأ قبل المحاولة مجدداً
        }
    }
}

// --- معالجة الصور ---
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
        return match ? match[1].trim() : "لم يتم العثور على اسم";
    } catch (e) {
        return "خطأ في القراءة";
    }
}

// --- الاستقبال ---
client.on('groupMessage', async (message) => {
    // التحقق من القناتين
    const isTargetChannel = (message.targetGroupId === CHANNEL_TASKS || message.targetGroupId === CHANNEL_ALLIANCE);
    
    if (!isTargetChannel || message.sourceSubscriberId != TARGET_USER_ID) return;
    if (message.type !== 'text/image_link') return;

    try {
        const response = await fetch(message.body);
        const buffer = Buffer.from(await response.arrayBuffer());

        if (!(await isCaptchaByColor(buffer))) return;

        const name = await extractPlayerName(buffer);
        console.log(`👤 اللاعب المكتشف في قناة ${message.targetGroupId}: ${name}`);

        if (!name.toLowerCase().includes(TARGET_PLAYER_NAME.toLowerCase())) {
            console.log(`⏭️ تجاهل: الاسم "${name}" لا يطابق المطلوب.`);
            return;
        }

        console.log(`✅ الاسم يطابق، جاري حل الكابتشا...`);
        const code = await solveCaptcha(buffer);
        
        if (code) {
            // الرد على نفس القناة التي جاءت منها الصورة
            await client.messaging.sendGroupMessage(message.targetGroupId, `#${code}`);
            console.log(`✅ تم الإرسال للقناة ${message.targetGroupId}: #${code}`);
        }
    } catch (err) {
        console.error("⚠️ خطأ في المعالجة:", err.message);
    }
});

// --- وظيفة حل الكابتشا ---
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
