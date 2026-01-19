import { io, Socket } from 'socket.io-client';
import { notificationService } from './notification.service';
import { widgetService } from './widget.service';


class SocketService {
    private socket: Socket | null = null;

    async connect(url: string = 'https://algotradesservice.onrender.com/') {
        if (this.socket) return;

        // Initialize notifications and start foreground service
        try {
            await notificationService.initialize();
            await notificationService.startForegroundService();
        } catch (err) {
            console.error('[SOCKET] Failed to start foreground service:', err);
        }

        this.socket = io(url, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
            console.log('[ALGO_NOTIF] Connected to socket server at', url);
        });

        this.socket.on('disconnect', () => {
            console.log('[ALGO_NOTIF] Disconnected from socket server');
        });

        this.socket.on('connect_error', (error) => {
            console.error('[ALGO_NOTIF] Socket connection error:', error);
        });
    }

    on(event: string, callback: (data: any) => void) {
        this.socket?.on(event, callback);
    }

    off(event: string, callback?: (data: any) => void) {
        if (callback) {
            this.socket?.off(event, callback);
        } else {
            this.socket?.off(event);
        }
    }

    emit(event: string, data: any) {
        this.socket?.emit(event, data);
    }

    subscribe(tokens: string[]) {
        this.socket?.emit('subscribe', tokens);
    }

    onAlert(callback: (data: any) => void) {
        this.socket?.on('new_alert', (alert) => {
            // Call the callback for any additional handling
            callback(alert);

            console.log('[ALGO_NOTIF] Received new_alert event:', alert);

            // Automatically show notification
            notificationService.displayAlert(alert).catch(err => {
                console.error('[ALGO_NOTIF] Failed to show notification from socket:', err);
            });
        });
    }
}

export const socketService = new SocketService();
