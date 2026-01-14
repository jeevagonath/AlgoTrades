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
}
