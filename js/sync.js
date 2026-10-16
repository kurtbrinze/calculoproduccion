/* Sincronización entre equipos.

   El problema real no es mover datos: es que la tablet captura el INV PM
   mientras la laptop decide la producción del mismo día. Copiar el archivo
   entero haría que el último en guardar borrara al otro.

   Por eso se mezcla por secciones: los parámetros, los promedios y cada día
   por separado. De cada sección se guarda una huella de cómo estaba la última
   vez que se sincronizó, y con eso se sabe quién la tocó:

     sólo cambió aquí      → se manda
     sólo cambió allá      → se trae
     cambió en los dos     → gana el de este equipo y se avisa
     nunca se sincronizó   → se pregunta una vez

   Las escrituras cuestan contra el plan gratis de Vercel, así que se sube
   sólo cuando de verdad cambió algo y no más de una vez por minuto. */
(function () {
  'use strict';
  const D = window.Datos;

  const cfg = (k, d = '') => { try { return localStorage.getItem('panprod_' + k) ?? d; } catch (_) { return d; } };
  const setCfg = (k, v) => { try { localStorage.setItem('panprod_' + k, v); } catch (_) {} };
  const delCfg = (k) => { try { localStorage.removeItem('panprod_' + k); } catch (_) {} };

  const URL_API = () => new URL('./api/estado', location.href).href;
  const clave = () => cfg('syncClave').trim();
  const activo = () => cfg('syncOn') === '1' && !!clave();

  // ---------- huellas ----------
  /* JSON con las llaves en orden, para que dos equipos que guardaron lo mismo
     en distinto orden den la misma huella. `migrado` es una marca interna. */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    const ks = Object.keys(v).filter((k) => k !== 'migrado').sort();
    return '{' + ks.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  function huella(v) {
    const s = canon(v);
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    }
    return (h1.toString(36) + h2.toString(36));
  }

  const base = () => { try { return JSON.parse(cfg('syncBase', 'null')) || {}; } catch (_) { return {}; } };
  const guardarBase = (b) => setCfg('syncBase', JSON.stringify(b));

  const estadoLocal = () => ({ v: 1, params: D.estado.params, prom: D.estado.prom, dias: D.estado.dias });

  /* Hasta dónde se baja a comparar en cada rama. Los parámetros se tratan
     enteros, porque media configuración de cada equipo no es una configuración.
     Los días bajan hasta la clave: así conviven el INV PM que capturó la
     tablet y el reparto que hizo la laptop el mismo día. */
  const PROF = { params: 0, prom: 1, dias: 3 };

  const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  /** Árbol de huellas con la misma forma que se compara. */
  function arbol(v, prof) {
    if (prof <= 0 || !esObjeto(v)) return huella(v);
    const out = {};
    Object.keys(v).forEach((k) => { out[k] = arbol(v[k], prof - 1); });
    return out;
  }
  function arbolRaiz(est) {
    return {
      params: arbol(est.params, PROF.params),
      prom: arbol(est.prom, PROF.prom),
      dias: arbol(est.dias, PROF.dias),
    };
  }

  // ---------- la mezcla ----------
  const AUSENTE = Symbol('ausente');

  /**
   * Compara una rama local contra la remota apoyándose en cómo estaba la
   * última vez que se sincronizó. Devuelve el valor que queda, o AUSENTE si
   * toca borrarla.
   */
  function mezclarNodo(l, r, b, prof, etiqueta, reg, eleccion) {
    const hayL = l !== undefined, hayR = r !== undefined;
    if (!hayL && !hayR) return AUSENTE;

    if (prof > 0 && esObjeto(l) && esObjeto(r)) {
      const out = {};
      const bb = esObjeto(b) ? b : {};
      new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(bb)]).forEach((k) => {
        const v = mezclarNodo(l[k], r[k], bb[k], prof - 1, etiqueta, reg, eleccion);
        if (v !== AUSENTE) out[k] = v;
      });
      return out;
    }

    /* La comparación contra la base se hace con la misma forma de árbol que
       tenga esa rama: si no, una huella suelta nunca cuadra contra un árbol y
       un borrado se deshace solo. */
    const comoBase = (v) => b !== undefined && canon(arbol(v, prof)) === canon(b);
    const hL = hayL ? huella(l) : null;
    const hR = hayR ? huella(r) : null;
    const hayB = b !== undefined;

    if (!hayR) {                       // no está allá
      if (comoBase(l)) { reg.borrados.add(etiqueta); return AUSENTE; }       // allá lo borraron
      reg.mandados.add(etiqueta); return l;
    }
    if (!hayL) {                       // no está aquí
      if (comoBase(r)) { reg.borrados.add(etiqueta); return AUSENTE; }       // aquí lo borré
      reg.traidos.add(etiqueta); return r;
    }
    if (hL === hR) return l;
    if (comoBase(r)) { reg.mandados.add(etiqueta); return l; }
    if (comoBase(l)) { reg.traidos.add(etiqueta); return r; }
    if (!hayB) {
      if (!eleccion) { reg.indecisos.add(etiqueta); return l; }
      if (eleccion === 'remoto') { reg.traidos.add(etiqueta); return r; }
      reg.mandados.add(etiqueta); return l;
    }
    reg.conflictos.add(etiqueta);      // se tocó en los dos lados
    return l;
  }

  function mezclar(local, remoto, b, eleccion) {
    const reg = { traidos: new Set(), mandados: new Set(), conflictos: new Set(),
      borrados: new Set(), indecisos: new Set() };
    const salida = (estado) => ({
      estado,
      traidos: [...reg.traidos], mandados: [...reg.mandados], conflictos: [...reg.conflictos],
      borrados: [...reg.borrados], indecisos: [...reg.indecisos],
    });
    if (!remoto) {
      reg.mandados.add('todo');
      return salida({ v: 1, params: local.params, prom: local.prom, dias: { ...local.dias } });
    }
    const bb = b || {};
    const params = mezclarNodo(local.params, remoto.params, bb.params, PROF.params, 'los parámetros', reg, eleccion);
    const prom = mezclarNodo(local.prom, remoto.prom, bb.prom, PROF.prom, 'los promedios', reg, eleccion);

    /* Los días se recorren uno por uno para poder nombrarlos en los avisos. */
    const dias = {};
    const bd = esObjeto(bb.dias) ? bb.dias : {};
    const fechas = new Set([...Object.keys(local.dias || {}), ...Object.keys(remoto.dias || {}), ...Object.keys(bd)]);
    [...fechas].sort().forEach((f) => {
      const v = mezclarNodo((local.dias || {})[f], (remoto.dias || {})[f], bd[f],
        PROF.dias - 1, D.fechaCorta(f), reg, eleccion);
      if (v !== AUSENTE) dias[f] = v;
    });

    return salida({
      v: 1,
      params: params === AUSENTE ? local.params : params,
      prom: prom === AUSENTE ? local.prom : prom,
      dias,
    });
  }

  // ---------- red ----------
  async function pedir(metodo, cuerpo) {
    const opciones = { method: metodo, headers: { 'x-clave': clave() } };
    if (cuerpo) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    const r = await fetch(URL_API(), opciones);
    let d = null;
    try { d = await r.json(); } catch (_) { /* respuesta vacía */ }
    if (!r.ok && r.status !== 409) {
      throw new Error((d && d.error) || `El servidor respondió ${r.status}.`);
    }
    return { estado: r.status, datos: d || {} };
  }

  /** Si este despliegue trae el endpoint y está configurado. */
  async function disponible() {
    try {
      const r = await fetch(URL_API() + '?ping=1');
      if (!r.ok) return { hay: false };
      const j = await r.json();
      return { hay: true, ...j };
    } catch (_) { return { hay: false }; }
  }

  // ---------- presupuesto de escrituras ----------
  /* El plan gratis da 2,000 escrituras al mes y bloquea el almacén 30 días si
     se pasa, así que se llevan contadas. */
  function mes() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  function escrituras(sumar) {
    let c = {};
    try { c = JSON.parse(cfg('syncEscrituras', '{}')) || {}; } catch (_) { c = {}; }
    if (c.mes !== mes()) c = { mes: mes(), n: 0 };
    if (sumar) { c.n = (c.n || 0) + 1; setCfg('syncEscrituras', JSON.stringify(c)); }
    return c.n || 0;
  }
  const TOPE_AVISO = 1500;

  let corriendo = false, ultimaSubida = 0;

  /**
   * Una pasada de sincronización.
   *   manual  → se salta la espera entre subidas
   *   eleccion→ 'local' | 'remoto' para el primer encuentro
   */
  async function sincronizar({ manual = false, eleccion = null } = {}) {
    if (!activo()) return { ok: false, motivo: 'apagada' };
    if (corriendo) return { ok: false, motivo: 'en curso' };
    corriendo = true;
    try {
      const bajada = await pedir('GET');
      let remoto = bajada.datos.estado || null;
      let etag = bajada.datos.etag || null;

      let m = mezclar(estadoLocal(), remoto, base(), eleccion);
      if (m.indecisos.length) {
        return { ok: false, motivo: 'eleccion', indecisos: m.indecisos, total: m.indecisos.length };
      }

      // 1. lo que vino de allá se aplica aquí
      const hayQueTraer = m.traidos.length || m.borrados.length;
      if (hayQueTraer) aplicar(m.estado);

      // 2. lo que falta allá se manda
      const igual = remoto && huella(m.estado) === huella({ v: 1, params: remoto.params, prom: remoto.prom, dias: remoto.dias });
      let subido = false;
      if (!igual) {
        const pronto = !manual && Date.now() - ultimaSubida < 60000;
        if (!pronto) {
          let r = await pedir('PUT', { estado: m.estado, etag });
          if (r.estado === 409) {
            /* El otro equipo escribió mientras tanto: se vuelve a mezclar
               contra lo que acaba de dejar y se intenta una vez más. */
            remoto = r.datos.estado || null;
            etag = r.datos.etag || null;
            m = mezclar(estadoLocal(), remoto, base(), eleccion || 'local');
            if (m.traidos.length || m.borrados.length) aplicar(m.estado);
            r = await pedir('PUT', { estado: m.estado, etag });
            if (r.estado === 409) throw new Error('Los dos equipos están guardando a la vez. Intenta de nuevo en un momento.');
          }
          etag = r.datos.etag || etag;
          ultimaSubida = Date.now();
          escrituras(true);
          subido = true;
        }
      }

      guardarBase(arbolRaiz(m.estado));
      if (etag) setCfg('syncEtag', etag);
      setCfg('syncUltima', new Date().toISOString());
      return {
        ok: true, subido, traidos: m.traidos, mandados: m.mandados,
        conflictos: m.conflictos, borrados: m.borrados,
        escrituras: escrituras(false),
      };
    } finally { corriendo = false; }
  }

  /** Escribe el resultado de la mezcla en el estado de la app. */
  function aplicar(est) {
    if (est.params) D.estado.params = D.fusionarParams(est.params);
    if (est.prom) D.estado.prom = est.prom;
    D.estado.dias = est.dias || {};
    D.guardarParams(); D.guardarProm();
    /* Se graba directo: guardarDias() limpia los días vacíos y eso borraría
       días que el otro equipo acaba de crear pero todavía no llena. */
    D.grabar('dias', D.estado.dias);
  }

  /** Olvida la huella: la próxima sincronización vuelve a preguntar. */
  function reiniciar() {
    delCfg('syncBase'); delCfg('syncEtag'); delCfg('syncUltima');
  }

  window.Sync = {
    sincronizar, disponible, reiniciar, activo, clave, cfg, setCfg,
    escrituras: () => escrituras(false), TOPE_AVISO,
    ultima: () => cfg('syncUltima', ''),
    // expuestos para las pruebas
    _mezclar: mezclar, _huella: huella, _canon: canon,
  };
})();
