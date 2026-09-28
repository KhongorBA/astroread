// netlify/functions/lib/qpay.js
//
// QPay-тэй харилцах гол логик. Бүх нууц утга (.env файл эсвэл Netlify-ийн
// Environment variables) -аас process.env дундуур уншигдана — хэзээ ч
// код дотор шууд бичигдэхгүй.
//
// Локал дээр туршихдаа .env файл ашиглах бол dotenv сан шаардлагатай:
//   npm install dotenv
require('dotenv').config();

const BASE_URL = process.env.QPAY_BASE_URL || 'https://merchant.qpay.mn/v2';

// Токеныг санах ойд кэшлээд, дуустал шинээр авахгүй байх (QPay токен
// ихэвчлэн ~60 минут хүчинтэй байдаг)
let cachedToken = null;
let tokenExpiryMs = 0;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} тохируулагдаагүй байна (.env файл эсвэл Netlify Environment variables-аа шалгана уу)`);
  }
  return value;
}

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiryMs) {
    return cachedToken;
  }

  const username = requireEnv('QPAY_USERNAME');
  const password = requireEnv('QPAY_PASSWORD');
  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

  const resp = await fetch(`${BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`QPay нэвтрэлт амжилтгүй (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  cachedToken = data.access_token;
  const expiresInSec = Number(data.expires_in) || 3300; // fallback ~55 мин
  tokenExpiryMs = now + (expiresInSec - 60) * 1000; // 1 минутын нөөцтэй
  return cachedToken;
}

// Хэрэв токен хугацаа дуусаад 401 өгвөл нэг удаа дахин нэвтэрч оролдоно
async function authedFetch(path, options) {
  let token = await getToken();
  let resp = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (resp.status === 401) {
    cachedToken = null;
    token = await getToken();
    resp = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return resp;
}

async function createInvoice({ amount, description, senderInvoiceNo }) {
  const invoiceCode = requireEnv('QPAY_INVOICE_CODE');

  const resp = await authedFetch('/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoice_code: invoiceCode,
      sender_invoice_no: senderInvoiceNo || String(Date.now()),
      invoice_receiver_code: 'terminal',
      invoice_description: description || 'Astro Read - Бүтэн тайлан',
      amount: amount,
      callback_url: process.env.QPAY_CALLBACK_URL || undefined,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`QPay нэхэмжлэл үүсгэхэд алдаа гарлаа (${resp.status}): ${text}`);
  }

  return resp.json(); // { invoice_id, qr_image, qr_text, urls: [...] }
}

async function checkPayment(invoiceId) {
  if (!invoiceId) throw new Error('invoice_id шаардлагатай');

  const resp = await authedFetch('/payment/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object_type: 'INVOICE',
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Төлбөр шалгахад алдаа гарлаа (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const paid = (Number(data.count) > 0) || rows.length > 0;

  return { paid, rows, raw: data };
}

module.exports = { getToken, createInvoice, checkPayment };
