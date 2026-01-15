import { FastifyInstance } from 'fastify';
import { shoonya } from '../services/shoonya.service';
import axios from 'axios';

export async function proxyRoutes(app: FastifyInstance) {
    // Generic proxy endpoint for API testing
    app.post('/api/proxy', async (request, reply) => {
        const { url, data } = request.body as { url: string; data: any };

        try {
            // Get user token from session
            const usertoken = await shoonya.getAuthToken();

            if (!usertoken) {
                return reply.status(401).send({
                    status: 'error',
                    message: 'Not authenticated. Please login first.'
                });
            }

            // Prepare payload with jKey
            const payload = new URLSearchParams();
            payload.append('jData', JSON.stringify(data));
            payload.append('jKey', usertoken);

            // Forward request to Shoonya API
            const response = await axios.post(url, payload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            return {
                status: 'success',
                data: response.data
            };
        } catch (err: any) {
            console.error('Proxy error:', err.message);

            if (err.response) {
                // Return detailed error from Shoonya API
                const errorData = {
                    status: 'error',
                    httpStatus: err.response.status,
                    httpStatusText: err.response.statusText,
                    shoonyaResponse: err.response.data,
                    message: err.response.data?.emsg || err.response.data?.message || 'API request failed',
                    details: {
                        url: url,
                        requestData: data
                    }
                };

                return reply.status(err.response.status).send(errorData);
            }

            return reply.status(500).send({
                status: 'error',
                message: err.message || 'Proxy request failed',
                details: {
                    url: url,
                    requestData: data
                }
            });
        }
    });
}
