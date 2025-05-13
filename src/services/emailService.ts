import nodemailer from 'nodemailer';

// Mock email transport (logs to console)
const transporter = nodemailer.createTransport({
  streamTransport: true,
  newline: 'unix',
  buffer: true,
});

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: 'billing@example.com',
      to,
      subject,
      text: body,
    });
    console.warn(`Email sent: ${info.message.toString()}`);
    return true;
  } catch (error) {
    console.error(`Email failed: ${error}`);
    return false;
  }
} 