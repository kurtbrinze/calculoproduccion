/* Resumen de producción del día.

   Tres salidas, todas armadas en el momento y ninguna se guarda ni se
   sincroniza: sale del día que está en pantalla y se va al teléfono o al disco.

     - Imagen simple: clave y quintales, para mandar por WhatsApp.
     - Imagen completa: además el desglose por turno de esa planta.
     - PDF media carta: la hoja de trabajo de siempre, ya llena.

   Las imágenes van en claro, no en el tema oscuro del app: se leen en el
   teléfono y se imprimen sin gastar tinta. */
(function () {
  'use strict';
  const D = window.Datos, C = window.Calculo;

  // Los mismos colores de la hoja de Excel que ya usa.
  const COL = {
    verde: '#4E7C2F', verdeSuave: '#EAF3E3', verdeLinea: '#C7DEB4',
    naranja: '#C0511B', naranjaSuave: '#F6C7A4', tinta: '#1F3312',
    gris: '#D9D9D9', grisTexto: '#8A8A8A', blanco: '#FFFFFF', linea: '#9CB98A',
  };

  const n2 = (v) => (!v ? '0' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 2 }));
  const n0 = (v) => (v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('es-GT'));
  const fechaArchivo = (iso) => String(iso).replace(/-/g, '_');

  /** Lo que se va a mostrar, ya resuelto para una planta. */
  function datos(fecha, planta) {
    const reg = D.registro(fecha);
    const t = C.calcularTodo(D.estado, reg, fecha);
    const turnos = planta === 'TODAS' ? D.TURNOS : D.turnosDePlanta(planta);
    const nombrePlanta = planta === 'TODAS' ? 'TODAS LAS PLANTAS'
      : ((D.PLANTAS.find((p) => p.id === planta) || {}).nombre || planta).toUpperCase();

    const filas = t.filas.map((f) => {
      const porTurno = {};
      let total = 0;
      turnos.forEach((x) => {
        const v = Number(f.asign[x.id]) || 0;
        porTurno[x.id] = v;
        total += v;
      });
      return {
        clave: f.clave,
        etiqueta: (D.fichaPorClave(f.clave) || {}).alias || f.clave,
        rend: f.rend,
        puede: Object.fromEntries(turnos.map((x) => [x.id, (D.fichaPorClave(f.clave) || {}).turnos.includes(x.id)])),
        porTurno,
        total: Math.round(total * 100) / 100,
        stockAyer: f.stockAyer, prodAyerQQ: f.prodAyerQQ, ventaHoy: f.ventaHoy,
        teoricoHoy: f.teoricoHoy, invPM: f.invPM, ventaManana: f.ventaManana,
        ventaPasado: C.demandaDe(D.estado, D.estado.params, f.clave, D.sumarDias(fecha, 2)),
        todosTurnos: f.asign,
      };
    });
    const porTurnoTotal = {};
    turnos.forEach((x) => { porTurnoTotal[x.id] = Math.round(filas.reduce((a, f) => a + f.porTurno[x.id], 0) * 100) / 100; });
    return {
      fecha, planta, nombrePlanta, turnos, filas,
      diaManana: D.fechaCorta(D.sumarDias(fecha, 1)),
      diaPasado: D.fechaCorta(D.sumarDias(fecha, 2)),
      porTurnoTotal,
      total: Math.round(filas.reduce((a, f) => a + f.total, 0) * 100) / 100,
      dia: D.nombreDia(fecha),
      fechaLarga: (() => { const d = D.desdeISO(fecha); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })(),
    };
  }

  // ================= imágenes =================
  const ESC = 2;   // se dibuja al doble para que no salga pixeleado en el teléfono

  function lienzo(ancho, alto) {
    const cv = document.createElement('canvas');
    cv.width = ancho * ESC; cv.height = alto * ESC;
    const g = cv.getContext('2d');
    g.scale(ESC, ESC);
    g.textBaseline = 'middle';
    g.fillStyle = COL.blanco;
    g.fillRect(0, 0, ancho, alto);
    return { cv, g };
  }

  function celda(g, x, y, an, al, { fondo, texto, color, fuente, alinear = 'center', borde = COL.verdeLinea }) {
    if (fondo) { g.fillStyle = fondo; g.fillRect(x, y, an, al); }
    if (borde) { g.strokeStyle = borde; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, an - 1, al - 1); }
    if (texto == null || texto === '') return;
    g.fillStyle = color || COL.tinta;
    g.font = fuente || '12px system-ui, sans-serif';
    g.textAlign = alinear;
    const px = alinear === 'center' ? x + an / 2 : (alinear === 'right' ? x + an - 8 : x + 8);
    g.fillText(String(texto), px, y + al / 2);
  }

  /** Encabezado común de las dos imágenes. */
  function titulo(g, x, y, an, al, d) {
    celda(g, x, y, an, al, {
      fondo: COL.naranja, texto: `PRODUCCIÓN ${d.nombrePlanta} · ${d.dia} ${d.fechaLarga}`,
      color: COL.blanco, fuente: 'bold 13px system-ui, sans-serif', borde: COL.naranja,
    });
  }

  /** Imagen de clave y quintales, la que se manda por WhatsApp. */
  function imagenSimple(d) {
    const ANCHO = 360, FILA = 24, TIT = 30, CAB = 26;
    const alto = TIT + CAB + d.filas.length * FILA + FILA;
    const { cv, g } = lienzo(ANCHO, alto);
    const cClave = 150, cProd = ANCHO - cClave;
    let y = 0;
    titulo(g, 0, y, ANCHO, TIT, d); y += TIT;
    celda(g, 0, y, cClave, CAB, { fondo: COL.verde, texto: 'CLAVE', color: COL.blanco, fuente: 'bold 12px system-ui, sans-serif', borde: COL.verde });
    celda(g, cClave, y, cProd, CAB, { fondo: COL.naranja, texto: 'PRODUCCIÓN', color: COL.blanco, fuente: 'bold 12px system-ui, sans-serif', borde: COL.naranja });
    y += CAB;
    d.filas.forEach((f) => {
      celda(g, 0, y, cClave, FILA, { fondo: COL.verdeSuave, texto: f.etiqueta, color: COL.tinta, fuente: 'bold 12px system-ui, sans-serif', alinear: 'right' });
      celda(g, cClave, y, cProd, FILA, {
        fondo: COL.blanco, texto: f.total ? n2(f.total) : '',
        fuente: f.total ? 'bold 13px system-ui, sans-serif' : '12px system-ui, sans-serif', alinear: 'center',
      });
      y += FILA;
    });
    celda(g, 0, y, cClave, FILA, { fondo: COL.naranjaSuave, texto: 'TOTAL qq', color: COL.tinta, fuente: 'bold 12px system-ui, sans-serif', alinear: 'right', borde: COL.naranjaSuave });
    celda(g, cClave, y, cProd, FILA, { fondo: COL.naranjaSuave, texto: n2(d.total), color: COL.tinta, fuente: 'bold 13px system-ui, sans-serif', borde: COL.naranjaSuave });
    return cv;
  }

  /** Imagen con el desglose por turno. */
  function imagenCompleta(d) {
    const cClave = 110, cProd = 120, cTurno = 92;
    const ANCHO = cClave + cProd + d.turnos.length * cTurno;
    const FILA = 24, TIT = 30, CAB = 30, SUB = 24;
    const alto = TIT + SUB + CAB + d.filas.length * FILA + FILA;
    const { cv, g } = lienzo(ANCHO, alto);
    let y = 0;
    titulo(g, 0, y, ANCHO, TIT, d); y += TIT;

    // fila de totales por turno, como la del libro
    celda(g, 0, y, cClave + cProd, SUB, {
      fondo: COL.naranjaSuave, texto: `TOTAL ${n2(d.total)} qq`, color: COL.tinta,
      fuente: 'bold 12px system-ui, sans-serif', borde: COL.naranjaSuave,
    });
    d.turnos.forEach((x, i) => {
      celda(g, cClave + cProd + i * cTurno, y, cTurno, SUB, {
        fondo: COL.naranjaSuave, texto: n2(d.porTurnoTotal[x.id]), color: COL.tinta,
        fuente: 'bold 12px system-ui, sans-serif', borde: COL.naranjaSuave,
      });
    });
    y += SUB;

    celda(g, 0, y, cClave, CAB, { fondo: COL.verde, texto: 'CLAVE', color: COL.blanco, fuente: 'bold 12px system-ui, sans-serif', borde: COL.verde });
    celda(g, cClave, y, cProd, CAB, { fondo: COL.naranja, texto: 'PRODUCCIÓN', color: COL.blanco, fuente: 'bold 12px system-ui, sans-serif', borde: COL.naranja });
    d.turnos.forEach((x, i) => {
      celda(g, cClave + cProd + i * cTurno, y, cTurno, CAB, {
        fondo: COL.verde, texto: x.nombre.toUpperCase(), color: COL.blanco,
        fuente: 'bold 11px system-ui, sans-serif', borde: COL.verde,
      });
    });
    y += CAB;

    d.filas.forEach((f) => {
      celda(g, 0, y, cClave, FILA, { fondo: COL.verdeSuave, texto: f.etiqueta, color: COL.tinta, fuente: 'bold 12px system-ui, sans-serif', alinear: 'right' });
      celda(g, cClave, y, cProd, FILA, {
        fondo: COL.blanco, texto: f.total ? n2(f.total) : '',
        fuente: f.total ? 'bold 13px system-ui, sans-serif' : '12px system-ui, sans-serif',
      });
      d.turnos.forEach((x, i) => {
        const v = f.porTurno[x.id];
        celda(g, cClave + cProd + i * cTurno, y, cTurno, FILA, {
          fondo: f.puede[x.id] ? COL.blanco : COL.gris,
          texto: v ? n2(v) : '', fuente: 'bold 12px system-ui, sans-serif',
        });
      });
      y += FILA;
    });
    celda(g, 0, y, cClave + cProd, FILA, { fondo: COL.naranjaSuave, texto: `TOTAL ${n2(d.total)} qq`, color: COL.tinta, fuente: 'bold 12px system-ui, sans-serif', alinear: 'right', borde: COL.naranjaSuave });
    d.turnos.forEach((x, i) => {
      celda(g, cClave + cProd + i * cTurno, y, cTurno, FILA, { fondo: COL.naranjaSuave, texto: n2(d.porTurnoTotal[x.id]), color: COL.tinta, fuente: 'bold 12px system-ui, sans-serif', borde: COL.naranjaSuave });
    });
    return cv;
  }

  const aBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

  // ================= PDF =================
  /* Se arma a mano con Helvetica, que todos los lectores traen: así no hay que
     cargar ninguna librería ni incrustar una fuente de medio mega. */
  function pdfBytes(paginas, ancho, alto) {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const contenidos = paginas.map((p) => add(`<< /Length ${p.length} >>\nstream\n${p}\nendstream`));
    const fuenteN = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const negritaN = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const paginasN = objs.length + paginas.length + 1;
    const pagN = contenidos.map((c) => add(
      `<< /Type /Page /Parent ${paginasN} 0 R /MediaBox [0 0 ${ancho} ${alto}] `
      + `/Resources << /Font << /F1 ${fuenteN} 0 R /F2 ${negritaN} 0 R >> >> /Contents ${c} 0 R >>`));
    add(`<< /Type /Pages /Kids [${pagN.map((n) => n + ' 0 R').join(' ')}] /Count ${pagN.length} >>`);
    const catN = add(`<< /Type /Catalog /Pages ${paginasN} 0 R >>`);

    let salida = '%PDF-1.4\n';
    const offsets = [0];
    objs.forEach((o, i) => { offsets.push(salida.length); salida += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = salida.length;
    salida += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objs.length; i++) salida += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    salida += `trailer\n<< /Size ${objs.length + 1} /Root ${catN} 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const bytes = new Uint8Array(salida.length);
    for (let i = 0; i < salida.length; i++) bytes[i] = salida.charCodeAt(i) & 0xff;
    return bytes;
  }

  const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  /* Anchos reales de Helvetica, en milésimas de em. Sin esto el texto se sale
     de las celdas y nada queda centrado donde debe. */
  const W = (() => {
    const t = {};
    const poner = (cs, w) => [...cs].forEach((c) => { t[c] = w; });
    poner(' ', 278); poner('0123456789', 556); poner(',.', 278); poner("'", 191);
    poner('-', 333); poner('+=', 584); poner('/', 278); poner('()', 333); poner(':', 278);
    poner('·', 333); poner('%', 889); poner('ÁÀÂÄA', 667); poner('ÉÈÊËE', 667);
    poner('ÍÌÎÏI', 278); poner('ÓÒÔÖO', 778); poner('ÚÙÛÜU', 722); poner('ÑN', 722);
    poner('B', 667); poner('C', 722); poner('D', 722); poner('F', 611); poner('G', 778);
    poner('H', 722); poner('J', 500); poner('K', 667); poner('L', 556); poner('M', 833);
    poner('P', 667); poner('Q', 778); poner('R', 722); poner('S', 667); poner('T', 611);
    poner('V', 667); poner('W', 944); poner('X', 667); poner('Y', 667); poner('Z', 611);
    poner('aáàâä', 556); poner('b', 556); poner('c', 500); poner('d', 556); poner('eéèêë', 556);
    poner('f', 278); poner('g', 556); poner('h', 556); poner('iíìîï', 222); poner('j', 222);
    poner('k', 500); poner('l', 222); poner('m', 833); poner('nñ', 556); poner('oóòôö', 556);
    poner('p', 556); poner('q', 556); poner('r', 333); poner('s', 500); poner('t', 278);
    poner('uúùûü', 556); poner('v', 500); poner('w', 722); poner('x', 500); poner('y', 500); poner('z', 500);
    return t;
  })();
  /** Ancho de un texto en puntos. La negrita de Helvetica es ~6% más ancha. */
  function anchoTexto(s, tam, negrita) {
    let w = 0;
    for (const c of String(s)) w += (W[c] != null ? W[c] : 556);
    return (w / 1000) * tam * (negrita ? 1.06 : 1);
  }

  /** Dibujante mínimo sobre el lienzo del PDF, en puntos y con el 0 abajo. */
  function hoja(alto) {
    const ops = [];
    return {
      rect(x, y, an, al, relleno) {
        if (relleno) {
          ops.push(`${relleno.join(' ')} rg ${x} ${alto - y - al} ${an} ${al} re f`);
        }
        ops.push(`0.45 G 0.6 w ${x} ${alto - y - al} ${an} ${al} re S`);
      },
      texto(x, y, s, { tam = 7, negrita = false, alinear = 'left', ancho = 0 } = {}) {
        const txt = esc(s);
        if (!txt) return;
        const f = negrita ? '/F2' : '/F1';
        const w = anchoTexto(s, tam, negrita);
        let px = x;
        if (alinear === 'center') px = x + (ancho - w) / 2;
        if (alinear === 'right') px = x + ancho - w - 3;
        ops.push(`BT ${f} ${tam} Tf 0 0 0 rg 1 0 0 1 ${px.toFixed(2)} ${(alto - y - tam * 0.78).toFixed(2)} Tm (${txt}) Tj ET`);
      },
      linea(x1, y1, x2, y2, grosor = 1.2) {
        ops.push(`0.2 G ${grosor} w ${x1} ${alto - y1} m ${x2} ${alto - y2} l S`);
      },
      fin: () => ops.join('\n'),
    };
  }

  /** La hoja de trabajo de siempre, ya llena, en media carta horizontal. */
  function pdf(d) {
    const ANCHO = 612, ALTO = 396;   // media carta acostada
    const MX = 14, MY = 12;
    const h = hoja(ALTO);

    /* Con tres plantas no caben todos los turnos en media carta, así que la
       hoja lleva los de la planta que se eligió arriba. Con «todas» van todas
       y la tabla se encoge sola. */
    const grupos = (d.planta && d.planta !== 'TODAS'
      ? D.PLANTAS.filter((p) => p.id === d.planta)
      : D.PLANTAS)
      .map((p) => ({ id: p.id, nombre: p.nombre, turnos: D.turnosDePlanta(p.id) }))
      .filter((g) => g.turnos.length);
    const corto = (t) => (t.papel && t.papel.length > 2 ? t.papel : t.nombre).toUpperCase();
    const anchoTurno = grupos.reduce((a, g) => a + g.turnos.length, 0) > 8 ? 26 : 31;
    const cols = [
      { k: 'rend', t: 'REND', w: 22 },
      { k: 'clave', t: 'HOY', w: 42, alinear: 'left' },
      { k: 'stock', t: 'STOCK AYER =', w: 36 },
      { k: 'prod', t: 'PRODUC AYER +', w: 36 },
      { k: 'cons', t: 'CONSUMO HOY -', w: 36 },
      { k: 'teo', t: 'TEORICO HOY PM', w: 36 },
      { k: 'real', t: 'REAL HOY PM', w: 36 },
      /* Los dos días que siguen al de producción, cada uno con su fecha para
         que no haya que contarlos de memoria. */
      { k: 'man', w: 34, lineas: ['CONSUMO', 'MAÑANA', d.diaManana] },
      { k: 'pas', w: 34, lineas: ['CONSUMO', 'PASADO', d.diaPasado] },
      ...grupos.flatMap((g) => g.turnos.map((x) =>
        ({ k: 't:' + x.id, t: corto(x), w: anchoTurno, turno: x, grupo: g.id }))),
      { k: 'total', t: 'TOTAL', w: 30 },
    ];
    /* Con turnos de más la tabla se pasaría del papel: se encoge a lo ancho
       para que siempre quepa en media carta. */
    const disponible = ANCHO - 2 * MX;
    const bruto = cols.reduce((a, c) => a + c.w, 0);
    if (bruto > disponible) {
      const f = disponible / bruto;
      cols.forEach((c) => { c.w = Math.floor(c.w * f * 100) / 100; });
    }
    const anchoTabla = cols.reduce((a, c) => a + c.w, 0);
    const x0 = MX + Math.max(0, (ANCHO - 2 * MX - anchoTabla) / 2);

    // --- título ---
    h.texto(x0, MY, 'PRODUCCION', { tam: 10, negrita: true });
    h.texto(x0, MY, `${d.dia}  ${d.fechaLarga}`, { tam: 10, negrita: true, alinear: 'right', ancho: anchoTabla });

    const yGrupo = MY + 15, hGrupo = 11;
    const yCab = yGrupo + hGrupo, hCab = 26;
    const yFilas = yCab + hCab;
    const nFilas = d.filas.length;
    const hTot = 13;
    const hFila = Math.min(14, (ALTO - MY - yFilas - hTot - 6) / nFilas);

    // --- bandas de grupo ---
    const xIzq = x0 + cols.filter((c) => !c.grupo && c.k !== 'total').reduce((a, c) => a + c.w, 0);
    h.rect(x0, yGrupo, xIzq - x0, hGrupo);
    h.texto(x0, yGrupo + 2.5, 'INVENTARIO Y CONSUMO', { tam: 6.5, negrita: true, alinear: 'center', ancho: xIzq - x0 });
    const rotuloGrupo = { Z18: 'PRODUCCION INCECA', Z2CZ: 'PRODUCCION Z2 CZ', Z2: 'PRODUCCION Z2' };
    let xg = xIzq;
    grupos.forEach((g) => {
      const an = cols.filter((c) => c.grupo === g.id).reduce((a, c) => a + c.w, 0);
      if (!an) return;
      h.rect(xg, yGrupo, an, hGrupo);
      h.texto(xg, yGrupo + 2.5, rotuloGrupo[g.id] || g.nombre.toUpperCase(),
        { tam: 6.5, negrita: true, alinear: 'center', ancho: an });
      xg += an;
    });
    h.rect(xg, yGrupo, Math.max(0, x0 + anchoTabla - xg), hGrupo);
    const xZ18 = xIzq;   // la línea gruesa que separa inventario de producción

    // --- encabezados de columna, partidos para que quepan ---
    const TAM_CAB = 5.4;
    function partir(txt, ancho) {
      const palabras = String(txt).split(' ');
      const lineas = [];
      let actual = '';
      palabras.forEach((p) => {
        const prueba = actual ? actual + ' ' + p : p;
        if (anchoTexto(prueba, TAM_CAB, true) > ancho - 3 && actual) { lineas.push(actual); actual = p; }
        else actual = prueba;
      });
      if (actual) lineas.push(actual);
      return lineas.slice(0, 3);
    }
    let x = x0;
    cols.forEach((c) => {
      h.rect(x, yCab, c.w, hCab);
      const lineas = c.lineas ? c.lineas.slice(0, 3) : partir(c.t, c.w);
      const y0 = yCab + (hCab - lineas.length * (TAM_CAB + 1.6)) / 2;
      lineas.forEach((l, i) => {
        h.texto(x, y0 + i * (TAM_CAB + 1.6), l, { tam: TAM_CAB, negrita: true, alinear: 'center', ancho: c.w });
      });
      x += c.w;
    });

    const valor = (c, f) => {
      if (c.k === 'rend') return n0(f.rend);
      if (c.k === 'clave') return f.etiqueta;
      if (c.k === 'stock') return n0(f.stockAyer);
      if (c.k === 'prod') return f.prodAyerQQ ? n2(f.prodAyerQQ) : '';
      if (c.k === 'cons') return n0(f.ventaHoy);
      if (c.k === 'teo') return n0(f.teoricoHoy);
      if (c.k === 'real') return f.invPM == null ? '' : n0(f.invPM);
      if (c.k === 'man') return n0(f.ventaManana);
      if (c.k === 'pas') return n0(f.ventaPasado);
      /* El TOTAL suma las columnas que la hoja trae, no las de todas las
         plantas: si no, la fila no cuadra con lo que se ve. */
      if (c.k === 'total') {
        const q = cols.reduce((a, x) => a + (x.turno ? (Number(f.todosTurnos[x.turno.id]) || 0) : 0), 0);
        return q ? n2(Math.round(q * 100) / 100) : '';
      }
      if (c.turno) { const q = Number(f.todosTurnos[c.turno.id]) || 0; return q ? n2(q) : ''; }
      return '';
    };

    // --- filas ---
    d.filas.forEach((f, i) => {
      const y = yFilas + i * hFila;
      let xx = x0;
      cols.forEach((c) => {
        h.rect(xx, y, c.w, hFila);
        const neg = c.k === 'clave' || c.k === 'total' || !!c.turno;
        const tam = c.k === 'clave' ? 7 : 6.5;
        h.texto(xx, y + (hFila - tam) / 2, valor(c, f), {
          tam, negrita: neg, alinear: c.alinear || 'center', ancho: c.w,
        });
        xx += c.w;
      });
    });

    // --- totales ---
    const yTot = yFilas + nFilas * hFila;
    let xt = x0;
    cols.forEach((c) => {
      h.rect(xt, yTot, c.w, hTot);
      let v = '';
      if (c.k === 'clave') v = 'TOTAL';
      else if (c.turno) {
        const q = d.filas.reduce((a, f) => a + (Number(f.todosTurnos[c.turno.id]) || 0), 0);
        v = q ? n2(Math.round(q * 100) / 100) : '';
      } else if (c.k === 'total') {
        const q = d.filas.reduce((a, f) => a + cols.reduce((b, x) =>
          b + (x.turno ? (Number(f.todosTurnos[x.turno.id]) || 0) : 0), 0), 0);
        v = n2(Math.round(q * 100) / 100);
      }
      h.texto(xt, yTot + (hTot - 6.5) / 2, v, { tam: 6.5, negrita: true, alinear: c.alinear || 'center', ancho: c.w });
      xt += c.w;
    });

    // la raya gruesa que separa el inventario de la producción, como en la hoja
    h.linea(xZ18, yGrupo, xZ18, yTot + hTot, 1.6);
    h.linea(x0, yCab, x0 + anchoTabla, yCab, 1.2);

    return new Blob([pdfBytes([h.fin()], ANCHO, ALTO)], { type: 'application/pdf' });
  }

  // ================= pantalla =================
  const esc2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const A = () => window.Archivo;

  /** Guarda en la carpeta elegida si hay, y si no por la vía normal. */
  async function guardarArchivo(blob, nombre, tipo, opciones) {
    return A().guardar(blob, nombre, { tipo, ...(opciones || {}) });
  }
  const dondeDice = (r) => (r.modo === 'carpeta' ? ` en ${r.donde}`
    : (r.modo === 'elegido' ? ' donde lo pediste' : ''));

  /** Comparte el archivo si el equipo sabe; si no, lo descarga. */
  async function compartir(blob, nombre, titulo2) {
    const file = new File([blob], nombre, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: titulo2 }); return 'compartido'; }
      catch (err) { if (err && err.name === 'AbortError') return 'cancelado'; }
    }
    const r = await guardarArchivo(blob, nombre, A().TIPO_PNG);
    return r.modo === 'cancelado' ? 'cancelado' : 'descargado' + dondeDice(r);
  }

  function abrir(fecha, decir) {
    const avisar = decir || (() => {});
    let planta = 'Z18';

    const m = document.createElement('div');
    m.className = 'lector';
    m.innerHTML = `<div class="lcaja" style="max-width:1000px">
      <div class="lbar">
        <h3>Resumen de producción</h3>
        <span class="dim" id="rFecha"></span>
        <button class="btn sec mini" type="button" id="rCerrar" style="margin-left:auto">Cerrar</button>
      </div>
      <div class="lcuerpo">
        <div class="card" style="margin-bottom:12px">
          <div class="fila">
            <div class="campo"><label for="rPlanta">Planta</label>
              <select id="rPlanta" style="min-width:190px">
                ${D.PLANTAS.map((p) => `<option value="${p.id}">${esc2(p.nombre)}</option>`).join('')}
                <option value="TODAS">Todas juntas</option>
              </select></div>
            <div class="campo"><label>&nbsp;</label>
              <button class="btn" type="button" id="rImgSimple">Imagen clave y qq</button></div>
            <div class="campo"><label>&nbsp;</label>
              <button class="btn" type="button" id="rImgCompleta">Imagen completa</button></div>
            <div class="campo"><label>&nbsp;</label>
              <button class="btn ghost" type="button" id="rPdf">Descargar PDF</button></div>
            <div class="campo"><label>&nbsp;</label>
              <button class="btn sec" type="button" id="rImprimir">Imprimir</button></div>
          </div>
          <p class="sub" style="margin:11px 0 0" id="rNota"></p>
          <p class="dim" style="font-size:.84rem;margin:9px 0 0" id="rCarpeta"></p>
        </div>
        <div id="rVista"></div>
      </div>
    </div>`;
    document.body.appendChild(m);
    document.body.style.overflow = 'hidden';
    const q = (s) => m.querySelector(s);
    const cerrar = () => { document.body.style.overflow = ''; m.remove(); };

    let d = null;
    function pintar() {
      d = datos(fecha, planta);
      /* El total de la hoja completa suma los dos grupos, como el papel. */
      d.filas.forEach((f) => {
        f.todosTurnosTotal = Math.round(Object.values(f.todosTurnos).reduce((a, b) => a + (Number(b) || 0), 0) * 100) / 100;
      });
      d.totalTodos = Math.round(d.filas.reduce((a, f) => a + f.todosTurnosTotal, 0) * 100) / 100;

      q('#rFecha').textContent = `${d.dia} ${d.fechaLarga}`;
      q('#rNota').innerHTML = `Lleva <b>${n2(d.total)} qq</b> en ${esc2(d.nombrePlanta.toLowerCase())}`
        + (d.totalTodos !== d.total ? ` · <b>${n2(d.totalTodos)} qq</b> en total ese día` : '')
        + '. El PDF sale en media carta con la hoja de trabajo completa, y no se guarda en ningún lado.';
      const cv = imagenCompleta(d);
      cv.style.cssText = 'max-width:100%;height:auto;border-radius:9px;display:block';
      q('#rVista').innerHTML = '';
      q('#rVista').appendChild(cv);
    }

    const sufPlanta = () => (planta === 'TODAS' ? 'Todas' : planta);
    const nombrePdf = () => `Produccion ${sufPlanta()} ${fechaArchivo(fecha)}.pdf`;
    const nombreImg = (suf) => `Produccion ${sufPlanta()} ${fechaArchivo(fecha)}${suf}.png`;

    q('#rCerrar').onclick = cerrar;
    m.onclick = (e) => { if (e.target === m) cerrar(); };
    q('#rPlanta').onchange = (e) => { planta = e.target.value; pintar(); };
    q('#rImgSimple').onclick = async () => {
      const r = await compartir(await aBlob(imagenSimple(d)), nombreImg(''), 'Producción');
      avisar(r === 'descargado' ? 'Imagen descargada.' : (r === 'compartido' ? 'Imagen compartida.' : 'Cancelado.'));
    };
    q('#rImgCompleta').onclick = async () => {
      const r = await compartir(await aBlob(imagenCompleta(d)), nombreImg(' detalle'), 'Producción por turno');
      avisar(r === 'descargado' ? 'Imagen descargada.' : (r === 'compartido' ? 'Imagen compartida.' : 'Cancelado.'));
    };
    async function pintarCarpeta() {
      const c = await A().carpeta();
      const puede = A().haySoporte();
      q('#rCarpeta').innerHTML = c
        ? `Se guarda en la carpeta <b>${esc2(c.nombre)}</b>. `
          + '<button class="btn sec mini" type="button" id="rCambiarCarp">Cambiar</button> '
          + '<button class="btn sec mini" type="button" id="rQuitarCarp">Quitar</button>'
        : (puede
          ? 'Se guarda en Descargas. <button class="btn sec mini" type="button" id="rCambiarCarp">Elegir una carpeta fija</button>'
          : 'Se guarda en la carpeta de Descargas del navegador. Para elegir otra hace falta Chrome o Edge en la computadora.');
      const cam = q('#rCambiarCarp');
      if (cam) cam.onclick = async () => {
        try {
          const n = await A().elegirCarpeta();
          if (n) avisar(`Los archivos van a quedar en ${n}.`);
          pintarCarpeta();
        } catch (err) { avisar('No se pudo elegir la carpeta: ' + err.message, 'err'); }
      };
      const qui = q('#rQuitarCarp');
      if (qui) qui.onclick = async () => {
        await A().olvidarCarpeta(); pintarCarpeta(); avisar('Vuelve a guardarse en Descargas.');
      };
    }

    q('#rPdf').onclick = async () => {
      const r = await guardarArchivo(pdf(d), nombrePdf(), A().TIPO_PDF);
      if (r.modo === 'cancelado') return;
      avisar('PDF guardado' + dondeDice(r) + '.');
      pintarCarpeta();
    };
    q('#rImprimir').onclick = () => {
      const u = URL.createObjectURL(pdf(d));
      const w = window.open(u, '_blank');
      if (!w) { A().descargaNormal(pdf(d), nombrePdf()); avisar('El navegador bloqueó la ventana; el PDF se descargó.', 'err'); }
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    };

    pintar();
    pintarCarpeta();
  }

  window.Resumen = {
    abrir, datos, imagenSimple, imagenCompleta, pdf, pdfBytes,
    // el dibujo, que reusan la tabla de feriados y la de impresión de bolsa
    lienzo, celda, aBlob, compartir, COL, hoja, anchoTexto, fechaArchivo,
  };
})();
