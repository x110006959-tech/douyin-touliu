import nodemailer from "nodemailer";

const verificationPath = "/email-verification";
const testDeliveries: Array<{ email: string; token: string; verificationUrl: string; expiresAt: Date }> = [];

export function ensureEmailDeliveryConfigured(nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv !== "production") return;
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Production SMTP configuration is incomplete: ${missing.join(", ")}`);
  if (process.env.SMTP_SECURE?.trim().toLowerCase() !== "true") {
    throw new Error("SMTP_SECURE must be true in production");
  }
}

export async function sendEmailVerification(input: { email: string; token: string; expiresAt: Date }) {
  const verificationUrl = createVerificationUrl(input.token);
  if (process.env.NODE_ENV === "test") {
    testDeliveries.push({ ...input, verificationUrl });
    return;
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "127.0.0.1",
    port: readSmtpPort(),
    secure: process.env.SMTP_SECURE?.trim().toLowerCase() === "true",
    requireTLS: process.env.NODE_ENV === "production",
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || "PXXIS <no-reply@localhost>",
    to: input.email,
    subject: "验证你的 PXXIS 工作台邮箱",
    text: `请在 30 分钟内打开以下链接完成邮箱验证：${verificationUrl}`,
    html: `<p>请在 30 分钟内完成 PXXIS 工作台邮箱验证。</p><p><a href="${escapeHtml(verificationUrl)}">验证邮箱</a></p><p>若非本人操作，请忽略本邮件。</p>`
  });
}

export function takeLatestVerificationForTest(email: string) {
  if (process.env.NODE_ENV !== "test") return null;
  for (let index = testDeliveries.length - 1; index >= 0; index -= 1) {
    const delivery = testDeliveries[index];
    if (delivery?.email === email) return delivery;
  }
  return null;
}

export function resetTestEmailDeliveries() {
  testDeliveries.length = 0;
}

function createVerificationUrl(token: string) {
  const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
  const url = new URL(verificationPath, webOrigin);
  url.searchParams.set("token", token);
  return url.toString();
}

function readSmtpPort() {
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("SMTP_PORT must be a valid TCP port");
  return port;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
