/* Venta real: lo que de verdad salió de bodega cada día.

   El app ya guarda todo lo que hace falta para saberlo, sólo que nunca lo
   había puesto junto. De un día se conoce lo que había en la mañana, lo que se
   produjo y lo que quedó en el conteo de la tarde; la resta es lo que se
   vendió:

     venta = (lo que había + lo que se produjo) − lo que quedó

   Eso vale para cualquier clave del catálogo y sale en bolsas. El promedio de
   venta por día de semana que mueve el sugerido es otra cosa: es un promedio
   histórico que se carga del libro. Esto es el dato real de cada día, que
   sirve para ver si el promedio sigue valiendo.

   El CZ5 va aparte porque no es una clave del catálogo —en producción es CZ3,
   con empaque individual— y porque su conteo llega repartido en cinco
   empaques: parrillas de 55, parrillas de seis bolsas de 20, bolsas de 15,
   unidades sueltas de 16 y bolsas transparentes de 20. Se capturan tal cual y
   el app los pasa a unidades, que es como se compara. */
(function () {
  'use strict';
  const D = window.Datos;

  const r2 = (n) => Math.round(n * 100) / 100;
  const num = (v) => {
    if (v === '' || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // ---------- CZ5 ----------
  /* Cuántas unidades trae cada empaque. Salen de Items_Data del libro de
     preventas: la parrilla de CZ5 lleva 55 unidades, la de 20CZ5 son seis
     bolsas de 20, y así. */
  const CZ5 = [
    { id: 'empacadoP', nombre: 'Empacado', unidad: 'parrillas de 55', uni: 55, empaque: true },
    { id: 'invP',      nombre: 'CZ5',      unidad: 'parrillas de 55', uni: 55 },
    { id: 'inv20P',    nombre: '20CZ5',    unidad: 'parrillas de 6×20', uni: 120 },
    { id: 'inv15B',    nombre: '15CZ5',    unidad: 'bolsas de 15', uni: 15 },
    { id: 'inv16Un',   nombre: '16CZ5T',   unidad: 'unidades', uni: 1 },
    { id: 'inv20TB',   nombre: '20CZ5T',   unidad: 'bolsas de 20', uni: 20 },
  ];
  const CONTEO = CZ5.filter((x) => !x.empaque);
  const UNI_PARRILLA = 55;

  const crudoCz5 = (fecha) => (D.estado.dias[fecha] ? (D.migrar(D.estado.dias[fecha]).cz5 || {}) : {});

  /** Si ese día trae algo escrito de CZ5. */
  const hayCz5 = (fecha) => {
    const c = crudoCz5(fecha);
    return CZ5.some((x) => num(c[x.id]) > 0);
  };

  /** El último día anterior con conteo de CZ5: su cierre es la mañana de hoy. */
  function diaPrevioCz5(fecha) {
    const antes = Object.keys(D.estado.dias || {}).filter((f) => f < fecha).sort().reverse();
    return antes.find((f) => hayCz5(f)) || null;
  }

  /**
   * El día de CZ5, con lo escrito y lo que sale de ahí. Las unidades de la
   * mañana son el cierre del día anterior con conteo: lo que quedó anoche es
   * lo que hay al abrir.
   */
  function cz5De(fecha) {
    const c = crudoCz5(fecha);
    const puesto = {};
    CZ5.forEach((x) => { puesto[x.id] = c[x.id] === undefined ? '' : c[x.id]; });

    const invUni = CONTEO.reduce((a, x) => a + num(c[x.id]) * x.uni, 0);
    const empacadoP = num(c.empacadoP);
    const empacadoUni = empacadoP * UNI_PARRILLA;

    const fAyer = diaPrevioCz5(fecha);
    const amUni = fAyer ? CONTEO.reduce((a, x) => a + num(crudoCz5(fAyer)[x.id]) * x.uni, 0) : 0;

    const dispUni = amUni + empacadoUni;
    /* Sin conteo del día no hay venta que calcular: sería decir que se vendió
       todo, y lo que pasa es que nadie contó. */
    const conConteo = CONTEO.some((x) => num(c[x.id]) > 0) || c.contado === true;
    const venta = conConteo ? dispUni - invUni : null;

    return {
      fecha, puesto, fAyer,
      amUni, amP: r2(amUni / UNI_PARRILLA),
      empacadoP, empacadoUni,
      dispUni, invUni, invP: r2(invUni / UNI_PARRILLA),
      venta, ventaP: venta == null ? null : r2(venta / UNI_PARRILLA),
      conConteo,
    };
  }

  /** Escribe una casilla del CZ5 del día. Vive en el día, así que se sincroniza. */
  function escribirCz5(fecha, campo, valor) {
    if (!CZ5.some((x) => x.id === campo)) return;
    const r = D.registro(fecha);
    if (!r.cz5) r.cz5 = {};
    const t = String(valor).trim();
    if (t === '') delete r.cz5[campo];
    else r.cz5[campo] = Math.max(0, num(t));
    if (!Object.keys(r.cz5).length) delete r.cz5;
    D.guardarDias();
  }

  // ---------- venta real de una clave del catálogo ----------
  /**
   * Lo que salió de bodega ese día, en bolsas. Necesita el conteo de cierre:
   * sin él no hay resta que valga.
   */
  function ventaDeClave(clave, fecha) {
    const r = D.estado.dias[fecha] ? D.migrar(D.estado.dias[fecha]) : null;
    if (!r) return null;
    const inv = r.invPM ? r.invPM[clave] : null;
    if (inv == null || inv === '') return null;
    const ficha = D.estado.params.prod[clave] || {};
    const rend = Number(ficha.rend) || 0;
    /* Lo que había al abrir y lo que entró ese día, con las mismas piezas que
       usa la pantalla de Inventario. */
    const stock = num(r.stockAyer ? r.stockAyer[clave] : 0);
    const prodQQ = (r.turnos && r.turnos[clave])
      ? Object.values(r.turnos[clave]).reduce((a, v) => a + num(v), 0)
      : 0;
    const impor = num(r.prodImport ? r.prodImport[clave] : 0);
    const qq = prodQQ || impor;
    const disponible = stock + qq * rend;
    return { fecha, clave, stock, qq, producido: qq * rend, disponible, invPM: num(inv),
      venta: r2(disponible - num(inv)) };
  }

  /** La serie diaria de una clave, de la más nueva a la más vieja. */
  const serieClave = (clave) => Object.keys(D.estado.dias || {}).sort().reverse()
    .map((f) => ventaDeClave(clave, f)).filter(Boolean);

  /** La serie diaria de CZ5, sólo los días con conteo. */
  const serieCz5 = () => Object.keys(D.estado.dias || {}).sort().reverse()
    .map((f) => cz5De(f)).filter((d) => d.venta != null);

  /** Agrupa una serie por mes. `campo` es de dónde sale el número. */
  function porMes(serie, campo) {
    const out = new Map();
    serie.forEach((d) => {
      const mes = d.fecha.slice(0, 7);
      const v = Number(d[campo]);
      if (!Number.isFinite(v)) return;
      const m = out.get(mes) || { mes, total: 0, dias: 0, max: 0, min: Infinity };
      m.total = r2(m.total + v);
      m.dias++;
      if (v > m.max) m.max = v;
      if (v < m.min) m.min = v;
      out.set(mes, m);
    });
    return [...out.values()]
      .map((m) => ({ ...m, min: m.min === Infinity ? 0 : m.min, prom: r2(m.total / m.dias) }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
  }

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const nombreMes = (mes) => {
    const [a, m] = mes.split('-');
    return `${MESES[Number(m) - 1] || m} ${a.slice(2)}`;
  };

  window.Venta = {
    CZ5, CONTEO, UNI_PARRILLA,
    cz5De, escribirCz5, hayCz5, serieCz5,
    ventaDeClave, serieClave, porMes, nombreMes,
  };
})();
