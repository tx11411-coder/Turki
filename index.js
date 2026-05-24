import wolfjs from 'wolf.js';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";

// ملاحظة أمنية: يفضل استخدام ملف .env للمفتاح
const GEMINI_API_KEY = 'AIzaSyBPR7jm6_v0ESdnLanaln8DLHQWLTFulZs'; 

const { WOLF } = wolfjs;
const service = new WOLF();

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const settings = {
    allowedGroupIds: [ 81889058],
    verificationGroupId: 9969
};

// دالة تحويل الصورة
async function urlToGenerativePart(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return {
        inlineData: {
            data: Buffer.from(response.data).toString("base64"),
            mimeType: "image/jpeg"
        },
    };
}

// دالة الحل - تأكد من وجود try و catch بشكل سليم
async function solveCaptchaWithAI(imageUrl) {
    console.log("👁️ جاري التحليل البصري الذكي للصورة...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const imagePart = await urlToGenerativePart(imageUrl);
        const prompt = "في هذه الصورة يوجد عدة رموز. استخرج الرمز الموجود داخل المربع المظلل فقط. أجب بالرمز المكون من 4 خانات فقط.";

        const result = await model.generateContent([prompt, imagePart]);
        const solution = result.response.text().trim();
        
        console.log("🔑 الحل الذكي المستخرج:", solution);
        return solution;
    } catch (err) {
        console.error("❌ خطأ في الذكاء الاصطناعي:", err.message);
        return null;
    }
}

service.on('groupMessage', async (message) => {
    if (!settings.allowedGroupIds.includes(message.targetGroupId)) return;

    let imageUrl = null;
    if (message.type === 'text/image_link') imageUrl = message.body;
    else if (message.attachments && message.attachments.length > 0) imageUrl = message.attachments[0].link;

    if (imageUrl) {
        console.log(`✅ صورة مكتشفة، جاري حلها...`);
        const solution = await solveCaptchaWithAI(imageUrl);
        
        if (solution) {
            await service.messaging.sendGroupMessage(settings.verificationGroupId, `#${solution}`);
        }
    }
});

service.on('ready', () => console.log("🚀 البوت متصل ومزود بالذكاء الاصطناعي!"));

service.login(process.env.U_MAIL, process.env.U_PASS);
