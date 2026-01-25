import fastify from 'fastify';
process.env.TZ = 'Asia/Kolkata';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { FastifyInstance } from 'fastify';

import { authRoutes } from './routes/auth.routes';
import { strategyRoutes } from './routes/strategy.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { proxyRoutes } from './routes/proxy.routes';
import { strategyEngine } from './services/strategy.engine';

const app: FastifyInstance = fastify({ logger: true });

// Setup CORS
app.register(cors, {
    origin: (origin, cb) => {
        // Allow all origins for debugging, or you can restrict to Vercel here
        cb(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true,
});

// Global Error Handler
app.setErrorHandler((error: any, request, reply) => {
    app.log.error(error);
    reply.status(500).send({
        status: 'error',
        message: 'Internal Server Error',
        detail: error.message
    });
});

// Setup Routes
app.register(authRoutes, { prefix: '/api/auth' });
app.register(strategyRoutes, { prefix: '/api/strategy' });
app.register(analyticsRoutes, { prefix: '/api/analytics' });
app.register(proxyRoutes); // No prefix, already has /api/proxy in route

app.get('/health', async (request, reply) => {
    return { status: 'active', timestamp: new Date(), uptime: process.uptime() };
});

const PORT = Number(process.env.PORT) || 3001;

const start = async () => {
    try {
        console.log(`[System] Starting server on port ${PORT}...`);

        await app.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`[System] HTTP Server is listening at 0.0.0.0:${PORT}`);

        // Initialize Socket.io after server is listening
        const io = new Server(app.server, {
            cors: {
                origin: "*",
            }
        });

        import('./services/socket.service').then(({ socketService }) => {
            socketService.init(io);
            console.log('[System] SocketService initialized');
        }).catch(err => {
            console.error('[System] Failed to init SocketService:', err);
        });

        io.on('connection', (socket) => {
            socket.on('subscribe', (tokens: string[]) => {
                if (Array.isArray(tokens) && tokens.length > 0) {
                    import('./services/shoonya.service').then(({ shoonya }) => {
                        const formattedTokens = tokens.map(t => {
                            return (t === '26000' || t === '26009' || t === '26017') ? `NSE|${t}` : `NFO|${t}`;
                        });
                        shoonya.subscribe(formattedTokens);
                    });
                }
            });
        });

        // Resume any active strategy
        console.log('[System] Resuming strategy engine...');
        strategyEngine.resume();

    } catch (err) {
        console.error('[System] FATAL: Failed to start server:', err);
        app.log.error(err);
        process.exit(1);
    }
};

start();
