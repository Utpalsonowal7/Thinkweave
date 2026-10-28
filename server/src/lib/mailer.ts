export async function sendAuthEmail(email: string, subject: string, link: string): Promise<void> {
  const key = process.env.BREVO_API_KEY;
  const sender = process.env.EMAIL_FROM;
  if (!key || !sender) throw new Error('Email delivery is not configured');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify({ sender: { email: sender, name: 'ThinkWeave' }, to: [{ email }], subject, textContent: `${subject}\n\nOpen this link: ${link}\n\nIf you did not request this, ignore this email.` }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Email delivery failed');
}
