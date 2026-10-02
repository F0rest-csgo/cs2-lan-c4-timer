const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { BombTimer } = require('./timer');

const DEFAULT_TOKEN = 'cs2-c4-local-gsi';
function createServer({ timer = new BombTimer(), token = DEFAULT_TOKEN } = {}) {
  const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
  return http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const respond = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    if (req.method === 'GET' && req.url === '/api/state') return respond(200, timer.snapshot());
    if (req.method !== 'POST' || req.url !== '/gsi') return respond(404, { error: 'Not found' });
    // LAN devices may view the timer; only the local game can update it.
    const remote = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return respond(403, { error: 'Local GSI only' });
    let size = 0;
    const chunks = [];
    let rejected = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 65_536) {
        if (!rejected) respond(413, { error: 'Payload too large' });
        rejected = true;
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return respond(400, { error: 'Invalid JSON' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return respond(400, { error: 'Expected object' });
      if (payload.auth?.token !== token) return respond(403, { error: 'Invalid GSI token' });
      //console.log(JSON.stringify(payload, null, 2));
      timer.update(payload);
      respond(200, { ok: true });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT 必须是 1–65535 的整数。');
    process.exit(1);
  }
  const server = createServer({ token: process.env.GSI_TOKEN || DEFAULT_TOKEN });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.on('error', error => { console.error(`服务启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => {
    console.log(`CS2 C4 倒计时已启动\n本机：http://localhost:${port}\nGSI：http://127.0.0.1:${port}/gsi`);
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) console.log(`局域网：http://${address.address}:${port}`);
      }
    }
    console.log('按 Ctrl+C 停止。请将 cfg 放入 CS2 的 game\\csgo\\cfg 文件夹后重启游戏。');
  });
  process.on('SIGINT', () => { server.close(); server.closeAllConnections(); });
}

module.exports = { createServer };
