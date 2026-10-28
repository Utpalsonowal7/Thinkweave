// Gemini integration is not called until the AI feature is implemented.
export async function generateGeminiContent(model: string, prompt: string): Promise<unknown> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Invalid Gemini model name');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);
  return response.json();
}
