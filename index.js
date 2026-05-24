import 'dotenv/config';
import wolfjs from 'wolf.js';
import axios from 'axios';

const { WOLF } = wolfjs;
const service = new WOLF();

// الإعدادات - تأكد من مراجعة أرقام القنوات هنا
const settings = {
    allowedGroupIds: [ 81889058], // أضف هنا جميع القنوات التي تريد مراقبتها
    verificationGroupId: 9969,          // القناة التي سيرسل فيها الحل
    apiKey: process.env.API_KEY || 'K83171079488957'
};

// دالة الحل عبر API
async function solveCaptcha(imageUrl) {
    console.log("🔍 جاري معالجة الصورة عبر الـ API...");
    try {
        const response = await axios.post('https://api.ocr.space/parse/image', null, {
            params: { 
                apikey: settings.apiKey, 
                url: imageUrl, 
                language: 'eng', 
                OCREngine: 2,
                filetype: 'JPG' // هذا السطر هو الحل لمشكلة E216
            },
            timeout: 15000 
        });

        if (response.data.ParsedResults?.length > 0) {
            const text = response.data.ParsedResults[0].ParsedText.trim();
            console.log("📄 تم استخراج النص بنجاح:", text);
            return text;
        } else {
            console.log("⚠️ API لم يرجع أي نص. الرد:", JSON.stringify(response.data));
            return null;
        }
    } catch (err) {
        console.error("❌ خطأ أثناء الاتصال بالـ API:", err.message);
        return null;
    }
}

// مراقبة الرسائل
service.on('groupMessage', async (message) => {
    // 1. تصفية القنوات: إذا لم تكن القناة في القائمة، تجاهل الرسالة
    if (!settings.allowedGroupIds.includes(message.targetGroupId)) return;

    // 2. استخراج رابط الصورة
    let imageUrl = null;
    if (message.type === 'text/image_link') {
        imageUrl = message.body; // الصورة كـ رابط نصي كما ظهر في السجلات
    } else if (message.attachments && message.attachments.length > 0) {
        imageUrl = message.attachments[0].link; // الصورة كمرفق
    }

    // 3. التنفيذ
    if (imageUrl) {
        console.log(`✅ صورة مكتشفة في القناة ${message.targetGroupId}`);
        const solution = await solveCaptcha(imageUrl);
        
        if (solution) {
            console.log("🔑 إرسال الحل:", solution);
            await service.messaging.sendGroupMessage(settings.verificationGroupId, `#${solution}`);
        }
    }
});

// تشغيل البوت
service.on('ready', async () => {
    console.log("🚀 البوت متصل ومستعد للعمل...");
});

service.login(process.env.U_MAIL, process.env.U_PASS);
