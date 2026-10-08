export interface TelegramConfig {
    botToken?: string;
    defaultChatId?: string; // e.g. -1001234567890 for groups or user chat ID
    enabled?: boolean;
}

/**
 * Sends a Telegram notification using Telegram Bot API
 * @param config Telegram configuration (botToken, defaultChatId, enabled)
 * @param chatId Target chat ID (group ID, channel ID, or student chat ID). Fallbacks to defaultChatId if not specified.
 * @param text The message text (HTML formatted)
 */
export async function sendTelegramNotification(
    config: TelegramConfig | undefined,
    chatId: string | undefined,
    text: string
): Promise<{ success: boolean; error?: string }> {
    if (!config || !config.enabled || !config.botToken?.trim()) {
        return { success: false, error: 'خدمة التليكرام غير مفعلة أو لم يتم إدخال رمز البوت (Bot Token)' };
    }

    let targetChatId = (chatId && chatId.trim()) ? chatId.trim() : (config.defaultChatId && config.defaultChatId.trim());
    if (!targetChatId) {
        return { success: false, error: 'لم يتم تحديد معرف القناة/المجموعة أو معرف الطالب (Chat ID)' };
    }

    // Check if input is an Iraqi or international phone number (e.g. 07701234567 or +9647701234567)
    const cleanPhone = targetChatId.replace(/[\s\-\(\)]/g, '');
    const isPhoneNumber = /^(\+?964|0)?7[3-9]\d{8}$/.test(cleanPhone);

    if (isPhoneNumber) {
        return {
            success: false,
            error: `تم إدخال رقم هاتف (${targetChatId}). سياسة شركة تليكرام تمنع الإرسال بالرقم المباشر حماية للخصوصية، وتتطلب إدخال الـ (Chat ID العددي) المكون من أرقام فقط (مثل: 589123456).\n\nيمكن للطالب الحصول على الـ Chat ID الخاص به بسهولة بثوانٍ عبر فتح البوت @userinfobot في التليكرام وإرسال /start له.`
        };
    }

    // Check if targetChatId is a username (starts with @ and not a channel/group or numeric)
    const isUsername = targetChatId.startsWith('@') || (!targetChatId.startsWith('-') && !/^\d+$/.test(targetChatId));

    // Auto-fix username format if entered with trailing @ or without leading @ for alpha usernames
    if (!targetChatId.startsWith('-') && !/^\d+$/.test(targetChatId)) {
        // Strip trailing @
        targetChatId = targetChatId.replace(/@$/, '');
        // Ensure leading @ for usernames
        if (!targetChatId.startsWith('@')) {
            targetChatId = `@${targetChatId}`;
        }
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${config.botToken.trim()}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: text,
                parse_mode: 'HTML',
            }),
        });

        const data = await response.json();
        if (data.ok) {
            return { success: true };
        } else {
            let errorMsg = String(data.description || 'فشل إرسال الرسالة عبر التليكرام');
            if (isUsername && (errorMsg.includes('chat not found') || errorMsg.includes('user not found'))) {
                errorMsg = `تنبيه من التليكرام: لا يسمح التليكرام للبوتات بإرسال رسائل خاصة باليوزرنيم (${targetChatId}). يجب استخدام الآيدي العددي للطالب (مثل 589123456). يمكنك الحصول عليه بإرسال /start لبوت @userinfobot في التليكرام.`;
            } else if (errorMsg.includes('chat not found')) {
                errorMsg = 'لم يتم العثور على الشات. تأكد من إدخال الآيدي العددي الصحيح وأن الطالب قام بالضغط على /start للبوت أولاً.';
            } else if (errorMsg.includes('bot was blocked by the user')) {
                errorMsg = 'قام الطالب بحظر البوت في التليكرام.';
            }
            return { 
                success: false, 
                error: errorMsg
            };
        }
    } catch (err: any) {
        console.error('Telegram notification error:', err);
        return { success: false, error: err?.message || 'خطأ في الاتصال بالشبكة' };
    }
}
