import { Server } from 'socket.io';

class SocketService {
    private io: Server | null = null;

    init(io: Server) {
        this.io = io;
        //console.log('SocketService initialized with IO');
    }

    emit(event: string, data: any) {
        if (this.io) {
            // console.log('[SocketService Debug] Emitting:', event); // Too noisy for production, useful for deep debug
            if (event === 'tick' && data.tk === '26000') {
                console.log('[SocketDebug] Sending Nifty Tick:', data.lp);
            }
            this.io.emit(event, data);
        }
    }

    getIO() {
        return this.io;
    }
}

export const socketService = new SocketService();
