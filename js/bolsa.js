/* Impresión de bolsa: cuántas bolsas hay que mandar a imprimir.

   La hoja se arma para un día a producir y toma la producción sola, del
   reparto. De dónde sale cada quintal no está escrito en piedra: cada clave
   dice, turno por turno, si esos quintales cuentan para PROD AM o para
   PROD PM, y si se leen del día a producir o del día anterior. Eso es lo que
   se parametriza en Parámetros → Impresión de bolsa, y es lo que permite que
   dos claves que se hacen en la misma máquina lleven cuentas distintas.

   El cálculo, una vez juntos los quintales:

     PROD AM    = quintales de la cubeta AM × rendimiento
     PROD PM    = quintales de la cubeta PM × rendimiento
     EMPAQUE AM = PROD AM − OH
     EMPAQUE PM = PROD PM − lo que del OH no alcanzó a caber en la mañana
     A IMPRIMIR = EMPAQUE AM + EMPAQUE PM

   El OH se descuenta del día entero, no de una sola cubeta: primero contra
   la mañana y lo que sobre contra la tarde. Si saliera sólo de la mañana,
   un día en que la producción grande cae en la tarde mandaría a imprimir
   bolsa que ya está impresa.

   Las cuatro columnas de quintales son una foto de dónde están esos
   quintales: día anterior o día a producir, mañana o tarde. Son las fuentes
   elegidas y nada más, así que lo que se ve es lo que entra en la cuenta.

   Una clave que se hace en dos plantas lleva una fila por planta —sólo para
   ver de dónde sale cada parte— y abajo la fila que las une, que es la que
   lleva el OH y el total a imprimir, porque la bolsa es una sola. */
(function () {
  'use strict';
  const D = window.Datos;

  /* El empaque se pide en bolsas de diez en diez. */
  const MULT_EMPAQUE = 10;
  const alDiez = (n) => (n > 0 ? Math.round(n / MULT_EMPAQUE) * MULT_EMPAQUE : 0);
  const r2 = (n) => Math.round(n * 100) / 100;

  /* Las filas que no salen del catálogo: la unión de dos claves distintas que
     comparten bolsa, las de MU1 y las presentaciones que se cuentan a mano. */
  const EXTRAS = [
    { id: 'sum:WY1K', tipo: 'union', nombre: '12WY1 + K', claves: ['12WY1', '12WYK'] },
    { id: 'mu1:6',    tipo: 'mu1',    nombre: '6MU1',   unidades: 6 },
    { id: 'mu1:12',   tipo: 'manual', nombre: '12MU1' },
    { id: 'man:5HD2',   tipo: 'manual', nombre: '5HD2' },
    { id: 'man:15PL1',  tipo: 'manual', nombre: '15PL1' },
    { id: 'man:8PL1',   tipo: 'manual', nombre: '8PL1' },
    { id: 'man:10S11T', tipo: 'manual', nombre: '10S11T' },
    { id: 'man:12S11T', tipo: 'manual', nombre: '12S11T' },
    { id: 'man:10WY1M', tipo: 'manual', nombre: '10WY1 M' },
    { id: 'man:10WY1G', tipo: 'manual', nombre: '10WY1 G' },
  ];

  /* Nombres cortos de planta para la primera columna, como en la hoja. El
     orden es el de la hoja de papel: Zona 2 primero, de ahí el «2 + 18». */
  const corto = { Z2: '2', Z2CZ: '2 CZ', Z18: '18' };
  const ORDEN_PLANTA = ['Z2', 'Z2CZ', 'Z18'];

  // ---------- de dónde salen los quintales ----------
  /* Cada turno de una clave lleva dos ajustes, uno por día: qué hace lo que
     ese turno produjo el día a producir, y qué hace lo del día anterior. Cada
     uno va a la cubeta AM, a la PM, o a ninguna. Hacen falta los dos porque un
     mismo turno puede contar de un lado un día y del otro al siguiente. */
  const DESTINOS = ['', 'AM', 'PM'];
  const DIAS = ['hoy', 'ayer'];
  const limpiaDest = (v) => (DESTINOS.includes(v) ? v : '');

  /** Los turnos que una clave puede usar, que son los de sus plantas. */
  const turnosDeClave = (clave) => D.TURNOS.filter((t) => D.puedeEnTurno(clave, t.id));

  /**
   * De dónde sale ese turno para esa clave. Sin nada guardado cuenta lo del
   * día a producir, en el momento propio del turno, y sólo en los turnos donde
   * esa clave se hace de verdad —los que tiene marcados en Productos—. Así la
   * hoja sale llena y con una fila por clave desde el primer día, y las que de
   * veras se reparten entre dos plantas son las que se abren en dos.
   */
  function fuenteDe(P, clave, turnoId) {
    const v = ((P.bolsaFuentes || {})[clave] || {})[turnoId];
    if (v && typeof v === 'object') {
      return { hoy: limpiaDest(v.hoy), ayer: limpiaDest(v.ayer) };
    }
    const suyos = ((P.prod || {})[clave] || {}).turnos || [];
    return { hoy: suyos.includes(turnoId) ? D.momentoDeTurno(turnoId) : '', ayer: '' };
  }

  /** Las fuentes vivas de una clave: turno, cubeta y de qué día se lee. */
  function fuentesDe(P, clave) {
    const out = [];
    turnosDeClave(clave).forEach((t) => {
      const f = fuenteDe(P, clave, t.id);
      const planta = D.plantaDeTurno(t.id);
      if (f.hoy) out.push({ turno: t.id, planta, cubeta: f.hoy, atras: 0 });
      if (f.ayer) out.push({ turno: t.id, planta, cubeta: f.ayer, atras: 1 });
    });
    return out;
  }

  /** Las plantas donde esa clave trae algo; sin nada elegido, las marcadas. */
  function plantasDe(P, clave) {
    const vivas = [...new Set(fuentesDe(P, clave).map((f) => f.planta))];
    const lista = vivas.length ? vivas : D.PLANTAS.map((p) => p.id).filter((p) => D.enPlanta(clave, p));
    return ORDEN_PLANTA.filter((p) => lista.includes(p));
  }

  // ---------- las filas de la hoja ----------
  /**
   * Si esa fila entra en la hoja. Se guarda la lista de las que NO entran, no
   * la de las que sí: así una clave nueva aparece sola, en vez de quedarse
   * afuera sin que nadie se entere. La lista acepta la clave entera o el id de
   * una fila suelta.
   */
  const dentro = (P, id) => !(P.bolsaFuera || []).includes(id);
  const filaDentro = (P, f) => (f.clave ? dentro(P, f.clave) && dentro(P, f.id) : dentro(P, f.id));

  function filas(params, todas) {
    const P = params || D.estado.params;
    const out = [];
    const vistas = new Set();
    /* El orden de arranque es el de las áreas de producción, para que la hoja
       se lea como se decidió la producción. Después manda lo que se arrastró. */
    D.AREAS.forEach((a) => {
      D.clavesDeArea(a.id).forEach((c) => {
        if (vistas.has(c)) return;
        vistas.add(c);
        const f = P.prod[c] || {};
        const nombre = f.alias || c;
        const rend = Number(f.rend) || 0;
        const plantas = plantasDe(P, c);
        /* Con dos plantas van las dos filas de detalle y abajo la que une:
           ahí se escribe el OH y ahí sale el total, porque la bolsa es una. */
        if (plantas.length > 1) {
          plantas.forEach((p) => out.push({
            id: `${c}|${p}`, tipo: 'planta', clave: c, claves: [c], plantas: [p],
            nombre, rend, pprod: corto[p] || p, final: false,
          }));
          out.push({
            id: `sum:${c}`, tipo: 'union', clave: c, claves: [c], plantas,
            nombre, rend, pprod: plantas.map((p) => corto[p] || p).join(' + '), final: true,
          });
        } else {
          const p = plantas[0] || 'Z18';
          out.push({
            id: `${c}|${p}`, tipo: 'planta', clave: c, claves: [c], plantas: [p],
            nombre, rend, pprod: corto[p] || p, final: true,
          });
        }
      });
    });
    (P.bolsaExtras || EXTRAS).forEach((e) => {
      if (e.tipo !== 'union') { out.push({ ...e, rend: Number(e.rend) || 0, pprod: e.pprod || '', final: true }); return; }
      /* Una unión de dos claves distintas: comparten bolsa, así que comparten
         fila. El rendimiento y el nombre salen de la primera. */
      const base = P.prod[e.claves[0]] || {};
      const plantas = [...new Set(e.claves.flatMap((c) => plantasDe(P, c)))];
      out.push({
        ...e, clave: null, rend: Number(base.rend) || 0, final: true,
        plantas: ORDEN_PLANTA.filter((p) => plantas.includes(p)),
        pprod: ORDEN_PLANTA.filter((p) => plantas.includes(p)).map((p) => corto[p] || p).join(' + '),
      });
    });
    const vivas = todas ? out : out.filter((f) => filaDentro(P, f));
    return ordenar(P, vivas);
  }

  /**
   * El orden de las filas. De fábrica es el de las áreas de producción; si se
   * cambió a mano en Parámetros, manda esa lista. Lo que no esté en ella va
   * después en el orden de siempre, así una clave nueva aparece al final en
   * vez de perderse.
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

  /** Lo que el usuario escribió a mano, si escribió algo. */
  const puesto = (b, campo, id) => {
    const v = ((b || {})[campo] || {})[id];
    return v === '' || v === null || v === undefined ? null : Number(v);
  };

  /** El día del que salen las fuentes marcadas «día anterior». */
  const fechaPrevia = (fecha) => D.sumarDias(fecha, -1);

  // ---------- el domingo que todavía no pasó ----------
  /* La bolsa del domingo de Zona 2 se manda a imprimir el sábado, cuando esa
     producción todavía no existe en ningún lado. Lo único con qué estimarla
     son los domingos anteriores, que el app sí guarda porque la foto de Zona 2
     entra todos los días. Así que el sábado se le suma a la hoja el promedio
     de los últimos domingos, turno por turno, y cada turno entra por la misma
     cubeta que tenga puesta. */
  const SABADO = 5, DOMINGO = 6;   // con lunes = 0

  /**
   * La cantidad que esa clave lleva fija ese día de la semana, o 0. Es bolsa
   * que se manda a imprimir sin esperar producción, porque el dato se sabe de
   * antemano: el 10WY1 M de martes y jueves, por ejemplo.
   */
  function fijoDe(P, id, fecha) {
    const f = (P.bolsaFijos || {})[id];
    if (!f || !Array.isArray(f.dias)) return 0;
    return f.dias.includes(D.indiceDia(fecha)) ? (Number(f.cantidad) || 0) : 0;
  }

  /**
   * El promedio por clave y turno de los últimos domingos con producción en
   * esa planta. Devuelve también de qué domingos salió, para poder decirlo.
   */
  function promDomingos(P, fecha) {
    const cfg = P.bolsaDomingo || {};
    if (cfg.activo === false) return null;
    if (D.indiceDia(fecha) !== SABADO) return null;
    const planta = cfg.planta || 'Z2';
    const cuantos = Math.max(1, Math.round(Number(cfg.semanas) || 4));
    const ids = D.turnosDePlanta(planta).map((t) => t.id);
    /* Un domingo sin nada guardado no es un domingo de cero: es un domingo que
       no se capturó, y promediarlo como cero bajaría el estimado. Se salta. */
    const dias = [];
    let f = fecha;
    for (let i = 0; i < 70 && dias.length < cuantos; i++) {
      f = D.sumarDias(f, -1);
      if (D.indiceDia(f) !== DOMINGO) continue;
      const r = D.estado.dias[f] ? D.migrar(D.estado.dias[f]) : null;
      if (!r) continue;
      const hay = Object.values(r.turnos || {}).some((t) => ids.some((id) => Number((t || {})[id]) > 0));
      if (hay) dias.push(f);
    }
    if (!dias.length) return { dias: [], qq: {}, planta, cuantos };
    const suma = {};
    dias.forEach((d) => {
      const r = D.migrar(D.estado.dias[d]);
      Object.keys(r.turnos || {}).forEach((c) => {
        ids.forEach((id) => {
          const v = Number((r.turnos[c] || {})[id]) || 0;
          if (!v) return;
          (suma[c] = suma[c] || {})[id] = (suma[c][id] || 0) + v;
        });
      });
    });
    const qq = {};
    Object.keys(suma).forEach((c) => {
      qq[c] = {};
      Object.keys(suma[c]).forEach((id) => { qq[c][id] = r2(suma[c][id] / dias.length); });
    });
    return { dias, qq, planta, cuantos };
  }

  /**
   * La tabla completa de un día, ya calculada. La fecha que manda siempre es
   * la del día a producir; el día anterior sale de ella.
   */
  function calcular(fecha) {
    const P = D.estado.params;
    const b = D.estado.bolsa[fecha] || {};
    const fechas = [fecha, fechaPrevia(fecha)];
    const regs = fechas.map((f) => (D.estado.dias[f] ? D.migrar(D.estado.dias[f]) : { turnos: {} }));
    const qqDe = (atras, clave, turno) =>
      Number(((regs[atras] || {}).turnos || {})[clave] ? regs[atras].turnos[clave][turno] : 0) || 0;

    const mu1 = Number(b.mu1) || 0;
    const mu112 = Number(((b.manual || {})['mu1:12'])) || 0;
    const dom = promDomingos(P, fecha);

    return filas(P).map((f) => {
      const oh = f.final ? (Number(puesto(b, 'oh', f.id)) || 0) : 0;

      if (f.tipo === 'manual') {
        /* Lo escrito a mano manda. Si no hay nada escrito y ese día de la
           semana tiene cantidad fija, entra la fija. */
        const aMano = puesto(b, 'manual', f.id);
        const fijo = fijoDe(P, f.id, fecha);
        const tot = aMano !== null ? aMano : fijo;
        return { ...f, oh: 0, qq: celdas(), qqAM: 0, qqPM: 0,
          prodAM: 0, prodPM: 0, empAM: 0, empPM: 0, total: tot, manual: true,
          fijo, auto: aMano === null && !!fijo };
      }
      if (f.tipo === 'mu1') {
        /* Las unidades de MU1 se producen en Zona 18 y no las calcula esta
           app: se escriben arriba. De ahí salen bolsas de seis, menos las de
           doce, que llevan el doble de unidades cada una. */
        const uni = Number(f.unidades) || 6;
        const bolsas6 = Math.ceil(Math.round(1.01 * Math.floor(mu1 / uni)) / MULT_EMPAQUE) * MULT_EMPAQUE;
        const total = Math.max(0, bolsas6 - oh - mu112 * 2);
        return { ...f, oh, qq: celdas(), qqAM: 0, qqPM: 0,
          prodAM: 0, prodPM: 0, empAM: 0, empPM: 0, total,
          nota: `${mu1 ? mu1.toLocaleString('es-GT') : 0} unidades ÷ ${uni}` };
      }

      /* Las cuatro celdas de quintales y las dos cubetas, de una sola pasada
         sobre las fuentes que esa fila abarca. */
      const qq = celdas();
      let qqAM = 0, qqPM = 0;
      const sumar = (atras, turno, cubeta, v) => {
        const mo = D.momentoDeTurno(turno, fechas[atras]);
        qq[atras][mo] = r2(qq[atras][mo] + v);
        if (cubeta === 'AM') qqAM = r2(qqAM + v); else qqPM = r2(qqPM + v);
      };
      (f.claves || []).forEach((c) => {
        fuentesDe(P, c).forEach((s) => {
          if (!f.plantas.includes(s.planta)) return;
          const v = qqDe(s.atras, c, s.turno);
          if (v) sumar(s.atras, s.turno, s.cubeta, v);
        });
        /* El sábado se le suma encima el domingo estimado, que va en la
           columna del día a producir porque es bolsa de esta misma tanda. */
        if (!dom) return;
        const fila = dom.qq[c] || {};
        Object.keys(fila).forEach((id) => {
          if (!f.plantas.includes(D.plantaDeTurno(id))) return;
          const cub = fuenteDe(P, c, id).hoy;
          if (cub && fila[id]) sumar(0, id, cub, fila[id]);
        });
      });
      const rend = Number(f.rend) || 0;
      const prodAM = Math.round(rend * qqAM);
      const prodPM = Math.round(rend * qqPM);
      if (!f.final) {
        return { ...f, oh: 0, qq, qqAM, qqPM, prodAM, prodPM, empAM: 0, empPM: 0, total: 0 };
      }
      /* El OH ya está impreso: sale del día completo. Primero contra la
         mañana y, si no cabe entero ahí, el resto contra la tarde. */
      const sobra = Math.max(0, oh - prodAM);
      const empAM = alDiez(prodAM - oh);
      const empPM = alDiez(prodPM - sobra);
      return { ...f, oh, qq, qqAM, qqPM, prodAM, prodPM, empAM, empPM, total: empAM + empPM };
    });
  }

  /* [0] es el día a producir y [1] el anterior, con su mañana y su tarde. */
  const celdas = () => [{ AM: 0, PM: 0 }, { AM: 0, PM: 0 }];

  /**
   * Lo que se escribe a mano. Vive aparte de los días: esta hoja no se
   * sincroniza, se queda en el equipo donde se imprime.
   */
  function escribir(fecha, campo, id, valor) {
    const todo = D.estado.bolsa;
    if (!todo[fecha]) todo[fecha] = {};
    const b = todo[fecha];
    if (campo === 'mu1') {
      const n = Number(valor);
      b.mu1 = String(valor).trim() === '' || Number.isNaN(n) ? 0 : n;
      if (!b.mu1) delete b.mu1;
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
   * Las filas que entran al total: sólo las que llevan el cálculo. Las de
   * detalle por planta no cuentan —su bolsa la pide la fila de abajo— y una
   * clave que está dentro de una unión de dos claves tampoco.
   */
  function enTotal(fs) {
    const unidas = new Set();
    fs.forEach((f) => {
      if (f.tipo !== 'union' || !f.claves || f.claves.length < 2) return;
      f.claves.forEach((c) => unidas.add(c));
    });
    return fs.map((f) => ({ ...f, cuenta: !!f.final && !(f.clave && unidas.has(f.clave)) }));
  }

  function totales(fs) {
    const vivas = enTotal(fs).filter((f) => f.cuenta);
    const s = (k) => vivas.reduce((a, f) => a + (f[k] || 0), 0);
    return { prodAM: s('prodAM'), prodPM: s('prodPM'), empAM: s('empAM'), empPM: s('empPM'), total: s('total') };
  }

  // ---------- la hoja completa ----------
  /* Las trece columnas de la hoja de trabajo, con su ancho relativo. Las
     comparten el PDF y la imagen para que los dos digan lo mismo. */
  function colsHoja(fecha) {
    const d0 = D.fechaCorta(fecha).toUpperCase();
    const d1 = D.fechaCorta(fechaPrevia(fecha)).toUpperCase();
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
      { k: 'empAM', lineas: ['EMPAQUE', 'AM'], w: 52 },
      { k: 'empPM', lineas: ['EMPAQUE', 'PM'], w: 52 },
      { k: 'total', lineas: ['A', 'IMPRIMIR'], w: 52 },
    ];
  }

  const nHoja = (v) => (!v ? '' : Math.round(v).toLocaleString('es-GT'));
  const n2Hoja = (v) => (!v ? '' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 2 }));

  /** El texto de una celda de la hoja completa. */
  function valorHoja(f, c) {
    if (c.k === 'pprod') return f.pprod || '';
    if (c.k === 'nombre') return f.nombre;
    if (c.k === 'rend') return f.rend ? nHoja(f.rend) : '';
    if (c.k === 'q1AM') return n2Hoja(f.qq[1].AM);
    if (c.k === 'q1PM') return n2Hoja(f.qq[1].PM);
    if (c.k === 'q0AM') return n2Hoja(f.qq[0].AM);
    if (c.k === 'q0PM') return n2Hoja(f.qq[0].PM);
    /* En las filas de detalle el cálculo lo lleva la de abajo. */
    if (!f.final && ['oh', 'empAM', 'empPM', 'total'].includes(c.k)) return '';
    return nHoja(f[c.k]);
  }

  // ---------- PDF ----------
  /* Carta acostada y a toda la hoja: son trece columnas y de pie salían tan
     apretadas que había que acercarse al papel para leerlas. Se arma con las
     mismas piezas del resumen para no cargar ninguna librería. */
  function pdf(fecha) {
    const R = window.Resumen;
    const ANCHO = 792, ALTO = 612;
    const MX = 20, MY = 16;
    const fs = enTotal(calcular(fecha));
    const cols = colsHoja(fecha);
    /* La tabla se estira hasta los márgenes, encoja o crezca: el papel
       horizontal da de sobra y el espacio que quede en blanco es letra que
       se pudo haber hecho más grande. */
    const disponible = ANCHO - 2 * MX;
    const bruto = cols.reduce((a, c) => a + c.w, 0);
    const f0 = disponible / bruto;
    cols.forEach((c) => { c.w = Math.floor(c.w * f0 * 100) / 100; });
    const anchoTabla = cols.reduce((a, c) => a + c.w, 0);
    const x0 = MX + Math.max(0, (disponible - anchoTabla) / 2);

    const d = D.desdeISO(fecha);
    const larga = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    /* Una sola hoja, siempre: el reparto del día se mira completo o no sirve.
       Como el alto está fijo, lo que se estira es la letra, hasta donde el
       renglón y la columna más angosta la dejen crecer. */
    const yCab = MY + 18, hCab = 24;
    const yFilas = yCab + hCab;
    const alCuerpo = ALTO - MY - yFilas - 4;
    const hFila = Math.min(24, alCuerpo / Math.max(1, fs.length));

    const valor = valorHoja;
    const TAM_FILA = tamQueCabe(fs, cols, valor, hFila);
    const TAM_CAB = Math.min(8.5, Math.max(6, TAM_FILA));

    const h = R.hoja(ALTO);
    h.texto(x0, MY, 'IMPRESION DE BOLSA', { tam: 13, negrita: true });
    h.texto(x0, MY, `${D.nombreDia(fecha)}  ${larga}`,
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
        h.texto(x, y + (hFila - TAM_FILA) / 2, valor(f, c),
          { tam: TAM_FILA, negrita: neg, alinear: c.alinear || 'center', ancho: c.w });
        x += c.w;
      });
      y += hFila;
    });

    const bytes = R.pdfBytes([h.fin()], ANCHO, ALTO);
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      nombre: `Impresion Bolsa ${R.fechaArchivo(fecha)}.pdf`,
      tam: Math.round(TAM_FILA * 10) / 10,
    };
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

  /** La hoja completa en imagen, para mandarla por WhatsApp. */
  function hojaImagen(fecha) {
    const R = window.Resumen, COL = R.COL;
    const fs = enTotal(calcular(fecha));
    const cols = colsHoja(fecha);
    const ESCALA = 1.55;
    cols.forEach((c) => { c.w = Math.round(c.w * ESCALA); });
    const ANCHO = cols.reduce((a, c) => a + c.w, 0);
    const TIT = 36, CAB = 38, FILA = 22;
    const { cv, g } = R.lienzo(ANCHO, TIT + CAB + fs.length * FILA);

    const xs = [];
    cols.reduce((x, c) => { xs.push(x); return x + c.w; }, 0);

    R.celda(g, 0, 0, ANCHO, TIT, {
      fondo: COL.naranja, texto: `IMPRESIÓN DE BOLSA · ${tituloOrden(fecha)}`,
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

    return { cv, nombre: `Impresion Bolsa ${R.fechaArchivo(fecha)}.png`, filas: fs.length };
  }

  // ---------- La orden de impresión ----------
  /**
   * El papel corto que se manda a imprimir bolsa: la clave, cuánto va y el OH
   * de referencia, y tres casillas en blanco para anotar a mano lo que de
   * verdad salió en cada turno y el total. Esas tres no existen en la tabla
   * de trabajo a propósito: no son cálculo, son lo que se apunta en el papel.
   */
  const COLS_ORDEN = [
    { k: 'nombre', t: 'CLAVE', p: 1.5, alinear: 'left' },
    { k: 'total',  t: 'A IMPRIMIR', p: 1.3 },
    { k: 'oh',     t: 'OH', p: 0.7 },
    { k: 'impAM',  t: 'IMPRIMIR AM', p: 1.22, vacia: true },
    { k: 'impPM',  t: 'IMPRIMIR PM', p: 1.22, vacia: true },
    { k: 'suma',   t: 'TOTAL', p: 1.0, vacia: true },
  ];

  /**
   * Una línea por cosa que se imprime: ni las filas de detalle por planta
   * —su bolsa la pide la de abajo— ni las claves que hoy no producen nada.
   * El OH no entra en el filtro: llega en la mañana y se anota encima, así
   * que una clave con producción sale aunque todavía no tenga OH, y una sin
   * producción no entra sólo por tener OH escrito.
   */
  function ordenLineas(fecha) {
    return enTotal(calcular(fecha))
      .filter((f) => f.cuenta && (f.prodAM > 0 || f.prodPM > 0 || f.total > 0))
      .map((f) => ({ nombre: f.nombre, total: f.total || 0, oh: f.oh || 0 }));
  }

  const nOrden = (v) => (!v ? '' : Math.round(v).toLocaleString('es-GT'));

  function tituloOrden(fecha) {
    const d = D.desdeISO(fecha);
    return `${D.nombreDia(fecha)}  ${String(d.getDate()).padStart(2, '0')}/`
      + `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  /** Cuarto de carta vertical: el tamaño que se lleva en la mano. */
  function ordenPdf(fecha) {
    const R = window.Resumen;
    const ANCHO = 306, ALTO = 396;
    const MX = 12, MY = 12;
    const h = R.hoja(ALTO);
    const ls = ordenLineas(fecha);

    const ancho = ANCHO - 2 * MX;
    const unidad = ancho / COLS_ORDEN.reduce((a, c) => a + c.p, 0);
    const cols = COLS_ORDEN.map((c) => ({ ...c, w: Math.floor(c.p * unidad * 100) / 100 }));
    const anchoTabla = cols.reduce((a, c) => a + c.w, 0);
    const x0 = MX;

    h.texto(x0, MY, 'ORDEN DE IMPRESION DE BOLSA', { tam: 9, negrita: true });
    h.texto(x0, MY + 12, tituloOrden(fecha), { tam: 8, negrita: true });

    const yCab = MY + 26, hCab = 18;
    const yFilas = yCab + hCab;
    /* La fila se estira hasta llenar la hoja: en estas tres columnas se
       escribe a mano y el renglón apretado no sirve de nada. */
    const hFila = Math.min(28, (ALTO - MY - yFilas - 4) / Math.max(1, ls.length));
    const valorOrden = (f, c) => (c.vacia ? '' : (c.k === 'nombre' ? f.nombre : nOrden(f[c.k])));
    const TAM = tamQueCabe(ls, cols, valorOrden, hFila, 12);

    let xc = x0;
    cols.forEach((c) => {
      h.rect(xc, yCab, c.w, hCab);
      h.texto(xc, yCab + (hCab - 6) / 2, c.t,
        { tam: 6, negrita: true, alinear: 'center', ancho: c.w });
      xc += c.w;
    });

    let y = yFilas;
    ls.forEach((f) => {
      let x = x0;
      cols.forEach((c) => {
        h.rect(x, y, c.w, hFila);
        h.texto(x, y + (hFila - TAM) / 2, valorOrden(f, c),
          { tam: TAM, negrita: c.k !== 'oh', alinear: c.alinear || 'center', ancho: c.w });
        x += c.w;
      });
      y += hFila;
    });

    h.rect(x0, yCab, anchoTabla, y - yCab);

    const bytes = R.pdfBytes([h.fin()], ANCHO, ALTO);
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      nombre: `Orden Impresion Bolsa ${R.fechaArchivo(fecha)}.pdf`,
      lineas: ls.length,
    };
  }

  /** La misma orden, en imagen, para mandarla por WhatsApp. */
  function ordenImagen(fecha) {
    const R = window.Resumen, COL = R.COL;
    const ls = ordenLineas(fecha);
    /* Sin fila de totales: en el teléfono cada renglón que sobra es uno que
       se puede hacer más alto y con la letra más grande. */
    const ANCHO = 470, TIT = 34, CAB = 30, FILA = 30;
    const alto = TIT + CAB + ls.length * FILA;
    const { cv, g } = R.lienzo(ANCHO, alto);

    const unidad = ANCHO / COLS_ORDEN.reduce((a, c) => a + c.p, 0);
    const cols = COLS_ORDEN.map((c) => ({ ...c, w: c.p * unidad }));
    const xs = [];
    cols.reduce((x, c) => { xs.push(x); return x + c.w; }, 0);

    R.celda(g, 0, 0, ANCHO, TIT, {
      fondo: COL.naranja, texto: `IMPRESIÓN DE BOLSA · ${tituloOrden(fecha)}`,
      color: COL.blanco, fuente: 'bold 14px system-ui, sans-serif', borde: COL.naranja,
    });

    let y = TIT;
    cols.forEach((c, i) => {
      R.celda(g, xs[i], y, c.w, CAB, {
        fondo: c.vacia ? COL.gris : COL.verde, borde: c.vacia ? COL.gris : COL.verde,
        texto: c.t, color: c.vacia ? COL.tinta : COL.blanco,
        fuente: 'bold 10px system-ui, sans-serif',
      });
    });
    y += CAB;

    ls.forEach((f) => {
      cols.forEach((c, i) => {
        if (c.vacia) { R.celda(g, xs[i], y, c.w, FILA, { fondo: COL.blanco }); return; }
        const esClave = c.k === 'nombre';
        R.celda(g, xs[i], y, c.w, FILA, {
          fondo: esClave ? COL.verdeSuave : COL.blanco,
          texto: esClave ? f.nombre : nOrden(f[c.k]),
          color: c.k === 'oh' ? COL.grisTexto : COL.tinta,
          alinear: esClave ? 'left' : 'center',
          fuente: c.k === 'oh' ? '14px system-ui, sans-serif' : 'bold 15px system-ui, sans-serif',
        });
      });
      y += FILA;
    });

    return { cv, nombre: `Orden Impresion Bolsa ${R.fechaArchivo(fecha)}.png`, lineas: ls.length };
  }

  /**
   * Producción del día a producir que no está entrando en la hoja porque su
   * turno quedó en «—». Sin esto la clave sale con menos bolsas de las que
   * toca y no hay forma de darse cuenta.
   */
  function ignorados(fecha) {
    const P = D.estado.params;
    const reg = D.estado.dias[fecha] ? D.migrar(D.estado.dias[fecha]) : { turnos: {} };
    const out = [];
    Object.keys(reg.turnos || {}).forEach((c) => {
      if (!P.prod[c] || !dentro(P, c)) return;
      turnosDeClave(c).forEach((t) => {
        const v = Number((reg.turnos[c] || {})[t.id]) || 0;
        if (!v) return;
        if (fuenteDe(P, c, t.id).hoy) return;
        out.push({ clave: c, nombre: (P.prod[c] || {}).alias || c, turno: t.nombre, qq: r2(v) });
      });
    });
    return out;
  }

  window.Bolsa = { filas, calcular, escribir, totales, enTotal, pdf, ignorados,
    ordenLineas, ordenPdf, ordenImagen, hojaImagen, COLS_ORDEN,
    dentro, filaDentro, fechaPrevia, fuenteDe, fuentesDe, turnosDeClave, promDomingos, fijoDe,
    DESTINOS, DIAS, EXTRAS, alDiez };
})();
