import { FastifyInstance } from 'fastify';
import { db } from '../services/supabase.service';

export async function analyticsRoutes(app: FastifyInstance) {
    // Get trade history with filters
    app.get('/trade-history', async (request, reply) => {
        try {
            const { startDate, endDate, isVirtual } = request.query as {
                startDate?: string;
                endDate?: string;
                isVirtual?: string;
            };

            const filters = {
                startDate,
                endDate,
                isVirtual: isVirtual === 'true' ? true : isVirtual === 'false' ? false : undefined
            };

            const data = await db.getTradeHistory(filters);
            return { status: 'success', data };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    // Get daily P&L aggregated data for calendar heatmap
    app.get('/daily-pnl', async (request, reply) => {
        try {
            const { startDate, endDate, isVirtual } = request.query as {
                startDate?: string;
                endDate?: string;
                isVirtual?: string;
            };

            const filters = {
                startDate,
                endDate,
                isVirtual: isVirtual === 'true' ? true : isVirtual === 'false' ? false : undefined
            };

            const data = await db.getDailyPnL(filters);
            return { status: 'success', data };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    // Get P&L summary metrics
    app.get('/summary', async (request, reply) => {
        try {
            const { startDate, endDate, isVirtual } = request.query as {
                startDate?: string;
                endDate?: string;
                isVirtual?: string;
            };

            const filters = {
                startDate,
                endDate,
                isVirtual: isVirtual === 'true' ? true : isVirtual === 'false' ? false : undefined
            };

            const data = await db.getPnLSummary(filters);
            return { status: 'success', data };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    // Get positions by trade ID
    app.get('/trade-positions/:tradeId', async (request, reply) => {
        try {
            const { tradeId } = request.params as { tradeId: string };
            const data = await db.getPositionsByTradeId(tradeId);
            return { status: 'success', data };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    // Get intraday P&L for chart
    app.get('/intraday-pnl', async (request, reply) => {
        try {
            // Note: In a real multi-user system, we'd get UID from auth token/session
            // For now, we fetch ALL or specific user if passed, but typically we want the current strategy's view
            // strategy.engine.ts logs with the UID found in session.
            // We can try to fetch for the main user or just return all for today if single user.
            // Let's assume we pass a query param or fetch all.
            // For simplicity, we'll fetch all snapshots for today (or filter by implicit single user if we had one).
            // Better: Get the UID from the request query or default to fetching all
            const { uid } = request.query as { uid?: string };
            const data = await db.getIntradayPnl(uid);
            return { status: 'success', data };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });
}
