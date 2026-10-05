// netlify/functions/send-report.js
//
// Энэ функц нь Netlify дээр серверийн талд ("backend") ажилладаг тул
// нууц түлхүүр (RESEND_API_KEY) энд аюулгүй байрладаг — хөтчийн код руу
// хэзээ ч гардаггүй.
//
// Ашигласан үйлчилгээ: https://resend.com (сар бүр 3,000 имэйл хүртэл үнэгүй)

exports.handler = async function (event) {
  // Зөвхөн POST хүсэлт хүлээж авна
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // pdf: base64 (data: prefix-гүй) — хөтөч дээр html2pdf.js-ээр үүсгэсэн тайлан
  const { email, subject, html, pdf, filename } = payload;

  // Энгийн шалгалт
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Зөв и-мэйл хаяг өгөөгүй байна' }) };
  }
  if (pdf && !/^[A-Za-z0-9+/=]+$/.test(pdf)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'PDF хавсралт буруу форматтай байна' }) };
  }
  if (!html) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Илгээх агуулга (html) өгөөгүй байна' }) };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('[send-report] RESEND_API_KEY тохируулагдаагүй');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'RESEND_API_KEY тохируулагдаагүй байна. Netlify -> Site settings -> Environment variables хэсэгт нэмнэ үү.' }),
    };
  }

  // Илгээгч хаяг: домайнаа баталгаажуулаагүй бол Resend-ийн туршилтын
  // "onboarding@resend.dev" хаягаар илгээж болно. Өөрийн домайн
  // (жишээ нь astroread.mn) баталгаажуулсны дараа доорхыг солино:
  //   from: 'Astro Read <hello@astroread.mn>'
  const FROM_ADDRESS = process.env.RESEND_FROM || 'Astro Read <onboarding@resend.dev>';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [email],
        subject: subject || 'Таны Astro Read тайлан',
        html,
        ...(pdf && {
          attachments: [{
            filename: /^[\w.-]+\.pdf$/.test(filename || '') ? filename : 'astro-read-tailan.pdf',
            content: pdf,
          }],
        }),
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('[send-report] Resend алдаа:', resp.status, JSON.stringify(data));
      return { statusCode: resp.status, body: JSON.stringify({ error: data }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: data.id }),
    };
  } catch (err) {
    console.error('[send-report] алдаа:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
