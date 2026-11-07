/**
 * El dibujo de la hoja de bolsa: columnas, PDF e imagen.
 *
 * Está aparte y sin tocar `Datos` a propósito, porque el app del teléfono usa
 * este MISMO archivo. Lo que antes venía del catálogo y del calendario ahora
 * entra como argumento, en `fechas`, así que las dos apps dibujan la misma
 * hoja con el mismo código en vez de dos copias que se separan con el tiempo.
 *
 * `fechas` lleva los rótulos ya armados:
 *   prod    el día cuya producción lleva la hoja (el sábado es el domingo)
 *   prev    el día anterior, para las columnas de «ant»
 *   sig     el día siguiente al de producción, para el empaque de la mañana
 *   titulo  el nombre del día y la fecha larga, para el encabezado
 *   archivo el pedazo de fecha que va en el nombre del archivo
 */
(function () {
  'use strict';

  const nHoja = (v) => (!v ? '' : Math.round(v).toLocaleString('es-GT'));
  const n2Hoja = (v) => (!v ? '' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 2 }));

  /* MU1 y las filas de ingreso manual no llevan margen: esas cantidades se
     escriben a mano, ya con el criterio de quien las escribe. */
  const llevaMargen = (f) => !['mu1', 'manual'].includes(f.tipo);

  function colsHoja(fechas) {
    const d0 = String(fechas.prod).toUpperCase();
    const d1 = String(fechas.prev).toUpperCase();
    const e1 = String(fechas.sig).toUpperCase();
    return [
      { k: 'pprod', t: 'P PROD', w: 36 },
      { k: 'nombre', t: 'CLAVE', w: 58, alinear: 'left' },
      { k: 'rend', t: 'RENDIM', w: 36 },
      { k: 'q1AM', lineas: [d1, 'QQ AM'], w: 40 },
      { k: 'q1PM', lineas: [d1, 'QQ PM'], w: 40 },
      { k: 'q0AM', lineas: [d0, 'QQ AM'], w: 40 },
      { k: 'q0PM', lineas: [d0, 'QQ PM'], w: 40 },
      { k: 'prodAM', lineas: ['PROD', 'AM'], w: 44 },
      { k: 'prodPM', lineas: ['PROD', 'PM'], w: 44 },
      { k: 'oh', t: 'OH', w: 36 },
      /* El rótulo dice la tanda que esa bolsa va a empacar, no la hora de la
         producción: lo de la mañana se empaca esa tarde y lo de la tarde, a la
         mañana siguiente. */
      { k: 'empAM', lineas: ['EMPAQUE', `${d0} PM`], w: 56 },
      { k: 'empPM', lineas: ['EMPAQUE', `${e1} AM`], w: 56 },
      { k: 'margen', lineas: ['MARGEN', '%'], w: 34 },
      { k: 'total', lineas: ['A', 'IMPRIMIR'], w: 52 },
    ];
  }

  /** El texto de una celda. */
  function valorHoja(f, c) {
    if (c.k === 'pprod') return f.pprod || '';
    if (c.k === 'nombre') return f.nombre;
    if (c.k === 'rend') return f.rend ? nHoja(f.rend) : '';
    if (c.k === 'q1AM') return n2Hoja(f.qq[1].AM);
    if (c.k === 'q1PM') return n2Hoja(f.qq[1].PM);
    if (c.k === 'q0AM') return n2Hoja(f.qq[0].AM);
    if (c.k === 'q0PM') return n2Hoja(f.qq[0].PM);
    /* En las filas de detalle el cálculo lo lleva la de abajo. */
    if (!f.final && ['oh', 'empAM', 'empPM', 'margen', 'total'].includes(c.k)) return '';
    /* El margen sólo en las filas que van a imprimir algo: puesto en todas,
       repite el mismo número cincuenta veces y tapa las que sí importan. */
    if (c.k === 'margen') {
      return llevaMargen(f) && f.margen && (f.prodAM || f.prodPM) ? `${n2Hoja(f.margen)}%` : '';
    }
    return nHoja(f[c.k]);
  }

  /**
   * La letra más grande que cabe: la limita el alto del renglón y, columna
   * por columna, el texto más largo que le toca. Sin lo segundo un «1,550»
   * se sale de RENDIM en cuanto la hoja tiene pocas claves.
   */
  function tamQueCabe(fs, cols, valor, hFila, tope) {
    const R = window.Resumen;
    let max = Math.min(tope || 11, hFila - 1.3);
    cols.forEach((c) => {
      fs.forEach((f) => {
        const s = valor(f, c);
        if (!s) return;
        const porPunto = R.anchoTexto(s, 1, true);
        if (porPunto > 0) max = Math.min(max, (c.w - 5) / porPunto);
      });
    });
    return Math.max(5, max);
  }

  /* Carta acostada y a toda la hoja: son catorce columnas y de pie salían tan
     apretadas que había que acercarse al papel para leerlas. Se arma con las
     mismas piezas del resumen para no cargar ninguna librería. */
  function pdf(fs, fechas) {
    const R = window.Resumen;
    const ANCHO = 792, ALTO = 612;
    const MX = 20, MY = 16;
    const cols = colsHoja(fechas);
    /* La tabla se estira hasta los márgenes, encoja o crezca: el papel
       horizontal da de sobra y el espacio que quede en blanco es letra que
       se pudo haber hecho más grande. */
    const disponible = ANCHO - 2 * MX;
    const bruto = cols.reduce((a, c) => a + c.w, 0);
    const f0 = disponible / bruto;
    cols.forEach((c) => { c.w = Math.floor(c.w * f0 * 100) / 100; });
    const anchoTabla = cols.reduce((a, c) => a + c.w, 0);
    const x0 = MX + Math.max(0, (disponible - anchoTabla) / 2);

    /* Una sola hoja, siempre: el reparto del día se mira completo o no sirve.
       Como el alto está fijo, lo que se estira es la letra, hasta donde el
       renglón y la columna más angosta la dejen crecer. */
    const yCab = MY + 18, hCab = 24;
    const yFilas = yCab + hCab;
    const alCuerpo = ALTO - MY - yFilas - 4;
    const hFila = Math.min(24, alCuerpo / Math.max(1, fs.length));

    const TAM_FILA = tamQueCabe(fs, cols, valorHoja, hFila);
    const TAM_CAB = Math.min(8.5, Math.max(6, TAM_FILA));

    const h = R.hoja(ALTO);
    h.texto(x0, MY, 'IMPRESION DE BOLSA', { tam: 13, negrita: true });
    h.texto(x0, MY, fechas.titulo,
      { tam: 13, negrita: true, alinear: 'right', ancho: anchoTabla });

    let xc = x0;
    cols.forEach((c) => {
      h.rect(xc, yCab, c.w, hCab);
      const ls = c.lineas || [c.t];
      const y0 = yCab + (hCab - ls.length * (TAM_CAB + 2.4)) / 2;
      ls.forEach((l, i) => {
        h.texto(xc, y0 + i * (TAM_CAB + 2.4), l,
          { tam: TAM_CAB, negrita: true, alinear: 'center', ancho: c.w });
      });
      xc += c.w;
    });

    let y = yFilas;
    fs.forEach((f) => {
      let x = x0;
      cols.forEach((c) => {
        h.rect(x, y, c.w, hFila);
        const neg = f.final && (c.k === 'nombre' || c.k === 'total');
        h.texto(x, y + (hFila - TAM_FILA) / 2, valorHoja(f, c),
          { tam: TAM_FILA, negrita: neg, alinear: c.alinear || 'center', ancho: c.w });
        x += c.w;
      });
      y += hFila;
    });

    const bytes = R.pdfBytes([h.fin()], ANCHO, ALTO);
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      nombre: `Impresion Bolsa ${fechas.archivo}.pdf`,
      tam: Math.round(TAM_FILA * 10) / 10,
    };
  }

  /** La hoja completa en imagen, para mandarla por WhatsApp. */
  function imagen(fs, fechas) {
    const R = window.Resumen, COL = R.COL;
    const cols = colsHoja(fechas);
    const ESCALA = 1.55;
    cols.forEach((c) => { c.w = Math.round(c.w * ESCALA); });
    const ANCHO = cols.reduce((a, c) => a + c.w, 0);
    const TIT = 36, CAB = 38, FILA = 22;
    const { cv, g } = R.lienzo(ANCHO, TIT + CAB + fs.length * FILA);

    const xs = [];
    cols.reduce((x, c) => { xs.push(x); return x + c.w; }, 0);

    R.celda(g, 0, 0, ANCHO, TIT, {
      fondo: COL.naranja, texto: `IMPRESIÓN DE BOLSA · ${fechas.titulo}`,
      color: COL.blanco, fuente: 'bold 15px system-ui, sans-serif', borde: COL.naranja,
    });

    cols.forEach((c, i) => {
      R.celda(g, xs[i], TIT, c.w, CAB, { fondo: COL.verde, borde: COL.verde });
      const ls = c.lineas || [c.t];
      g.fillStyle = COL.blanco;
      g.textAlign = 'center';
      g.font = 'bold 10px system-ui, sans-serif';
      ls.forEach((l, j) => {
        g.fillText(l, xs[i] + c.w / 2, TIT + CAB / 2 + (j - (ls.length - 1) / 2) * 12);
      });
    });

    let y = TIT + CAB;
    fs.forEach((f) => {
      cols.forEach((c, i) => {
        const esClave = c.k === 'nombre';
        const fuerte = f.final && (esClave || c.k === 'total');
        R.celda(g, xs[i], y, c.w, FILA, {
          fondo: esClave ? COL.verdeSuave : COL.blanco,
          texto: valorHoja(f, c),
          color: f.final ? COL.tinta : COL.grisTexto,
          alinear: esClave ? 'left' : 'center',
          fuente: `${fuerte ? 'bold ' : ''}11px system-ui, sans-serif`,
        });
      });
      y += FILA;
    });
    return { cv, nombre: `Impresion Bolsa ${fechas.archivo}.png` };
  }

  window.HojaDib = { colsHoja, valorHoja, tamQueCabe, pdf, imagen, llevaMargen };
}());
