/* Promedios desde los crudos semanales.
 *
 * La app Pedidos lee los sábados los crudos de despacho y bodega (últimas 4
 * semanas) y sube a su nube el despacho por código y día de la semana, con
 * las mismas reglas de PROM_VD: el día lo manda «Verificado Fecha», entran
 * cambios y reposiciones, y se divide la suma entre los días de ese día de la
 * semana en que hubo despacho (AM / AJ = AL).
 *
 * Aquí se juntan los códigos en su clave madre —la que se parametriza en
 * Pedidos; si no hay, la clave de la presentación o el código del producto—,
 * se comparan con los promedios actuales y se aplican con un botón.
 * Usa la misma clave de nube que «Pedidos en su propia app».
 */
(function (raiz) {
  'use strict';
  const D = raiz.Datos;
  const leerJ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const grabarJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const CACHE = 'panprod_promCrudos';
  const estado = { cargando: false, error: '' };

  const mejor = (a, b) => (!a ? b : !b ? a : (b._u || 0) > (a._u || 0) ? b : a);
  /* Lo último de la nube de Pedidos (y de este equipo, si se abre en el centro). */
  async function traer() {
    const PE = raiz.PedidosExt;
    const local = ((leerJ('pedpana.col', null) || {}).catalogo) || {};
    let prom = mejor((leerJ(CACHE, {}) || {}).prom, local.promedios), madres = mejor((leerJ(CACHE, {}) || {}).madres, local.madres);
    estado.error = '';
    if (PE && PE.clave()) {
      estado.cargando = true;
      try {
        const r = await fetch(PE.url(), { headers: { 'X-Pedidos-Key': PE.clave() }, cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
        const cat = (j.data && j.data.col && j.data.col.catalogo) || {};
        prom = mejor(prom, cat.promedios); madres = mejor(madres, cat.madres);
      } catch (e) { estado.error = String(e.message || e); }
      estado.cargando = false;
    } else if (!prom) estado.error = 'sin-clave';
    grabarJ(CACHE, { prom, madres });
    return { prom, madres };
  }
  const guardado = () => leerJ(CACHE, {}) || {};

  /* Código del crudo → clave de Producción. */
  function claveDe(cod, madres) {
    const porClave = new Map(D.productos().map((p) => [String(p.clave).toUpperCase(), p.clave]));
    const porCodigo = new Map(D.productos().filter((p) => p.codigo).map((p) => [String(p.codigo), p.clave]));
    const m = (madres && madres.mapa || {})[cod];
    const pres = D.presentacionDe ? D.presentacionDe(cod) : null;
    for (const c of [m, cod, pres && pres.clave]) {
      if (!c) continue;
      if (porCodigo.has(String(c))) return porCodigo.get(String(c));
      if (porClave.has(String(c).toUpperCase())) return porClave.get(String(c).toUpperCase());
    }
    return null;
  }
  /* Promedio por clave en el orden de Producción (lunes a domingo). */
  function calcular(prom, madres) {
    const suma = {}, sin = [];
    Object.entries(prom.porCodigo || {}).forEach(([cod, s]) => {
      const cl = claveDe(cod, madres);
      if (!cl) { sin.push(cod); return; }
      const v = suma[cl] || (suma[cl] = { s: [0, 0, 0, 0, 0, 0, 0], cods: [] });
      s.forEach((x, w) => { v.s[w] += Number(x) || 0; });
      v.cods.push(cod);
    });
    const out = {};
    Object.entries(suma).forEach(([cl, v]) => {
      // índice de Producción i (0 = lunes) → día de JS w = (i + 1) % 7
      out[cl] = { fila: D.DIAS.map((_, i) => { const w = (i + 1) % 7; return prom.dias[w] ? Math.round(v.s[w] / prom.dias[w]) : 0; }), cods: v.cods };
    });
    return { porClave: out, sin };
  }
  function aplicar(porClave) {
    let n = 0;
    Object.entries(porClave).forEach(([cl, v]) => { D.estado.prom[cl] = v.fila.slice(); n++; });
    D.guardarProm();
    grabarJ(CACHE, { ...guardado(), aplicado: guardado().prom && guardado().prom._u });
    return n;
  }

  raiz.PromCrudos = { traer, guardado, calcular, aplicar, estado };
})(window);
