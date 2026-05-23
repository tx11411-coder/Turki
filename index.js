import 'dotenv/config';
import wolfjs from 'wolf.js';
const { WOLF } = wolfjs;

const settings = {
    identity: process.env.U_MAIL || 'your_email@example.com',
    secret: process.env.U_PASS || 'your_password',
    taskGroupId: 81889058,
    depositGroupId: 81889058
};

const MY_INFO = {
    myId: "80055399" 
};

const service = new WOLF();

// دالة لتجهيز الرموز للبحث البرمجي
const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

service.on('groupMessage', async (message) => {
    try {
        const content = message.body;
        const isTargetGroup = message.targetGroupId === settings.taskGroupId || message.targetGroupId === settings.depositGroupId;
        if (!isTargetGroup) return;

        // التحقق من أن الرسالة موجهة للعضوية المطلوبة
        if (content.includes("اختبار تحقق سريع") && content.includes(MY_INFO.myId)) {
            
            // --- 1. الفصل الجوهري ---
            // نبحث عن موقع النقطتين
            const colonIndex = content.indexOf(':');
            if (colonIndex === -1) return;

            // استخراج الجزئين في متغيرات منفصلة
            const instructionPart = content.substring(0, colonIndex); // الجزء قبل النقطتين (للتعليمات)
            const answerPart = content.substring(colonIndex + 1).trim(); // الجزء بعد النقطتين (للبحث عن الإجابة)

            console.log(`تم فصل الرسالة. جزء الإجابة المستهدف هو: ${answerPart}`);

            // --- 2. استخراج العلامتين (من الجزء الخاص بالتعليمات فقط) ---
            const symbolMatch = instructionPart.match(/العلامتين\s*([^\s])\s*و?\s*([^\s])/u);

            if (symbolMatch) {
                const sym1 = symbolMatch[1];
                const sym2 = symbolMatch[2];
                console.log(`✅ تم تحديد العلامات: [${sym1}] و [${sym2}]`);

                // --- 3. البحث عن الإجابة (في الجزء الخاص بالإجابة فقط) ---
                // الآن البوت يبحث فقط داخل `answerPart` ولا يرى التعليمات
                const pattern = new RegExp(`${escapeRegExp(sym1)}(.*?)${escapeRegExp(sym2)}`, 'u');
                const result = answerPart.match(pattern);

                if (result && result[1]) {
                    const answer = result[1].trim();
                    console.log(`🚀 الإجابة المستخرجة بنجاح: ${answer}`);
                    
                    setTimeout(async () => {
                        await service.messaging.sendGroupMessage(message.targetGroupId, `#${answer}`);
                    }, 3000);
                } else {
                    console.log("❌ تعذر العثور على الإجابة داخل النص المستهدف.");
                }
            } else {
                console.log("❌ فشل في تحديد العلامات من نص التعليمات.");
            }
        }
    } catch (err) {
        console.error("خطأ في معالجة الفخ:", err);
    }
});

// --- قسم المهام الدورية ---
service.on('ready', async () => {
    console.log(`🚀 البوت يعمل: نظام الفصل الذكي للنصوص مفعل.`);
    
    try {
        await service.group.joinById(settings.taskGroupId);
        await service.group.joinById(settings.depositGroupId);

        setInterval(async () => {
            await service.messaging.sendGroupMessage(settings.taskGroupId, "!مد مهام");
            setTimeout(async () => {
                await service.messaging.sendGroupMessage(settings.depositGroupId, "!مد تحالف ايداع كل");
            }, 2000);
        }, 60000); 

        setInterval(async () => {
            await service.messaging.sendGroupMessage(settings.taskGroupId, "!مد صندوق فتح");
        }, 180000); 

    } catch (e) {
        console.error("خطأ في بدء المهام:", e);
    }
});

service.login(settings.identity, settings.secret);
