/**
 * Traslados de Zona 18 a Zona 2.
 *
 * La mañana del día a producir hay que bajar a Zona 2 el pan que allá se va a
 * empacar. La decisión sale de comparar lo que quedó anoche contra lo que se
 * vende hoy:
 *
 *     CONTEO   = el cierre de anoche, que es el STOCK AYER del día a producir
 *     VENTA    = la venta de hoy, la del día siguiente a ese conteo
 *     FALTA    = VENTA − CONTEO, cuando el conteo se queda corto
 *
 * Esas bolsas se pasan a unidades con la presentación de la clave y de ahí a
 * parrillas con las unidades sin empacar que cabe una —que no es lo mismo que
 * las bolsas por parrilla del producto ya empacado, porque lo que viaja va sin
 * empaque—. Después se reparte en los camiones del día, en el orden en que
 * salen, y lo que no cabe queda anotado para que lo decidan en Zona 18.
 */
(function () {
  'use strict';
  const D = window.Datos, C = window.Calculo;

  const r2 = (n) => Math.round(n * 100) / 100;

  const cfg = () => D.estado.params.traslado || { claves: {}, camiones: [] };

  /** Unidades que lleva una bolsa de esa clave, de su presentación principal. */
  function uxbDe(clave) {
    const ps = D.presentaciones().filter((p) => p.clave === clave);
    /* La presentación que se llama igual que la clave es la del producto
       suelto; si no hay, vale la primera que le pegue. */
    const p = ps.find((x) => x.cod === clave) || ps[0];
    return p ? Math.max(1, Number(p.uxb) || 1) : 1;
  }

  /** Los camiones que salen ese día, en el orden de la tabla. */
  function camionesDe(fecha) {
    const c = cfg();
    const dia = D.indiceDia(fecha);
    return (c.camiones || [])
      .filter((x) => (x.dias || []).includes(dia))
      .map((x) => {
        const resta = c.arrastre !== false ? (Number(x.arrastre) || 0) : 0;
        return { ...x, resta, capacidad: Math.max(0, (Number(x.total) || 0) - resta) };
      });
  }

  /** Lo que cada clave necesita que baje, antes de repartir en camiones. */
  function faltantes(fecha) {
    const P = D.estado.params;
    const c = cfg();
    const reg = D.registro(fecha);
    const t = C.calcularTodo(D.estado, reg, fecha);
    const ayer = D.sumarDias(fecha, -1);
    const out = [];

    Object.keys(c.claves || {}).forEach((clave) => {
      const k = c.claves[clave];
      if (!k || !k.viaja) return;
      const f = t.filas.find((x) => x.clave === clave);
      if (!f) return;

      let bolsas = 0, motivo = '';
      if (k.regla === 'siempre') {
        bolsas = Math.max(0, Math.round(f.ventaHoy));
        motivo = 'baja todos los días';
      } else if (k.regla === 'produccionAyer') {
        /* Lo que se produjo anoche baja entero: se hizo en Zona 18 para
           empacarse en Zona 2, no para quedarse. */
        const turnos = (D.estado.dias[ayer] ? D.migrar(D.estado.dias[ayer]).turnos : {})[clave] || {};
        const qq = Object.values(turnos).reduce((a, b) => a + (Number(b) || 0), 0);
        bolsas = Math.round(qq * (Number(f.rend) || 0));
        motivo = qq ? `se produjeron ${r2(qq)} QQ el ${D.fechaCorta(ayer)}` : '';
        if (!bolsas) return;
      } else {
        /* La regla de siempre: el conteo de anoche contra la venta de hoy. */
        bolsas = Math.round(f.ventaHoy - f.stockAyer);
        motivo = 'el conteo no cubre la venta de hoy';
        if (bolsas <= 0) return;
      }
      if (bolsas <= 0) return;

      const uxb = uxbDe(clave);
      const uxp = Number(k.uxp) || 0;
      const unidades = bolsas * uxb;
      const parrillas = uxp > 0 ? Math.ceil(unidades / uxp) : 0;
      /* Cobertura: qué parte del día aguanta lo que quedó. Cuanto menos,
         antes se vacía y antes tiene que subir al camión. */
      /* Sólo tiene sentido para la regla del conteo: una clave que baja porque
         se produjo anoche no se mide por lo que le queda en Zona 2. */
      const cob = k.regla === 'conteo' && f.ventaHoy > 0 ? f.stockAyer / f.ventaHoy : null;

      out.push({
        clave,
        alias: (D.fichaPorClave(clave) || {}).alias || clave,
        regla: k.regla, motivo,
        conteo: Math.round(f.stockAyer), venta: Math.round(f.ventaHoy),
        bolsas, uxb, uxp, unidades, parrillas,
        cobertura: cob == null ? null : r2(cob),
        sinUxp: !(uxp > 0),
      });
    });

    /* El que se vacía primero carga primero. Sin venta —el que baja siempre o
       por producción— va después, que su urgencia no se puede medir así. */
    out.sort((a, b) => {
      const ca = a.cobertura == null ? 99 : a.cobertura;
      const cb = b.cobertura == null ? 99 : b.cobertura;
      return ca - cb || b.parrillas - a.parrillas || a.clave.localeCompare(b.clave);
    });
    return out;
  }

  /**
   * Reparte las parrillas en los camiones del día. Con `completos` suben
   * primero las claves que caben enteras —llegar con media clave no resuelve
   * nada en el empaque— y la que no cabe se parte al final; con `orden`, se
   * llena estrictamente por prioridad.
   */
  function plan(fecha) {
    const c = cfg();
    const lista = faltantes(fecha);
    const camiones = camionesDe(fecha).map((x) => ({ ...x, carga: [], usado: 0 }));
    const capacidad = camiones.reduce((a, x) => a + x.capacidad, 0);
    const pedido = lista.reduce((a, x) => a + x.parrillas, 0);

    /* Pendiente por clave, en el orden en que se va a cargar. */
    let cola = lista.map((x) => ({ clave: x.clave, alias: x.alias, parrillas: x.parrillas }));
    if (c.carga !== 'orden') {
      let libre = capacidad;
      const caben = [], parten = [];
      cola.forEach((x) => {
        if (x.parrillas <= libre) { caben.push(x); libre -= x.parrillas; } else parten.push(x);
      });
      cola = [...caben, ...parten];
    }

    let i = 0;
    cola.forEach((x) => {
      let queda = x.parrillas;
      while (queda > 0 && i < camiones.length) {
        const cam = camiones[i];
        const hueco = cam.capacidad - cam.usado;
        if (hueco <= 0) { i++; continue; }
        const pone = Math.min(hueco, queda);
        cam.carga.push({ clave: x.clave, alias: x.alias, parrillas: pone, partida: pone < x.parrillas });
        cam.usado += pone;
        queda -= pone;
      }
      x.queda = queda;
    });

    const sobra = cola.filter((x) => x.queda > 0)
      .map((x) => ({ clave: x.clave, alias: x.alias, parrillas: x.queda }));

    return {
      fecha, lista, camiones, capacidad, pedido,
      cargado: camiones.reduce((a, x) => a + x.usado, 0),
      sobra,
      sobraParrillas: sobra.reduce((a, x) => a + x.parrillas, 0),
      sinCamiones: !camiones.length,
      sinUxp: lista.filter((x) => x.sinUxp).map((x) => x.clave),
    };
  }

  // ---------- la imagen que se manda por WhatsApp ----------
  function imagen(fecha) {
    const R = window.Resumen, COL = R.COL;
    const p = plan(fecha);
    const d = D.desdeISO(fecha);
    const larga = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const ANCHO = 560, TIT = 34, CAB = 26, FILA = 26, SUB = 28;
    const filas = p.camiones.reduce((a, c) => a + Math.max(1, c.carga.length) + 1, 0)
      + (p.sobra.length ? p.sobra.length + 1 : 0);
    const alto = TIT + CAB + filas * FILA + 6;
    const { cv, g } = R.lienzo(ANCHO, alto);

    const cC = 150, cP = 120, cR = ANCHO - cC - cP;
    R.celda(g, 0, 0, ANCHO, TIT, {
      fondo: COL.naranja, texto: `TRASLADOS A ZONA 2 · ${D.nombreDia(fecha)} ${larga}`,
      color: COL.blanco, fuente: 'bold 14px system-ui, sans-serif', borde: COL.naranja,
    });
    let y = TIT;
    [['CAMIÓN', cC, 0], ['PARRILLAS', cP, cC], ['CLAVE', cR, cC + cP]].forEach(([t, w, x]) => {
      R.celda(g, x, y, w, CAB, {
        fondo: COL.verde, borde: COL.verde, texto: t, color: COL.blanco,
        fuente: 'bold 11px system-ui, sans-serif',
      });
    });
    y += CAB;

    p.camiones.forEach((c) => {
      R.celda(g, 0, y, cC, FILA, {
        fondo: COL.verdeSuave, texto: c.id, alinear: 'left',
        fuente: 'bold 13px system-ui, sans-serif',
      });
      R.celda(g, cC, y, cP, FILA, {
        fondo: COL.verdeSuave, texto: `${c.usado} de ${c.capacidad}`,
        fuente: 'bold 12px system-ui, sans-serif',
      });
      R.celda(g, cC + cP, y, cR, FILA, { fondo: COL.verdeSuave, texto: '' });
      y += FILA;
      if (!c.carga.length) {
        R.celda(g, 0, y, ANCHO, FILA, {
          texto: 'vacío', color: COL.grisTexto, alinear: 'left',
          fuente: '12px system-ui, sans-serif', fondo: COL.blanco,
        });
        y += FILA;
        return;
      }
      c.carga.forEach((x) => {
        R.celda(g, 0, y, cC, FILA, { fondo: COL.blanco, texto: '' });
        R.celda(g, cC, y, cP, FILA, {
          fondo: COL.blanco, texto: String(x.parrillas),
          fuente: 'bold 13px system-ui, sans-serif',
        });
        R.celda(g, cC + cP, y, cR, FILA, {
          fondo: COL.blanco, texto: x.alias + (x.partida ? ' (parte)' : ''),
          alinear: 'left', fuente: '13px system-ui, sans-serif',
        });
        y += FILA;
      });
    });

    if (p.sobra.length) {
      R.celda(g, 0, y, ANCHO, FILA, {
        fondo: COL.naranjaSuave, borde: COL.naranjaSuave, color: COL.tinta, alinear: 'left',
        texto: `QUEDA PARA ZONA 18 · ${p.sobraParrillas} parrillas`,
        fuente: 'bold 12px system-ui, sans-serif',
      });
      y += FILA;
      p.sobra.forEach((x) => {
        R.celda(g, 0, y, cC, FILA, { fondo: COL.blanco, texto: '' });
        R.celda(g, cC, y, cP, FILA, {
          fondo: COL.blanco, texto: String(x.parrillas), color: COL.grisTexto,
          fuente: 'bold 13px system-ui, sans-serif',
        });
        R.celda(g, cC + cP, y, cR, FILA, {
          fondo: COL.blanco, texto: x.alias, alinear: 'left', color: COL.grisTexto,
          fuente: '13px system-ui, sans-serif',
        });
        y += FILA;
      });
    }
    void SUB;
    return { cv, nombre: `Traslados Zona 2 ${R.fechaArchivo(fecha)}.png`, plan: p };
  }

  window.Traslado = { faltantes, plan, camionesDe, imagen, uxbDe, cfg };
})();
