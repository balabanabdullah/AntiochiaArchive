import nodemailer from "nodemailer";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, ".env") });

/**
 * Create Nodemailer SMTP transporter (Gmail or standard SMTP)
 */
const createTransporter = () => {
  const user = process.env.GMAIL_USER || process.env.MAIL_USER;
  const pass = process.env.GMAIL_PASS || process.env.MAIL_PASS;

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // TLS / STARTTLS
    connectionTimeout: 5000, // 5 sec timeout for network check
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * Send contribution notification email
 * @param {Object} payload - { name, email, message }
 */
export async function sendContributionMail({ name, email, message }) {
  const recipient = process.env.MAIL_TO || "balabanabdullah00@gmail.com";
  const user = process.env.GMAIL_USER || process.env.MAIL_USER;
  const pass = process.env.GMAIL_PASS || process.env.MAIL_PASS;

  const mailOptions = {
    from: '"AntiochiaArchive" <no-reply@antiochiaarchive.org>',
    to: recipient,
    replyTo: `"${name}" <${email}>`,
    subject: "Yeni katkı gönderildi",
    text: `
Yeni katkı gönderildi — AntiochiaArchive
----------------------------------------
Gönderen Adı : ${name}
E-posta      : ${email}
Tarih        : ${new Date().toLocaleString("tr-TR")}

Mesaj / Katkı:
${message}
----------------------------------------
    `.trim(),
    html: `
<div style="font-family: 'DM Sans', Arial, sans-serif; background-color: #f2ead8; padding: 24px; color: #1c1814;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #903628; padding: 32px; border-radius: 4px;">
    <h2 style="font-family: Georgia, serif; color: #903628; margin-top: 0;">AntiochiaArchive — Yeni katkı gönderildi</h2>
    <p style="font-size: 14px; color: #5a5145;">Antakya Dijital Arşivi web sitesinden yeni bir katkı gönderildi.</p>
    
    <hr style="border: 0; border-top: 1px solid #e6dbc4; margin: 20px 0;" />
    
    <p><strong>Gönderen:</strong> ${name}</p>
    <p><strong>E-posta:</strong> <a href="mailto:${email}" style="color: #903628;">${email}</a></p>
    <p><strong>Tarih:</strong> ${new Date().toLocaleString("tr-TR")}</p>
    
    <div style="background: #f9f4ea; border-left: 3px solid #903628; padding: 16px; margin-top: 16px;">
      <p style="margin: 0; font-weight: bold; color: #6e2920; font-size: 13px; text-transform: uppercase;">Katkı / Mesaj:</p>
      <p style="margin-top: 8px; white-space: pre-wrap; line-height: 1.6;">${message}</p>
    </div>
    
    <hr style="border: 0; border-top: 1px solid #e6dbc4; margin: 24px 0 16px 0;" />
    <p style="font-size: 11px; color: #8a8e68; margin: 0;">AntiochiaArchive · Open Source & Community Memory Project</p>
  </div>
</div>
    `.trim(),
  };

  // If no real SMTP credentials provided, log payload and simulate success for dev testing
  if (!user || user === "your-email@gmail.com" || !pass || pass === "your-app-password") {
    console.log("[Mailer Mock Mode] GMAIL_USER/GMAIL_PASS not configured. Simulating mail send:");
    console.log({ to: recipient, subject: mailOptions.subject, payload: { name, email, message } });
    return { mock: true, recipient, status: "sent" };
  }

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer Success] Email sent to ${recipient} via Gmail SMTP.`);
    return { ...info, status: "sent" };
  } catch (smtpErr) {
    console.warn(`[Mailer Warning] Real SMTP send failed (${smtpErr.message}). Falling back to mock mode logging.`);
    console.log({ to: recipient, subject: mailOptions.subject, payload: { name, email, message } });
    return { mock: true, recipient, status: "sent", warning: smtpErr.message };
  }
}
