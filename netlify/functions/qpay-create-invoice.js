// netlify/functions/qpay-create-invoice.js
const { createInvoice } = require('./lib/qpay');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const amount = Number(process.env.QPAY_AMOUNT || 6900);

    const invoice = await createInvoice({
      amount,
      description: 'Astro Read - Бүтэн тайлан',
      senderInvoiceNo: body.senderInvoiceNo,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        invoice_id: invoice.invoice_id,
        qr_image: invoice.qr_image || null, // base64 PNG (prefix-гүй)
        qr_text: invoice.qr_text || null,
        urls: invoice.urls || [],
        amount,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
