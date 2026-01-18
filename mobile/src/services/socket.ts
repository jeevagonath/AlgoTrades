import { io, Socket } from 'socket.io-client';
import { notificationService } from './notification.service';

class SocketService {
    private socket: Socket | null = null;

    connect(url: string = 'https://algotradesservice.onrender.com/') {
        if (this.socket) return;

        this.socket = io(url, {
            transports: ['websocket']
        });

        this.socket.on('connect', () => {
            //console.log('Connected to socket server');
        });

        this.socket.on('disconnect', () => {
            //console.log('Disconnected from socket server');
        });

        this.socket.on('connect_error', (error) => {
            //console.error('Socket connection error:', error);
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

            // Automatically show notification
            notificationService.showNotification(alert).catch(err => {
                console.error('Failed to show notification:', err);
            });
        });
    }
}

export const socketService = new SocketService();
