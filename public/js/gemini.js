export async function askGemini(prompt) {
const BACKEND_URL = 'https://fluencircle-backend.onrender.com';
  try {
    const response = await fetch(`${BACKEND_URL}/api/gemini/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });

    console.log(response)

    if (!response.ok) {
      throw new Error(`Erro no servidor: ${response.statusText}`);
    }
    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('Erro ao chamar o backend:', error);
    throw error;
  }
}