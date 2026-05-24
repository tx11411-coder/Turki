import wolfjs from 'wolf.js';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";

// ضع مفتاح الـ API الخاص بك هنا
const GEMINI_API_KEY = 'AIzaSyBPR7jm6_v0ESdnLanaln8DLHQWLTFulZs'; 

const { WOLF } = wolfjs;
const service = new WOLF();
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// دالة تحويل الصورة لرابط يمكن لـ Gemini فهمه
async function urlToGenerativePart(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return {
        inlineData: {
            data: Buffer.from(response.data).toString("base64"),
            mimeType: "image/jpeg"
        },
    };
}

// دالة الحل الذكي
async function solveCaptchaWithAI(imageUrl) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = await urlToGenerativePart(imageUrl);
        const prompt = "في هذه الصورة يوجد عدة رموز. استخرج الرمز الموجود داخل المربع المظلل أو المميز. أجب بالرمز المكون من 4 خانات فقط.";

        const result = await model.generateContent([prompt, imagePart]);
        return result.response.text().trim();
    } catch (err) {
        console.error("❌ خطأ AI:", err.message);
        return null;
    }
}

service.on('groupMessage', async (message) => {
    // فلتر المجموعات: الكود سيتوقف فوراً إذا لم تكن الرسالة من الروم المطلوب
    if (message.targetGroupId !== 81889058) return;

    let imageUrl = null;
    
    // التقاط الصورة
    if (message.body && message.body.startsWith('http')) imageUrl = message.body;
    else if (message.attachments && message.attachments.length > 0) imageUrl = message.attachments[0].link;

    if (imageUrl) {
        console.log(`✅ تم اكتشاف صورة في الروم ${message.targetGroupId}، جاري التحليل...`);
        const solution = await solveCaptchaWithAI(imageUrl);
        
        if (solution) {
            console.log(`🔑 الحل المستخرج: ${solution}`);
            await service.messaging.sendGroupMessage(message.targetGroupId, `#${solution}`);
        }
    }
});

service.on('ready', () => console.log("🚀 البوت متصل ومستعد للعمل في الروم المحدد!"));

service.login(process.env.U_MAIL, process.env.U_PASS);
