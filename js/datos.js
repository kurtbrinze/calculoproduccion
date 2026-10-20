/* Datos maestros, parámetros y guardado.
   Todo vive en el dispositivo (localStorage). El historial se exporta para respaldo.

   El catálogo de productos es editable: `params.catalogo` manda el orden y
   `params.prod[clave]` guarda la ficha. PRODUCTOS es sólo la semilla de fábrica. */
(function (raiz) {
  'use strict';

  const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

  /* Las tres plantas. Cada turno pertenece a una.
     Zona 2 CZ es la de dulces —Byron y Julio—; Zona 2 es la de los seis turnos
     que mandan la hoja a mano todos los días. Son plantas distintas con su
     propio calendario, igual que aparecen separadas en la tabla de feriados. */
  const PLANTAS = [
    { id: 'Z18',  nombre: 'Zona 18' },
    { id: 'Z2CZ', nombre: 'Zona 2 CZ' },
    { id: 'Z2',   nombre: 'Zona 2' },
  ];

  /* Turnos. El tope es el máximo de quintales que ese turno alcanza a hacer. */
  const TURNOS = [
    { id: 'MGD',     nombre: 'Magdalenas',   papel: 'Pequeño AM', tope: 2,  minimo: 0,  momento: 'AM', planta: 'Z18' },
    { id: 'RED_AM',  nombre: 'Redondo AM',   papel: 'Máquina AM', tope: 40, minimo: 0,  momento: 'AM', planta: 'Z18' },
    { id: 'SAND_AM', nombre: 'Sándwich AM',  papel: 'Grande AM',  tope: 64, minimo: 0,  momento: 'AM', planta: 'Z18' },
    /* Panaderos PM corre lleno con 10HD7 todos los días, por eso trae mínimo. */
    { id: 'PAN_PM',  nombre: 'Panaderos PM', papel: 'Grande PM',  tope: 12, minimo: 12, momento: 'PM', planta: 'Z18' },
    { id: 'RED_PM',  nombre: 'Redondo PM',   papel: 'Máquina PM', tope: 34, minimo: 0,  momento: 'PM', planta: 'Z18' },
    /* Byron y Julio se turnan la mañana y la tarde una semana cada uno; el
       `momento` de fábrica es sólo el punto de partida, lo que manda es
       `momentoDeTurno`. */
    { id: 'BYRON',   nombre: 'Byron',        papel: 'B',          tope: 12, minimo: 0,  momento: 'AM', planta: 'Z2CZ', rota: true },
    { id: 'JULIO',   nombre: 'Julio',        papel: 'J',          tope: 12, minimo: 0,  momento: 'PM', planta: 'Z2CZ', rota: true },
    /* Planta Zona 2. Los topes son un punto de partida: la hoja a mano trae
       entre 11 y 17 QQ por persona. Se ajustan en Parámetros. */
    { id: 'LUCAS',   nombre: 'Lucas',        papel: 'L',          tope: 20, minimo: 0,  momento: 'AM', planta: 'Z2' },
    { id: 'GILO',    nombre: 'Gilo',         papel: 'G',          tope: 20, minimo: 0,  momento: 'AM', planta: 'Z2' },
    { id: 'ARMANDO', nombre: 'Armando',      papel: 'A',          tope: 20, minimo: 0,  momento: 'AM', planta: 'Z2' },
    { id: 'RODRIGO', nombre: 'Rodrigo',      papel: 'R',          tope: 20, minimo: 0,  momento: 'AM', planta: 'Z2' },
    { id: 'VICTOR',  nombre: 'Victor',       papel: 'V',          tope: 20, minimo: 0,  momento: 'AM', planta: 'Z2' },
    { id: 'MAQ_Z2',  nombre: 'Máquina',      papel: 'Máquina',    tope: 40, minimo: 0,  momento: 'AM', planta: 'Z2' },
  ];

  /* Familias: agrupan vida útil y ordenan la pantalla. */
  const FAMILIAS = [
    { id: 'SANDWICH',  nombre: 'Sándwich',          vidaUtil: 21, minDespacho: 14, colchon: 2 },
    { id: 'REDONDO',   nombre: 'Redondo',           vidaUtil: 21, minDespacho: 14, colchon: 1 },
    { id: 'MAGDALENA', nombre: 'Magdalenas',        vidaUtil: 21, minDespacho: 14, colchon: 1 },
    { id: 'DULCE',     nombre: 'Dulces y especial', vidaUtil: 21, minDespacho: 14, colchon: 1 },
    { id: 'Z2',        nombre: 'Planta Zona 2',     vidaUtil: 21, minDespacho: 14, colchon: 1 },
  ];

  /* Áreas de producción: cada tarjeta de la pantalla de producción.
     Un área es un juego de turnos, no una familia, y por eso una clave que se
     hace en las dos plantas —10HR3, S32— sale en las dos tarjetas, cada una
     con lo que se decidió ahí. Antes se agrupaba por familia y eso no daba
     cabida a la misma clave en dos plantas. */
  const AREAS = [
    { id: 'Z18_SAND', nombre: 'Sándwich',             planta: 'Z18',  familia: 'SANDWICH',  turnos: ['SAND_AM'] },
    { id: 'Z18_RED',  nombre: 'Redondo',              planta: 'Z18',  familia: 'REDONDO',   turnos: ['RED_AM', 'PAN_PM', 'RED_PM'] },
    { id: 'Z18_MGD',  nombre: 'Magdalenas',           planta: 'Z18',  familia: 'MAGDALENA', turnos: ['MGD'] },
    { id: 'Z2CZ',     nombre: 'Dulce y Especiales',   planta: 'Z2CZ', familia: null,        turnos: ['BYRON', 'JULIO'] },
    { id: 'Z2',       nombre: 'Producción Planta Z2', planta: 'Z2',   familia: null,
      turnos: ['LUCAS', 'GILO', 'ARMANDO', 'RODRIGO', 'VICTOR', 'MAQ_Z2'] },
  ];
  /* Un pedido especial se produce con días de anticipación sobre la entrega.
     Vale para todas las familias salvo que alguna traiga el suyo. */
  const ANTICIPACION = 1;

  /* Un producto por fila. `turnos` va en orden de preferencia: el reparto
     automático llena el primero que tenga cupo antes de pasar al siguiente.
     `plantas` dice en qué plantas se puede producir.
     prodEnConteo marca el producto que se hace de mañana y que el conteo
     de cierre ya trae adentro, para no sumarlo dos veces. */
  const T_Z2 = ['LUCAS', 'GILO', 'ARMANDO', 'RODRIGO', 'VICTOR', 'MAQ_Z2'];
  const PRODUCTOS = [
    /* Las claves que se hacen en las dos plantas sólo llevan sus turnos de
       Zona 18 en la lista: lo de Zona 2 entra por la foto, no por el reparto
       automático, que si no se derramaría para allá al llenarse Sándwich. */
    { clave: 'S26',   codigo: 25,  familia: 'SANDWICH',  rend: 94,   mult: 2,    turnos: ['SAND_AM'], plantas: ['Z18', 'Z2'] },
    { clave: 'S19',   codigo: 26,  familia: 'SANDWICH',  rend: 120,  mult: 2,    turnos: ['SAND_AM'], plantas: ['Z18'] },
    { clave: 'S16',   codigo: 549, familia: 'SANDWICH',  rend: 150,  mult: 2,    turnos: ['SAND_AM'], plantas: ['Z18'] },
    { clave: 'S11',   codigo: 28,  familia: 'SANDWICH',  rend: 210,  mult: 2,    turnos: ['SAND_AM'], plantas: ['Z18'] },
    { clave: '10PM3', codigo: 32,  familia: 'REDONDO',   rend: 120,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], plantas: ['Z18'] },
    { clave: '10HD7', codigo: 5,   familia: 'REDONDO',   rend: 110,  mult: 1,    turnos: ['PAN_PM', 'MAQ_Z2', 'RED_AM', 'RED_PM'], plantas: ['Z18', 'Z2'] },
    /* El 10HR3 no se decide por cascada: lleva 40 % de mañana y 60 % de tarde,
       con un tope de 54 QQ al día. */
    { clave: '10HR3', codigo: 1,   familia: 'REDONDO',   rend: 150,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], plantas: ['Z18', 'Z2'], alias: 'HR3',
      maxDia: 54, reparto: 'porcentaje', pesos: { RED_AM: 40, RED_PM: 60 } },
    { clave: '12BLL', codigo: 436, familia: 'REDONDO',   rend: 200,  mult: 0.5,  turnos: ['RED_AM', 'RED_PM'], plantas: ['Z18'] },
    { clave: '15PL1', codigo: 34,  familia: 'REDONDO',   rend: 144,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], plantas: ['Z18'] },
    { clave: '5HM4',  codigo: 9,   familia: 'REDONDO',   rend: 220,  mult: 1,    turnos: T_Z2.slice(), plantas: ['Z2'], alias: 'HM4' },
    { clave: 'MG1',   codigo: 77,  familia: 'MAGDALENA', rend: 130,  mult: 0.1,  turnos: ['MGD'], plantas: ['Z18'] },
    { clave: 'MG4',   codigo: 79,  familia: 'MAGDALENA', rend: 64,   mult: 0.1,  turnos: ['MGD'], plantas: ['Z18'] },
    { clave: 'MGN',   codigo: 414, familia: 'MAGDALENA', rend: 108,  mult: 0.1,  turnos: ['MGD'], plantas: ['Z18'] },
    { clave: 'CZ3',   codigo: 134, familia: 'DULCE',     rend: 1550, mult: 0.5,  turnos: ['JULIO', 'BYRON'], plantas: ['Z2CZ'] },
    { clave: '10CZ4', codigo: 573, familia: 'DULCE',     rend: 226,  mult: 0.25, turnos: ['BYRON', 'JULIO'], plantas: ['Z2CZ'], prodEnConteo: true },
    { clave: '6CG2N', codigo: 391, familia: 'DULCE',     rend: 280,  mult: 0.25, turnos: ['BYRON'], plantas: ['Z2CZ'] },
    { clave: '6CG2V', codigo: 390, familia: 'DULCE',     rend: 280,  mult: 0.25, turnos: ['BYRON'], plantas: ['Z2CZ'] },
    { clave: '6CHO',  codigo: 355, familia: 'DULCE',     rend: 300,  mult: 0.25, turnos: ['BYRON'], plantas: ['Z2CZ'] },
    { clave: '6QU1',  codigo: 490, familia: 'DULCE',     rend: 378,  mult: 0.25, turnos: ['JULIO'], plantas: ['Z2CZ'] },
    { clave: 'IN16',  codigo: 473, familia: 'SANDWICH',  rend: 110,  mult: 2,    turnos: ['SAND_AM'], plantas: ['Z18'] },
    { clave: 'S32',   codigo: 31,  familia: 'SANDWICH',  rend: 84,   mult: 0.5,  turnos: ['SAND_AM'], plantas: ['Z18', 'Z2'] },

    /* Planta Zona 2. Los rendimientos salen de la columna RENDIM de Calc_Bolsa;
       el múltiplo de 0.25 es un punto de partida, igual que los topes. */
    { clave: '10FP8', codigo: null, familia: 'Z2', rend: 114,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '5HC1',  codigo: null, familia: 'Z2', rend: 316,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '10HD6', codigo: null, familia: 'Z2', rend: 120,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '5HD8',  codigo: null, familia: 'Z2', rend: 178,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '5HE8',  codigo: null, familia: 'Z2', rend: 200,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '5HG7',  codigo: null, familia: 'Z2', rend: 182,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '10HM5', codigo: null, familia: 'Z2', rend: 130,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: 'MA1',   codigo: null, familia: 'Z2', rend: 132,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: 'MA3',   codigo: null, familia: 'Z2', rend: 1290, mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '6PC4',  codigo: null, familia: 'Z2', rend: 210,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: 'S25',   codigo: null, familia: 'Z2', rend: 100,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '12WY1', codigo: null, familia: 'Z2', rend: 80,   mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '12WYK', codigo: null, familia: 'Z2', rend: 80,   mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: 'SE2',   codigo: null, familia: 'Z2', rend: 1230, mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    { clave: '6HD12', codigo: null, familia: 'Z2', rend: 264,  mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    /* El Excel la llama 12PB2; acá va como PB2, que es como viene en la hoja. */
    { clave: 'PB2',   codigo: null, familia: 'Z2', rend: 183.33, mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
    /* WYK+P no está en Calc_Bolsa: toma el rendimiento de 12WYK hasta que se
       confirme el suyo. */
    { clave: 'WYK+P', codigo: null, familia: 'Z2', rend: 80,   mult: 0.25, turnos: T_Z2.slice(), plantas: ['Z2'] },
  ];

  /* ---------- feriados ----------
     En panadería el feriado no es un día sin trabajo: se descansa el día
     ANTERIOR y se produce el día del feriado. Por eso un feriado no es una
     fecha suelta sino una ventana de días con lo que hace cada planta en cada
     momento, que es lo que se le pasa al equipo por WhatsApp.

     Las filas de empaque no entran al cálculo —la app planifica producción,
     no empaque— pero sí van en la tabla, porque son la mitad del mensaje. */
  const EMPAQUE = [
    { id: 'HM',   nombre: 'EMP HM',   planta: 'Z2' },
    { id: 'HR',   nombre: 'EMP HR',   planta: 'Z2' },
    { id: 'SAND', nombre: 'EMP SAND', planta: 'Z18' },
  ];
  /* SI y NO son los únicos que mueven el cálculo; los otros dos son recados
     para el equipo. */
  const ESTADOS = [
    { id: 'SI',     nombre: 'SI',       trabaja: true },
    { id: 'NO',     nombre: 'Descanso', trabaja: false },
    { id: 'NORMAL', nombre: 'Normal',   trabaja: true },
    { id: 'X',      nombre: 'X',        trabaja: false },
  ];
  const MOMENTOS = ['AM', 'PM'];
  const FERIADO_ANTES = 2, FERIADO_DESPUES = 1;

  const filaPlanta = (planta, momento) => `${planta}|${momento}`;
  const filaEmpaque = (empId, momento) => `EMP:${empId}|${momento}`;

  /* El orden de las claves dentro de la tarjeta de Planta Z2, tal como viene
     en la hoja que mandan a diario. Lo que no esté acá sale después. */
  const ORDEN_Z2 = [
    '10FP8', '5HC1', '10HD6', '5HD8', '5HE8', '5HG7', '5HM4', '10HM5', '10HR3',
    'MA1', 'MA3', '6PC4', 'S25', 'S26', 'S32', '12WY1', '12WYK', 'SE2',
    '6HD12', 'PB2', 'WYK+P',
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
     las dos de Zona 2 trabajan también el domingo. Todo se cambia en Parámetros. */
  const CALENDARIO_INICIAL = DIAS.map((d) => {
    const z18 = !['SABADO', 'DOMINGO'].includes(d);
    const z2 = d !== 'SABADO';
    const plantas = { Z18: z18, Z2CZ: z2, Z2: z2 };
    return { dia: d, produce: z18 || z2, factor: 1, plantas };
  });

  /* Sube cuando hay un cambio de fábrica que debe alcanzar a quien ya tenía
     parámetros guardados.
       2 = llegó el turno Máquina Z2.
       3 = el calendario de producción pasó a ser por planta.
       4 = el catálogo se ordenó como la hoja de papel.
       5 = se separó la planta Zona 2 de la de dulces (Zona 2 CZ).
       6 = tope de quintales por producto y reparto por porcentaje. */
  const ESQUEMA = 6;

  /**
   * Mapa de plantas de un producto. Acepta la forma nueva (`plantas` como
   * lista o como mapa) y la vieja de dos banderas, que es la que traen los
   * parámetros guardados antes de que existiera la tercera planta.
   */
  function mapaPlantas(p) {
    const out = {};
    PLANTAS.forEach((x) => { out[x.id] = false; });
    if (Array.isArray(p.plantas)) {
      p.plantas.forEach((id) => { if (id in out) out[id] = true; });
    } else if (p.plantas && typeof p.plantas === 'object') {
      PLANTAS.forEach((x) => { out[x.id] = !!p.plantas[x.id]; });
    } else {
      /* Forma vieja: z18 + z2. El z2 de antes era la planta de dulces. */
      out.Z18 = p.z18 !== false;
      out.Z2CZ = !!p.z2;
    }
    if (!Object.values(out).some(Boolean)) out.Z18 = true;
    return out;
  }

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
      plantas: mapaPlantas(p),
      /* Tope de quintales del producto en todo el día: sale de los moldes y
         las vueltas que se les alcanza a dar. null = sin tope propio. */
      maxDia: p.maxDia ?? null,
      /* Cómo se parte entre sus turnos:
           'cascada'    llena el primero de la lista y pasa al siguiente
           'porcentaje' reparte por el peso de cada turno */
      reparto: p.reparto === 'porcentaje' ? 'porcentaje' : 'cascada',
      pesos: { ...(p.pesos || {}) },
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
      /* Byron y Julio cambian de mañana a tarde todos los domingos. Basta
         con una semana de referencia y quién estuvo en la mañana: de ahí sale
         cualquier otra semana, para atrás y para adelante. */
      rotacion: { desde: '2026-10-18', amPrimero: 'BYRON' },
      /* [{ fecha, nombre, dias: { 'AAAA-MM-DD': { 'Z18|AM': 'SI', ... } } }] */
      feriados: [],
      empaque: EMPAQUE.map((e) => ({ ...e })),
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
      const g = guardadoProd[c] || {};
      out.prod[c] = { ...b, ...g, clave: c };
      if (!Array.isArray(out.prod[c].turnos)) out.prod[c].turnos = b.turnos.slice();
      /* Las banderas de planta: lo guardado manda si ya viene en la forma
         nueva; si trae las dos viejas, `mapaPlantas` las traduce —el z2 de
         antes era la planta de dulces, que ahora se llama Z2 CZ. */
      out.prod[c].plantas = mapaPlantas(g.plantas !== undefined ? g : (('z18' in g || 'z2' in g) ? g : b));
      delete out.prod[c].z18; delete out.prod[c].z2;
      const md = out.prod[c].maxDia;
      out.prod[c].maxDia = md === '' || md == null || !(Number(md) > 0) ? null : Number(md);
      out.prod[c].reparto = out.prod[c].reparto === 'porcentaje' ? 'porcentaje' : 'cascada';
      out.prod[c].pesos = { ...(out.prod[c].pesos || {}) };
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
    /* Calendario por planta. Lo que había de una sola planta pasa a Zona 18;
       el calendario viejo de «Z2» era el de dulces y se lo queda Zona 2 CZ,
       y la planta Zona 2 nueva arranca con ese mismo calendario. */
    const viejoEsquema = Number(guardado.esquema) || 0;
    out.calendario = out.calendario.map((c, i) => {
      const dia = DIAS[i];
      const pl = (c && c.plantas) || {};
      const bool = (v, alt) => (typeof v === 'boolean' ? v : alt);
      const z18 = bool(pl.Z18, !!(c && c.produce));
      const cz = bool(pl.Z2CZ, bool(pl.Z2, dia === 'DOMINGO' ? true : !!(c && c.produce)));
      /* Antes del esquema 5 no existía Z2 aparte: hereda el de dulces. */
      const z2 = viejoEsquema >= 5 ? bool(pl.Z2, cz) : cz;
      return {
        dia, factor: Number(c && c.factor) || 1,
        plantas: { Z18: z18, Z2CZ: cz, Z2: z2 },
        produce: z18 || cz || z2,
      };
    });
    /* Los feriados eran una lista de fechas sueltas que apagaban el día
       entero, que es justo al revés de como trabaja la panadería. Las que
       haya guardadas se convierten en feriados de verdad al abrir. */
    const rot = guardado.rotacion || {};
    out.rotacion = {
      desde: /^\d{4}-\d{2}-\d{2}$/.test(rot.desde || '') ? rot.desde : base.rotacion.desde,
      amPrimero: rot.amPrimero === 'JULIO' ? 'JULIO' : base.rotacion.amPrimero,
    };
    out.feriados = (Array.isArray(guardado.feriados) ? guardado.feriados : [])
      .map((f) => (typeof f === 'string'
        ? { fecha: f, nombre: 'Feriado', antes: FERIADO_ANTES, despues: FERIADO_DESPUES, dias: null }
        : f))
      .filter((f) => f && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha))
      .map((f) => ({
        fecha: f.fecha,
        nombre: String(f.nombre || 'Feriado'),
        antes: Number(f.antes) >= 0 ? Number(f.antes) : FERIADO_ANTES,
        despues: Number(f.despues) >= 0 ? Number(f.despues) : FERIADO_DESPUES,
        dias: f.dias && typeof f.dias === 'object' ? f.dias : null,
      }));
    out.empaque = (Array.isArray(guardado.empaque) && guardado.empaque.length
      ? guardado.empaque : EMPAQUE)
      .filter((e) => e && e.id)
      .map((e) => ({ id: String(e.id), nombre: String(e.nombre || e.id), planta: e.planta || 'Z18' }));

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
    if (viejoEsquema < 2) {
      if (out.prod['5HM4']) {
        out.prod['5HM4'].turnos = ['MAQ_Z2'];
        out.prod['5HM4'].plantas = mapaPlantas({ plantas: ['Z2'] });
      }
      if (out.prod['10HD7']) {
        const t = out.prod['10HD7'].turnos || [];
        if (!t.includes('MAQ_Z2')) out.prod['10HD7'].turnos = ['PAN_PM', 'MAQ_Z2', ...t.filter((x) => x !== 'PAN_PM')];
        out.prod['10HD7'].plantas.Z2 = true;
      }
    }

    /* La planta de dulces se separa de la planta Zona 2.
       Lo guardado decía «Z2» para Byron y Julio: eso ahora es Z2 CZ. La
       Máquina se queda en la Zona 2 nueva, junto a los cinco panaderos. */
    if (viejoEsquema < 5) {
      ['BYRON', 'JULIO'].forEach((id) => { if (out.turnos[id]) out.turnos[id].planta = 'Z2CZ'; });
      if (out.turnos.MAQ_Z2) out.turnos.MAQ_Z2.planta = 'Z2';
      /* Un producto que se hacía en Byron o Julio es de dulces; el que se
         hacía en la Máquina pasa a la planta nueva. */
      cat.forEach((c) => {
        const f = out.prod[c];
        if (!f) return;
        const t = f.turnos || [];
        if (t.some((x) => x === 'BYRON' || x === 'JULIO')) { f.plantas.Z2CZ = true; f.plantas.Z2 = false; }
        if (t.includes('MAQ_Z2')) f.plantas.Z2 = true;
      });
      /* Las claves y los turnos nuevos de la planta Zona 2 ya entraron con los
         valores de fábrica unas líneas más arriba, junto con todo lo que el
         catálogo guardado no traía. */
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
    /* Lo de impresión de bolsa vive aparte de los días a propósito: es una
       hoja de trabajo local de la computadora donde se imprime, y no se
       sincroniza con la tablet. Guardarla fuera del día es lo que la deja
       fuera del envío, sin tener que acordarse de filtrarla. */
    bolsa: leer('bolsa', {}),    // { 'AAAA-MM-DD': { qqAmZ2, oh, manual, hd7z2, mu1 } }
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

  // ---------- rotación de turnos ----------
  /** El domingo que abre la semana de esa fecha. */
  function domingoDe(iso) {
    const d = desdeISO(iso);
    return sumarDias(iso, -d.getDay());   // 0 = domingo
  }

  /**
   * En qué momento trabaja un turno esa fecha. Byron y Julio se cambian la
   * mañana por la tarde cada domingo; los demás turnos no se mueven.
   *
   * Sirve para tres cosas: verlo escrito al lado del nombre, que un feriado
   * que apaga sólo la mañana apague al que de verdad esté en la mañana, y
   * saber de cuál de los dos sacar la producción de la tarde.
   */
  function momentoDeTurno(id, iso) {
    const t = TURNOS.find((x) => x.id === id) || {};
    const base = (estado.params.turnos[id] || {}).momento || t.momento || 'AM';
    if (!t.rota || !iso) return base;
    const r = estado.params.rotacion || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.desde || '')) return base;
    const d0 = desdeISO(domingoDe(r.desde)), d1 = desdeISO(domingoDe(iso));
    const semanas = Math.round((d1 - d0) / (7 * 86400000));
    /* Semana par: el de referencia en la mañana. Impar: al revés.
       El resto con signo evita que una fecha anterior salga al revés. */
    const par = ((semanas % 2) + 2) % 2 === 0;
    const amEs = r.amPrimero || 'BYRON';
    const rotan = TURNOS.filter((x) => x.rota).map((x) => x.id);
    const otro = rotan.find((x) => x !== amEs) || amEs;
    const enAM = par ? amEs : otro;
    return id === enAM ? 'AM' : 'PM';
  }

  /** Los turnos que rotan, con el momento que les toca esa fecha. */
  const rotacionDe = (iso) => TURNOS.filter((t) => t.rota)
    .map((t) => ({ id: t.id, nombre: t.nombre, momento: momentoDeTurno(t.id, iso) }));

  /** El turno que rota y está en ese momento esa fecha. */
  const turnoRotandoEn = (momento, iso) =>
    (rotacionDe(iso).find((t) => t.momento === momento) || {}).id || null;

  // ---------- feriados ----------
  /** Los días que entran en la tabla de un feriado, en orden. */
  function diasFeriado(f) {
    const out = [];
    const a = Number(f.antes) >= 0 ? Number(f.antes) : FERIADO_ANTES;
    const d = Number(f.despues) >= 0 ? Number(f.despues) : FERIADO_DESPUES;
    for (let i = -a; i <= d; i++) out.push(sumarDias(f.fecha, i));
    return out;
  }

  /** Lo que hace normalmente una planta ese día, según el calendario semanal. */
  function normalDe(planta, iso) {
    const c = estado.params.calendario[indiceDia(iso)];
    if (!c) return false;
    const pl = c.plantas || {};
    return typeof pl[planta] === 'boolean' ? pl[planta] : !!c.produce;
  }

  /**
   * Un feriado recién puesto ya trae lo que casi siempre pasa: el día anterior
   * se descansa y el día del feriado se produce. Los demás días quedan como el
   * calendario de siempre. Todo se puede cambiar celda por celda.
   */
  function feriadoNuevo(fecha, nombre) {
    const f = { fecha, nombre: nombre || 'Feriado', antes: FERIADO_ANTES, despues: FERIADO_DESPUES, dias: {} };
    const ayer = sumarDias(fecha, -1);
    diasFeriado(f).forEach((iso) => {
      const celdas = {};
      PLANTAS.forEach((p) => {
        MOMENTOS.forEach((mo) => {
          const v = iso === fecha ? 'SI' : (iso === ayer ? 'NO' : (normalDe(p.id, iso) ? 'SI' : 'NO'));
          celdas[filaPlanta(p.id, mo)] = v;
        });
      });
      (estado.params.empaque || EMPAQUE).forEach((e) => {
        MOMENTOS.forEach((mo) => {
          /* El empaque del feriado descansa, porque lo que se produce ese día
             se empaca al siguiente. Es lo que se ve en la hoja. */
          celdas[filaEmpaque(e.id, mo)] = iso === fecha ? 'NO' : (normalDe(e.planta, iso) ? 'SI' : 'NO');
        });
      });
      f.dias[iso] = celdas;
    });
    return f;
  }

  /** El feriado que cubre esa fecha, si hay alguno. */
  function feriadoDe(iso) {
    return (estado.params.feriados || []).find((f) => f && f.dias && f.dias[iso]) || null;
  }

  /**
   * Si una planta trabaja esa fecha en ese momento, con el feriado mandando
   * por encima del calendario semanal. Sin momento, basta con que trabaje en
   * alguno de los dos.
   */
  function plantaTrabaja(params, planta, iso, momento) {
    const f = (params.feriados || []).find((x) => x && x.dias && x.dias[iso]);
    const trabaja = (id) => {
      const e = ESTADOS.find((x) => x.id === id);
      return e ? e.trabaja : null;
    };
    if (f) {
      const celdas = f.dias[iso] || {};
      const mos = momento ? [momento] : MOMENTOS;
      const vals = mos.map((mo) => trabaja(celdas[filaPlanta(planta, mo)])).filter((v) => v !== null);
      if (vals.length) return vals.some(Boolean);
    }
    const c = params.calendario[indiceDia(iso)];
    if (!c) return false;
    const pl = c.plantas || {};
    const base = typeof pl[planta] === 'boolean' ? pl[planta] : !!c.produce;
    if (!base || !momento) return base;
    /* Sin feriado el calendario no distingue mañana de tarde: trabaja si hay
       algún turno de ese momento en la planta. */
    return turnosDePlanta(planta).some((t) => t.momento === momento
      && (estado.params.turnos[t.id] || {}).activo !== false);
  }

  // ---------- áreas de producción ----------
  /** Si esa clave se produce en esa planta. */
  const enPlanta = (clave, planta) => {
    const f = estado.params.prod[clave];
    return !!(f && f.plantas && f.plantas[planta]);
  };

  /**
   * Las claves de un área, en el orden que le toca: la planta Zona 2 sigue el
   * orden de la hoja que mandan a diario; las demás, el del catálogo.
   */
  function clavesDeArea(areaId) {
    const a = AREAS.find((x) => x.id === areaId);
    if (!a) return [];
    const dentro = activos().filter((p) =>
      enPlanta(p.clave, a.planta) && (!a.familia || p.familia === a.familia));
    if (a.id !== 'Z2') return dentro.map((p) => p.clave);
    const pos = (c) => { const i = ORDEN_Z2.indexOf(c); return i < 0 ? ORDEN_Z2.length : i; };
    return dentro.map((p) => p.clave).sort((x, y) => pos(x) - pos(y));
  }

  /**
   * Los turnos que se muestran como columnas en un área: los que el área
   * declara, más los de esa planta que ninguna área nombra —un turno nuevo
   * tiene que salir en algún lado, no desaparecer.
   */
  function turnosDeArea(areaId) {
    const a = AREAS.find((x) => x.id === areaId);
    if (!a) return [];
    const nombrados = new Set(AREAS.flatMap((x) => x.turnos || []));
    const dePlanta = AREAS.filter((x) => x.planta === a.planta);
    const esPrimera = dePlanta[0] && dePlanta[0].id === a.id;
    return turnosDePlanta(a.planta).filter((t) => {
      if ((estado.params.turnos[t.id] || {}).activo === false) return false;
      if ((a.turnos || []).includes(t.id)) return true;
      return esPrimera && !nombrados.has(t.id);
    });
  }

  /**
   * Si esa clave se puede anotar en ese turno. La lista `turnos` de la ficha
   * es el orden que sigue el reparto automático; para escribir a mano —o para
   * que entre lo que viene de la foto— basta con que la clave se produzca en
   * la planta de ese turno. Así 10HR3 se anota en Zona 2 sin que el reparto
   * automático se le vaya para allá.
   */
  const puedeEnTurno = (clave, turnoId) => {
    if ((estado.params.turnos[turnoId] || {}).activo === false) return false;
    return enPlanta(clave, plantaDeTurno(turnoId));
  };

  /** Las áreas que hoy tienen algo que mostrar. */
  const areasUsadas = () => AREAS.filter((a) => clavesDeArea(a.id).length);

  const guardarParams = () => grabar('params', estado.params);
  const guardarPedidos = () => grabar('pedidos', estado.pedidos);

  /* Los parámetros que el usuario declaró como suyos. Mientras no guarde
     ninguno, "volver a los míos" devuelve los de fábrica. */
  const misDefecto = () => leer('defecto', null);
  const fijarDefecto = () => grabar('defecto', JSON.parse(JSON.stringify(estado.params)));
  const borrarDefecto = () => { try { localStorage.removeItem(K + 'defecto'); return true; } catch (_) { return false; } };
  const hayDefecto = () => !!misDefecto();
  const guardarProm = () => grabar('prom', estado.prom);
  const guardarBolsa = () => grabar('bolsa', estado.bolsa);

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

  /* Los feriados que venían de la versión vieja —una fecha suelta— se arman
     ahora, cuando ya existen el calendario y las plantas para consultarlos. */
  estado.params.feriados.forEach((f, i) => {
    if (!f.dias) estado.params.feriados[i] = feriadoNuevo(f.fecha, f.nombre);
  });

  const api = {
    DIAS, TURNOS, FAMILIAS, PRODUCTOS, PLANTAS, AREAS, ORDEN_Z2, PROM_INICIAL, DIFERENCIADOS,
    prodPorClave, turnoPorId, fichaDe, mapaPlantas,
    productos, activos, claves, fichaPorClave, plantaDeTurno, turnosDePlanta,
    clavesDeArea, turnosDeArea, areasUsadas, enPlanta, puedeEnTurno,
    EMPAQUE, ESTADOS, MOMENTOS, filaPlanta, filaEmpaque,
    momentoDeTurno, rotacionDe, turnoRotandoEn, domingoDe,
    diasFeriado, feriadoNuevo, feriadoDe, plantaTrabaja, normalDe,
    paramsPorDefecto, fusionarParams,
    estado, guardarParams, guardarProm, guardarDias, guardarPedidos, guardarBolsa, leer, grabar,
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
