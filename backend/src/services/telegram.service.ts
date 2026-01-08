import axios from 'axios';
import { db } from './supabase.service';

class TelegramService {
    private token: string = '';
    private chatId: string = '';

    setCredentials(token: string, chatId: string) {
        this.token = token;
        this.chatId = chatId;
    }

    private parseAlert(message: string): { type: string, severity: string, title: string, icon: string } {
        // Extract title from <b>...</b> tags
        const titleMatch = message.match(/<b>(.*?)<\/b>/);
        const title = titleMatch ? titleMatch[1] : 'Notification';

        // Determine type and severity based on keywords
        let type = 'INFO';
        let severity = 'INFO';
        let icon = '📢';

        if (message.includes('Expiry')) {
            type = 'EXPIRY';
            icon = '🔔';
            severity = 'INFO';
        } else if (message.includes('Strike')) {
            type = 'STRIKE';
            icon = '🎯';
            severity = 'SUCCESS';
        } else if (message.includes('Margin')) {
            type = 'MARGIN';
            icon = message.includes('Shortfall') ? '🚨' : '💰';
            severity = message.includes('Shortfall') ? 'ERROR' : 'WARNING';
        } else if (message.includes('Trade') || message.includes('Order')) {
            type = 'TRADE';
            icon = message.includes('Failed') ? '❌' : '✅';
            severity = message.includes('Failed') ? 'ERROR' : 'SUCCESS';
        } else if (message.includes('Adjustment')) {
            type = 'ADJUSTMENT';
            icon = '⚙️';
            severity = 'WARNING';
        } else if (message.includes('Paused') || message.includes('Resumed') || message.includes('Closed') || message.includes('Kill')) {
            type = 'CONTROL';
            icon = message.includes('Kill') ? '🛑' : message.includes('Closed') ? '🏁' : message.includes('Paused') ? '⏸️' : '▶️';
            severity = message.includes('Kill') || message.includes('Closed') ? 'WARNING' : 'INFO';
        }

        return { type, severity, title, icon };
    }

    async sendMessage(message: string) {
        if (!this.token || !this.chatId) {
            console.warn('[Telegram] Credentials not set. Skipping message.');
            return;
        }

        try {
            // Parse and save alert to database
            const alertMeta = this.parseAlert(message);
            const alertData = {
                type: alertMeta.type,
                severity: alertMeta.severity,
                title: alertMeta.title,
                message: message.replace(/<\/?b>/g, ''), // Remove HTML tags for storage
                icon: alertMeta.icon
            };

            await db.saveAlert(alertData);

            // Emit real-time alert to connected clients
            import('./socket.service').then(({ socketService }) => {
                socketService.emit('new_alert', {
                    ...alertData,
                    created_at: new Date().toISOString()
                });
            }).catch(() => { });

            // Send to Telegram
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
