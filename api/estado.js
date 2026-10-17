/**
 * Sincronización del estado entre la laptop y la tablet.
 *
 * Guarda un solo archivo JSON en Vercel Blob. La app manda lo que tiene, el
 * endpoint devuelve lo que hay guardado, y la mezcla se hace en el navegador
 * (js/sync.js), que es el único que sabe qué cambió de cada lado.
 *
 * Escrituras condicionadas: cada respuesta trae el etag del archivo y cada
 * guardado lo exige de vuelta. Si entre medio escribió el otro equipo, se
 * responde 409 con lo que hay y la app vuelve a mezclar. Así no se pierde un
 * cambio por llegar medio segundo tarde.
 *
 * Hace falta:
 *   - Un almacén Blob conectado al proyecto (Vercel pone BLOB_READ_WRITE_TOKEN).
 *   - La variable de entorno SYNC_CLAVE con la clave que también se escribe
 *     en la app, en Parámetros. Sin ella el endpoint no trabaja: la dirección
 *     es pública y sin clave cualquiera podría leer o borrar la producción.
 *
 * Pasos en SINCRONIZAR.md
 */
import { get, put } from '@vercel/blob';

const RUTA = 'produccion/estado.json';
const LIMITE = 4 * 1024 * 1024;   // Vercel corta el cuerpo en 4.5 MB

/** Comparación de la clave en tiempo parejo, para no filtrarla a tanteos. */
function mismaClave(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return dif === 0;
}

async function leer() {
  const r = await get(RUTA, { access: 'private', useCache: false });
  if (!r || !r.stream) return { estado: null, etag: null, actualizado: null };
  const texto = await new Response(r.stream).text();
  let estado = null;
  try { estado = JSON.parse(texto); } catch (_) { estado = null; }
  return {
    estado,
    etag: r.blob && r.blob.etag ? r.blob.etag : null,
    actualizado: r.blob && r.blob.uploadedAt ? r.blob.uploadedAt : null,
  };
}

export default async function handler(req, res) {
  const metodo = (req.method || 'GET').toUpperCase();
  if (metodo === 'OPTIONS') return res.status(204).end();

  /* Sonda: la app pregunta si este despliegue sabe sincronizar antes de
     ofrecerlo, igual que hace con el lector de fotos. */
  const listo = !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID;
  if (metodo === 'GET' && req.query && req.query.ping != null) {
    return res.status(200).json({ ok: listo && !!process.env.SYNC_CLAVE, almacen: listo, clave: !!process.env.SYNC_CLAVE });
  }

  if (!process.env.SYNC_CLAVE) {
    return res.status(503).json({ error: 'Falta la variable SYNC_CLAVE en Vercel. Está explicado en SINCRONIZAR.md.' });
  }
  if (!listo) {
    return res.status(503).json({ error: 'Falta conectar un almacén Blob al proyecto en Vercel. Está explicado en SINCRONIZAR.md.' });
  }
  if (!mismaClave(req.headers['x-clave'], process.env.SYNC_CLAVE)) {
    return res.status(401).json({ error: 'Clave de sincronización incorrecta. Revísala en Parámetros.' });
  }

  try {
    if (metodo === 'GET') {
      const { estado, etag, actualizado } = await leer();
      return res.status(200).json({ ok: true, estado, etag, actualizado });
    }

    if (metodo === 'PUT' || metodo === 'POST') {
      const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!cuerpo || typeof cuerpo !== 'object' || !cuerpo.estado) {
        return res.status(400).json({ error: 'Falta el estado a guardar.' });
      }
      const texto = JSON.stringify(cuerpo.estado);
      if (texto.length > LIMITE) {
        return res.status(413).json({ error: 'El historial pesa demasiado para subirlo de una. Exporta y borra días viejos.' });
      }

      const opciones = {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      };
      /* Sin etag se asume que es la primera vez; con etag se exige que nadie
         haya escrito en medio. */
      if (cuerpo.etag) opciones.ifMatch = cuerpo.etag;

      let blob;
      try {
        blob = await put(RUTA, texto, opciones);
      } catch (err) {
        const conflicto = err && (err.name === 'BlobPreconditionFailedError'
          || /precondition|ifmatch|412/i.test(String(err.message || '')));
        if (!conflicto) throw err;
        const actual = await leer();
        return res.status(409).json({
          error: 'El otro equipo guardó primero.',
          estado: actual.estado, etag: actual.etag, actualizado: actual.actualizado,
        });
      }
      return res.status(200).json({ ok: true, etag: blob.etag || null, actualizado: new Date().toISOString() });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    return res.status(502).json({ error: 'No se pudo hablar con el almacén: ' + (err && err.message ? err.message : err) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };
