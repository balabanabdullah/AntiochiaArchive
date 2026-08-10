import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function createTransporter() {
  const user = process.env.GMAIL_USER || process.env.MAIL_USER;
  const pass = process.env.GMAIL_PASS || process.env.MAIL_PASS;
  if (!user || !pass) throw new Error("SMTP credentials are not configured.");

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: { user, pass },
  });
}

export async function sendContributionMail({ name, email, message }) {
  const mode = String(process.env.MAIL_MODE || "mock").toLowerCase();
  if (!['mock', 'smtp'].includes(mode)) {
    throw new Error("MAIL_MODE must be either 'mock' or 'smtp'.");
  }

  if (mode === "mock") {
    console.log("[Mailer] Mock mode: notification email was not sent.");
    return { status: "mock" };
  }

  const recipient = process.env.MAIL_TO;
  const sender = process.env.MAIL_FROM || process.env.MAIL_USER || process.env.GMAIL_USER;
  if (!recipient || !sender) throw new Error("Mail sender or recipient is not configured.");

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message);
  const timestamp = new Date().toLocaleString("tr-TR");
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"AntiochiaArchive" <${sender}>`,
    to: recipient,
    replyTo: email,
    subject: "Yeni katkı gönderildi",
    text: [
      "Yeni katkı gönderildi — AntiochiaArchive",
      `Gönderen Adı: ${name}`,
      `E-posta: ${email}`,
      `Tarih: ${timestamp}`,
      "",
      message,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #1c1814;">
        <h2 style="color: #903628;">AntiochiaArchive — Yeni katkı</h2>
        <p><strong>Gönderen:</strong> ${safeName}</p>
        <p><strong>E-posta:</strong> ${safeEmail}</p>
        <p><strong>Tarih:</strong> ${escapeHtml(timestamp)}</p>
        <div style="white-space: pre-wrap;">${safeMessage}</div>
      </div>
    `.trim(),
  });

  return { status: "sent" };
}
