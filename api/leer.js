/**
 * Lector de fotos, del lado del servidor.
 *
 * La app puede leer las fotos de dos maneras: con una llave pegada en el
 * dispositivo, o contra una dirección propia. Esto es esa dirección, para que
 * la llave viva en Vercel y no en la tablet.
 *
 * Recibe la foto y las instrucciones de qué leer —la hoja de inventario o la
 * de producción de Zona 2— y devuelve el JSON tal como lo arma el modelo. No
 * sabe nada de panadería: las instrucciones viajan desde la app, que es la que
 * conoce las claves y los turnos de hoy.
 *
 * Hace falta la variable de entorno ANTHROPIC_API_KEY. Sin ella responde 503
 * diciéndolo, en vez de fallar sin explicación.
 */
const MODELO = 'claude-opus-5';
const SISTEMA = 'Eres un transcriptor de hojas de panadería. Tu única tarea es copiar números manuscritos con exactitud literal. Ante la duda marcas la celda como dudosa en lugar de adivinar.';

/** Saca el objeto JSON aunque venga envuelto en ``` o con texto alrededor. */
function parseJson(texto) {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto);
  for (const c of [fence && fence[1], texto]) {
    if (!c) continue;
    const a = c.indexOf('{'), b = c.lastIndexOf('}');
    if (a < 0 || b <= a) continue;
    try { return JSON.parse(c.slice(a, b + 1)); } catch (_) { /* siguiente */ }
  }
  return null;
}

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(204).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'Falta la variable ANTHROPIC_API_KEY en el proyecto de Vercel.',
    });
  }

  const b = req.body || {};
  const img = b.image_base64;
  if (!img) return res.status(400).json({ error: 'Falta la imagen.' });
  const mime = b.media_type || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) {
    return res.status(400).json({ error: 'Ese tipo de imagen no sirve.' });
  }
  /* Sin instrucciones no se adivina qué leer: es preferible decirlo a
     devolver la hoja equivocada. */
  const instruccion = b.instruccion;
  if (!instruccion || typeof instruccion !== 'string') {
    return res.status(400).json({
      error: 'Falta la instrucción de qué leer. Actualiza la app a una versión que la mande.',
    });
  }

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: b.modelo || MODELO,
        max_tokens: 4096,
        system: typeof b.sistema === 'string' && b.sistema ? b.sistema : SISTEMA,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: img } },
          { type: 'text', text: instruccion }] }],
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: 'No se pudo contactar al lector: ' + err.message });
  }

  const crudo = await r.text();
  if (!r.ok) {
    let det = crudo.slice(0, 300);
    try { det = JSON.parse(crudo).error?.message || det; } catch (_) { /* el texto crudo sirve */ }
    if (r.status === 401) det = 'La llave del servidor no es válida o fue revocada.';
    if (r.status === 429) det = 'Demasiadas peticiones o sin saldo en la cuenta.';
    return res.status(502).json({ error: `El lector respondió ${r.status}: ${det}` });
  }

  let texto = '';
  try {
    texto = (JSON.parse(crudo).content || [])
      .filter((x) => x.type === 'text').map((x) => x.text).join('\n');
  } catch (_) { texto = ''; }
  const data = parseJson(texto);
  if (!data) {
    return res.status(502).json({
      error: 'El lector no devolvió datos legibles. Repite la foto con la hoja completa y plana.',
    });
  }
  return res.status(200).json(data);
}
