import 'dotenv/config';
import wolfjs from 'wolf.js';
const { WOLF } = wolfjs;

const settings = {
    // تأكد من تغيير هذه القيم في ملف .env الخاص بك
    identity: process.env.U_MAIL_2 || 'your_second_email@example.com',
    secret: process.env.U_PASS_2 || 'your_second_password',
    taskGroupId: 330865,
    depositGroupId: 224,
    minuteInterval: 63 * 1000,
    boxInterval: 3 * 60 * 1000
};

const MY_INFO = {
    // استخدمنا جزءاً من الرمز لضمان الرصد الصحيح
    keyword: "🐈",  
    ownerId: "2481425"  
};

let canOpenBoxes = true; 
let isPaused = false; 
let lastBoxCommandTime = 0; 
let lastRoutineCommandTime = 0; 

const numToWord = {'0':'صفر','1':'واحد','2':'اثنان','3':'ثلاثة','4':'أربعة','5':'خمسة','6':'ستة','7':'سبعة','8':'ثمانية','9':'تسعة','10':'عشرة'};
const wordToNum = {'صفر':'0','واحد':'1','اثنان':'2','ثلاثة':'3','أربعة':'4','خمسة':'5','ستة':'6','سبعة':'7','ثمانية':'8','تسعة':'9','عشرة':'10'};

const service = new WOLF();

const sendRoutineCommands = async () => {
    if (isPaused) return;
    try {
        lastRoutineCommandTime = Date.now();
        await service.messaging.sendGroupMessage(settings.taskGroupId, "!مد مهام");
        setTimeout(async () => {
            if (!isPaused) {
                lastRoutineCommandTime = Date.now(); 
                await service.messaging.sendGroupMessage(settings.depositGroupId, "!مد تحالف ايداع كل");
            }
        }, 3000);
    } catch (e) {}
};

service.on('groupMessage', async (message) => {
    try {
        const isTargetGroup = message.targetGroupId === settings.taskGroupId || message.targetGroupId === settings.depositGroupId;
        if (!isTargetGroup) return;

        const content = message.body;
        const isMe = message.subscriberId === service.currentSubscriber.id;

        // --- ميزة التجاهل القطعي لـ فزآعنا ---
        if (content.includes("فزآعنا")) return;

        // 1. التوقف الإنتاجي (يتفاعل مع 🐈)
        if (content.includes("تم إيقاف الأوامر الإنتاجية مؤقتًا") && content.includes(MY_INFO.keyword)) {
            const match = content.match(/\d+/); 
            if (match) {
                isPaused = true;
                console.log(`⚠️ توقف إنتاجي لـ ${MY_INFO.keyword} لمدة ${match[0]} دقيقة.`);
                setTimeout(() => { isPaused = false; }, parseInt(match[0]) * 60 * 1000);
            }
            return;
        }

        // 2. إيقاف الصناديق لنفاذ المفاتيح
        if (content.includes("لا تملك مفاتيح!") && message.targetGroupId === settings.taskGroupId) {
            if (Date.now() - lastBoxCommandTime < 5000) {
                canOpenBoxes = false;
                console.log("🚫 توقفت الصناديق لهذا الحساب.");
            }
            return;
        }

        // 3. نظام الأولوية للحل
        const isTrap = content.includes("لأنك لاعب مجتهد جدًا اليوم") || content.includes("سؤال التحقق الخاص بك هو");
        const isSafetyAlert = content.includes("يوجد سؤال تحقق نشط");

        if ((isTrap && content.includes(MY_INFO.keyword)) || isSafetyAlert) {
            
            // التحقق المقيد بـ 5 ثوانٍ لضمان التبعية للحساب الحالي
            if (isSafetyAlert) {
                const now = Date.now();
                if ((now - lastRoutineCommandTime <= 5500) || (now - lastBoxCommandTime <= 5500)) {
                    await service.messaging.sendGroupMessage(message.targetGroupId, "!مد فحص");
                }
                return;
            }

            let answer = null;
            // --- محرك الحل الكامل ---
            if (content.includes('عضوية')) answer = MY_INFO.ownerId;
            else if (content.includes('بالكلمات') || content.includes('بالحروف')) {
                const match = content.match(/\d+/);
                if (match && numToWord[match[0]]) answer = numToWord[match[0]];
            }
            else if (content.includes('بالأرقام')) {
                for (let word in wordToNum) { if (content.includes(word)) { answer = wordToNum[word]; break; } }
            }
            else if (content.includes('اكتب') && (content.includes('كما هي'))) {
                const match = content.match(/:\s*(\S+)/) || content.match(/هي\s+(\S+)/);
                if (match) answer = match[1];
            }
            else if (content.includes('صح أم خطأ') || content.includes('التحالف')) answer = "صح";
            else if (content.includes('أيهما')) {
                const nums = content.match(/\d+/g);
                if (nums && nums.length >= 2) {
                    const n1 = parseInt(nums[0]), n2 = parseInt(nums[1]);
                    answer = (content.includes('أكبر')) ? Math.max(n1, n2) : Math.min(n1, n2);
                }
            }
            else if (content.includes('ناتج') || content.includes('+') || content.includes('-')) {
                const nums = content.match(/\d+/g);
                if (nums && nums.length >= 2) {
                    const n1 = parseInt(nums[0]), n2 = parseInt(nums[1]);
                    answer = (content.includes('-')) ? n1 - n2 : n1 + n2;
                }
            }

            if (answer !== null) {
                setTimeout(async () => {
                    await service.messaging.sendGroupMessage(message.targetGroupId, `!${answer}`);
                    setTimeout(() => sendRoutineCommands(), 2000);
                }, 5000);
            }
        }
    } catch (err) {}
});

service.on('ready', async () => {
    console.log(`🚀 بوت الحساب (🐈) جاهز الآن.`);
    try {
        await service.group.joinById(settings.taskGroupId);
        await service.group.joinById(settings.depositGroupId);
        sendRoutineCommands();
        setInterval(() => sendRoutineCommands(), settings.minuteInterval);
        setInterval(() => {
            if (canOpenBoxes && !isPaused) {
                lastBoxCommandTime = Date.now();
                service.messaging.sendGroupMessage(settings.taskGroupId, "!مد صندوق فتح");
            }
        }, settings.boxInterval);
    } catch (e) {}
});

service.login(settings.identity, settings.secret);
