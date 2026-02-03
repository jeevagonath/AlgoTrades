import { io, Socket } from 'socket.io-client';

export interface SocketStatus {
    connected: boolean;
    subscribedCount: number;
}

class SocketService {
    private socket: Socket | null = null;
    private isConnected: boolean = false;
    private activeSubscriptions: Set<string> = new Set();
    private statusListeners: ((status: SocketStatus) => void)[] = [];

    connect(url: string = import.meta.env.VITE_SOCKET_URL || 'https://algotradesservice.onrender.com/') {
        if (this.socket) return;

        console.log('[Socket] Connecting to:', url);
        this.socket = io(url, {
            transports: ['websocket']
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.notifyStatusListeners();
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.notifyStatusListeners();
        });

        this.socket.on('connect_error', () => {
            this.isConnected = false;
            this.notifyStatusListeners();
        });
    }

    private notifyStatusListeners() {
        const status: SocketStatus = {
            connected: this.isConnected,
            subscribedCount: this.activeSubscriptions.size
        };
        this.statusListeners.forEach(listener => listener(status));
    }

    onStatusUpdate(callback: (status: SocketStatus) => void) {
        this.statusListeners.push(callback);
        // Initial call
        callback({
            connected: this.isConnected,
            subscribedCount: this.activeSubscriptions.size
        });
        return () => {
            this.statusListeners = this.statusListeners.filter(l => l !== callback);
        };
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
        tokens.forEach(t => this.activeSubscriptions.add(t));
        this.socket?.emit('subscribe', tokens);
        this.notifyStatusListeners();
    }

    unsubscribe(tokens: string[]) {
        tokens.forEach(t => this.activeSubscriptions.delete(t));
        this.socket?.emit('unsubscribe', tokens);
        this.notifyStatusListeners();
    }
}

export const socketService = new SocketService();
