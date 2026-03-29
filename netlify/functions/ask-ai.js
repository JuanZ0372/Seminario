const MODEL_NAME = 'gemini-3-flash-preview';

function buildPrompt(question, contextData = {}) {
  const document = contextData.document || {};
  const liveMetrics = contextData.liveMetrics || [];
  const catalogSnapshot = contextData.catalogSnapshot || [];

  return `
Eres un bibliotecario virtual universitario.
Responde en espanol claro, util y directo.
Si hay un PDF cargado, usa primero la informacion del documento de referencia.
Si no hay PDF cargado, responde con las metricas del dashboard y el catalogo y aclara que no hay un documento activo.
Si hay PDF pero el dato no aparece ahi, dilo explicitamente antes de apoyarte en el dashboard o en el catalogo.
No inventes politicas ni cifras.

Documento:
- Titulo: ${document.title || 'Sin documento'}
- Tema: ${document.topic || 'Sin tema'}
- Resumen: ${document.summary || 'Sin resumen'}
- Paginas: ${document.pages || 0}
- Puntos clave: ${JSON.stringify(document.highlights || [])}
- Texto extraido: ${document.extractedText || 'Sin texto extraido'}

Metricas en vivo del dashboard:
${JSON.stringify(liveMetrics)}

Catalogo disponible:
${JSON.stringify(catalogSnapshot)}

Pregunta del usuario:
${question}
`.trim();
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { prompt, contextData } = JSON.parse(event.body || '{}');
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Falta GEMINI_API_KEY en el entorno de Netlify.' })
      };
    }

    if (!prompt || typeof prompt !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'La propiedad prompt es obligatoria.' })
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
    const payload = {
      contents: [
        {
          parts: [
            {
              text: buildPrompt(prompt, contextData)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 800
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return {
        statusCode: response.status || 400,
        headers,
        body: JSON.stringify({
          error: data.error?.message || 'No se pudo consultar la API de Gemini.'
        })
      };
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No hay respuesta disponible.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}
