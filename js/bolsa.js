/* Impresión de bolsa: qué lote y vencimiento hay que imprimir.

   Replica la tabla "Nueva" de Calc_Bolsa. La idea de fondo es simple: lo que
   se produce de noche se empaca a la mañana siguiente y al revés, así que la
   bolsa que se imprime en la mañana lleva el pan de la tarde anterior. Por eso
   EMPAQUE AM sale de PROD PM y EMPAQUE PM de PROD AM: van cruzados a
   propósito, no es un error del Excel.

   La hoja cubre el empaque de un día, y ese día se empaca pan de dos tandas:
   la de anoche y la de esta mañana. Por eso las columnas AM traen los turnos
   de mañana del día del cálculo y las columnas PM los turnos de tarde del día
   anterior, en las dos plantas por igual. La única que se escribe a mano es
   QQ AM Z2, igual que en el Excel: esa producción todavía no está en el app
   cuando se arma la hoja.

   Una clave que se hace en dos plantas lleva una fila por planta, y abajo una
   fila que las suma —el "2 + 18" de la hoja— porque la bolsa es la misma. */
(function () {
  'use strict';
  const D = window.Datos;

  /* El empaque se pide en bolsas de diez en diez. */
  const MULT_EMPAQUE = 10;
  const alDiez = (n) => (n > 0 ? Math.round(n / MULT_EMPAQUE) * MULT_EMPAQUE : 0);
  const r2 = (n) => Math.round(n * 100) / 100;

  /* Las filas que no salen del catálogo: las sumas de dos plantas o de dos
     claves, las de MU1 y las presentaciones que se cuentan a mano. Son las de
     la hoja de Kurt; se cambian en Parámetros. */
  const EXTRAS = [
    { id: 'sum:HD7',  tipo: 'suma',   nombre: '10HD7',      partes: [{ clave: '10HD7' }] },
    { id: 'sum:HR3',  tipo: 'suma',   nombre: '10HR3',      partes: [{ clave: '10HR3' }] },
    { id: 'sum:HM4',  tipo: 'suma',   nombre: '5HM4',       partes: [{ clave: '5HM4' }] },
    { id: 'sum:WY1K', tipo: 'suma',   nombre: '12WY1 + K',  partes: [{ clave: '12WY1' }, { clave: '12WYK' }] },
    { id: 'mu1:6',    tipo: 'mu1',    nombre: '6MU1',       unidades: 6 },
    { id: 'mu1:12',   tipo: 'manual', nombre: '12MU1' },
    { id: 'man:5HD2',   tipo: 'manual', nombre: '5HD2' },
    { id: 'man:15PL1',  tipo: 'manual', nombre: '15PL1' },
    { id: 'man:8PL1',   tipo: 'manual', nombre: '8PL1' },
    { id: 'man:10S11T', tipo: 'manual', nombre: '10S11T' },
    { id: 'man:12S11T', tipo: 'manual', nombre: '12S11T' },
    { id: 'man:10WY1M', tipo: 'manual', nombre: '10WY1 M' },
    { id: 'man:10WY1G', tipo: 'manual', nombre: '10WY1 G' },
  ];

  /* Nombres cortos de planta para la primera columna, como en la hoja. */
  const corto = { Z18: '18', Z2CZ: '2 CZ', Z2: '2' };

  /** Las filas de la tabla: una por clave y planta, más las de arriba. */
  /**
   * Si esa fila entra en la hoja. Se guarda la lista de las que NO entran, no
   * la de las que sí: así una clave nueva aparece sola, como en el resto de
   * la app, en vez de quedarse afuera sin que nadie se entere.
   *
   * La lista acepta dos cosas: la clave —quita todas sus filas, que es como
   * se guardaba antes— o el id de una fila suelta, `CLAVE|PLANTA`, para sacar
   * sólo esa. Hace falta porque una clave puede tener fila en una planta donde
   * no se produce nada.
   */
  const dentro = (P, id) => !(P.bolsaFuera || []).includes(id);
  const filaDentro = (P, f) => (f.tipo === 'clave'
    ? dentro(P, f.clave) && dentro(P, f.id)
    : dentro(P, f.id));

  function filas(params, todas) {
    const P = params || D.estado.params;
    const out = [];
    /* El orden es el de las áreas de producción, para que la hoja se lea en
       el mismo orden en que se decidió la producción. */
    const vistas = new Set();
    D.AREAS.forEach((a) => {
      D.clavesDeArea(a.id).forEach((c) => {
        const id = `${c}|${a.planta}`;
        if (vistas.has(id)) return;
        vistas.add(id);
        const f = P.prod[c] || {};
        const fila = {
          id, tipo: 'clave', clave: c, planta: a.planta,
          nombre: f.alias || c, rend: Number(f.rend) || 0,
          pprod: corto[a.planta] || a.planta,
        };
        if (!todas && !filaDentro(P, fila)) return;
        out.push(fila);
      });
    });
    (P.bolsaExtras || EXTRAS).forEach((e) => {
      if (!todas && !dentro(P, e.id)) return;
      if (e.tipo !== 'suma') { out.push({ ...e, rend: Number(e.rend) || 0, pprod: e.pprod || '' }); return; }
      const base = P.prod[e.partes[0].clave] || {};
      /* Una suma de una sola clave se llama como la clave —con su alias, para
         que la tabla no diga HM4 arriba y 5HM4 abajo—; la de varias conserva
         el nombre que se le puso. */
      const nombre = e.partes.length === 1 ? (base.alias || e.partes[0].clave) : e.nombre;
      out.push({ ...e, nombre, rend: Number(base.rend) || 0, pprod: '2 + 18' });
    });
    return ordenar(P, out);
  }

  /**
   * El orden de las filas. De fábrica es el de las áreas de producción, para
   * que la hoja se lea como se decidió la producción; si se cambió a mano en
   * Parámetros, manda esa lista. Lo que no esté en ella va después en el orden
   * de siempre, así una clave nueva aparece al final en vez de perderse.
   */
  function ordenar(P, lista) {
    const orden = P.bolsaOrden || [];
    if (!orden.length) return lista;
    const porId = new Map(lista.map((f) => [f.id, f]));
    const out = [];
    orden.forEach((id) => {
      if (porId.has(id)) { out.push(porId.get(id)); porId.delete(id); }
    });
    lista.forEach((f) => { if (porId.has(f.id)) out.push(f); });
    return out;
  }

  /** Los quintales decididos de una clave, por planta y momento. */
  function qqDe(reg, clave, fecha) {
    const asign = (reg.turnos || {})[clave] || {};
    const out = {};
    D.PLANTAS.forEach((p) => { out[p.id] = { AM: 0, PM: 0 }; });
    Object.entries(asign).forEach(([t, v]) => {
      const n = Number(v) || 0;
      if (!n) return;
      const pl = D.plantaDeTurno(t);
      const mo = D.momentoDeTurno(t, fecha);
      if (out[pl]) out[pl][mo] = r2(out[pl][mo] + n);
    });
    return out;
  }

  /** Lo que el usuario escribió encima, si escribió algo. */
  const puesto = (b, campo, id) => {
    const v = ((b || {})[campo] || {})[id];
    return v === '' || v === null || v === undefined ? null : Number(v);
  };

  /**
   * La tabla completa de un día, ya calculada. `reg` es el registro del día,
   * que es donde viven los valores escritos a mano.
   */
  function calcular(fecha) {
    const reg = D.registro(fecha);
    const b = D.estado.bolsa[fecha] || {};
    const P = D.estado.params;
    const lista = filas(P);

    /* Una hoja de bolsa cubre el empaque de un día, y ese día se empaca pan de
       dos tandas: la de anoche y la de esta mañana. Así que las columnas AM
       traen los turnos de mañana del día del cálculo, y las columnas PM los
       turnos de tarde del día anterior. Vale para las dos plantas por igual:
       lo que manda es el momento del turno, no dónde trabaja.
       Quién es de mañana y quién de tarde se marca en Parámetros, y los que
       rotan se leen con la fecha de su propio día. */
    const fAyer = D.sumarDias(fecha, -1);
    const regAyer = D.estado.dias[fAyer] ? D.migrar(D.estado.dias[fAyer]) : { turnos: {} };
    const hoy = {}, ayer = {};
    D.claves().forEach((c) => {
      hoy[c] = qqDe(reg, c, fecha);
      ayer[c] = qqDe(regAyer, c, fAyer);
    });
    /* Los quintales de una fila: de mañana los de hoy, de tarde los de ayer. */
    const am = (c, planta) => ((hoy[c] || {})[planta] || {}).AM || 0;
    const pm = (c, planta) => ((ayer[c] || {})[planta] || {}).PM || 0;

    /* Primera pasada: los quintales de cada fila. */
    const filas1 = lista.map((f) => {
      const qq = { amZ18: 0, pmZ18: 0, amZ2: 0, pmZ2: 0 };
      if (f.tipo === 'clave') {
        if (f.planta === 'Z18') { qq.amZ18 = am(f.clave, 'Z18'); qq.pmZ18 = pm(f.clave, 'Z18'); }
        else if (f.planta === 'Z2') { qq.amZ2 = am(f.clave, 'Z2'); qq.pmZ2 = pm(f.clave, 'Z2'); }
        else { qq.amZ2 = am(f.clave, 'Z2CZ'); qq.pmZ2 = pm(f.clave, 'Z2CZ'); }
      } else if (f.tipo === 'suma') {
        /* Suma la clave en todas sus plantas: es la misma bolsa. */
        f.partes.forEach((p) => {
          qq.amZ18 = r2(qq.amZ18 + am(p.clave, 'Z18'));
          qq.pmZ18 = r2(qq.pmZ18 + pm(p.clave, 'Z18'));
          qq.amZ2 = r2(qq.amZ2 + am(p.clave, 'Z2') + am(p.clave, 'Z2CZ'));
          qq.pmZ2 = r2(qq.pmZ2 + pm(p.clave, 'Z2') + pm(p.clave, 'Z2CZ'));
        });
      }
      /* La mañana de la planta Zona 2 se escribe a mano y nada más.
         Son los quintales producidos HOY ahí, y ese dato todavía no existe en
         el app cuando se arma la hoja: la foto de Zona 2 que se lee hoy trae la
         producción de AYER. Lo que el reparto haya puesto en esos turnos es un
         plan, no un hecho, así que se ofrece como sugerencia —se toca y se
         copia— pero nunca entra solo.
         Las filas de Zona 2 CZ no llevan esa casilla: lo de Byron y Julio sí
         sale del reparto, y además rotan de mañana a tarde. */
      const aMano = f.tipo === 'suma' || (f.tipo === 'clave' && f.planta === 'Z2');
      if (!aMano) return { ...f, qq, plan: 0, amZ2Manual: false, sinMano: true };
      const plan = qq.amZ2;
      let man = puesto(b, 'qqAmZ2', f.id);
      /* Una fila 2 + 18 toma lo escrito en la fila de Zona 2 de su clave si en
         ella misma no se escribió nada: da igual en cuál de las dos se anote,
         y lo propio manda si está. */
      if (man == null && f.tipo === 'suma') {
        const partes = (f.partes || [])
          .map((x) => puesto(b, 'qqAmZ2', `${x.clave}|Z2`))
          .filter((v) => v != null && !Number.isNaN(v));
        if (partes.length) man = r2(partes.reduce((a, v) => a + v, 0));
      }
      const hay = man != null && !Number.isNaN(man);
      return { ...f, qq: { ...qq, amZ2: hay ? man : 0 }, plan, amZ2Manual: hay };
    });

    /* Segunda pasada: bolsas. */
    /* La casilla suelta de «HD7 Z2» es de cuando la hoja no tenía fila 2 + 18
       para el 10HD7: servía para meter a mano lo de Máquina. Con la fila suma
       puesta eso ya sale del reparto, así que la casilla deja de pisar el
       empaque y queda sin efecto; sin la fila suma sigue funcionando igual. */
    const haySumaHD7 = filas1.some((f) => f.tipo === 'suma'
      && (f.partes || []).some((x) => x.clave === '10HD7'));
    const hd7z2 = haySumaHD7 ? 0 : Number(b.hd7z2) || 0;
    const mu1 = Number(b.mu1) || 0;
    const mu112 = Number(((b.manual || {})['mu1:12'])) || 0;

    return filas1.map((f) => {
      const oh = Number(puesto(b, 'oh', f.id)) || 0;
      if (f.tipo === 'manual') {
        const tot = Number(puesto(b, 'manual', f.id)) || 0;
        return { ...f, oh, prodAM: 0, prodPM: 0, empAM: 0, empPM: 0, total: tot, manual: true };
      }
      if (f.tipo === 'mu1') {
        /* Las unidades de MU1 se producen en Zona 18 y no las calcula esta
           app: se escriben. De ahí salen bolsas de seis, menos las de doce,
           que llevan el doble de unidades cada una. */
        const uni = Number(f.unidades) || 6;
        const bolsas6 = Math.ceil(Math.round(1.01 * Math.floor(mu1 / uni)) / MULT_EMPAQUE) * MULT_EMPAQUE;
        const total = Math.max(0, bolsas6 - oh - mu112 * 2);
        return { ...f, oh, prodAM: 0, prodPM: 0, empAM: 0, empPM: 0,
          total, nota: `${mu1 ? mu1.toLocaleString('es-GT') : 0} unidades ÷ ${uni}` };
      }
      const rend = Number(f.rend) || 0;
      const prodAM = Math.round(rend * (f.qq.amZ18 + f.qq.amZ2));
      const prodPM = Math.round(rend * (f.qq.pmZ18 + f.qq.pmZ2));
      /* Cruzado a propósito: la bolsa de la mañana lleva el pan de la noche. */
      let empAM = alDiez(prodPM - oh);
      let empPM = alDiez(prodAM - oh);
      /* El 10HD7 de Zona 2 se anota aparte y manda sobre el empaque de la
         tarde, igual que en la tabla accesoria de la hoja. */
      if (f.tipo === 'clave' && f.clave === '10HD7' && f.planta === 'Z18' && hd7z2) {
        empPM = Math.round(hd7z2 * rend);
      }
      return { ...f, oh, prodAM, prodPM, empAM, empPM, total: empAM + empPM };
    });
  }

  /**
   * Lo que se escribe a mano. Vive aparte de los días: esta hoja no se
   * sincroniza, se queda en el equipo donde se imprime.
   */
  function escribir(fecha, campo, id, valor) {
    const todo = D.estado.bolsa;
    if (!todo[fecha]) todo[fecha] = {};
    const b = todo[fecha];
    if (campo === 'hd7z2' || campo === 'mu1') {
      const n = Number(valor);
      b[campo] = String(valor).trim() === '' || Number.isNaN(n) ? 0 : n;
      if (!b[campo]) delete b[campo];
    } else {
      if (!b[campo]) b[campo] = {};
      const t = String(valor).trim();
      if (t === '') delete b[campo][id];
      else {
        const n = Number(t);
        b[campo][id] = Number.isNaN(n) ? 0 : n;
      }
      if (!Object.keys(b[campo]).length) delete b[campo];
    }
    if (!Object.keys(b).length) delete todo[fecha];
    D.guardarBolsa();
  }

  /**
   * Las filas que no entran al total: las de una clave que más abajo tiene su
   * fila «2 + 18». La bolsa es la misma, y la que se imprime es la de la
   * suma; contar las dos daría el doble.
   */
  function enTotal(fs) {
    const sumadas = new Set();
    fs.forEach((f) => {
      if (f.tipo !== 'suma') return;
      (f.partes || []).forEach((p) => sumadas.add(p.clave));
    });
    return fs.map((f) => ({ ...f, cuenta: !(f.tipo === 'clave' && sumadas.has(f.clave)) }));
  }

  function totales(fs) {
    const vivas = enTotal(fs).filter((f) => f.cuenta);
    const s = (k) => vivas.reduce((a, f) => a + (f[k] || 0), 0);
    return { prodAM: s('prodAM'), prodPM: s('prodPM'), empAM: s('empAM'), empPM: s('empPM'), total: s('total') };
  }

  // ---------- PDF ----------
  /* Carta vertical: la tabla es alta y angosta, al revés que la hoja de
     trabajo del día. Se arma con las mismas piezas del resumen para no
     cargar ninguna librería. */
  function pdf(fecha) {
    const R = window.Resumen;
    const ANCHO = 612, ALTO = 792;
    const MX = 24, MY = 22;
    const h = R.hoja(ALTO);
    const fs = enTotal(calcular(fecha));
    const t = totales(fs);
    const dAM = D.fechaCorta(fecha);
    const dPM = D.fechaCorta(fechaPrevia(fecha));

    const cols = [
      { k: 'pprod', t: 'P PROD', w: 34 },
      { k: 'nombre', t: 'ITEM', w: 58, alinear: 'left' },
      { k: 'rend', t: 'RENDIM', w: 36 },
      { k: 'amZ18', lineas: ['QQ AM', 'Z18', dAM], w: 42 },
      { k: 'pmZ18', lineas: ['QQ PM', 'Z18', dPM], w: 42 },
      { k: 'pmZ2', lineas: ['QQ PM', 'Z2', dPM], w: 42 },
      { k: 'amZ2', lineas: ['QQ AM', 'Z2', dAM], w: 42 },
      { k: 'prodAM', lineas: ['PROD', 'AM', dAM], w: 44 },
      { k: 'prodPM', lineas: ['PROD', 'PM', dPM], w: 44 },
      { k: 'oh', t: 'OH', w: 30 },
      { k: 'empAM', lineas: ['EMPAQUE', 'AM', dAM], w: 52 },
      { k: 'empPM', lineas: ['EMPAQUE', 'PM', dAM], w: 52 },
      { k: 'total', lineas: ['TOTAL', 'PROD'], w: 46 },
    ];
    const disponible = ANCHO - 2 * MX;
    const bruto = cols.reduce((a, c) => a + c.w, 0);
    if (bruto > disponible) {
      const f = disponible / bruto;
      cols.forEach((c) => { c.w = Math.floor(c.w * f * 100) / 100; });
    }
    const anchoTabla = cols.reduce((a, c) => a + c.w, 0);
    const x0 = MX + Math.max(0, (disponible - anchoTabla) / 2);

    const d = D.desdeISO(fecha);
    const larga = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    h.texto(x0, MY, 'PRODUCCION BOLSA', { tam: 11, negrita: true });
    h.texto(x0, MY, `${D.nombreDia(fecha)}  ${larga}`,
      { tam: 11, negrita: true, alinear: 'right', ancho: anchoTabla });

    const yCab = MY + 18, hCab = 30;
    const yFilas = yCab + hCab, hTot = 14;
    const hFila = Math.min(12, (ALTO - MY - yFilas - hTot - 4) / Math.max(1, fs.length));

    const TAM_CAB = 5.4;
    let xc = x0;
    cols.forEach((c) => {
      h.rect(xc, yCab, c.w, hCab);
      const ls = c.lineas || [c.t];
      const y0 = yCab + (hCab - ls.length * (TAM_CAB + 1.6)) / 2;
      ls.forEach((l, i) => {
        h.texto(xc, y0 + i * (TAM_CAB + 1.6), l,
          { tam: TAM_CAB, negrita: true, alinear: 'center', ancho: c.w });
      });
      xc += c.w;
    });

    const n0 = (v) => (!v ? '' : Math.round(v).toLocaleString('es-GT'));
    const n2v = (v) => (!v ? '' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 2 }));
    const valor = (f, c) => {
      if (c.k === 'pprod') return f.pprod || '';
      if (c.k === 'nombre') return f.nombre;
      if (c.k === 'rend') return f.rend ? n0(f.rend) : '';
      if (c.k === 'oh') return f.oh ? n0(f.oh) : '';
      if (['amZ18', 'pmZ18', 'pmZ2', 'amZ2'].includes(c.k)) {
        return f.qq ? n2v(f.qq[c.k]) : '';
      }
      return n0(f[c.k]);
    };

    let y = yFilas;
    fs.forEach((f) => {
      let x = x0;
      cols.forEach((c) => {
        h.rect(x, y, c.w, hFila);
        const neg = c.k === 'nombre' || c.k === 'total';
        h.texto(x, y + (hFila - 6.2) / 2, valor(f, c),
          { tam: 6.2, negrita: neg, alinear: c.alinear || 'center', ancho: c.w });
        x += c.w;
      });
      y += hFila;
    });

    let xt = x0;
    cols.forEach((c) => {
      h.rect(xt, y, c.w, hTot);
      const v = c.k === 'nombre' ? 'TOTAL'
        : (['prodAM', 'prodPM', 'empAM', 'empPM', 'total'].includes(c.k) ? n0(t[c.k]) : '');
      h.texto(xt, y + (hTot - 6.5) / 2, v,
        { tam: 6.5, negrita: true, alinear: c.alinear || 'center', ancho: c.w });
      xt += c.w;
    });

    const bytes = R.pdfBytes([h.fin()], ANCHO, ALTO);
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      nombre: `Impresion Bolsa ${R.fechaArchivo(fecha)}.pdf`,
    };
  }

  /** El día del que salen las columnas PM: la tarde anterior. */
  const fechaPrevia = (fecha) => D.sumarDias(fecha, -1);

  window.Bolsa = { filas, calcular, escribir, totales, enTotal, pdf,
    dentro, filaDentro, fechaPrevia, EXTRAS, alDiez };
})();
