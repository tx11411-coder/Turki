import wolfjs from 'wolf.js';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import Jimp from 'jimp';

const { WOLF } = wolfjs;
const service = new WOLF();

// إعدادات البوت
const CONFIG = {
    MONITOR_GROUP: 81889058, // الروم الذي تراقب فيه
    RESULT_ROOM: 9969        // الروم الذي ترسل فيه الحل
};

// وظيفة معالجة الصورة الذكية
async function solveCaptcha(imageUrl) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const image = await Jimp.read(response.data);

        // 1. حساب عرض كل بطاقة (الصورة مكونة من 6 بطاقات)
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const blockWidth = Math.floor(width / 6); 

        // 2. البحث عن البطاقة الأغمق (التي تحتوي على الإطار المتقطع)
        let darkestBlockIndex = 0;
        let lowestBrightness = 255;
        
        for (let i = 0; i < 6; i++) {
            const currentBlock = image.clone().crop(i * blockWidth, 0, blockWidth, height);
            let currentBrightness = 0;
            currentBlock.scan(0, 0, currentBlock.bitmap.width, currentBlock.bitmap.height, function(x, y, idx) {
                currentBrightness += (this.bitmap.data[idx] + this.bitmap.data[idx+1] + this.bitmap.data[idx+2]) / 3;
            });
            currentBrightness = currentBrightness / (currentBlock.bitmap.width * currentBlock.bitmap.height);
            
            if (currentBrightness < lowestBrightness) {
                lowestBrightness = currentBrightness;
                darkestBlockIndex = i;
            }
        }

        // 3. قص البطاقة الأغمق فقط
        const finalBlock = image.crop(darkestBlockIndex * blockWidth, 0, blockWidth, height);
        
        // 4. تصفية الصورة: تحويلها لأبيض وأسود لإزالة الضجيج والحدود
        await finalBlock.greyscale().threshold({ max: 120, replace: 255 }); 
        const buffer = await finalBlock.getBufferAsync(Jimp.MIME_PNG);

        // 5. القراءة مع قائمة حروف مسموحة فقط (لتجنب الرموز الغريبة)
        const { data: { text } } = await Tesseract.recognize(buffer, 'ara+eng', {
            tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZابتثجحخدذرزسشصضطظعغفقكلمنهوي',
            tessedit_pageseg_mode: '8' 
        });

        // 6. التنظيف النهائي وإزالة أي شيء غير الحروف والأرقام
        return text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').trim();
        
    } catch (err) {
        console.error("❌ خطأ في المعالجة:", err.message);
        return null;
    }
}

// 1. المهام الدورية
service.on('ready', () => {
    console.log("🚀 البوت يعمل الآن!");
    setInterval(async () => {
        try {
            await service.messaging.sendGroupMessage(CONFIG.MONITOR_GROUP, "!مد مهام");
            setTimeout(async () => {
                await service.messaging.sendGroupMessage(CONFIG.MONITOR_GROUP, "!مد تحالف ايداع كل");
            }, 2000);
        } catch (err) { console.error("خطأ في المهام الدورية"); }
    }, 60000);
});

// 2. مراقبة الصور (من أي عضو)
service.on('groupMessage', async (message) => {
    if (message.targetGroupId !== CONFIG.MONITOR_GROUP) return;

    let imageUrl = null;
    if (message.attachments && message.attachments.length > 0) imageUrl = message.attachments[0].link;
    else if (message.body && message.body.match(/\.(jpg|jpeg|png)$/)) imageUrl = message.body;

    if (imageUrl) {
        console.log("📸 تم اكتشاف صورة، جاري الحل...");
        const result = await solveCaptcha(imageUrl);
        
        if (result && result.length > 0) {
            console.log(`🔑 الحل النهائي: ${result}`);
            await service.messaging.sendGroupMessage(CONFIG.RESULT_ROOM, `# ${result}`);
        }
    }
});

service.login(process.env.U_MAIL, process.env.U_PASS);
