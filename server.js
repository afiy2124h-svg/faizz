const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const typeOf = file => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

function sendError(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(msg);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    // The media filenames contain spaces, so the page requests them as %20.
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendError(res, 400, 'Bad request');
  }
  // Serve index.html at the root, the way GitHub Pages and most static hosts
  // do, so this keeps working if the page is ever renamed.
  if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside ROOT only - never let a ../ escape the folder.
  const file = path.resolve(ROOT, '.' + pathname);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return sendError(res, 403, 'Forbidden');
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendError(res, 404, 'Not found: ' + pathname);

    const type = typeOf(file);
    const size = stat.size;

    // Range support: without it the browser can play the file but the seek
    // bar and "resume where you left off" break.
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        let start = m[1] === '' ? null : Number(m[1]);
        let end = m[2] === '' ? null : Number(m[2]);
        if (start === null) { start = Math.max(0, size - (end || 0)); end = size - 1; }
        if (end === null || end >= size) end = size - 1;
        if (start > end || start >= size) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size });
          return res.end();
        }
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Cache-Control': 'no-cache',
        });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(`http://${n.address}:${PORT}/`);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Birthday page is being served:');
  console.log(`    local   http://localhost:${PORT}/`);
  lanUrls().forEach(u => console.log(`    phone   ${u}`));
  console.log('');
  console.log('  Ctrl+C to stop.');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try:  PORT=5174 npm run dev\n`);
  } else {
    console.error('\n  Server error:', err.message, '\n');
  }
  process.exit(1);
});
