/* Sincronización entre equipos.

   El problema real no es mover datos: es que la tablet captura el INV PM
   mientras la laptop decide la producción del mismo día. Copiar el archivo
   entero haría que el último en guardar borrara al otro.

   Por eso se mezcla por partes: los parámetros, los promedios, cada pedido y
   cada día por separado, y los días recientes hasta la clave del producto. De
   cada parte se guarda una huella de cómo estaba la última vez que se
   sincronizó, y con eso se sabe quién la tocó:

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
  /** Devuelve false si el navegador no la dejó guardar: sin base todo parece distinto. */
  function guardarBase(b) {
    try { localStorage.setItem('panprod_syncBase', JSON.stringify(b)); return true; }
    catch (_) { return false; }
  }

  /* Al abrir, la app crea el registro del día en blanco. Ese fantasma no es un
     cambio: si entrara a la comparación, chocaría contra el día de verdad que
     tiene el otro equipo y pararía toda la sincronización. */
  function diasReales() {
    const out = {};
    Object.keys(D.estado.dias || {}).forEach((f) => {
      if (!D.vacio(D.estado.dias[f])) out[f] = D.estado.dias[f];
    });
    return out;
  }
  const estadoLocal = () => ({
    v: 1, params: D.estado.params, prom: D.estado.prom,
    dias: diasReales(), pedidos: D.estado.pedidos || {},
  });

  /* Hasta dónde se baja a comparar en cada rama. Los parámetros se tratan
     enteros, porque media configuración de cada equipo no es una configuración.
     Los días bajan hasta la clave: así conviven el INV PM que capturó la
     tablet y el reparto que hizo la laptop el mismo día. */
  const PROF = { params: 0, prom: 1, pedidos: 1 };

  /* Los días recientes se comparan clave por clave: ahí es donde los dos
     equipos escriben el mismo día y hay que conservar lo de ambos. Los días
     viejos ya nadie los toca, así que con una sola huella por día alcanza y la
     memoria de comparación pesa la mitad que comparando todo por sección. */
  const DIAS_FINOS = 60;
  const profDia = (fecha) => (fecha >= D.sumarDias(D.hoyISO(), -DIAS_FINOS) ? 2 : 0);

  const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  /** Árbol de huellas con la misma forma que se compara. */
  function arbol(v, prof) {
    if (prof <= 0 || !esObjeto(v)) return huella(v);
    const out = {};
    Object.keys(v).forEach((k) => {
      if (k === 'migrado') return;                      // marca interna
      if (esObjeto(v[k]) && !Object.keys(v[k]).length) return;   // sección vacía
      out[k] = arbol(v[k], prof - 1);
    });
    return out;
  }
  /** Los días no van todos a la misma profundidad. */
  function arbolDias(dias) {
    const out = {};
    Object.keys(dias || {}).forEach((f) => { out[f] = arbol(dias[f], profDia(f)); });
    return out;
  }
  function arbolRaiz(est) {
    return {
      params: arbol(est.params, PROF.params),
      prom: arbol(est.prom, PROF.prom),
      dias: arbolDias(est.dias),
      pedidos: arbol(est.pedidos || {}, PROF.pedidos),
    };
  }

  // ---------- la mezcla ----------
  const AUSENTE = Symbol('ausente');

  /**
   * Lo que el otro equipo no mandó no siempre es algo borrado: si corre una
   * versión anterior, puede ser algo que su versión todavía no conoce. Las
   * secciones —el estado completo y cada día— nunca se borran enteras, así que
   * lo que falte del otro lado se completa con lo de aquí antes de comparar.
   * Sin esto, una tablet con la versión vieja borraba los pedidos especiales
   * de la laptop con sólo sincronizar.
   */
  function completar(local, remoto) {
    if (!esObjeto(local) || !esObjeto(remoto)) return remoto;
    const out = { ...remoto };
    Object.keys(local).forEach((k) => { if (out[k] === undefined) out[k] = local[k]; });
    return out;
  }

  /**
   * Si el estado mezclado y el remoto dicen lo mismo. Compara sección por
   * sección y trata la que falte como vacía: así una sección nueva no los hace
   * ver distintos para siempre y subir en cada sincronización.
   */
  function mismoEstado(a, b) {
    if (!a || !b) return false;
    const llaves = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => k !== 'v'));
    for (const k of llaves) {
      if (canon(a[k] === undefined ? {} : a[k]) !== canon(b[k] === undefined ? {} : b[k])) return false;
    }
    return true;
  }

  /**
   * Compara una rama local contra la remota apoyándose en cómo estaba la
   * última vez que se sincronizó. Devuelve el valor que queda, o AUSENTE si
   * toca borrarla.
   */
  const SECCION = {
    invPM: 'INV PM', turnos: 'reparto', stockAyer: 'STOCK AYER',
    prodAyer: 'PROD AYER', crudo: 'lectura', nota: 'nota', cerrado: 'cierre',
  };

  /* Cuando el choque es en una sola casilla conviene nombrarla: «MIE 14/10»
     obliga a revisar el día entero, «MIE 14/10 (INV PM S19)» dice qué número
     mirar. Los avisos de lo que se trajo o se mandó siguen nombrando sólo el
     día, porque ahí una línea por clave sería una lista enorme. */
  function detallar(etiqueta, ruta) {
    if (!ruta || !ruta.length) return etiqueta;
    return etiqueta + ' (' + ruta.map((k, i) => (i ? k : (SECCION[k] || k))).join(' ') + ')';
  }

  function mezclarNodo(l, r, b, prof, etiqueta, reg, eleccion, ruta) {
    const hayL = l !== undefined, hayR = r !== undefined;
    if (!hayL && !hayR) return AUSENTE;

    if (prof > 0 && esObjeto(l) && esObjeto(r)) {
      const out = {};
      const bb = esObjeto(b) ? b : {};
      new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(bb)]).forEach((k) => {
        const v = mezclarNodo(l[k], r[k], bb[k], prof - 1, etiqueta, reg, eleccion,
          ruta ? ruta.concat(k) : null);
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
      if (!eleccion) { reg.indecisos.add(detallar(etiqueta, ruta)); return l; }
      if (eleccion === 'remoto') { reg.traidos.add(etiqueta); return r; }
      reg.mandados.add(etiqueta); return l;
    }
    reg.conflictos.add(detallar(etiqueta, ruta));   // se tocó en los dos lados
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
      return salida({ v: 1, params: local.params, prom: local.prom,
        dias: { ...local.dias }, pedidos: { ...local.pedidos } });
    }
    const bb = b || {};
    remoto = completar(local, remoto);
    const params = mezclarNodo(local.params, remoto.params, bb.params, PROF.params, 'los parámetros', reg, eleccion);
    const prom = mezclarNodo(local.prom, remoto.prom, bb.prom, PROF.prom, 'los promedios', reg, eleccion);
    const pedidos = mezclarNodo(local.pedidos || {}, remoto.pedidos || {}, bb.pedidos,
      PROF.pedidos, 'los pedidos especiales', reg, eleccion);

    /* Los días se recorren uno por uno para poder nombrarlos en los avisos. */
    const dias = {};
    const bd = esObjeto(bb.dias) ? bb.dias : {};
    const fechas = new Set([...Object.keys(local.dias || {}), ...Object.keys(remoto.dias || {}), ...Object.keys(bd)]);
    [...fechas].sort().forEach((f) => {
      const dl = (local.dias || {})[f];
      let dr = (remoto.dias || {})[f];
      /* Un día que no viene es un día borrado; un día que viene sin una de sus
         secciones es un equipo con versión vieja. Sólo lo segundo se completa. */
      if (dr !== undefined) dr = completar(dl, dr);
      const v = mezclarNodo(dl, dr, bd[f], profDia(f), D.fechaCorta(f), reg, eleccion, []);
      if (v !== AUSENTE) dias[f] = v;
    });

    return salida({
      v: 1,
      params: params === AUSENTE ? local.params : params,
      prom: prom === AUSENTE ? local.prom : prom,
      pedidos: pedidos === AUSENTE ? (local.pedidos || {}) : pedidos,
      dias,
    });
  }

  // ---------- red ----------
  /* Vercel corta los envíos en 4.5 MB. Se avisa antes para que el error se
     entienda, en vez de que la petición muera en el camino. */
  const TOPE_ENVIO = 4 * 1024 * 1024;

  async function pedir(metodo, cuerpo) {
    const opciones = { method: metodo, headers: { 'x-clave': clave() } };
    if (cuerpo) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
      if (opciones.body.length > TOPE_ENVIO) {
        throw new Error('El historial ya pesa más de lo que se puede subir de una. '
          + 'Expórtalo a Excel desde el Historial y borra los días más viejos.');
      }
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

      /* Lo que no tiene dudas se aplica siempre, aunque alguna cosa suelta haya
         quedado sin decidir. Antes una sola duda paraba la sincronización
         entera y el otro equipo se quedaba sin los cientos de días que sí
         estaban claros. */
      if (m.traidos.length || m.borrados.length) aplicar(m.estado);

      /* Con dudas pendientes no se sube nada: subir sería decidir en silencio
         y pisarle al otro equipo lo suyo. Se aplica lo claro y se avisa. */
      if (m.indecisos.length) {
        return {
          ok: true, pendiente: 'eleccion', subido: false,
          traidos: m.traidos, mandados: [], conflictos: m.conflictos,
          borrados: m.borrados, indecisos: m.indecisos, total: m.indecisos.length,
          escrituras: escrituras(false),
        };
      }

      const igual = mismoEstado(m.estado, remoto);
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

      const baseOk = guardarBase(arbolRaiz(m.estado));
      if (etag) setCfg('syncEtag', etag);
      setCfg('syncUltima', new Date().toISOString());
      return {
        ok: true, subido, baseOk, traidos: m.traidos, mandados: m.mandados,
        conflictos: m.conflictos, borrados: m.borrados, indecisos: [],
        escrituras: escrituras(false),
      };
    } finally { corriendo = false; }
  }

  /** Escribe el resultado de la mezcla en el estado de la app. */
  function aplicar(est) {
    if (est.params) D.estado.params = D.fusionarParams(est.params);
    if (est.prom) D.estado.prom = est.prom;
    D.estado.pedidos = est.pedidos || {};
    D.estado.dias = est.dias || {};
    D.guardarParams(); D.guardarProm(); D.guardarPedidos();
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
    escrituras: () => escrituras(false), TOPE_AVISO, TOPE_ENVIO,
    ultima: () => cfg('syncUltima', ''),
    // expuestos para las pruebas
    _mezclar: mezclar, _huella: huella, _canon: canon, _mismoEstado: mismoEstado,
    _arbolRaiz: arbolRaiz,
  };
})();
