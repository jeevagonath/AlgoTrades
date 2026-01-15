import { useState } from 'react';
import { Send, Copy, Trash2, AlertCircle } from 'lucide-react';
import axios from 'axios';

const APITester = () => {
    const [apiUrl, setApiUrl] = useState('');
    const [requestBody, setRequestBody] = useState('');
    const [response, setResponse] = useState('');
    const [requestPreview, setRequestPreview] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSendRequest = async () => {
        setLoading(true);
        setError('');
        setResponse('');
        setRequestPreview('');

        try {
            // Parse request body
            let parsedRequest: any = {};
            if (requestBody.trim()) {
                try {
                    parsedRequest = JSON.parse(requestBody);
                } catch (e) {
                    setError('Invalid JSON in request body');
                    setLoading(false);
                    return;
                }
            }

            // Show request preview
            const requestPreviewData = {
                targetUrl: apiUrl,
                method: 'POST',
                requestBody: parsedRequest,
                note: 'Request will be sent via backend proxy with jKey automatically added'
            };
            setRequestPreview(JSON.stringify(requestPreviewData, null, 2));

            // Send request through backend proxy to avoid CORS
            const result = await axios.post('https://algotradesservice.onrender.com/api/proxy', {
                url: apiUrl,
                data: parsedRequest
            });

            // Display response
            setResponse(JSON.stringify(result.data, null, 2));
        } catch (err: any) {
            // Enhanced error handling
            let errorMessage = 'Request failed';
            let errorDetails: any = {};

            if (err.code === 'ERR_NETWORK') {
                errorMessage = 'Network Error: Unable to reach backend server';
                errorDetails = {
                    code: err.code,
                    message: 'Make sure your backend server is running on https://algotradesservice.onrender.com',
                    possibleCauses: [
                        'Backend server is not running',
                        'Backend server is running on a different port',
                        'Network connectivity issue'
                    ]
                };
            } else if (err.response) {
                errorMessage = `HTTP ${err.response.status}: ${err.response.statusText}`;
                errorDetails = {
                    status: err.response.status,
                    statusText: err.response.statusText,
                    data: err.response.data
                };
            } else if (err.request) {
                errorMessage = 'No response received from server';
                errorDetails = {
                    message: 'Request was sent but no response received',
                    timeout: err.code === 'ECONNABORTED'
                };
            } else {
                errorMessage = err.message || 'Unknown error';
                errorDetails = { error: err.toString() };
            }

            setError(errorMessage);
            setResponse(JSON.stringify(errorDetails, null, 2));
        } finally {
            setLoading(false);
        }
    };

    const handleCopyResponse = () => {
        navigator.clipboard.writeText(response);
    };

    const handleClearAll = () => {
        setApiUrl('');
        setRequestBody('');
        setResponse('');
        setError('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-black text-slate-900">API Tester</h1>
                            <p className="text-sm text-slate-500 mt-1">Test Shoonya API endpoints with automatic jKey injection</p>
                        </div>
                        <button
                            onClick={handleClearAll}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
                        >
                            <Trash2 size={16} />
                            Clear All
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Request Section */}
                    <div className="space-y-6">
                        {/* API URL */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                API URL
                            </label>
                            <input
                                type="text"
                                value={apiUrl}
                                onChange={(e) => setApiUrl(e.target.value)}
                                placeholder="https://api.shoonya.com/NorenWClientTP/..."
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>

                        {/* Request Body */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex-1">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                Request Body (JSON)
                            </label>
                            <textarea
                                value={requestBody}
                                onChange={(e) => setRequestBody(e.target.value)}
                                placeholder={`{\n  "uid": "USER123",\n  "exch": "NSE",\n  "token": "26000"\n}`}
                                className="w-full h-64 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                            />
                            <p className="text-xs text-slate-400 mt-2">
                                ℹ️ jKey will be automatically added from your session
                            </p>
                        </div>

                        {/* Send Button */}
                        <button
                            onClick={handleSendRequest}
                            disabled={loading || !apiUrl}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] disabled:active:scale-100 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Send Request
                                </>
                            )}
                        </button>
                    </div>

                    {/* Response Section */}
                    <div className="space-y-6">
                        {/* Request Preview */}
                        {requestPreview && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                                        📤 Request Sent
                                    </label>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(requestPreview)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                                    >
                                        <Copy size={14} />
                                        Copy
                                    </button>
                                </div>
                                <div className="bg-slate-900 rounded-xl p-4 max-h-[300px] overflow-auto">
                                    <pre className="text-xs text-cyan-400 font-mono whitespace-pre-wrap">
                                        {requestPreview}
                                    </pre>
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-red-900">Error</p>
                                    <p className="text-sm text-red-700 mt-1">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* Response Display */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex-1">
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    📥 Response
                                </label>
                                {response && (
                                    <button
                                        onClick={handleCopyResponse}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                                    >
                                        <Copy size={14} />
                                        Copy
                                    </button>
                                )}
                            </div>
                            <div className="bg-slate-900 rounded-xl p-4 min-h-[400px] max-h-[600px] overflow-auto">
                                <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                                    {response || '// Response will appear here...'}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Examples */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Quick Examples</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={() => {
                                setApiUrl('https://api.shoonya.com/NorenWClientTP/GetQuotes');
                                setRequestBody(JSON.stringify({ uid: 'YOUR_UID', exch: 'NSE', token: '26000' }, null, 2));
                            }}
                            className="text-left p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                        >
                            <p className="text-xs font-bold text-blue-600 mb-1">Get Quotes</p>
                            <p className="text-xs text-slate-500">Fetch live quotes for Nifty 50</p>
                        </button>
                        <button
                            onClick={() => {
                                setApiUrl('https://api.shoonya.com/NorenWClientTP/PositionBook');
                                setRequestBody(JSON.stringify({ uid: 'YOUR_UID', actid: 'YOUR_UID' }, null, 2));
                            }}
                            className="text-left p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                        >
                            <p className="text-xs font-bold text-blue-600 mb-1">Position Book</p>
                            <p className="text-xs text-slate-500">Get current positions</p>
                        </button>
                        <button
                            onClick={() => {
                                setApiUrl('https://api.shoonya.com/NorenWClientTP/OrderBook');
                                setRequestBody(JSON.stringify({ uid: 'YOUR_UID' }, null, 2));
                            }}
                            className="text-left p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                        >
                            <p className="text-xs font-bold text-blue-600 mb-1">Order Book</p>
                            <p className="text-xs text-slate-500">View all orders</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default APITester;
