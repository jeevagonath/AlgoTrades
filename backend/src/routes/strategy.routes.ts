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

    app.post('/activity', async (request, reply) => {
        try {
            const { activity } = request.body as { activity: string };
            if (activity === undefined) throw new Error('Activity is required');
            await strategyEngine.setEngineActivity(activity);
            return { status: 'success' };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.post('/status', async (request, reply) => {
        try {
            const { status } = request.body as { status: any };
            if (!status) throw new Error('Status is required');
            await strategyEngine.setStatus(status);
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
            //console.log('[Routes] GET /orders - Fetching state...');
            const state = strategyEngine.getState();

            if (state.isVirtual) {
                //console.log('[Routes] GET /orders - Mode: VIRTUAL. Fetching from DB...');
                const orders = await db.getOrders();
                //console.log(`[Routes] GET /orders - Found ${orders.length} virtual orders.`);
                return { status: 'success', data: orders };
            } else {
                //console.log('[Routes] GET /orders - Mode: LIVE. Fetching from Shoonya...');
                const rawOrders: any = await shoonya.getOrderBook();

                if (!rawOrders || !Array.isArray(rawOrders)) {
                    //console.log('[Routes] GET /orders - Shoonya returned no orders or non-array data.');
                    return { status: 'success', data: [] };
                }

                //console.log(`[Routes] GET /orders - Processing ${rawOrders.length} Shoonya orders...`);
                const orders = rawOrders.map((o: any) => {
                    let isoTime = new Date().toISOString();

                    if (o.norentm) {
                        try {
                            // Expected: "HH:mm:ss DD-MM-YYYY"
                            const parts = o.norentm.split(' ');
                            if (parts.length === 2) {
                                const [time, datePart] = parts;
                                const dateParts = datePart.split('-');
                                if (dateParts.length === 3) {
                                    const [d, mon, y] = dateParts;
                                    const dateObj = new Date(`${y}-${mon}-${d}T${time}`);
                                    if (!isNaN(dateObj.getTime())) {
                                        isoTime = dateObj.toISOString();
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('[Routes] Date parse error for:', o.norentm, e);
                        }
                    }

                    return {
                        symbol: o.tsym || 'Unknown',
                        side: o.trantype === 'B' ? 'BUY' : 'SELL',
                        price: o.avgprc || o.prc || 0,
                        quantity: o.qty || 0,
                        status: o.status || 'Unknown',
                        created_at: isoTime
                    };
                });

                //console.log('[Routes] GET /orders - Sorting orders...');
                orders.sort((a: any, b: any) => {
                    const timeA = new Date(a.created_at).getTime();
                    const timeB = new Date(b.created_at).getTime();
                    return (timeB || 0) - (timeA || 0);
                });

                //console.log('[Routes] GET /orders - Success.');
                return { status: 'success', data: orders };
            }
        } catch (err: any) {
            console.error('[Routes] FATAL Error in /orders:', err);
            return reply.status(500).send({
                status: 'error',
                message: 'Failed to fetch orders',
                detail: err.message
            });
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

    app.post('/reset', async (request, reply) => {
        try {
            await strategyEngine.resetEngine();
            return { status: 'success', message: 'Engine reset to IDLE' };
        } catch (err: any) {
            return reply.status(400).send({ status: 'error', message: err.message });
        }
    });

    app.get('/alerts', async (request, reply) => {
        try {
            const alerts = await db.getAlerts();
            return { status: 'success', data: alerts };
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

