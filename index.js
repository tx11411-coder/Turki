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

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

service.on('groupMessage', async (message) => {
    try {
        const content = message.body;
        const isTargetGroup = message.targetGroupId === settings.taskGroupId || message.targetGroupId === settings.depositGroupId;
        if (!isTargetGroup) return;

        // التحقق من أنها رسالة فخ وموجهة لي
        if (content.includes("اختبار تحقق سريع") && content.includes(MY_INFO.myId)) {
            
            // --- 1. فخ الرموز ---
            if (content.includes("العلامتين")) {
                const symbolMatch = content.match(/العلامتين\s*([^\s\w\u0600-\u06FF])\s*و\s*([^\s\w\u0600-\u06FF])/u);
                if (symbolMatch) {
                    const sym1 = symbolMatch[1];
                    const sym2 = symbolMatch[2];
                    const pattern = new RegExp(`${escapeRegExp(sym1)}(.*?)${escapeRegExp(sym2)}`, 'gu');
                    const allMatches = [...content.matchAll(pattern)];
                    if (allMatches.length > 1) {
                        const answer = allMatches[1][1].trim();
                        await service.messaging.sendGroupMessage(message.targetGroupId, `#${answer}`);
                    }
                }
            } 
            
            // --- 2. فخ القوسين () ---
            else if (content.includes("داخل القوسين")) {
                const match = content.match(/\((.*?)\)/); // يبحث عن النص داخل ()
                if (match && match[1]) {
                    const answer = match[1].trim();
                    console.log(`✅ إجابة القوسين المستخرجة: ${answer}`);
                    await service.messaging.sendGroupMessage(message.targetGroupId, `#${answer}`);
                }
            }

            // --- 3. فخ الأقواس المعقوفة {} ---
            else if (content.includes("الأقواس المعقوفة")) {
                const match = content.match(/\{(.*?)\}/); // يبحث عن النص داخل {}
                if (match && match[1]) {
                    const answer = match[1].trim();
                    console.log(`✅ إجابة المعقوفة المستخرجة: ${answer}`);
                    await service.messaging.sendGroupMessage(message.targetGroupId, `#${answer}`);
                }
            }
        }
    } catch (err) {
        console.error("خطأ في معالجة الفخ:", err);
    }
});

// --- قسم المهام الدورية ---
service.on('ready', async () => {
    console.log(`🚀 البوت نشط: نظام التعامل مع الفخاخ المتعددة مفعل.`);
    
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
        console.error("خطأ في المهام:", e);
    }
});

service.login(settings.identity, settings.secret);
