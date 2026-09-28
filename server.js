// server.js
//
// Render (эсвэл өөр Node хост) дээр ажиллуулах энгийн сервер.
// index.html-ийг үзүүлж, /.netlify/functions/<нэр> хүсэлтийг
// netlify/functions доторх handler руу дамжуулна.

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX_PATH = path.join(__dirname, 'index.html');

const functions = {
  'send-report': require('./netlify/functions/send-report').handler,
  'qpay-create-invoice': require('./netlify/functions/qpay-create-invoice').handler,
  'qpay-check-payment': require('./netlify/functions/qpay-check-payment').handler,
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  const match = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)\/?$/);
  if (match) {
    const handler = functions[match[1]];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Function not found' }));
    }
    try {
      const event = {
        httpMethod: req.method,
        headers: req.headers,
        path: url.pathname,
        queryStringParameters: Object.fromEntries(url.searchParams),
        body: await readBody(req),
      };
      const result = await handler(event);
      res.writeHead(result.statusCode || 200, {
        'Content-Type': 'application/json',
        ...(result.headers || {}),
      });
      return res.end(result.body || '');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Зөвхөн index.html-ийг үзүүлнэ (.env гэх мэт файлууд ил гарахгүй)
  if (req.method === 'GET' || req.method === 'HEAD') {
    fs.readFile(INDEX_PATH, (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end('index.html уншиж чадсангүй');
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'DENY',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
    return;
  }

  res.writeHead(405);
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`Astro Read server: http://localhost:${PORT}`);
});
