const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const f0 = data.f0 > 0 ? data.f0.toFixed(1).padStart(5) + ' Hz' : '  ---   ';
        const rms = (data.rms * 1000).toFixed(1).padStart(5);
        const cv = data.cv !== null ? (data.cv * 100).toFixed(1).padStart(4) + '%' : ' --- ';
        const vad = data.isVoiced ? '🟢 Voiced ' : '⚫ Silence';
        
        console.log(`🎙️  [Metrics]  Pitch: ${f0}  |  Loudness: ${rms}  |  Pitch CV: ${cv}  |  VAD: ${vad}`);
        res.writeHead(200);
        res.end('ok');
      } catch (err) {
        res.writeHead(400); res.end('Bad JSON');
      }
    });
    return;
  }

  // Static file serving
  let filePath = path.join(__dirname, req.url === '/' ? 'test_engine.html' : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404); res.end('Not Found');
      } else {
        res.writeHead(500); res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 PS Coach Server running at http://localhost:${PORT}`);
  console.log(`   Leave this terminal open. Your metrics will print here in realtime.\n`);
  console.log(`-------------------------------------------------------------------------`);
});
