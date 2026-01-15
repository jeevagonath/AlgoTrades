import { FastifyInstance } from 'fastify';
import { shoonya } from '../services/shoonya.service';

export async function authRoutes(app: FastifyInstance) {
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
