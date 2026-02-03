import { io, Socket } from 'socket.io-client';

export interface SocketStatus {
    connected: boolean;
    subscribedCount: number;
}

class SocketService {
    private socket: Socket;
    private isConnected: boolean = false;
    private activeSubscriptions: Set<string> = new Set();
    private statusListeners: ((status: SocketStatus) => void)[] = [];

    constructor() {
        const url = import.meta.env.VITE_SOCKET_URL || 'https://algotradesservice.onrender.com/'
        console.log('[Socket] Initializing socket with:', url);
        this.socket = io(url, {
            transports: ['websocket'],
            autoConnect: false
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected');
            this.isConnected = true;
            this.notifyStatusListeners();
            // Resubscribe to active subscriptions on reconnect
            if (this.activeSubscriptions.size > 0) {
                this.socket.emit('subscribe', Array.from(this.activeSubscriptions));
            }
        });

        this.socket.on('disconnect', () => {
            console.log('[Socket] Disconnected');
            this.isConnected = false;
            this.notifyStatusListeners();
        });

        this.socket.on('connect_error', (err) => {
            console.log('[Socket] Connect Error:', err);
            this.isConnected = false;
            this.notifyStatusListeners();
        });
    }

    connect(url?: string) {
        if (!this.socket.connected) {
            console.log('[Socket] Connecting...');
            this.socket.connect();
        }
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
        this.socket.on(event, callback);
    }

    off(event: string, callback?: (data: any) => void) {
        if (callback) {
            this.socket.off(event, callback);
        } else {
            this.socket.off(event);
        }
    }

    emit(event: string, data: any) {
        this.socket.emit(event, data);
    }

    subscribe(tokens: string[]) {
        tokens.forEach(t => this.activeSubscriptions.add(t));
        this.socket.emit('subscribe', tokens);
        this.notifyStatusListeners();
    }

    unsubscribe(tokens: string[]) {
        tokens.forEach(t => this.activeSubscriptions.delete(t));
        this.socket.emit('unsubscribe', tokens);
        this.notifyStatusListeners();
    }
}

export const socketService = new SocketService();
