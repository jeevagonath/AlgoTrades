import { FastifyInstance } from 'fastify';
import { strategyEngine } from '../services/strategy.engine';
import { db } from '../services/supabase.service';
import { shoonya } from '../services/shoonya.service';


export async function strategyRoutes(app: FastifyInstance) {
    app.get('/expiries', async (request, reply) => {
        try {
            const expiries = await strategyEngine.getAvailableExpiries();
            return { status: 'success', data: expiries };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/test-selection', async (request, reply) => {
        try {
            const { expiry } = request.body as { expiry: string };
            const strikes = await strategyEngine.selectStrikes(expiry);
            return { status: 'success', data: strikes };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/mock-expiry', async (request, reply) => {
        try {
            const { date } = request.body as { date: string | null };
            await strategyEngine.setTestDate(date);
            return { status: 'success', message: `Mock date set to ${date || 'current'}` };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/place-order', async (request, reply) => {
        try {
            await strategyEngine.placeOrder();
            return { status: 'success' };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.get('/state', async (request, reply) => {
        return { status: 'success', data: strategyEngine.getState() };
    });

    app.get('/logs', async (request, reply) => {
        try {
            const logs = await db.getLogs();
            return { status: 'success', data: logs };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/settings', async (request, reply) => {
        try {
            const settings = request.body as any;
            await strategyEngine.updateSettings(settings);
            return { status: 'success' };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/manual-expiries', async (request, reply) => {
        try {
            const { expiries } = request.body as { expiries: string[] };

            if (!expiries || !Array.isArray(expiries)) {
                return reply.status(400).send({ status: 'error', message: 'Invalid expiries format' });
            }

            const result = await db.saveManualExpiries(expiries);

            if (result.success) {
                return { status: 'success', message: `Saved ${expiries.length} expiry dates` };
            } else {
                return reply.status(500).send({ status: 'error', message: 'Failed to save expiries' });
            }
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.get('/manual-expiries', async (request, reply) => {
        try {
            const expiries = await db.getManualExpiries();
            return { status: 'success', data: expiries };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.get('/nifty-spot', async (request, reply) => {
        try {
            const { shoonya } = await import('../services/shoonya.service');

            if (!shoonya.isLoggedIn()) {
                return reply.status(401).send({ status: 'error', message: 'Not logged in' });
            }

            const quote: any = await shoonya.getQuotes('NSE', '26000');

            if (quote && quote.lp) {
                const price = parseFloat(quote.lp);
                // Shoonya 'c' is usually Previous Close Price. 'pc' is Percentage Change.
                // If 'c' is missing, try to infer from 'pc'.
                let prevClose = 0;
                if (quote.c) {
                    prevClose = parseFloat(quote.c);
                } else if (quote.pc) {
                    prevClose = price / (1 + parseFloat(quote.pc) / 100);
                } else {
                    prevClose = price; // Fallback
                }

                const change = price - prevClose;
                const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

                return {
                    status: 'success',
                    data: {
                        price,
                        change,
                        changePercent,
                        prevClose
                    }
                };
            }

            return reply.status(500).send({ status: 'error', message: 'Failed to fetch NIFTY price' });
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });


    app.get('/orders', async (request, reply) => {
        try {
            const state = strategyEngine.getState();
            if (state.isVirtual) {
                const orders = await db.getOrders();
                return { status: 'success', data: orders };
            } else {
                const rawOrders: any = await shoonya.getOrderBook();
                const orders = Array.isArray(rawOrders) ? rawOrders.map((o: any) => {
                    let isoTime = new Date().toISOString();
                    if (o.norentm) {
                        try {
                            // "14:30:21 07-01-2025"
                            const [time, date] = o.norentm.split(' ');
                            if (time && date) {
                                const [d, mon, y] = date.split('-');
                                isoTime = new Date(`${y}-${mon}-${d}T${time}`).toISOString();
                            }
                        } catch (e) { console.error('Date parse error', e); }
                    }
                    return {
                        symbol: o.tsym,
                        side: o.trantype === 'B' ? 'BUY' : 'SELL',
                        price: o.avgprc || o.prc,
                        quantity: o.qty,
                        status: o.status,
                        created_at: isoTime
                    };
                }) : [];

                orders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                return { status: 'success', data: orders };
            }
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/exit', async (request, reply) => {
        try {
            await strategyEngine.manualExit();
            return { status: 'success', message: 'Manual exit triggered' };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/pause', async (request, reply) => {
        try {
            await strategyEngine.pause();
            return { status: 'success', message: 'Strategy paused' };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/resume', async (request, reply) => {
        try {
            await strategyEngine.resumeMonitoring();
            return { status: 'success', message: 'Strategy resumed' };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    // Test Routes
    app.post('/test/place-order', async (request, reply) => {
        try {
            const result = await strategyEngine.testPlaceOrder();
            return result;
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/test/exit-order', async (request, reply) => {
        try {
            const result = await strategyEngine.testExitOrder();
            return result;
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });
}

