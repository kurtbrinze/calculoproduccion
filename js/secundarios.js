/* Cálculos secundarios de inventario.

   Son las tablas sueltas de la pestaña INV_PM del libro: conversiones de
   parrillas y perchas a unidades o bolsas que sirven para decidir algo en el
   momento —qué empacar, qué falta del pedido de BELCA— y se apuntan a mano en
   otro reporte.

   No tocan nada. No entran al inventario, ni a la producción, ni al historial,
   ni viajan a la tablet: se guardan sólo en este equipo para que una recarga a
   media captura no borre el trabajo, y el botón de limpiar los deja en cero.

   Quedaron fuera del libro las tablas que sólo servían para completar el
   conteo —CZ3 FREDY, Massella Granda y las filas de Esp_Dulce que salían de
   Toma_Inv—, porque eso ahora lo hace la lectura de la foto del INV PM. */
(function () {
  'use strict';
  const D = window.Datos;

  const r2 = (n) => Math.round(n * 100) / 100;
  const num = (v) => {
    const n = Number(String(v == null ? '' : v).replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  /* Cada tabla declara sus filas y de qué se componen. `campos` son las
     casillas que se escriben; el resto sale de `calc`. */
  const TABLAS = [
    {
      id: 'esp',
      nombre: 'Especiales y dulces',
      nota: 'Parrillas por lo que lleva cada una, más los panes sueltos.',
      cols: [
        { k: 'clave', t: 'Clave', ancho: 'l' },
        { k: 'parr', t: 'Parrillas', entra: true },
        { k: 'uni', t: 'Panes sueltos', entra: true },
        { k: 'total', t: 'Total unidades', fuerte: true },
      ],
      filas: [
        { id: 'S19M',  clave: 'S19M',        por: 12 },
        /* SR16 es la misma pieza que S16 con otra marca: va a 12 por parrilla
           igual, y se cuenta aparte porque de ahí sale cuánto empacar de esa
           marca. Se escribe acá y se ve también en la tarjeta de S16 total. */
        { id: 'S16',   clave: 'S16',         por: 12 },
        { id: 'SR16',  clave: 'SR16',        por: 12 },
        { id: 'S25M',  clave: 'S25M',        por: 10 },
        { id: '5HD2',  clave: '5HD2',        por: 18 },
        { id: '5HD2P', clave: '5HD2 Emp PM', por: 18 },
      ],
      /* La suma de las dos presentaciones de 5HD2, que es la que se apunta. */
      pies: [{ id: 'tot5HD2', t: 'TOTAL 5HD2', de: ['5HD2', '5HD2P'], k: 'total' }],
      calc: (f, v) => ({ total: r2(num(v.parr) * f.por + num(v.uni)) }),
    },
    {
      id: 's16',
      nombre: 'S16 total',
      nota: 'Las dos marcas se escriben arriba, en Especiales y dulces, y acá se suman. '
        + 'S16 y SR16 van a 12 por parrilla.',
      cols: [
        { k: 'clave', t: 'Clave', ancho: 'l' },
        { k: 'parr', t: 'Parrillas', entra: true },
        { k: 'uni', t: 'Panes sueltos', entra: true },
        { k: 'total', t: 'Unidades disponibles', fuerte: true },
      ],
      filas: [
        { id: 'S16',  clave: 'S16',  por: 12, espejo: { tabla: 'esp', fila: 'S16' } },
        { id: 'SR16', clave: 'SR16', por: 12, espejo: { tabla: 'esp', fila: 'SR16' } },
      ],
      pies: [{ id: 'totS16', t: 'Total', de: ['S16', 'SR16'], k: 'total' }],
      calc: (f, v) => ({ total: r2(num(v.parr) * f.por + num(v.uni)) }),
    },
    {
      id: 'pl1',
      nombre: 'PL1 (0034)',
      nota: 'Las cinco presentaciones llevadas a equivalente de 15PL1.',
      cols: [
        { k: 'clave', t: 'Clave', ancho: 'l' },
        { k: 'parr', t: 'Parrillas', entra: true },
        { k: 'bolsas', t: 'Bolsas', entra: true },
        { k: 'uni', t: 'Unidades' },
        { k: 'total', t: '= 15PL1', fuerte: true },
      ],
      filas: [
        { id: 'PL1T',   clave: 'PL1T',   modo: 'parr', por: 64 },
        { id: '15PL1',  clave: '15PL1',  modo: 'mixto', porParr: 6, porBolsa: 15 },
        { id: 'PL1U',   clave: 'PL1U',   modo: 'parr', por: 60 },
        { id: '15PL1U', clave: '15PL1U', modo: 'mixto', porParr: 4, porBolsa: 15 },
        { id: '8PL1',   clave: '8PL1',   modo: 'parr', por: 8 * 18 },
      ],
      pies: [{ id: 'totPL1', t: 'Total', de: '*', k: 'total' }],
      calc: (f, v) => {
        const uni = f.modo === 'parr'
          ? num(v.parr) * f.por
          : (num(v.parr) * f.porParr * f.porBolsa) + (num(v.bolsas) * f.porBolsa);
        return { uni: r2(uni), total: r2(uni / 15) };
      },
    },
    {
      id: 'mg',
      nombre: 'Magdalenas (0414)',
      nota: 'MG4D a 5 por parrilla y MGND a 8.',
      cols: [
        { k: 'clave', t: 'Clave', ancho: 'l' },
        { k: 'parr', t: 'Parrillas', entra: true },
        { k: 'uni', t: 'Sueltas', entra: true },
        { k: 'total', t: 'Unidades disponibles', fuerte: true },
      ],
      filas: [
        { id: 'MG4D', clave: 'MG4D', por: 5 },
        { id: 'MGND', clave: 'MGND', por: 8 },
      ],
      pies: [{ id: 'totMG', t: 'Total', de: '*', k: 'total' }],
      calc: (f, v) => ({ total: r2(num(v.parr) * f.por + num(v.uni)) }),
    },
  ];

  /* ---------- BELCA ----------
     Dos unidades de parrilla distintas y es a propósito: lo que ya está
     preparado va en parrillas del cliente —el 10HM5 le lleva 9 bolsas—, y lo
     que falta se convierte a parrillas de inventario —8 bolsas—, que son las
     que hay que bajar al día siguiente para terminar el pedido. */
  const BELCA = [
    { id: 'PM3', clave: '10PM3', cliente: 6, bodega: 6 },
    { id: 'HM5', clave: '10HM5', cliente: 9, bodega: 8 },
  ];

  function calcBelca(v) {
    return BELCA.map((f) => {
      const d = v[f.id] || {};
      const listo = r2(num(d.parr) * f.cliente + num(d.bolsas));
      const pedido = num(d.oc);
      const falta = r2(Math.max(0, pedido - listo));
      const parrFalta = Math.floor(falta / f.bodega);
      return {
        ...f,
        parr: num(d.parr), bolsas: num(d.bolsas), oc: pedido,
        listo, falta,
        parrFalta, sueltasFalta: r2(falta - parrFalta * f.bodega),
        /* Parrillas enteras a bajar de bodega: media parrilla no se baja. */
        pedir: Math.ceil(falta / f.bodega),
      };
    });
  }

  /* ---------- CZ3 / CZ5 (0134) ----------
     Las perchas de CZ3 se escriben en bolsas y la parrilla sale de bolsas×12.
     La producción de la tarde entra en quintales: la hace el turno de Byron o
     Julio que esa semana esté en la tarde, y se convierte con el rendimiento
     de CZ3. */
  const PERCHA = 12;
  const CZ3_POR_PERCHA = 720;

  function calcCz(v, fecha) {
    const parr20 = num(v.parr20);
    const b20 = r2(parr20 * 6);

    const ohBolsas = num(v.ohBolsas);
    const ohParr = r2(ohBolsas * PERCHA);

    const rend = Number((D.estado.params.prod.CZ3 || {}).rend) || 1550;
    const turnoPM = D.turnoRotandoEn('PM', fecha);
    const prodQQauto = turnoPM
      ? r2(Number(((D.registro(fecha).turnos || {}).CZ3 || {})[turnoPM]) || 0) : 0;
    const puesto = v.prodQQ;
    const manual = puesto !== '' && puesto !== null && puesto !== undefined;
    const prodQQ = manual ? num(puesto) : prodQQauto;
    const prodBolsas = r2((prodQQ * rend) / CZ3_POR_PERCHA);

    const total = r2(ohBolsas + prodBolsas);
    const cz5Bolsas = num(v.cz5Bolsas);
    const cz5Parr = r2(cz5Bolsas * PERCHA);
    const quedan = r2(total - cz5Bolsas);
    const empacar = num(v.empacar);
    const libres = r2(quedan - empacar);

    return {
      parr20, b20,
      ohBolsas, ohParr,
      prodQQ, prodBolsas, prodQQauto, manual,
      turnoPM: turnoPM ? (D.turnoPorId[turnoPM] || {}).nombre || turnoPM : null,
      rend,
      total, cz5Bolsas, cz5Parr, quedan, empacar, libres,
    };
  }

  // ---------- guardado ----------
  /* Una sola hoja de trabajo, local, fuera de los días y fuera del envío. */
  const K = 'panprod_secundarios';
  function leer() {
    try { return JSON.parse(localStorage.getItem(K) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function grabar(v) {
    try { localStorage.setItem(K, JSON.stringify(v)); return true; } catch (_) { return false; }
  }
  const limpiar = () => { try { localStorage.removeItem(K); } catch (_) {} };

  /** Lee una casilla, siguiendo el espejo si la fila lo tiene. */
  function valor(datos, tablaId, filaId, campo) {
    const t = TABLAS.find((x) => x.id === tablaId);
    const f = t && t.filas.find((x) => x.id === filaId);
    if (f && f.espejo) return ((datos[f.espejo.tabla] || {})[f.espejo.fila] || {})[campo] ?? '';
    return ((datos[tablaId] || {})[filaId] || {})[campo] ?? '';
  }

  function escribir(datos, tablaId, filaId, campo, v) {
    const t = TABLAS.find((x) => x.id === tablaId);
    const f = t && t.filas.find((x) => x.id === filaId);
    /* Escribir en una fila espejo escribe en su original: el S16 es uno solo. */
    const dt = f && f.espejo ? f.espejo.tabla : tablaId;
    const df = f && f.espejo ? f.espejo.fila : filaId;
    if (!datos[dt]) datos[dt] = {};
    if (!datos[dt][df]) datos[dt][df] = {};
    const s = String(v).trim();
    if (s === '') delete datos[dt][df][campo];
    else datos[dt][df][campo] = s;
    if (!Object.keys(datos[dt][df]).length) delete datos[dt][df];
    if (!Object.keys(datos[dt]).length) delete datos[dt];
    grabar(datos);
  }

  /** Una tabla resuelta: cada fila con lo escrito y lo calculado. */
  function resolver(tabla, datos) {
    const filas = tabla.filas.map((f) => {
      const v = {};
      tabla.cols.forEach((c) => { if (c.k !== 'clave') v[c.k] = valor(datos, tabla.id, f.id, c.k); });
      return { ...f, v, calc: tabla.calc(f, v) };
    });
    const pies = (tabla.pies || []).map((pie) => {
      const dentro = pie.de === '*' ? filas : filas.filter((f) => pie.de.includes(f.id));
      return { ...pie, valor: r2(dentro.reduce((a, f) => a + (Number(f.calc[pie.k]) || 0), 0)) };
    });
    return { ...tabla, filas, pies };
  }

  window.Secundarios = {
    TABLAS, BELCA, leer, grabar, limpiar, escribir, valor, resolver,
    calcBelca, calcCz, num, r2, PERCHA, CZ3_POR_PERCHA,
  };
})();
