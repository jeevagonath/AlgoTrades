import axios from 'axios';

class TelegramService {
    private token: string = '';
    private chatId: string = '';

    setCredentials(token: string, chatId: string) {
        this.token = token;
        this.chatId = chatId;
    }

    async sendMessage(message: string) {
        if (!this.token || !this.chatId) {
            console.warn('[Telegram] Credentials not set. Skipping message.');
            return;
        }

        try {
            const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
            await axios.post(url, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            });
            //console.log('[Telegram] Message sent successfully');
        } catch (error: any) {
            console.error('[Telegram] Failed to send message:', error.response?.data || error.message);
        }
    }
}

export const telegramService = new TelegramService();
