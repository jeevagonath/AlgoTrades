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
    private dailyUnsubscribeTimer: number | null = null;

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

        this.setupDailyUnsubscribe();
    }

    private clearDailyUnsubscribeTimer() {
        if (this.dailyUnsubscribeTimer !== null) {
            clearTimeout(this.dailyUnsubscribeTimer);
            this.dailyUnsubscribeTimer = null;
        }
    }

    private unsubscribeAt4pm() {
        if (this.activeSubscriptions.size === 0) return;
        const tokens = Array.from(this.activeSubscriptions);
        console.log('[Socket] Auto-unsubscribe at 4pm for tokens:', tokens);
        this.socket.emit('unsubscribe', tokens);
        this.activeSubscriptions.clear();
        this.notifyStatusListeners();
    }

    private scheduleNextDailyUnsubscribe() {
        if (typeof window === 'undefined') return;
        const now = new Date();
        const next4pm = new Date(now);
        next4pm.setHours(16, 0, 0, 0);
        if (next4pm <= now) {
            next4pm.setDate(next4pm.getDate() + 1);
        }
        const delay = next4pm.getTime() - now.getTime();
        this.dailyUnsubscribeTimer = window.setTimeout(() => {
            this.unsubscribeAt4pm();
            this.scheduleNextDailyUnsubscribe();
        }, delay);
    }

    private setupDailyUnsubscribe() {
        if (typeof window === 'undefined') return;
        const now = new Date();
        if (now.getHours() >= 16) {
            this.unsubscribeAt4pm();
        }
        this.scheduleNextDailyUnsubscribe();
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
        if (!tokens || tokens.length === 0) return;
        tokens.forEach(t => this.activeSubscriptions.delete(t));
        this.socket.emit('unsubscribe', tokens);
        this.notifyStatusListeners();
    }

    unsubscribeAll() {
        const tokens = Array.from(this.activeSubscriptions);
        if (tokens.length === 0) return;
        this.activeSubscriptions.clear();
        this.socket.emit('unsubscribe', tokens);
        this.notifyStatusListeners();
    }

    disconnect() {
        this.unsubscribeAll();
        if (this.socket.connected) {
            this.socket.disconnect();
        }
        this.isConnected = false;
        this.notifyStatusListeners();
        this.clearDailyUnsubscribeTimer();
    }
}

export const socketService = new SocketService();
