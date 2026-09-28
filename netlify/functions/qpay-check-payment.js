// netlify/functions/qpay-check-payment.js
const { checkPayment } = require('./lib/qpay');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { invoice_id } = JSON.parse(event.body || '{}');
    if (!invoice_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'invoice_id шаардлагатай' }) };
    }

    const result = await checkPayment(invoice_id);
    return { statusCode: 200, body: JSON.stringify({ paid: result.paid }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
