/**
 * El retrato de la producción: lo que viaja de la laptop al teléfono por el
 * código QR para consultar —y simular— la producción del día.
 *
 * Igual que el retrato de la hoja de bolsa, es el contrato entre las dos apps,
 * así que este archivo es el MISMO en las dos. El número de formato y la
 * versión de la cuenta viajan en el encabezado para que, cuando una de las dos
 * se quede atrás, el teléfono lo diga en vez de calcular distinto en silencio.
 *
 * El teléfono no escribe nada de vuelta. Lo que se mueve allá es una
 * simulación: sirve para decidir, y la decisión se escribe en la laptop.
 *
 * Lleva resuelto todo lo que la laptop sabe calcular —stock, producción de
 * ayer, venta promedio de hoy y de mañana, sugerido, topes— y deja para el
 * teléfono una sola cosa: mover los quintales de un turno.
 *
 * Formato de texto plano para que comprima bien: un encabezado de líneas
 * sueltas, una línea en blanco, y una fila por línea con los campos separados
 * por tabulación. La primera letra dice qué es la fila: `T` un turno, `C` una
 * clave.
 */
(function (raiz) {
  'use strict';

  const FORMATO = 'PP1';
  /* La versión de la cuenta. Sube cuando `cadena` cambie de resultado, no
     cuando cambie el formato: son dos cosas distintas y se avisan aparte. */
  const VERSION = 'P1';
  const SEP = '\t';

  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? String(Math.round(x * 100) / 100) : '0';
  };
  const num = (v) => Number(v) || 0;

  /**
   * La cadena de una clave, con los quintales que se le quieran poner.
   *
   * Es la misma cuenta de la laptop, con una diferencia pedida a propósito: la
   * venta de hoy y la de mañana son la venta PROMEDIO, sin los pedidos en
   * firme. Los pedidos viajan aparte y se muestran en su propia línea, así que
   * la diferencia contra el teórico de la laptop queda a la vista en vez de
   * esconderse dentro de un número.
   *
   * Lo importante de esta cuenta: mover la producción de hoy NO mueve lo que
   * cierra hoy. Lo que se produce hoy se cuenta mañana. Por eso `cierraHoy` no
   * depende de `qq` y `cierraMan` sí.
   */
  function cadena(c, qq) {
    const q = num(qq);
    const disponible = num(c.stock) + num(c.prodAyerB);
    const cierraHoy = Math.max(0, disponible - num(c.ventaHoy));
    const prodB = q * num(c.rend);
    const cierraMan = cierraHoy + prodB - num(c.ventaMan);
    const prom = num(c.promDia);
    return {
      qq: q, disponible, cierraHoy, prodB, cierraMan,
      cobertura: prom > 0 ? (cierraHoy + prodB) / prom : null,
    };
  }

  /** Suma de un reparto por turno. */
  const sumaQQ = (asig) => Math.round(
    Object.values(asig || {}).reduce((a, b) => a + num(b), 0) * 100) / 100;

  /**
   * Lo que lleva cada turno contra su tope, sumando todas las claves.
   *
   * Es el freno de la simulación: un turno no alcanza a hacer más de su tope,
   * por mucho que falte producto. El tope se puede pisar en el teléfono —para
   * probar qué pasaría si alguien se queda una hora más— pero el pisado es de
   * la simulación y no vuelve a la laptop.
   */
  function topes(r, asigs, pisados) {
    const out = {};
    (r.turnos || []).forEach((t) => {
      const pisado = pisados && pisados[t.id] != null ? num(pisados[t.id]) : null;
      const tope = pisado != null ? pisado : num(t.tope);
      out[t.id] = { ...t, tope, pisado: pisado != null, usado: 0 };
    });
    Object.values(asigs || {}).forEach((asig) => {
      Object.entries(asig || {}).forEach(([id, v]) => {
        if (out[id]) out[id].usado = Math.round((out[id].usado + num(v)) * 100) / 100;
      });
    });
    Object.values(out).forEach((t) => {
      t.libre = Math.round((t.tope - t.usado) * 100) / 100;
      t.excedido = t.usado > t.tope + 1e-9;
      t.pct = t.tope > 0 ? t.usado / t.tope : 0;
    });
    return out;
  }

  // ---------- armar (sólo corre en la laptop) ----------
  /**
   * Arma el retrato de la producción de una fecha.
   * Necesita `window.Datos` y `window.Calculo`.
   */
  function armar(fecha, version) {
    const D = window.Datos, C = window.Calculo;
    const P = D.estado.params;
    const reg = D.registro(fecha);
    const todo = C.calcularTodo(D.estado, reg, fecha);

    const cab = [FORMATO, fecha, version || '', VERSION];

    /* Los turnos que de verdad pueden recibir quintales ese día. El `reparte`
       no entra: eso sólo apaga el reparto automático, y acá la decisión es a
       mano igual que cuando se escribe en la laptop. */
    /* La planta va con su nombre, no con su código: el teléfono no tiene el
       catálogo para traducirlo y «Zona 18» se lee y «Z18» hay que saberlo. */
    const nombrePlanta = (id) => (D.PLANTAS.find((x) => x.id === id) || {}).nombre || id;
    const turnos = Object.values(todo.turnos)
      .filter((t) => t.activo)
      .map((t) => ['T', t.id, t.nombre, nombrePlanta(t.planta), t.momento, n(t.tope)].join(SEP));

    const hoyReal = D.hoyISO();
    const manana = D.sumarDias(fecha, 1);

    /* En el orden del catálogo, que es el que se ve en la laptop. */
    const claves = todo.filas.map((f) => {
      const cfg = P.prod[f.clave] || {};
      const suyos = C.turnosUtiles(P, f.clave).turnos
        .filter((t) => C.turnoTrabaja(P, t, fecha) && (P.turnos[t] || {}).activo !== false);
      const asig = Object.entries(f.asign || {})
        .filter(([, v]) => num(v) > 0)
        .map(([t, v]) => `${t}=${n(v)}`);
      return ['C',
        f.clave,
        f.familia || '',
        n(f.rend),
        n(f.mult),
        n(cfg.maxDia || 0),
        n(f.stockAyer),
        n(f.prodAyerB),
        /* La venta promedio sola, sin los pedidos: así la pidió la hoja de
           consulta. Los pedidos van en su propia columna. */
        n(C.ventaDe(D.estado, P, f.clave, fecha)),
        n(f.pedidoHoy),
        n(C.ventaDe(D.estado, P, f.clave, manana)),
        n(C.bolsasDe(C.pedidosDe(D.estado, f.clave, manana, hoyReal))),
        n(f.promDia),
        n(f.sugeridoQQ),
        suyos.join(','),
        asig.join(','),
      ].join(SEP);
    });

    return `${cab.join('\n')}\n\n${[...turnos, ...claves].join('\n')}`;
  }

  /** Lee el retrato. Devuelve `null` si el texto no es uno. */
  function leer(texto) {
    const t = String(texto || '').replace(/\r/g, '');
    const corte = t.indexOf('\n\n');
    if (corte < 0) return null;
    const cab = t.slice(0, corte).split('\n');
    if (cab[0] !== FORMATO) return null;

    const turnos = [], claves = [];
    t.slice(corte + 2).split('\n').filter(Boolean).forEach((ln) => {
      const c = ln.split(SEP);
      if (c[0] === 'T') {
        turnos.push({ id: c[1], nombre: c[2], planta: c[3], momento: c[4], tope: num(c[5]) });
      } else if (c[0] === 'C') {
        const asig = {};
        (c[15] || '').split(',').filter(Boolean).forEach((p) => {
          const [id, v] = p.split('=');
          if (id) asig[id] = num(v);
        });
        claves.push({
          clave: c[1], familia: c[2] || '',
          rend: num(c[3]), mult: num(c[4]), maxDia: num(c[5]),
          stock: num(c[6]), prodAyerB: num(c[7]),
          ventaHoy: num(c[8]), pedHoy: num(c[9]),
          ventaMan: num(c[10]), pedMan: num(c[11]),
          promDia: num(c[12]), sugerido: num(c[13]),
          turnos: (c[14] || '').split(',').filter(Boolean),
          asig,
        });
      }
    });
    return { formato: cab[0], fecha: cab[1], version: cab[2], calc: cab[3] || '',
      turnos, claves };
  }

  raiz.RetratoProd = { armar, leer, cadena, topes, sumaQQ, FORMATO, VERSION };
}(typeof globalThis !== 'undefined' ? globalThis : this));
