/* Pedidos desde la app Pedidos.
 *
 * Los pedidos se mudaron a su propia app (pedidos_pana). Con este interruptor
 * encendido —se elige por equipo, en Parámetros— Producción deja de capturar
 * pedidos y los toma de allá:
 *   - Dentro del Centro de Control las dos apps comparten sitio, así que se
 *     leen directo de lo que Pedidos guardó en este equipo (pedpana.col).
 *   - Además se piden a la nube de Pedidos con su clave, para traer lo que se
 *     capturó en otros equipos.
 * Se mezclan por pedido (gana el cambio más nuevo) y quedan en memoria como
 * D.estado.pedidos, que es lo único que lee el cálculo. Se guarda una copia
 * (panprod_pedidosExt) para abrir sin señal.
 *
 * Mientras está encendido, los pedidos propios de Producción (panprod_pedidos)
 * no se tocan ni se sincronizan: si se apaga, vuelven tal como estaban.
 */
(function (raiz) {
  'use strict';
  const D = raiz.Datos;
  const CFG = 'panprod_pedExt', CACHE = 'panprod_pedidosExt';
  const NUBE = 'https://centrocontrolpana.vercel.app/apps/pedidos/api/sync';
  const leerJ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const grabarJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  const cfg = () => leerJ(CFG, {}) || {};
  const activo = () => cfg().activo === true;
  const clave = () => String(cfg().clave || '');
  function fijar(campos) { grabarJ(CFG, { ...cfg(), ...campos }); }

  /* Dentro del centro la nube se pide en el mismo sitio; sola, al centro. */
  const url = () => (location.pathname.startsWith('/apps/produccion') ? '/apps/pedidos/api/sync' : NUBE);
  const estado = { ultima: Number((leerJ(CFG, {}) || {}).ultima) || 0, n: 0, error: '', origen: '' };

  /* De la forma de Pedidos (con _u y marcas de borrado) a la de Producción. */
  function aplicar(col) {
    const out = {};
    Object.values(col || {}).forEach((p) => {
      if (!p || p.borrado || !p.id) return;
      const { _u, borrado, ...resto } = p;
      out[p.id] = resto;
    });
    D.estado.pedidos = out;
    estado.n = Object.keys(out).length;
    return out;
  }
  function mezclar(a, b) {
    const out = { ...(a || {}) };
    Object.entries(b || {}).forEach(([id, r]) => { const c = out[id]; if (r && (!c || (r._u || 0) > (c._u || 0))) out[id] = r; });
    return out;
  }
  const locales = () => ((leerJ('pedpana.col', null) || {}).pedidos) || null;

  /* Al abrir: lo último que se leyó, para que el cálculo arranque con pedidos. */
  function cargarCache() {
    if (!activo()) return;
    const cache = leerJ(CACHE, {}) || {};
    aplicar(mezclar(cache, locales()));
  }

  let corriendo = null;
  async function refrescar() {
    if (!activo()) return false;
    if (corriendo) return corriendo;
    corriendo = (async () => {
      let col = mezclar(leerJ(CACHE, {}) || {}, locales());
      estado.origen = locales() ? 'este equipo' : '';
      estado.error = '';
      if (clave()) {
        try {
          const r = await fetch(url(), { headers: { 'X-Pedidos-Key': clave() }, cache: 'no-store' });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
          col = mezclar(col, j.data && j.data.col && j.data.col.pedidos);
          estado.origen = estado.origen ? 'este equipo y la nube' : 'la nube';
        } catch (e) { estado.error = String(e.message || e); }
      } else if (!estado.origen) estado.error = 'Falta la clave de Pedidos';
      grabarJ(CACHE, col);
      aplicar(col);
      estado.ultima = Date.now(); fijar({ ultima: estado.ultima });
      return true;
    })();
    try { return await corriendo; } finally { corriendo = null; }
  }

  cargarCache();
  raiz.PedidosExt = { activo, clave, fijar, refrescar, estado, cargarCache, url };
})(window);
