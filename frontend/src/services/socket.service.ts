import { io, Socket } from 'socket.io-client';

class SocketService {
    private socket: Socket | null = null;
    //'https://algotradesservice.onrender.com/') {//
    connect(url: string = 'http://localhost:3001') {
        this.socket = io(url);

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

    emit(event: string, data: any) {
        this.socket?.emit(event, data);
    }

    subscribe(tokens: string[]) {
        this.socket?.emit('subscribe', tokens);
    }
}

export const socketService = new SocketService();
