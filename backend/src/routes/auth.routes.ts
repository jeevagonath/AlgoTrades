import { FastifyInstance } from 'fastify';
import { shoonya } from '../services/shoonya.service';
import axios from 'axios';

// Cache the public IP so we don't hit external services on every request
let cachedServerIp: string | null = null;

async function fetchPublicIp(): Promise<string> {
    if (cachedServerIp) return cachedServerIp;

    const services = [
        { url: 'https://api.ipify.org?format=json', type: 'json', path: 'ip' },
        { url: 'https://checkip.amazonaws.com/', type: 'text' },
        { url: 'https://ifconfig.me/ip', type: 'text' },
        { url: 'https://ipinfo.io/json', type: 'json', path: 'ip' },
        { url: 'https://ip.seeip.org/jsonip?', type: 'json', path: 'ip' },
    ];

    const errors: string[] = [];

    for (const svc of services) {
        try {
            const res = await axios.get(svc.url, { timeout: 5000 });
            let ip: string | undefined;

            if (svc.type === 'json') {
                ip = svc.path ? res.data?.[svc.path] : undefined;
                if (!ip && typeof res.data === 'string') ip = res.data; // some JSON endpoints return raw
            } else {
                ip = typeof res.data === 'string' ? res.data.trim() : undefined;
            }

            if (ip && ip.length > 0 && ip !== 'null') {
                cachedServerIp = ip;
                return cachedServerIp;
            }
        } catch (err: any) {
            errors.push(`${svc.url} -> ${err?.message || 'error'}`);
            // try next
        }
    }

    // If we reach here nothing worked
    console.warn('[System] fetchPublicIp failed for all services:', errors.join(' | '));
    return 'Unable to detect';
}

export async function authRoutes(app: FastifyInstance) {
    /**
     * Returns the public IP address of this backend server.
     * Used on the login page so the user knows which IP to whitelist in Shoonya.
     */
    app.get('/server-ip', async (request, reply) => {
        const ip = await fetchPublicIp();
        return { status: 'success', data: { ip } };
    });

    app.post('/login', async (request, reply) => {
        const credentials = request.body as any;

        try {
            const res = await shoonya.login(credentials);
            return { status: 'success', data: res };
        } catch (err: any) {
            // Check for password expiry errors
            const errorMessage = err?.data?.emsg || err?.message || 'Unknown error';

            // Detect password expiry scenarios
            const isPasswordExpired =
                errorMessage.includes('Password Expired') ||
                errorMessage.includes('Change Password');

            if (isPasswordExpired) {
                return reply.status(401).send({
                    status: 'error',
                    code: 'PASSWORD_EXPIRED',
                    message: errorMessage,
                    redirectUrl: 'https://shoonya.finvasia.com/change-password',
                    detail: err
                });
            }

            return reply.status(401).send({
                status: 'error',
                code: 'AUTH_FAILED',
                message: 'Invalid credentials or API error',
                detail: err
            });
        }
    });

    /**
     * New GenAcsTok OAuth token exchange.
     * Body: { code: string, app_key: string, secret_key: string }
     */
    app.post('/exchange-token', async (request, reply) => {
        const { code, app_key, secret_key } = request.body as any;

        if (!code || !app_key || !secret_key) {
            return reply.status(400).send({
                status: 'error',
                code: 'MISSING_PARAMS',
                message: 'code, app_key, and secret_key are required'
            });
        }

        try {
            const res = await shoonya.loginWithCode(code, app_key, secret_key);
            return { status: 'success', data: res };
        } catch (err: any) {
            const errorMessage = err?.emsg || err?.message || 'Token exchange failed';
            return reply.status(401).send({
                status: 'error',
                code: 'TOKEN_EXCHANGE_FAILED',
                message: errorMessage,
                detail: err
            });
        }
    });

    app.get('/session', async (request, reply) => {
        return { status: 'success', data: { authenticated: shoonya.isLoggedIn() } };
    });

    app.post('/logout', async (request, reply) => {
        try {
            await shoonya.logout();
            return { status: 'success', message: 'Logged out successfully' };
        } catch (err: any) {
            return reply.status(500).send({ status: 'error', message: err.message });
        }
    });

    app.get('/user', async (request, reply) => {
        try {
            const res = await shoonya.getUserDetails();
            return { status: 'success', data: res };
        } catch (err) {
            return reply.status(500).send({ status: 'error', message: 'Failed to fetch user details', detail: err });
        }
    });

    app.get('/client', async (request, reply) => {
        try {
            const res = await shoonya.getClientDetails();
            return { status: 'success', data: res };
        } catch (err) {
            return reply.status(500).send({ status: 'error', message: 'Failed to fetch client details', detail: err });
        }
    });

    app.get('/margins', async (request, reply) => {
        try {
            const res = await shoonya.getLimits();
            return { status: 'success', data: res };
        } catch (err) {
            return reply.status(500).send({ status: 'error', message: 'Failed to fetch account margins', detail: err });
        }
    });
}
