/**
 * utils/mailer.js – Nodemailer email helper for AEONV
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env
 * Works with Gmail (use App Password), Brevo, Mailgun, etc.
 */
const nodemailer = require('nodemailer');

// Force IPv4 resolution
require('dns').setDefaultResultOrder('ipv4first');

const port = parseInt(process.env.SMTP_PORT) || 587;
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
});

const FROM = process.env.SMTP_FROM || `"AEONV Jewellery" <${process.env.SMTP_USER}>`;
const ADMIN_EMAIL = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL_NOTIFY || process.env.SMTP_USER;

// Send via Resend API (HTTPS bypasses Render SMTP block)
async function sendViaResend(to, subject, html) {
    // Use the domain if verified on Resend, or a fallback. 
    // Resend will reject @gmail.com, so we use @aeonv.in
    const fromStr = `AEONV Jewellery <orders@aeonv.in>`;
    
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: fromStr,
            to: Array.isArray(to) ? to : to.split(',').map(e => e.trim()),
            subject,
            html
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Resend error');
    return data;
}

// ── Send order confirmation to customer ───────────────────────────────────────
async function sendOrderConfirmation(order) {
    const to = order.address?.email || order.guest_email;
    if (!to) return;

    const items = (order.items || []).map(i =>
        `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #222;">${i.name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;">×${i.qty || 1}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:right;color:#C9A96E;">₹${(parseFloat(i.price) * (i.qty || 1)).toLocaleString('en-IN')}</td>
        </tr>`
    ).join('');

    const addr = order.address || {};
    const html = `
    <div style="max-width:600px;margin:0 auto;background:#0A0A0A;color:#E8E0D0;font-family:Inter,sans-serif;border:1px solid #222;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#9A7840,#C9A96E);padding:28px 32px;">
            <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;letter-spacing:6px;color:#0A0A0A;">AEONV</h1>
            <p style="margin:6px 0 0;font-size:11px;letter-spacing:3px;color:rgba(0,0,0,0.6);text-transform:uppercase;">Jewellery</p>
        </div>
        <div style="padding:32px;">
            <h2 style="font-family:Georgia,serif;font-size:22px;color:#C9A96E;margin:0 0 8px;">Order Confirmed! 🎉</h2>
            <p style="color:#888;font-size:13px;margin:0 0 24px;">Thank you, ${addr.name || 'valued customer'}! Your order has been placed successfully.</p>
            <div style="background:#111;border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:12px;letter-spacing:1px;">
                <span style="color:#888;">Order ID:</span> <strong style="color:#C9A96E;">#${order.id?.slice(0, 8).toUpperCase()}</strong>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
                <thead><tr style="background:#1A1A1A;">
                    <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:2px;color:#888;text-transform:uppercase;">Item</th>
                    <th style="padding:10px 12px;text-align:center;font-size:10px;letter-spacing:2px;color:#888;text-transform:uppercase;">Qty</th>
                    <th style="padding:10px 12px;text-align:right;font-size:10px;letter-spacing:2px;color:#888;text-transform:uppercase;">Price</th>
                </tr></thead>
                <tbody>${items}</tbody>
            </table>
            <div style="border-top:1px solid #222;padding-top:16px;font-size:14px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#888;">
                    <span>Subtotal</span><span>₹${parseFloat(order.subtotal || 0).toLocaleString('en-IN')}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;color:#888;">
                    <span>Delivery</span><span>${parseFloat(order.delivery_charge || 0) === 0 ? 'FREE' : '₹' + parseFloat(order.delivery_charge || 0).toLocaleString('en-IN')}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:700;color:#C9A96E;">
                    <span>Total Paid</span><span>₹${parseFloat(order.total || 0).toLocaleString('en-IN')}</span>
                </div>
            </div>
            <div style="margin-top:24px;background:#111;border-radius:8px;padding:16px 18px;font-size:13px;">
                <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;color:#888;text-transform:uppercase;">Delivery Address</p>
                <p style="margin:0;color:#E8E0D0;line-height:1.7;">${addr.name}<br/>${addr.line1}${addr.line2 ? ', ' + addr.line2 : ''}<br/>${addr.city}, ${addr.state} – ${addr.pincode}</p>
            </div>
            <p style="margin:28px 0 0;font-size:12px;color:#666;text-align:center;">We'll ship your order within 2–5 business days.<br/>Crafted with ♥ in India</p>
        </div>
    </div>`;
    const subject = `✅ Order Confirmed – #${order.id?.slice(0, 8).toUpperCase()} | AEONV Jewellery`;

    if (process.env.RESEND_API_KEY) {
        return sendViaResend(to, subject, html);
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    await transporter.sendMail({ from: FROM, to, subject, html });
}

// ── Send new order alert to admin ─────────────────────────────────────────────
async function sendAdminOrderAlert(order) {
    if (!ADMIN_EMAIL) return;
    
    const addr = order.address || {};
    const subject = `🛒 New Order #${order.id?.slice(0, 8).toUpperCase()} – ₹${parseFloat(order.total || 0).toLocaleString('en-IN')}`;
    const html = `<p><strong>New order received!</strong></p>
               <p><strong>Customer:</strong> ${addr.name} | ${addr.phone}</p>
               <p><strong>Total:</strong> ₹${parseFloat(order.total || 0).toLocaleString('en-IN')}</p>
               <p><strong>Address:</strong> ${addr.line1}, ${addr.city}, ${addr.state} – ${addr.pincode}</p>
               <p><strong>Items:</strong> ${order.items?.length || 0}</p>
               <p><a href="${process.env.APP_URL || ''}/admin">View in Admin Dashboard →</a></p>`;

    if (process.env.RESEND_API_KEY) {
        return sendViaResend(ADMIN_EMAIL, subject, html);
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    await transporter.sendMail({ from: FROM, to: ADMIN_EMAIL, subject, html });
}

module.exports = { sendOrderConfirmation, sendAdminOrderAlert };
