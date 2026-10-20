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

/**
 * Sello del contenido guardado.
 *
 * Antes se usaba el etag del blob y eso resultó frágil: es un dato opaco del
 * almacén, y si lo que devuelve al leer no es exactamente lo que `ifMatch`
 * espera al escribir, la condición falla SIEMPRE. El efecto era un 409 eterno
 * —«los dos equipos están guardando a la vez» sin que nadie más estuviera
 * guardando— que sólo se arreglaba borrando el archivo a mano.
 *
 * El sello se calcula aquí sobre el texto guardado, así que leer y escribir
 * hablan el mismo idioma por construcción.
 */
function sello(texto) {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b + c, 2246822519) >>> 0;
  }
  return `${texto.length.toString(36)}-${a.toString(36)}-${b.toString(36)}`;
}

async function leer() {
  const r = await get(RUTA, { access: 'private', useCache: false });
  if (!r || !r.stream) return { estado: null, etag: null, actualizado: null };
  const texto = await new Response(r.stream).text();
  let estado = null;
  try { estado = JSON.parse(texto); } catch (_) { estado = null; }
  return {
    estado,
    etag: sello(texto),
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

      /* La condición se comprueba acá, comparando el sello de lo guardado con
         el que trae la app. Si entre su lectura y este guardado escribió el
         otro equipo, el sello ya no es el mismo y se responde 409 con lo que
         hay, para que vuelva a mezclar.
         Sin etag se asume que es la primera vez de ese equipo. */
      if (cuerpo.etag) {
        const actual = await leer();
        if (actual.etag && actual.etag !== cuerpo.etag) {
          return res.status(409).json({
            error: 'El otro equipo guardó primero.',
            estado: actual.estado, etag: actual.etag, actualizado: actual.actualizado,
          });
        }
      }

      await put(RUTA, texto, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return res.status(200).json({ ok: true, etag: sello(texto), actualizado: new Date().toISOString() });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    return res.status(502).json({ error: 'No se pudo hablar con el almacén: ' + (err && err.message ? err.message : err) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };
