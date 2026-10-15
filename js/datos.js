/* Datos maestros, parámetros y guardado.
   Todo vive en el dispositivo (localStorage). El historial se exporta para respaldo. */
(function (raiz) {
  'use strict';

  const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

  /* Turnos de planta 18. El tope es el máximo de quintales que ese turno alcanza a hacer. */
  const TURNOS = [
    { id: 'MGD',     nombre: 'Magdalenas',   papel: 'Pequeño AM', tope: 2,  minimo: 0,  momento: 'AM' },
    { id: 'RED_AM',  nombre: 'Redondo AM',   papel: 'Máquina AM', tope: 40, minimo: 0,  momento: 'AM' },
    { id: 'SAND_AM', nombre: 'Sándwich AM',  papel: 'Grande AM',  tope: 64, minimo: 0,  momento: 'AM' },
    /* Panaderos PM corre lleno con 10HD7 todos los días, por eso trae mínimo. */
    { id: 'PAN_PM',  nombre: 'Panaderos PM', papel: 'Grande PM',  tope: 12, minimo: 12, momento: 'PM' },
    { id: 'RED_PM',  nombre: 'Redondo PM',   papel: 'Máquina PM', tope: 34, minimo: 0,  momento: 'PM' },
    { id: 'BYRON',   nombre: 'Byron',        papel: 'B',          tope: 12, minimo: 0,  momento: 'PM' },
    { id: 'JULIO',   nombre: 'Julio',        papel: 'J',          tope: 12, minimo: 0,  momento: 'PM' },
  ];

  /* Familias: agrupan vida útil y ordenan la pantalla. */
  const FAMILIAS = [
    { id: 'SANDWICH',  nombre: 'Sándwich',          vidaUtil: 21, minDespacho: 14, colchon: 2 },
    { id: 'REDONDO',   nombre: 'Redondo',           vidaUtil: 21, minDespacho: 14, colchon: 1 },
    { id: 'MAGDALENA', nombre: 'Magdalenas',        vidaUtil: 21, minDespacho: 14, colchon: 1 },
    { id: 'DULCE',     nombre: 'Dulces y especial', vidaUtil: 21, minDespacho: 14, colchon: 1 },
  ];

  /* Un producto por fila. `turnos` va en orden de preferencia: el reparto
     automático llena el primero que tenga cupo antes de pasar al siguiente. */
  const PRODUCTOS = [
    { clave: 'S26',   codigo: 25,  familia: 'SANDWICH',  rend: 94,   mult: 2,    turnos: ['SAND_AM'] },
    { clave: 'S19',   codigo: 26,  familia: 'SANDWICH',  rend: 120,  mult: 2,    turnos: ['SAND_AM'] },
    { clave: 'S16',   codigo: 549, familia: 'SANDWICH',  rend: 150,  mult: 2,    turnos: ['SAND_AM'] },
    { clave: 'S13',   codigo: 28,  familia: 'SANDWICH',  rend: 210,  mult: 2,    turnos: ['SAND_AM'] },
    { clave: 'IN16',  codigo: 473, familia: 'SANDWICH',  rend: 110,  mult: 2,    turnos: ['SAND_AM'] },
    { clave: 'S32',   codigo: 31,  familia: 'SANDWICH',  rend: 84,   mult: 0.5,  turnos: ['SAND_AM'] },
    { clave: '10PM3', codigo: 32,  familia: 'REDONDO',   rend: 120,  mult: 1,    turnos: ['RED_AM', 'RED_PM'] },
    { clave: '10HD7', codigo: 5,   familia: 'REDONDO',   rend: 110,  mult: 1,    turnos: ['PAN_PM', 'RED_AM', 'RED_PM'] },
    { clave: '10HR3', codigo: 1,   familia: 'REDONDO',   rend: 150,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], alias: 'HR3' },
    { clave: '12BLL', codigo: 436, familia: 'REDONDO',   rend: 200,  mult: 0.5,  turnos: ['RED_AM', 'RED_PM'] },
    { clave: '15PL1', codigo: 34,  familia: 'REDONDO',   rend: 144,  mult: 1,    turnos: ['RED_AM', 'RED_PM'] },
    { clave: '5HM4',  codigo: 9,   familia: 'REDONDO',   rend: 220,  mult: 1,    turnos: ['RED_AM', 'RED_PM'], alias: 'HM4' },
    { clave: 'MG1',   codigo: 77,  familia: 'MAGDALENA', rend: 130,  mult: 0.1,  turnos: ['MGD'] },
    { clave: 'MG4',   codigo: 79,  familia: 'MAGDALENA', rend: 64,   mult: 0.1,  turnos: ['MGD'] },
    { clave: 'MGN',   codigo: 414, familia: 'MAGDALENA', rend: 108,  mult: 0.1,  turnos: ['MGD'] },
    { clave: 'CZ3',   codigo: 134, familia: 'DULCE',     rend: 1550, mult: 0.5,  turnos: ['JULIO', 'BYRON'] },
    { clave: '10CZ4', codigo: 573, familia: 'DULCE',     rend: 226,  mult: 0.25, turnos: ['BYRON', 'JULIO'] },
    { clave: '6CG2N', codigo: 391, familia: 'DULCE',     rend: 280,  mult: 0.25, turnos: ['BYRON'] },
    { clave: '6CG2V', codigo: 390, familia: 'DULCE',     rend: 280,  mult: 0.25, turnos: ['BYRON'] },
    { clave: '6CHO',  codigo: 355, familia: 'DULCE',     rend: 300,  mult: 0.25, turnos: ['BYRON'] },
    { clave: '6QU1',  codigo: 490, familia: 'DULCE',     rend: 378,  mult: 0.25, turnos: ['JULIO'] },
  ];

  /* Promedios de venta en bolsas por día, tomados de PROM_VD. Son el punto de
     partida: se editan en la app y se pueden recargar desde el libro. */
  const PROM_INICIAL = {
    S26:   [586, 398, 653, 461, 450, 324, 0],
    S19:   [3294, 1755, 3455, 2350, 2087, 1142, 0],
    S16:   [596, 291, 536, 557, 406, 201, 0],
    S13:   [441, 154, 314, 192, 176, 156, 0],
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

  /* Calendario: qué días trabaja la planta. Sábado y domingo no se produce. */
  const CALENDARIO_INICIAL = DIAS.map((d) => ({ dia: d, produce: !['SABADO', 'DOMINGO'].includes(d), factor: 1 }));

  function paramsPorDefecto() {
    const prod = {};
    PRODUCTOS.forEach((p) => {
      prod[p.clave] = {
        rend: p.rend, mult: p.mult,
        turnos: p.turnos.slice(), familia: p.familia,
        // null = hereda de la familia
        vidaUtil: null, minDespacho: null, colchon: null,
        activo: true,
      };
    });
    const turnos = {};
    TURNOS.forEach((t) => { turnos[t.id] = { tope: t.tope, minimo: t.minimo || 0, activo: true }; });
    const familias = {};
    FAMILIAS.forEach((f) => { familias[f.id] = { vidaUtil: f.vidaUtil, minDespacho: f.minDespacho, colchon: f.colchon }; });
    return {
      factorTemporada: 1,
      horizonteModo: 'calendario',   // 'calendario' | 'fijo' | 'tabla'
      horizonteFijo: 3,
      cortePorProduccion: 2,         // cubrir hasta la 2ª corrida
      /* Modo 'tabla': para cada día de cálculo se marca qué días de venta entran.
         `general` aplica a todas las familias; `familias[X]` la pisa si no es null. */
      cobertura: { general: null, familias: {} },
      prod, turnos, familias,
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

  /* Mezcla superficial pero respetando sub-objetos por clave, para que al agregar
     un producto nuevo en una versión futura no se pierdan los ajustes guardados. */
  function fusionarParams(guardado) {
    const base = paramsPorDefecto();
    if (!guardado || typeof guardado !== 'object') return base;
    const out = { ...base, ...guardado };
    out.prod = { ...base.prod };
    Object.keys(guardado.prod || {}).forEach((k) => {
      if (base.prod[k]) out.prod[k] = { ...base.prod[k], ...guardado.prod[k] };
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
    if (!Array.isArray(out.feriados)) out.feriados = [];
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

  /** Matriz 7x7 de booleanos: fila = día de cálculo, columna = día de venta. */
  const matrizValida = (m) => Array.isArray(m) && m.length === 7 && m.every((f) => Array.isArray(f) && f.length === 7);
  const matrizVacia = () => Array.from({ length: 7 }, () => Array(7).fill(false));

  const estado = {
    params: fusionarParams(leer('params', null)),
    prom: leer('prom', null) || JSON.parse(JSON.stringify(PROM_INICIAL)),
    dias: leer('dias', {}),      // { 'AAAA-MM-DD': registro }
  };

  const guardarParams = () => grabar('params', estado.params);
  const guardarProm = () => grabar('prom', estado.prom);
  /** Un día sin nada capturado no merece guardarse: ensucia el historial. */
  function vacio(r) {
    if (!r || r.cerrado) return false;
    const algo = (o) => Object.values(o || {}).some((v) => v != null && v !== '');
    const turnos = Object.values(r.turnos || {}).some((t) => Object.values(t || {}).some((v) => Number(v) > 0));
    return !algo(r.inv) && !algo(r.prodHoy) && !algo(r.real) && !turnos && !(r.nota || '').trim();
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
  function registroVacio(fecha) {
    const inv = {}, prodHoy = {}, turnos = {}, real = {};
    PRODUCTOS.forEach((p) => { inv[p.clave] = null; prodHoy[p.clave] = null; real[p.clave] = null; turnos[p.clave] = {}; });
    return { fecha, inv, prodHoy, turnos, real, nota: '', cerrado: false, guardadoEn: null };
  }
  function registro(fecha) {
    if (!estado.dias[fecha]) estado.dias[fecha] = registroVacio(fecha);
    const r = estado.dias[fecha];
    // completa claves nuevas sin tocar lo ya capturado
    PRODUCTOS.forEach((p) => {
      if (!(p.clave in r.inv)) r.inv[p.clave] = null;
      if (!(p.clave in r.prodHoy)) r.prodHoy[p.clave] = null;
      if (!(p.clave in r.real)) r.real[p.clave] = null;
      if (!r.turnos[p.clave]) r.turnos[p.clave] = {};
    });
    return r;
  }

  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const prodPorClave = Object.fromEntries(PRODUCTOS.map((p) => [p.clave, p]));
  const turnoPorId = Object.fromEntries(TURNOS.map((t) => [t.id, t]));

  const api = {
    DIAS, TURNOS, FAMILIAS, PRODUCTOS, PROM_INICIAL,
    prodPorClave, turnoPorId,
    paramsPorDefecto, fusionarParams,
    estado, guardarParams, guardarProm, guardarDias, leer, grabar,
    hoyISO, desdeISO, aISO, sumarDias, indiceDia, nombreDia, fechaCorta,
    registro, registroVacio, num, vacio, matrizValida, matrizVacia,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Datos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
