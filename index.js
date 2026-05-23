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

        if (content.includes("اختبار تحقق سريع") && content.includes(MY_INFO.myId)) {
            
            // --- 1. فخ الرموز (النظام القديم) ---
            if (content.includes("العلامتين")) {
                const symbolMatch = content.match(/العلامتين\s*([^\s\w\u0600-\u06FF])\s*و\s*([^\s\w\u0600-\u06FF])/u);
                if (symbolMatch) {
                    const pattern = new RegExp(`${escapeRegExp(symbolMatch[1])}(.*?)${escapeRegExp(symbolMatch[2])}`, 'gu');
                    const allMatches = [...content.matchAll(pattern)];
                    if (allMatches.length > 1) {
                        await service.messaging.sendGroupMessage(message.targetGroupId, `#${allMatches[1][1].trim()}`);
                    }
                }
            } 
            
            // --- 2. فخ القوسين (النظام القديم) ---
            else if (content.includes("داخل القوسين")) {
                const match = content.match(/\((.*?)\)/);
                if (match) await service.messaging.sendGroupMessage(message.targetGroupId, `#${match[1].trim()}`);
            }

            // --- 3. فخ الأقواس المعقوفة {} (النظام القديم) ---
            else if (content.includes("الأقواس المعقوفة")) {
                const match = content.match(/\{(.*?)\}/);
                if (match) await service.messaging.sendGroupMessage(message.targetGroupId, `#${match[1].trim()}`);
            }

            // --- 4. فخ الاتجاهات (يمين / يسار) الجديد ---
            else if (content.includes("اليمين") || content.includes("يمين") || content.includes("اليسار") || content.includes("يسار")) {
                // استخراج العلامة المذكورة (مثل ◈)
                const symMatch = content.match(/للعلامة\s*([^\s])/u);
                // استخراج الاتجاه (يمين أو يسار)
                const dirMatch = content.match(/(اليمين|يمين|اليسار|يسار)/u);

                if (symMatch && dirMatch) {
                    const sym = symMatch[1]; // الرمز (◈)
                    const direction = dirMatch[0]; // (يمين أو يسار)
                    
                    // البحث عن النص الذي يحتوي على الرمز (مثل: Z2Z ◈ W465)
                    // هذا التعبير يبحث عن كلمة ثم مسافة ثم الرمز ثم مسافة ثم كلمة
                    const regex = new RegExp(`([^\\s]+)\\s*${escapeRegExp(sym)}\\s*([^\\s]+)`, 'u');
                    const match = content.match(regex);

                    if (match) {
                        let answer = "";
                        if (direction.includes("يمين")) {
                            answer = match[2]; // الجزء بعد الرمز
                        } else {
                            answer = match[1]; // الجزء قبل الرمز
                        }
                        
                        console.log(`✅ فخ الاتجاهات: الاتجاه [${direction}]، الإجابة [${answer}]`);
                        await service.messaging.sendGroupMessage(message.targetGroupId, `#${answer}`);
                    }
                }
            }
        }
    } catch (err) {
        console.error("خطأ في معالجة الفخ:", err);
    }
});

// --- قسم المهام الدورية ---
service.on('ready', async () => {
    console.log(`🚀 البوت نشط: نظام الفخاخ المتكامل (بما فيها الاتجاهات) مفعل.`);
    // ... بقية كود المهام الدورية ...
});

service.login(settings.identity, settings.secret);
