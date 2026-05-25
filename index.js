import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

const TARGET_USER_ID = 51660277;
const CHANNEL_ID = 81889058;

client.on('ready', async () => {
    console.log("🚀 البوت متصل ومستعد للعمل التلقائي!");
    await client.group.joinById(CHANNEL_ID);
});

client.on('groupMessage', async (message) => {
    if (message.sourceSubscriberId == TARGET_USER_ID && message.targetGroupId == CHANNEL_ID) {
        const imageUrl = message.body || (message.attachments && message.attachments[0]?.link);

        if (imageUrl && (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg') || imageUrl.endsWith('.png'))) {
            console.log("📸 اكتشفت صورة! جاري المعالجة...");
            
            try {
                // محاولة الاستخراج
                const code = await solveCaptcha(imageUrl);
                
                // إذا نجح الاستخراج، سيصل الكود إلى هذا السطر ويرسل الرسالة
                await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
                console.log(`✅ تم استخراج وإرسال الرمز: #${code}`);
                
            } catch (err) {
                // إذا فشل الاستخراج، الكود سيقفز هنا ولن يتم تنفيذ أمر الإرسال
                console.error("❌ فشل الاستخراج: لن يتم إرسال أي شيء للقناة. الخطأ:", err.message);
            }
        }
    }
});

async function solveCaptcha(url) {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

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
