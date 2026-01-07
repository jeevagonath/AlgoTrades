import { Server } from 'socket.io';

class SocketService {
    private io: Server | null = null;

    init(io: Server) {
        this.io = io;
        //console.log('SocketService initialized with IO');
    }

    emit(event: string, data: any) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }

    getIO() {
        return this.io;
    }
}

export const socketService = new SocketService();
