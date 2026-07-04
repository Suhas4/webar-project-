const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
let id = 1;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));

ws.addEventListener('open', () => {
  send('Runtime.enable');
  send('Log.enable');
  send('Network.enable');
  console.log('[connected] watching console + network for', wsUrl);
});

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  const m = msg.method;
  if (m === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    console.log(`[console.${msg.params.type}]`, args);
  } else if (m === 'Runtime.exceptionThrown') {
    const ex = msg.params.exceptionDetails;
    console.log('[exception]', ex.text, ex.exception?.description || '');
  } else if (m === 'Log.entryAdded') {
    const e = msg.params.entry;
    console.log(`[log.${e.level}]`, e.source, e.text);
  } else if (m === 'Network.responseReceived') {
    const r = msg.params.response;
    if (r.status >= 400 || /\.glb|\.gltf|\.obj|\.fbx|ar-glb/i.test(r.url)) {
      console.log(`[net ${r.status}]`, r.url);
    }
  } else if (m === 'Network.loadingFailed') {
    console.log('[net failed]', msg.params.errorText, msg.params.type);
  }
});

ws.addEventListener('close', () => console.log('[closed]'));
ws.addEventListener('error', (e) => console.log('[ws error]', e.message));

setTimeout(() => { console.log('[timeout — closing]'); ws.close(); process.exit(0); }, 120000);
