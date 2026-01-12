import { io, Socket } from 'socket.io-client';

class SocketService {
    private socket: Socket | null = null;
    connect(url: string = import.meta.env.VITE_SOCKET_URL || 'https://algotradesservice.onrender.com/') {
        this.socket = io(url, {
            transports: ['websocket']
        });

        this.socket.on('connect', () => {
            //console.log('Connected to server');
        });

        this.socket.on('disconnect', () => {
            //console.log('Disconnected from server');
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
}

export const socketService = new SocketService();
