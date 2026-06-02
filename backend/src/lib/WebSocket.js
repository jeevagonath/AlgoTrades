let web_socket = require("ws");
let { API } = require("./config");

let WebSocketClient = function (cred) {
     let self = this;
     let ws = null;
     let url = cred && cred.url;
     let timeout = API.heartbeat || 3000;
     let hbInterval = null;
     let triggers = {
          open: [],
          quote: [],
          order: [],
          error: [],
          close: []
     };

     function trigger(e, args) {
          if (!triggers[e]) return;
          for (let i = 0; i < triggers[e].length; i++) {
               try {
                    triggers[e][i].apply(null, args ? args : []);
               } catch (err) {
                    console.error('[Shoonya WS] trigger callback error', err);
               }
          }
     }

     this.connect = function (params, callbacks) {
          return new Promise((resolve, reject) => {
               if (!url) return reject(new Error('url is missing'));
               console.log(url);

               // attach callbacks
               this.set_callbacks(callbacks);

               ws = new web_socket(url, { rejectUnauthorized: false });

               ws.on('open', function () {
                    hbInterval = setInterval(function () {
                         var _hb_req = '{"t":"h"}';
                         try { if (ws && ws.readyState === 1) ws.send(_hb_req); } catch (e) { }
                    }, timeout);

                    //prepare the data
                    let values = { t: 'c' };
                    values.uid = params.uid;
                    values.actid = params.actid;
                    values.accesstoken = params.apikey || params.usertoken;
                    values.source = 'API';
                    console.log('[Shoonya WS] Sending connect request:', JSON.stringify(values));
                    try { ws.send(JSON.stringify(values)); } catch (e) { console.error('[Shoonya WS] send failed', e); }
                    resolve();
               });

               ws.on('message', function (data) {
                    const text = (typeof data === 'string') ? data : data.toString();
                    console.log('[Shoonya WS] RECEIVED:', text);
                    let result;
                    try { result = JSON.parse(text); } catch (e) { console.error('[Shoonya WS] Invalid JSON', e); return; }

                    if (result.t === 'ck') {
                         console.log('[Shoonya WS] Connect Acknowledgement:', result);
                         trigger('open', [result]);
                    }
                    if (result.t === 'tk' || result.t === 'tf' || result.t === 'dk' || result.t === 'df') {
                         trigger('quote', [result]);
                    }
                    if (result.t === 'om') {
                         trigger('order', [result]);
                    }
               });

               ws.on('error', function (err) {
                    console.log('error::', err);
                    trigger('error', [err]);
                    // attempt reconnect after short delay
                    setTimeout(() => {
                         try { self.connect(params, callbacks).catch(() => { }); } catch (e) { }
                    }, 1000);
                    reject(err);
               });

               ws.on('close', function (code, reason) {
                    console.log('Socket closed', code, reason && reason.toString());
                    if (hbInterval) clearInterval(hbInterval);
                    trigger('close', [{ code, reason: reason && reason.toString() }]);
               });
          });
     };

     this.set_callbacks = function (callbacks) {
          if (!callbacks) return;
          if (callbacks.socket_open !== undefined) this.on('open', callbacks.socket_open);
          if (callbacks.socket_close !== undefined) this.on('close', callbacks.socket_close);
          if (callbacks.socket_error !== undefined) this.on('error', callbacks.socket_error);
          if (callbacks.quote !== undefined) this.on('quote', callbacks.quote);
          if (callbacks.order !== undefined) this.on('order', callbacks.order);
     };

     this.send = function (data) {
          if (!ws || ws.readyState !== 1) throw new Error('WebSocket not open');
          ws.send(data);
     };

     this.on = function (e, callback) {
          if (triggers.hasOwnProperty(e)) triggers[e].push(callback);
     };

     this.close = function () {
          try { if (hbInterval) clearInterval(hbInterval); } catch (e) { }
          try { if (ws) ws.close(); } catch (e) { }
     };
}

module.exports = WebSocketClient;