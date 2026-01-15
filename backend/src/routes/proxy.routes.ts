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

            // Get user details to inject uid if not provided
            try {
                const userDetails: any = await shoonya.getUserDetails();
                if (userDetails && userDetails.uid && !data.uid) {
                    data.uid = userDetails.uid;
                    console.log('[Proxy] Auto-injected uid:', userDetails.uid);
                }
            } catch (err) {
                console.warn('[Proxy] Could not fetch user details for auto-uid injection');
            }

            // Prepare payload with jKey
            const payload = new URLSearchParams();
            payload.append('jData', JSON.stringify(data));
            payload.append('jKey', usertoken);

            // Log the request being sent
            const requestLog = {
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                payload: {
                    jData: data,
                    jKey: usertoken.substring(0, 20) + '...' // Partial token for security
                }
            };
            console.log('[Proxy] Sending request to Shoonya:', JSON.stringify(requestLog, null, 2));

            // Forward request to Shoonya API
            const response = await axios.post(url, payload.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            return {
                status: 'success',
                data: response.data,
                requestSent: requestLog // Include request details in response
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
