import 'dotenv/config';
import wolfjs from 'wolf.js';
import axios from 'axios';

const { WOLF } = wolfjs;
const service = new WOLF();

// الإعدادات
const settings = {
    taskGroupId: 81889058,
    verificationGroupId: 9969,
    apiKey: process.env.API_KEY || 'K83171079488957' // مفتاحك
};

// دالة الحل عبر API
async function solveCaptcha(imageUrl) {
    try {
        console.log("جاري إرسال الصورة للـ API...");
        const response = await axios.post('https://api.ocr.space/parse/image', null, {
            params: { apikey: settings.apiKey, url: imageUrl, language: 'eng', OCREngine: 2 }
        });
        if (response.data.ParsedResults?.length > 0) {
            return response.data.ParsedResults[0].ParsedText.trim();
        }
        return null;
    } catch (err) { return null; }
}

service.on('groupMessage', async (message) => {
    // 1. طباعة كامل بيانات الرسالة في السجلات (Logs) لكي نكتشف مكان الصورة
    console.log("--- تفاصيل الرسالة المستلمة ---");
    console.log(JSON.stringify(message, null, 2));

    // 2. محاولات استخراج رابط الصورة (بناءً على هياكل WOLF المختلفة)
    let imageUrl = null;

    // الطريقة الأولى: المرفقات التقليدية
    if (message.attachments && message.attachments[0]) {
        imageUrl = message.attachments[0].link || message.attachments[0].url;
    }
    
    // الطريقة الثانية: إذا كانت الصورة من نوع ميديا
    if (!imageUrl && message.media) {
        imageUrl = message.media.url || message.media.link;
    }

    if (imageUrl) {
        console.log("✅ تم العثور على رابط صورة:", imageUrl);
        const solution = await solveCaptcha(imageUrl);
        if (solution) {
            console.log("🔑 الحل المستخرج:", solution);
            await service.messaging.sendGroupMessage(settings.verificationGroupId, `#${solution}`);
        }
    } else {
        console.log("❌ لم يتم العثور على رابط صورة في هذه الرسالة.");
    }
});

service.on('ready', async () => {
    console.log("🚀 البوت متصل ويراقب القناة...");
});

service.login(process.env.U_MAIL, process.env.U_PASS);
