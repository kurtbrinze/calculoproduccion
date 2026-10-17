/* Datos maestros, parámetros y guardado.
   Todo vive en el dispositivo (localStorage). El historial se exporta para respaldo.

   El catálogo de productos es editable: `params.catalogo` manda el orden y
   `params.prod[clave]` guarda la ficha. PRODUCTOS es sólo la semilla de fábrica. */
(function (raiz) {
  'use strict';

  const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

  /* Las dos plantas. Cada turno pertenece a una. */
  const PLANTAS = [
    { id: 'Z18', nombre: 'Zona 18' },
    { id: 'Z2',  nombre: 'Zona 2' },
  ];

  /* Turnos. El tope es el máximo de quintales que ese turno alcanza a hacer. */
  const TURNOS = [
    { id: 'MGD',     nombre: 'Magdalenas',   papel: 'Pequeño AM', tope: 2,  minimo: 0,  momento: 'AM', planta: 'Z18' },
    { id: 'RED_AM',  nombre: 'Redondo AM',   papel: 'Máquina AM', tope: 40, minimo: 0,  momento: 'AM', planta: 'Z18' },
    { id: 'SAND_AM', nombre: 'Sándwich AM',  papel: 'Grande AM',  tope: 64, minimo: 0,  momento: 'AM', planta: 'Z18' },
    /* Panaderos PM corre lleno con 10HD7 todos los días, por eso trae mínimo. */
    { id: 'PAN_PM',  nombre: 'Panaderos PM', papel: 'Grande PM',  tope: 12, minimo: 12, momento: 'PM', planta: 'Z18' },
    { id: 'RED_PM',  nombre: 'Redondo PM',   papel: 'Máquina PM', tope: 34, minimo: 0,  momento: 'PM', planta: 'Z18' },
    { id: 'BYRON',   nombre: 'Byron',        papel: 'B',          tope: 12, minimo: 0,  momento: 'PM', planta: 'Z2' },
    { id: 'JULIO',   nombre: 'Julio',        papel: 'J',          tope: 12, minimo: 0,  momento: 'PM', planta: 'Z2' },
    /* Máquina de Zona 2: hace 5HM4 y 10HD7. El tope de 40 qq es el que se le vio
       a la máquina en la hoja del 14/oct; cámbialo en Parámetros si es otro. */
    { id: 'MAQ_Z2',  nombre: 'Máquina Z2',   papel: 'Máquina',    tope: 40, minimo: 0,  momento: 'AM', planta: 'Z2' },
  ];

  /* Familias: agrupan vida útil y ordenan la pantalla. */
  const FAMILIAS = [
    { id: 'SANDWICH',  nombre: 'Sándwich',          vidaUtil: 21, minDespacho: 14, colchon: 2 },
    { id: 'REDONDO',   nombre: 'Redondo',           vidaUtil: 21, minDespacho: 14, colchon: 1 },
    { id: 'MAGDALENA', nombre: 'Magdalenas',        vidaUtil: 21, minDespacho: 14, colchon: 1 },
    { id: 'DULCE',     nombre: 'Dulces y especial', vidaUtil: 21, minDespacho: 14, colchon: 1 },
  ];
  /* Un pedido especial se produce con días de anticipación sobre la entrega.
     Vale para todas las familias salvo que alguna traiga el suyo. */
  const ANTICIPACION = 1;

  /* Un producto por fila. `turnos` va en orden de preferencia: el reparto
     automático llena el primero que tenga cupo antes de pasar al siguiente.
     z2 / z18 dicen en qué planta se puede producir.
     prodEnConteo marca el producto que se hace de mañana y que el conteo
     de cierre ya trae adentro, para no sumarlo dos veces. */
  const PRODUCTOS = [
    { clave: 'S26',   codigo: 25,  familia: 'SANDWICH',  rend: 94,   mult: 2,    turnos: ['SAND_AM'], z18: true,  z2: false },
    { clave: 'S19',   codigo: 26,  familia: 'SANDWICH',  rend: 120,  mult: 2,    turnos: ['SAND_AM'], z18: true,  z2: false },
    { clave: 'S16',   codigo: 549, familia: 'SANDWICH',  rend: 150,  mult: 2,    turnos: ['SAND_AM'], z18: true,  z2: false },
    { clave: 'S11',   codigo: 28,  familia: 'SANDWICH',  rend: 210,  mult: 2,    turnos: ['SAND_AM'], z18: true,  z2: false },
    { clave: '10PM3', codigo: 32,  familia: 'REDONDO',   rend: 120,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], z18: true, z2: false },
    { clave: '10HD7', codigo: 5,   familia: 'REDONDO',   rend: 110,  mult: 1,    turnos: ['PAN_PM', 'MAQ_Z2', 'RED_AM', 'RED_PM'], z18: true, z2: true },
    { clave: '10HR3', codigo: 1,   familia: 'REDONDO',   rend: 150,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], z18: true, z2: false, alias: 'HR3' },
    { clave: '12BLL', codigo: 436, familia: 'REDONDO',   rend: 200,  mult: 0.5,  turnos: ['RED_AM', 'RED_PM'], z18: true, z2: false },
    { clave: '15PL1', codigo: 34,  familia: 'REDONDO',   rend: 144,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], z18: true, z2: false },
    { clave: '5HM4',  codigo: 9,   familia: 'REDONDO',   rend: 220,  mult: 1,    turnos: ['MAQ_Z2'], z18: false, z2: true, alias: 'HM4' },
    { clave: 'MG1',   codigo: 77,  familia: 'MAGDALENA', rend: 130,  mult: 0.1,  turnos: ['MGD'], z18: true, z2: false },
    { clave: 'MG4',   codigo: 79,  familia: 'MAGDALENA', rend: 64,   mult: 0.1,  turnos: ['MGD'], z18: true, z2: false },
    { clave: 'MGN',   codigo: 414, familia: 'MAGDALENA', rend: 108,  mult: 0.1,  turnos: ['MGD'], z18: true, z2: false },
    { clave: 'CZ3',   codigo: 134, familia: 'DULCE',     rend: 1550, mult: 0.5,  turnos: ['JULIO', 'BYRON'], z18: false, z2: true },
    { clave: '10CZ4', codigo: 573, familia: 'DULCE',     rend: 226,  mult: 0.25, turnos: ['BYRON', 'JULIO'], z18: false, z2: true, prodEnConteo: true },
    { clave: '6CG2N', codigo: 391, familia: 'DULCE',     rend: 280,  mult: 0.25, turnos: ['BYRON'], z18: false, z2: true },
    { clave: '6CG2V', codigo: 390, familia: 'DULCE',     rend: 280,  mult: 0.25, turnos: ['BYRON'], z18: false, z2: true },
    { clave: '6CHO',  codigo: 355, familia: 'DULCE',     rend: 300,  mult: 0.25, turnos: ['BYRON'], z18: false, z2: true },
    { clave: '6QU1',  codigo: 490, familia: 'DULCE',     rend: 378,  mult: 0.25, turnos: ['JULIO'], z18: false, z2: true },
    { clave: 'IN16',  codigo: 473, familia: 'SANDWICH',  rend: 110,  mult: 2,    turnos: ['SAND_AM'], z18: true,  z2: false },
    { clave: 'S32',   codigo: 31,  familia: 'SANDWICH',  rend: 84,   mult: 0.5,  turnos: ['SAND_AM'], z18: true,  z2: true },
  ];

  /* Productos diferenciados: presentaciones distintas del mismo producto.
     El inventario de la clave destino sale de sumar sus partes, donde cada
     parte aporta  valor × mult / div  de la clave tal como viene en la hoja.
     El total se aproxima al entero de abajo. */
  const DIFERENCIADOS = [
    { destino: 'S11', activo: true, partes: [
      { clave: 'S11',  mult: 1,  div: 1 },
      { clave: 'S11T', mult: 21, div: 1 },
    ] },
    { destino: '15PL1', activo: true, partes: [
      { clave: '15PL1',  mult: 1,  div: 1 },
      { clave: 'PL1U',   mult: 1,  div: 15 },
      { clave: '15PL1U', mult: 1,  div: 1 },
      { clave: '8PL1',   mult: 8,  div: 15 },
      { clave: 'PL1T',   mult: 64, div: 15 },
    ] },
    { destino: '10HR3', activo: true, partes: [
      { clave: '10HR3', mult: 1, div: 1 },
      { clave: '5HD2',  mult: 1, div: 2 },
    ] },
    { destino: 'CZ3', activo: true, partes: [
      { clave: 'CZ3', mult: 60, div: 1 },
      { clave: 'CZ5', mult: 55, div: 1 },
    ] },
  ];

  /* Promedios de venta en bolsas por día, tomados de PROM_VD. Son el punto de
     partida: se editan en la app y se pueden recargar desde el libro. */
  const PROM_INICIAL = {
    S26:   [586, 398, 653, 461, 450, 324, 0],
    S19:   [3294, 1755, 3455, 2350, 2087, 1142, 0],
    S16:   [596, 291, 536, 557, 406, 201, 0],
    S11:   [441, 154, 314, 192, 176, 156, 0],
    IN16:  [12, 9, 10, 9, 15, 9, 0],
    S32:   [6, 2, 11, 7, 26, 2, 0],
    '10PM3': [53, 504, 19, 825, 308, 1435, 0],
    '10HD7': [1683, 683, 1248, 939, 1113, 825, 0],
    '10HR3': [9407, 2801, 9958, 4138, 5526, 3917, 0],
    '12BLL': [13, 24, 30, 18, 55, 27, 0],
    '15PL1': [741, 154, 625, 394, 582, 595, 0],
    '5HM4':  [9679, 4350, 8080, 4513, 7623, 4391, 0],
    MG1:   [7, 6, 5, 6, 7, 4, 0],
    MG4:   [11, 15, 30, 20, 23, 17, 0],
    MGN:   [22, 12, 42, 14, 22, 6, 0],
    CZ3:   [25684, 19149, 21872, 15696, 18293, 26976, 0],
    '10CZ4': [69, 36, 70, 56, 32, 24, 0],
    '6CG2N': [249, 191, 249, 236, 292, 90, 0],
    '6CG2V': [14, 22, 14, 20, 17, 8, 0],
    '6CHO': [12, 8, 14, 9, 12, 6, 0],
    '6QU1': [39, 31, 35, 36, 45, 34, 0],
  };

  /* Calendario: qué días trabaja cada planta. Zona 18 descansa sábado y domingo;
     Zona 2 trabaja también el domingo. Todo se cambia en Parámetros. */
  const CALENDARIO_INICIAL = DIAS.map((d) => {
    const z18 = !['SABADO', 'DOMINGO'].includes(d);
    const z2 = d !== 'SABADO';
    return { dia: d, produce: z18 || z2, factor: 1, plantas: { Z18: z18, Z2: z2 } };
  });

  /* Sube cuando hay un cambio de fábrica que debe alcanzar a quien ya tenía
     parámetros guardados.
       2 = llegó el turno Máquina Z2.
       3 = el calendario de producción pasó a ser por planta.
       4 = el catálogo se ordenó como la hoja de papel. */
  const ESQUEMA = 4;

  /** Ficha de producto completa, con todos los campos en su lugar. */
  function fichaDe(p) {
    return {
      clave: p.clave,
      codigo: p.codigo ?? null,
      familia: p.familia,
      rend: p.rend,
      mult: p.mult,
      unidad: p.unidad || 'bolsas',
      turnos: (p.turnos || []).slice(),
      z18: p.z18 !== false,
      z2: !!p.z2,
      prodEnConteo: !!p.prodEnConteo,
      alias: p.alias || '',
      // null = hereda de la familia
      vidaUtil: null, minDespacho: null, colchon: null,
      activo: true,
    };
  }

  function paramsPorDefecto() {
    const prod = {};
    PRODUCTOS.forEach((p) => { prod[p.clave] = fichaDe(p); });
    const turnos = {};
    TURNOS.forEach((t) => { turnos[t.id] = { tope: t.tope, minimo: t.minimo || 0, planta: t.planta, activo: true }; });
    const familias = {};
    FAMILIAS.forEach((f) => {
      familias[f.id] = { vidaUtil: f.vidaUtil, minDespacho: f.minDespacho, colchon: f.colchon, anticipacion: null };
    });
    return {
      factorTemporada: 1,
      horizonteModo: 'calendario',   // 'calendario' | 'fijo' | 'tabla'
      horizonteFijo: 3,
      cortePorProduccion: 2,         // cubrir hasta la 2ª corrida
      /* Modo 'tabla': para cada día de cálculo se marca qué días de venta entran.
         `general` aplica a todas las familias; `familias[X]` la pisa si no es null. */
      cobertura: { general: null, familias: {} },
      catalogo: PRODUCTOS.map((p) => p.clave),
      /* Claves de fábrica que el usuario quitó o renombró: no vuelven solas. */
      quitados: [],
      esquema: ESQUEMA,
      prod, turnos, familias,
      diferenciados: JSON.parse(JSON.stringify(DIFERENCIADOS)),
      pedidos: { anticipacion: ANTICIPACION },
      calendario: CALENDARIO_INICIAL.map((c) => ({ ...c })),
      feriados: [],                  // ['AAAA-MM-DD', ...]
    };
  }

  // ---------- guardado ----------
  const K = 'panprod_';
  const leer = (k, d) => {
    try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); }
    catch (_) { return d; }
  };
  const grabar = (k, v) => {
    try { localStorage.setItem(K + k, JSON.stringify(v)); return true; }
    catch (_) { return false; }
  };

  /** Matriz 7x7 de booleanos: fila = día de cálculo, columna = día de venta. */
  const matrizValida = (m) => Array.isArray(m) && m.length === 7 && m.every((f) => Array.isArray(f) && f.length === 7);
  const matrizVacia = () => Array.from({ length: 7 }, () => Array(7).fill(false));

  /* Mezcla lo guardado sobre los valores de fábrica, respetando el catálogo del
     usuario: si agregó o quitó productos, eso manda sobre la lista de fábrica. */
  function fusionarParams(guardado) {
    const base = paramsPorDefecto();
    if (!guardado || typeof guardado !== 'object') return base;
    const out = { ...base, ...guardado };

    /* El catálogo guardado manda. Al abrir una versión que trae claves nuevas,
       se agregan al final para no perderlas. */
    const guardadoProd = guardado.prod || {};
    let cat = Array.isArray(guardado.catalogo) && guardado.catalogo.length
      ? guardado.catalogo.filter((c) => typeof c === 'string')
      : Object.keys(guardadoProd);
    if (!cat.length) cat = base.catalogo.slice();
    /* Versión vieja: la clave S13 pasó a llamarse S11. */
    if (cat.includes('S13') && !cat.includes('S11')) {
      cat = cat.map((c) => (c === 'S13' ? 'S11' : c));
      if (Array.isArray(guardado.quitados)) guardado.quitados = guardado.quitados.filter((c) => c !== 'S11');
      if (guardadoProd.S13) { guardadoProd.S11 = { ...guardadoProd.S13, clave: 'S11' }; delete guardadoProd.S13; }
    }
    /* Lo que de fábrica no está en el catálogo guardado se agrega al final,
       salvo que se haya quitado o renombrado a propósito. */
    const fuera = new Set(Array.isArray(guardado.quitados) ? guardado.quitados : []);
    base.catalogo.forEach((c) => { if (!cat.includes(c) && !fuera.has(c)) cat.push(c); });
    out.catalogo = cat;
    out.quitados = [...fuera];

    out.prod = {};
    cat.forEach((c) => {
      const b = base.prod[c] || fichaDe({ clave: c, familia: 'REDONDO', rend: 100, mult: 1, turnos: [] });
      out.prod[c] = { ...b, ...(guardadoProd[c] || {}), clave: c };
      if (!Array.isArray(out.prod[c].turnos)) out.prod[c].turnos = b.turnos.slice();
    });

    out.turnos = { ...base.turnos };
    Object.keys(guardado.turnos || {}).forEach((k) => {
      if (base.turnos[k]) out.turnos[k] = { ...base.turnos[k], ...guardado.turnos[k] };
    });
    out.familias = { ...base.familias };
    Object.keys(guardado.familias || {}).forEach((k) => {
      if (base.familias[k]) out.familias[k] = { ...base.familias[k], ...guardado.familias[k] };
    });
    if (!Array.isArray(out.calendario) || out.calendario.length !== 7) out.calendario = base.calendario;
    /* Calendario por planta: lo que había pasa a Zona 18, y Zona 2 arranca
       igual más el domingo, que es lo que de verdad trabaja. */
    out.calendario = out.calendario.map((c, i) => {
      const dia = DIAS[i];
      const pl = c && c.plantas;
      const z18 = pl && typeof pl.Z18 === 'boolean' ? pl.Z18 : !!(c && c.produce);
      const z2 = pl && typeof pl.Z2 === 'boolean' ? pl.Z2
        : (dia === 'DOMINGO' ? true : !!(c && c.produce));
      return { dia, factor: Number(c && c.factor) || 1, plantas: { Z18: z18, Z2: z2 }, produce: z18 || z2 };
    });
    if (!Array.isArray(out.feriados)) out.feriados = [];

    out.pedidos = { ...base.pedidos, ...(guardado.pedidos || {}) };
    out.pedidos.anticipacion = Math.max(0, Number(out.pedidos.anticipacion) || 0);

    const dif = Array.isArray(guardado.diferenciados) ? guardado.diferenciados : null;
    out.diferenciados = (dif || base.diferenciados)
      .filter((d) => d && typeof d.destino === 'string' && Array.isArray(d.partes))
      .map((d) => ({
        destino: d.destino, activo: d.activo !== false,
        partes: d.partes
          .filter((p) => p && typeof p.clave === 'string')
          .map((p) => ({ clave: p.clave, mult: Number(p.mult) || 0, div: Number(p.div) || 1 })),
      }));

    /* El catálogo pasa al orden de la hoja de papel. Lo que el usuario haya
       agregado después se queda al final, sin tocar. */
    if ((Number(guardado.esquema) || 0) < 4) {
      const orden = base.catalogo;
      out.catalogo = [
        ...orden.filter((c) => out.catalogo.includes(c)),
        ...out.catalogo.filter((c) => !orden.includes(c)),
      ];
      cat = out.catalogo;
    }

    /* Máquina Z2: 5HM4 pasa a hacerse ahí y 10HD7 puede hacerse ahí o en
       Panaderos PM. Se aplica una sola vez sobre los parámetros guardados. */
    if ((Number(guardado.esquema) || 0) < 2) {
      if (out.prod['5HM4']) {
        out.prod['5HM4'].turnos = ['MAQ_Z2'];
        out.prod['5HM4'].z2 = true; out.prod['5HM4'].z18 = false;
      }
      if (out.prod['10HD7']) {
        const t = out.prod['10HD7'].turnos || [];
        if (!t.includes('MAQ_Z2')) out.prod['10HD7'].turnos = ['PAN_PM', 'MAQ_Z2', ...t.filter((x) => x !== 'PAN_PM')];
        out.prod['10HD7'].z2 = true;
      }
    }
    out.esquema = ESQUEMA;

    const cob = guardado.cobertura;
    out.cobertura = {
      general: matrizValida(cob && cob.general) ? cob.general : null,
      familias: Object.fromEntries(FAMILIAS.map((f) => {
        const m = cob && cob.familias && cob.familias[f.id];
        return [f.id, matrizValida(m) ? m : null];
      })),
    };
    return out;
  }

  const estado = {
    params: fusionarParams(leer('params', null)),
    prom: leer('prom', null) || JSON.parse(JSON.stringify(PROM_INICIAL)),
    dias: leer('dias', {}),      // { 'AAAA-MM-DD': registro }
    pedidos: leer('pedidos', {}),// { id: pedido }
  };
  /* Versión vieja de los promedios: S13 pasó a S11. */
  if (estado.prom.S13 && !estado.prom.S11) { estado.prom.S11 = estado.prom.S13; delete estado.prom.S13; }

  // ---------- catálogo vivo ----------
  /** Lista de productos tal como está configurada hoy. */
  function productos() {
    return estado.params.catalogo.map((c) => estado.params.prod[c]).filter(Boolean);
  }
  /** Sólo los activos, que son los que entran al cálculo. */
  function activos() {
    return productos().filter((p) => p.activo !== false);
  }
  const claves = () => productos().map((p) => p.clave);
  const fichaPorClave = (c) => estado.params.prod[c] || null;
  /** La planta de un turno según los parámetros, con la de fábrica de respaldo. */
  const plantaDeTurno = (id) => {
    const c = estado.params.turnos[id] || {};
    const t = TURNOS.find((x) => x.id === id);
    return c.planta || (t && t.planta) || 'Z18';
  };
  const turnosDePlanta = (planta) => TURNOS.filter((t) => plantaDeTurno(t.id) === planta);

  const guardarParams = () => grabar('params', estado.params);
  const guardarPedidos = () => grabar('pedidos', estado.pedidos);

  /* Los parámetros que el usuario declaró como suyos. Mientras no guarde
     ninguno, "volver a los míos" devuelve los de fábrica. */
  const misDefecto = () => leer('defecto', null);
  const fijarDefecto = () => grabar('defecto', JSON.parse(JSON.stringify(estado.params)));
  const borrarDefecto = () => { try { localStorage.removeItem(K + 'defecto'); return true; } catch (_) { return false; } };
  const hayDefecto = () => !!misDefecto();
  const guardarProm = () => grabar('prom', estado.prom);

  /** Un día sin nada capturado no merece guardarse: ensucia el historial. */
  function vacio(r) {
    if (!r || r.cerrado) return false;
    const algo = (o) => Object.values(o || {}).some((v) => v != null && v !== '');
    const turnos = Object.values(r.turnos || {}).some((t) => Object.values(t || {}).some((v) => Number(v) > 0));
    return !algo(r.invPM) && !algo(r.stockAyer) && !algo(r.prodAyer) && !algo(r.crudo)
      && !algo(r.prodImport) && !algo(r.turnoImport) && !turnos && !(r.nota || '').trim();
  }
  const guardarDias = () => {
    Object.keys(estado.dias).forEach((f) => { if (vacio(estado.dias[f])) delete estado.dias[f]; });
    return grabar('dias', estado.dias);
  };

  // ---------- utilidades de fecha ----------
  const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const desdeISO = (iso) => {
    const [a, m, d] = String(iso).split('-').map(Number);
    return new Date(a, m - 1, d);
  };
  const aISO = (f) =>
    `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  const sumarDias = (iso, n) => {
    const f = desdeISO(iso); f.setDate(f.getDate() + n); return aISO(f);
  };
  /* Lunes = 0, para indexar DIAS sin sorpresas de zona horaria. */
  const indiceDia = (iso) => (desdeISO(iso).getDay() + 6) % 7;
  const nombreDia = (iso) => DIAS[indiceDia(iso)];
  const fechaCorta = (iso) => {
    const f = desdeISO(iso);
    return `${DIAS[indiceDia(iso)].slice(0, 3)} ${f.getDate()}/${f.getMonth() + 1}`;
  };

  // ---------- registro del día ----------
  /*  invPM     = conteo de cierre de ESE día (el de la foto)
      stockAyer = conteo de cierre del día anterior; vacío = se toma solo
      prodAyer  = quintales producidos el día anterior; vacío = sale del historial
      turnos    = los quintales decididos para ESE día
      crudo     = la hoja de inventario tal como se leyó, por clave impresa   */
  function registroVacio(fecha) {
    const invPM = {}, stockAyer = {}, prodAyer = {}, turnos = {};
    claves().forEach((c) => { invPM[c] = null; stockAyer[c] = null; prodAyer[c] = null; turnos[c] = {}; });
    return { fecha, invPM, stockAyer, prodAyer, turnos, crudo: {}, nota: '', cerrado: false, guardadoEn: null };
  }

  /** Trae registros de versiones anteriores al esquema de hoy. */
  function migrar(r) {
    if (!r || r.migrado) return r;
    if (!r.invPM) r.invPM = r.real || {};
    if (!r.stockAyer) r.stockAyer = r.inv || {};
    if (!r.prodAyer) r.prodAyer = r.prodHoy || {};
    if (!r.crudo) r.crudo = {};
    ['inv', 'prodHoy', 'real'].forEach((k) => { delete r[k]; });
    /* S13 pasó a S11 en todos los mapas del registro. */
    ['invPM', 'stockAyer', 'prodAyer', 'turnos', 'calc'].forEach((k) => {
      const o = r[k];
      if (o && o.S13 !== undefined && o.S11 === undefined) { o.S11 = o.S13; delete o.S13; }
    });
    r.migrado = true;
    return r;
  }

  function registro(fecha) {
    if (!estado.dias[fecha]) estado.dias[fecha] = registroVacio(fecha);
    const r = migrar(estado.dias[fecha]);
    // completa claves nuevas sin tocar lo ya capturado
    claves().forEach((c) => {
      if (!(c in r.invPM)) r.invPM[c] = null;
      if (!(c in r.stockAyer)) r.stockAyer[c] = null;
      if (!(c in r.prodAyer)) r.prodAyer[c] = null;
      if (!r.turnos[c]) r.turnos[c] = {};
    });
    return r;
  }

  /** El día anterior con datos: ayer si lo hay, si no el más reciente antes de la fecha. */
  function diaPrevio(fecha, campo) {
    const tiene = (r) => {
      if (!r) return false;
      if (campo === 'prod') {
        return Object.values(r.turnos || {}).some((t) => Object.values(t || {}).some((v) => Number(v) > 0))
          || Object.values(r.prodImport || {}).some((v) => Number(v) > 0);
      }
      return Object.values(r.invPM || {}).some((v) => v != null && v !== '');
    };
    const ayer = sumarDias(fecha, -1);
    if (tiene(estado.dias[ayer] && migrar(estado.dias[ayer]))) return ayer;
    const antes = Object.keys(estado.dias).filter((f) => f < fecha).sort().reverse();
    for (const f of antes) if (tiene(migrar(estado.dias[f]))) return f;
    return null;
  }

  /**
   * Quintales producidos por clave en una fecha. Sale de lo repartido por turno;
   * si ese día vino de un historial importado, de lo que traía el archivo.
   */
  function produccionDe(fecha) {
    const r = estado.dias[fecha];
    if (!r) return {};
    migrar(r);
    const out = {};
    Object.keys(r.turnos || {}).forEach((c) => {
      const v = Object.values(r.turnos[c] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      if (v) out[c] = Math.round(v * 100) / 100;
    });
    Object.entries(r.prodImport || {}).forEach(([c, v]) => {
      const n = Number(v) || 0;
      if (n && !out[c]) out[c] = Math.round(n * 100) / 100;
    });
    return out;
  }

  /** Quintales por turno de una fecha, incluyendo lo que vino importado. */
  function porTurnoDe(fecha) {
    const r = estado.dias[fecha];
    if (!r) return {};
    migrar(r);
    const out = {};
    TURNOS.forEach((t) => {
      const v = Object.keys(r.turnos || {}).reduce((a, c) => a + (Number((r.turnos[c] || {})[t.id]) || 0), 0);
      const imp = Number((r.turnoImport || {})[t.id]) || 0;
      const n = v || imp;
      if (n) out[t.id] = Math.round(n * 100) / 100;
    });
    return out;
  }

  /** Quintales por planta de una fecha. Lo importado sin turno queda aparte. */
  function porPlantaDe(fecha) {
    const porT = porTurnoDe(fecha);
    const out = Object.fromEntries(PLANTAS.map((p) => [p.id, 0]));
    Object.entries(porT).forEach(([t, v]) => {
      const pl = plantaDeTurno(t);
      if (out[pl] != null) out[pl] = Math.round((out[pl] + v) * 100) / 100;
    });
    return out;
  }

  /** Quintales por clave y turno de una fecha. */
  const turnosDe = (fecha) => {
    const r = estado.dias[fecha];
    return r ? (migrar(r).turnos || {}) : {};
  };

  // ---------- pedidos especiales ----------
  /* Un pedido es producto comprometido fuera del promedio de venta: una fecha
     de entrega, un cliente, una clave y las bolsas. */
  const nuevoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function nuevoPedido({ fecha, cliente, clave, bolsas, nota }) {
    const id = nuevoId();
    estado.pedidos[id] = {
      id, fecha, cliente: String(cliente || '').trim(), clave,
      bolsas: Math.max(0, Math.round(Number(bolsas) || 0)),
      estado: 'pendiente', nota: String(nota || '').trim(),
      creado: new Date().toISOString(),
    };
    return estado.pedidos[id];
  }

  const pedidosLista = () => Object.values(estado.pedidos || {})
    .filter((p) => p && p.fecha && p.clave)
    .sort((a, b) => (a.fecha === b.fecha
      ? String(a.cliente).localeCompare(String(b.cliente))
      : a.fecha.localeCompare(b.fecha)));

  /**
   * En qué anda cada pedido:
   *   entregado / cancelado — ya no cuentan
   *   vencido  — se pasó la fecha y nadie lo cerró: avisa pero deja de contar
   *   pendiente — todavía cuenta para el cálculo
   */
  function estadoPedido(p, hoy) {
    const h = hoy || hoyISO();
    if (p.estado === 'entregado') return 'entregado';
    if (p.estado === 'cancelado') return 'cancelado';
    return p.fecha < h ? 'vencido' : 'pendiente';
  }

  /** Los que mueven el cálculo: pendientes y con fecha de hoy en adelante. */
  const pedidosVivos = (hoy) => pedidosLista().filter((p) => estadoPedido(p, hoy) === 'pendiente');

  /** Clientes ya usados, para no escribir el mismo nombre de tres maneras. */
  const clientes = () => [...new Set(pedidosLista().map((p) => p.cliente).filter(Boolean))].sort();

  // ---------- productos diferenciados ----------
  const piso = (n) => (n == null || !isFinite(n) ? null : Math.floor(n + 1e-9));

  /**
   * Convierte la hoja de inventario (claves tal como vienen impresas) al
   * inventario por clave del tablero, aplicando los productos diferenciados.
   * Devuelve también el desglose para mostrarlo en pantalla.
   */
  function aplicarDiferenciados(params, crudo) {
    const src = {};
    Object.entries(crudo || {}).forEach(([k, v]) => {
      const n = num(v);
      if (n != null && !Number.isNaN(n)) src[String(k).trim().toUpperCase()] = n;
    });
    const dif = (params.diferenciados || []).filter((d) => d.activo !== false);
    const porDestino = Object.fromEntries(dif.map((d) => [d.destino.toUpperCase(), d]));

    const inv = {}, detalle = [];
    params.catalogo.forEach((clave) => {
      const d = porDestino[clave.toUpperCase()];
      if (d) {
        const partes = d.partes.map((p) => {
          const crudoV = src[p.clave.toUpperCase()];
          const div = Number(p.div) || 1;
          const aporte = crudoV == null ? null : (crudoV * (Number(p.mult) || 0)) / div;
          return { ...p, crudo: crudoV ?? null, aporte };
        });
        const hay = partes.some((p) => p.aporte != null);
        const total = hay ? piso(partes.reduce((a, p) => a + (p.aporte || 0), 0)) : null;
        if (total != null) inv[clave] = total;
        detalle.push({ destino: clave, partes, total });
      } else {
        const ficha = params.prod[clave] || {};
        const v = src[clave.toUpperCase()] ?? (ficha.alias ? src[ficha.alias.toUpperCase()] : undefined);
        if (v != null) inv[clave] = piso(v);
      }
    });
    return { inv, detalle };
  }

  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const prodPorClave = Object.fromEntries(PRODUCTOS.map((p) => [p.clave, p]));
  const turnoPorId = Object.fromEntries(TURNOS.map((t) => [t.id, t]));

  const api = {
    DIAS, TURNOS, FAMILIAS, PRODUCTOS, PLANTAS, PROM_INICIAL, DIFERENCIADOS,
    prodPorClave, turnoPorId, fichaDe,
    productos, activos, claves, fichaPorClave, plantaDeTurno, turnosDePlanta,
    paramsPorDefecto, fusionarParams,
    estado, guardarParams, guardarProm, guardarDias, guardarPedidos, leer, grabar,
    nuevoPedido, pedidosLista, pedidosVivos, estadoPedido, clientes, ANTICIPACION,
    misDefecto, fijarDefecto, borrarDefecto, hayDefecto, ESQUEMA,
    hoyISO, desdeISO, aISO, sumarDias, indiceDia, nombreDia, fechaCorta,
    registro, registroVacio, migrar, diaPrevio, produccionDe, turnosDe, porTurnoDe, porPlantaDe,
    aplicarDiferenciados, piso,
    num, vacio, matrizValida, matrizVacia,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Datos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
