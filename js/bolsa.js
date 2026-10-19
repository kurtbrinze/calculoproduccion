/* Impresión de bolsa: qué lote y vencimiento hay que imprimir.

   Replica la tabla "Nueva" de Calc_Bolsa. La idea de fondo es simple: lo que
   se produce de noche se empaca a la mañana siguiente y al revés, así que la
   bolsa que se imprime en la mañana lleva el pan de la tarde anterior. Por eso
   EMPAQUE AM sale de PROD PM y EMPAQUE PM de PROD AM: van cruzados a
   propósito, no es un error del Excel.

   Las cuatro columnas de quintales salen solas del reparto del día, partidas
   por planta y por momento. La de Zona 2 en la mañana se puede escribir
   encima, que es lo que había que hacer a mano en el Excel.

   Una clave que se hace en dos plantas lleva una fila por planta, y abajo una
   fila que las suma —el "2 + 18" de la hoja— porque la bolsa es la misma. */
(function () {
  'use strict';
  const D = window.Datos;
  const C = window.Calculo;

  /* El empaque se pide en bolsas de diez en diez. */
  const MULT_EMPAQUE = 10;
  const alDiez = (n) => (n > 0 ? Math.round(n / MULT_EMPAQUE) * MULT_EMPAQUE : 0);
  const r2 = (n) => Math.round(n * 100) / 100;

  /* Las filas que no salen del catálogo: las sumas de dos plantas o de dos
     claves, las de MU1 y las presentaciones que se cuentan a mano. Son las de
     la hoja de Kurt; se cambian en Parámetros. */
  const EXTRAS = [
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
  function filas(params) {
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
        out.push({
          id, tipo: 'clave', clave: c, planta: a.planta,
          nombre: f.alias || c, rend: Number(f.rend) || 0,
          pprod: corto[a.planta] || a.planta,
        });
      });
    });
    (P.bolsaExtras || EXTRAS).forEach((e) => {
      if (e.tipo !== 'suma') { out.push({ ...e, rend: Number(e.rend) || 0, pprod: e.pprod || '' }); return; }
      const base = P.prod[e.partes[0].clave] || {};
      /* Una suma de una sola clave se llama como la clave —con su alias, para
         que la tabla no diga HM4 arriba y 5HM4 abajo—; la de varias conserva
         el nombre que se le puso. */
      const nombre = e.partes.length === 1 ? (base.alias || e.partes[0].clave) : e.nombre;
      out.push({ ...e, nombre, rend: Number(base.rend) || 0, pprod: '2 + 18' });
    });
    return out;
  }

  /** Los quintales decididos de una clave, por planta y momento. */
  function qqDe(reg, clave) {
    const asign = (reg.turnos || {})[clave] || {};
    const out = {};
    D.PLANTAS.forEach((p) => { out[p.id] = { AM: 0, PM: 0 }; });
    Object.entries(asign).forEach(([t, v]) => {
      const n = Number(v) || 0;
      if (!n) return;
      const pl = D.plantaDeTurno(t);
      const mo = (D.turnoPorId[t] || {}).momento || 'AM';
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
    const porClave = {};
    D.claves().forEach((c) => { porClave[c] = qqDe(reg, c); });

    /* Primera pasada: los quintales de cada fila. */
    const filas1 = lista.map((f) => {
      const qq = { amZ18: 0, pmZ18: 0, amZ2: 0, pmZ2: 0 };
      if (f.tipo === 'clave') {
        const q = porClave[f.clave] || {};
        if (f.planta === 'Z18') { qq.amZ18 = (q.Z18 || {}).AM || 0; qq.pmZ18 = (q.Z18 || {}).PM || 0; }
        else if (f.planta === 'Z2') { qq.amZ2 = (q.Z2 || {}).AM || 0; qq.pmZ2 = (q.Z2 || {}).PM || 0; }
        else { qq.amZ2 = r2(qq.amZ2 + ((q.Z2CZ || {}).AM || 0)); qq.pmZ2 = r2(qq.pmZ2 + ((q.Z2CZ || {}).PM || 0)); }
      } else if (f.tipo === 'suma') {
        /* Suma la clave en todas sus plantas: es la misma bolsa. */
        f.partes.forEach((p) => {
          const q = porClave[p.clave] || {};
          qq.amZ18 = r2(qq.amZ18 + ((q.Z18 || {}).AM || 0));
          qq.pmZ18 = r2(qq.pmZ18 + ((q.Z18 || {}).PM || 0));
          qq.amZ2 = r2(qq.amZ2 + ((q.Z2 || {}).AM || 0) + ((q.Z2CZ || {}).AM || 0));
          qq.pmZ2 = r2(qq.pmZ2 + ((q.Z2 || {}).PM || 0) + ((q.Z2CZ || {}).PM || 0));
        });
      }
      /* La mañana de Zona 2 se escribe a mano y nada más.
         Es lo producido HOY en esa planta, y ese dato todavía no existe en el
         app cuando se arma la hoja: la foto de Zona 2 que se lee hoy trae la
         producción de AYER. Lo que el reparto haya puesto en esos turnos es un
         plan, no un hecho, así que se ofrece como sugerencia —se toca y se
         copia— pero nunca entra solo. */
      const plan = qq.amZ2;
      const man = puesto(b, 'qqAmZ2', f.id);
      const hay = man != null && !Number.isNaN(man);
      return { ...f, qq: { ...qq, amZ2: hay ? man : 0 }, plan, amZ2Manual: hay };
    });

    /* Segunda pasada: bolsas. */
    const hd7z2 = Number(b.hd7z2) || 0;
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
    const dPM = D.fechaCorta(D.sumarDias(fecha, 1));

    const cols = [
      { k: 'pprod', t: 'P PROD', w: 34 },
      { k: 'nombre', t: 'ITEM', w: 62, alinear: 'left' },
      { k: 'rend', t: 'RENDIM', w: 38 },
      { k: 'amZ18', lineas: ['QQ AM', 'Z18'], w: 38 },
      { k: 'pmZ18', lineas: ['QQ PM', 'Z18'], w: 38 },
      { k: 'pmZ2', lineas: ['QQ PM', 'Z2'], w: 38 },
      { k: 'amZ2', lineas: ['QQ AM', 'Z2'], w: 38 },
      { k: 'prodAM', lineas: ['PROD', 'AM'], w: 44 },
      { k: 'prodPM', lineas: ['PROD', 'PM'], w: 44 },
      { k: 'oh', t: 'OH', w: 32 },
      { k: 'empAM', lineas: ['EMPAQUE', 'AM', dPM], w: 56 },
      { k: 'empPM', lineas: ['EMPAQUE', 'PM', dAM], w: 56 },
      { k: 'total', lineas: ['TOTAL', 'PROD'], w: 48 },
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

  window.Bolsa = { filas, calcular, escribir, totales, enTotal, pdf, EXTRAS, alDiez };
})();
