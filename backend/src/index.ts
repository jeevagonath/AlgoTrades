import fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { FastifyInstance } from 'fastify';

import { authRoutes } from './routes/auth.routes';
import { strategyRoutes } from './routes/strategy.routes';
import { strategyEngine } from './services/strategy.engine';

const app: FastifyInstance = fastify({ logger: true });

// Setup CORS
app.register(cors, {
    origin: true,
});

// Setup Routes
app.register(authRoutes, { prefix: '/api/auth' });
app.register(strategyRoutes, { prefix: '/api/strategy' });

app.get('/health', async (request, reply) => {
    return { status: 'active', timestamp: new Date(), uptime: process.uptime() };
});

const PORT = Number(process.env.PORT) || 3001;

const start = async () => {
    try {
        await app.listen({ port: PORT, host: '0.0.0.0' });

        // Initialize Socket.io after server is listening
        const io = new Server(app.server, {
            cors: {
                origin: "*",
            }
        });

        import('./services/socket.service').then(({ socketService }) => {
            socketService.init(io);
        });

        io.on('connection', (socket) => {
            //console.log('Client connected:', socket.id);
            socket.on('disconnect', () => {
                //console.log('Client disconnected:', socket.id);
            });
        });

        //console.log(`Server is listening on port ${PORT}`);

        // Resume any active strategy
        strategyEngine.resume();
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
