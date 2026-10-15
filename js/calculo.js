/* Motor de cálculo.

   Cadena por producto, todo en BOLSAS salvo donde diga QQ:

     disponible      = inventario de cierre + producción de ese mismo día
     teóricoPMHoy    = max(0, disponible − venta de hoy)
     demandaHorizonte= suma de la venta de los días que hay que cubrir
     stockSeguridad  = venta promedio diaria × colchón de días
     necesidad       = demandaHorizonte + stockSeguridad − teóricoPMHoy
     topeVidaÚtil    = venta promedio diaria × días de cobertura máxima − teóricoPMHoy
     sugeridoQQ      = max(0, min(necesidad, topeVidaÚtil)) / rendimiento, al múltiplo

   Y con la decisión ya tomada (los quintales repartidos por turno):

     teóricoPMMañana = teóricoPMHoy + producción decidida − venta de mañana
     cobertura       = (teóricoPMHoy + producción decidida) / venta promedio diaria
*/
(function (raiz) {
  'use strict';
  const D = (typeof require === 'function' && typeof module !== 'undefined') ? require('./datos.js') : raiz.Datos;

  const redondea = (n, dec = 2) => Math.round((n + Number.EPSILON) * 10 ** dec) / 10 ** dec;

  /** Sube al siguiente múltiplo. Trabaja en centésimas para evitar 0.1+0.2. */
  function alMultiploArriba(qq, mult) {
    if (!(mult > 0)) return redondea(qq, 2);
    const m = Math.round(mult * 100), v = Math.round(qq * 100);
    return redondea((Math.ceil(v / m) * m) / 100, 2);
  }
  /** Baja al múltiplo anterior: se usa al repartir para no pasarse del tope. */
  function alMultiploAbajo(qq, mult) {
    if (!(mult > 0)) return redondea(qq, 2);
    const m = Math.round(mult * 100), v = Math.round(qq * 100);
    return redondea((Math.floor(v / m) * m) / 100, 2);
  }

  /* La vida útil y el colchón se definen por familia; el producto puede pisarlos. */
  const politica = (params, clave) => {
    const p = params.prod[clave] || {};
    const f = params.familias[p.familia] || {};
    const vu = p.vidaUtil != null ? p.vidaUtil : f.vidaUtil;
    const md = p.minDespacho != null ? p.minDespacho : f.minDespacho;
    const co = p.colchon != null ? p.colchon : f.colchon;
    return {
      vidaUtil: vu, minDespacho: md, colchon: Number(co) || 0,
      cobMax: Math.max(1, (vu || 0) - (md || 0)),
    };
  };
  const vidaUtil = politica;

  const produceEse = (params, iso) => {
    if ((params.feriados || []).includes(iso)) return false;
    const c = params.calendario[D.indiceDia(iso)];
    return !!(c && c.produce);
  };

  /** Cuántos días seguidos hay que cubrir según el calendario de producción. */
  function tramoCalendario(params, fecha) {
    if (params.horizonteModo === 'fijo') return Math.max(1, params.horizonteFijo || 1);
    const corte = Math.max(1, params.cortePorProduccion || 1);
    let vistas = 0;
    for (let d = 1; d <= 14; d++) {
      if (produceEse(params, D.sumarDias(fecha, d))) {
        vistas++;
        if (vistas >= corte) return d;
      }
    }
    return 7;
  }

  /** La matriz que rige para esa familia: la suya si la tiene, si no la general. */
  function matrizDe(params, familia) {
    const c = params.cobertura || {};
    const propia = c.familias && c.familias[familia];
    if (D.matrizValida(propia)) return propia;
    return D.matrizValida(c.general) ? c.general : null;
  }

  /**
   * Qué días de venta entran en el cálculo, como desplazamientos desde la fecha.
   * Con la tabla, un día marcado se busca en su próxima aparición: marcar el
   * mismo día del cálculo da desplazamiento 0, o sea la venta de hoy.
   */
  function offsetsACubrir(params, fecha, familia) {
    if (params.horizonteModo === 'tabla') {
      const m = matrizDe(params, familia);
      if (m) {
        const hoy = D.indiceDia(fecha);
        const offs = [];
        for (let d = 0; d < 7; d++) if (m[hoy][d]) offs.push((d - hoy + 7) % 7);
        if (offs.length) return offs.sort((a, b) => a - b);
      }
    }
    const n = tramoCalendario(params, fecha);
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  /** Compatibilidad: cuántos días cubre el cálculo. */
  function diasACubrir(params, fecha, familia) {
    return offsetsACubrir(params, fecha, familia).length;
  }

  /** Construye la matriz por defecto a partir del calendario, para arrancar igual. */
  function matrizDesdeCalendario(params) {
    const m = D.matrizVacia();
    const base = '2026-10-12';   // un lunes cualquiera: sólo importa el día de la semana
    for (let w = 0; w < 7; w++) {
      const f = D.sumarDias(base, w);
      const n = tramoCalendario(params, f);
      for (let i = 1; i <= n; i++) m[w][(w + i) % 7] = true;
    }
    return m;
  }

  const ventaDe = (estado, params, clave, iso) => {
    const fila = estado.prom[clave] || [];
    const base = Number(fila[D.indiceDia(iso)]) || 0;
    const cal = params.calendario[D.indiceDia(iso)] || {};
    return base * (Number(params.factorTemporada) || 1) * (Number(cal.factor) || 1);
  };

  /** Una fila de la pantalla de decisión. */
  function calcularFila(estado, reg, clave, fecha) {
    const params = estado.params;
    const cfg = params.prod[clave] || {};
    const rend = Number(cfg.rend) || 0;
    const inv = Number(reg.inv[clave]) || 0;
    const prodHoyQQ = Number(reg.prodHoy[clave]) || 0;
    const prodHoyB = prodHoyQQ * rend;

    const disponible = inv + prodHoyB;
    const ventaHoy = ventaDe(estado, params, clave, fecha);
    const teoricoHoy = Math.max(0, disponible - ventaHoy);

    const offs = offsetsACubrir(params, fecha, cfg.familia);
    const nDias = offs.length;
    const ventas = offs.map((d) => ventaDe(estado, params, clave, D.sumarDias(fecha, d)));
    const demanda = ventas.reduce((a, b) => a + b, 0);
    const conVenta = ventas.filter((v) => v > 0).length;
    const promDia = conVenta ? demanda / conVenta : 0;

    const { vidaUtil: vu, minDespacho, cobMax, colchon } = politica(params, clave);
    const seguridad = Math.ceil(promDia * colchon);
    const necesidad = demanda + seguridad - teoricoHoy;
    const topeVida = promDia * cobMax - teoricoHoy;
    const sugeridoB = Math.max(0, Math.min(necesidad, topeVida));
    const sugeridoQQcrudo = rend > 0 ? sugeridoB / rend : 0;
    const mult = Number(cfg.mult) || 0;
    let sugeridoQQ = alMultiploArriba(sugeridoQQcrudo, mult);
    if (mult > 0 && sugeridoQQcrudo < mult / 2) sugeridoQQ = 0;   // menos de medio lote no se arranca

    // decisión ya capturada
    const asign = reg.turnos[clave] || {};
    const decididoQQ = redondea(Object.values(asign).reduce((a, b) => a + (Number(b) || 0), 0), 2);
    const decididoB = decididoQQ * rend;
    const ventaManana = ventaDe(estado, params, clave, D.sumarDias(fecha, 1));
    const teoricoManana = teoricoHoy + decididoB - ventaManana;
    const cobertura = promDia > 0 ? (teoricoHoy + decididoB) / promDia : null;

    /* Si hace falta producto pero un solo lote se pasaría de largo, no es un
       faltante que la app deba resolver: se avisa aparte para decidirlo a mano. */
    const bajoLote = sugeridoQQ === 0 && necesidad > 0 && mult > 0 && sugeridoQQcrudo < mult / 2;

    let alerta = 'OK';
    if (demanda <= 0 && teoricoHoy <= 0) alerta = 'SIN VENTA';
    else if (bajoLote) alerta = 'MENOS DE UN LOTE';
    else if (teoricoManana < 0) alerta = 'FALTANTE';
    else if (cobertura != null && cobertura > cobMax) alerta = 'EXCESO';
    else if (necesidad > topeVida && topeVida > 0) alerta = 'TOPE VIDA UTIL';

    return {
      clave, familia: cfg.familia, rend, mult,
      inv, prodHoyQQ, prodHoyB, disponible,
      ventaHoy, teoricoHoy,
      nDias, offs, ventas, demanda, promDia, seguridad,
      necesidad, topeVida, cobMax, vidaUtil: vu, minDespacho, colchon,
      objetivoDias: nDias + colchon,
      sugeridoB, sugeridoQQcrudo, sugeridoQQ,
      asign, decididoQQ, decididoB, bajoLote,
      ventaManana, teoricoManana, cobertura, alerta,
    };
  }

  function calcularTodo(estado, reg, fecha) {
    const filas = D.PRODUCTOS
      .filter((p) => (estado.params.prod[p.clave] || {}).activo !== false)
      .map((p) => calcularFila(estado, reg, p.clave, fecha));
    return { filas, turnos: resumenTurnos(estado, filas) };
  }

  /** Cuánto lleva cada turno contra su tope. */
  function resumenTurnos(estado, filas) {
    const out = {};
    D.TURNOS.forEach((t) => {
      const cfg = estado.params.turnos[t.id] || {};
      out[t.id] = {
        id: t.id, nombre: t.nombre, papel: t.papel, momento: t.momento,
        tope: Number(cfg.tope) || 0, minimo: Number(cfg.minimo) || 0, activo: cfg.activo !== false,
        usado: 0, sugerido: 0, claves: [],
      };
    });
    filas.forEach((f) => {
      Object.entries(f.asign).forEach(([t, v]) => {
        const n = Number(v) || 0;
        if (out[t] && n) { out[t].usado = redondea(out[t].usado + n, 2); out[t].claves.push(f.clave); }
      });
    });
    Object.values(out).forEach((t) => {
      t.libre = redondea(t.tope - t.usado, 2);
      t.pct = t.tope > 0 ? t.usado / t.tope : 0;
      t.excedido = t.usado > t.tope + 1e-9;
      t.bajoMinimo = t.activo && t.minimo > 0 && t.usado < t.minimo - 1e-9;
    });
    return out;
  }

  /** Lo que cada turno tiene libre ahora mismo. */
  function cupos(estado, filas, soloClaves) {
    const res = resumenTurnos(estado, filas);
    const libre = {};
    Object.values(res).forEach((t) => {
      let usado = t.usado;
      if (soloClaves) {   // al re-repartir, lo de esas claves vuelve al cupo
        filas.filter((f) => soloClaves.includes(f.clave)).forEach((f) => {
          usado -= Number(f.asign[t.id]) || 0;
        });
      }
      libre[t.id] = t.activo ? redondea(t.tope - usado, 2) : 0;
    });
    return libre;
  }

  /**
   * Reparte el sugerido entre los turnos que pueden hacer cada clave.
   *
   * Recorre los turnos en orden. En cada uno toma las claves cuyo primer turno
   * con cupo es ése, y si lo que piden no cabe, lo reparte en proporción a lo
   * que pide cada una, en múltiplos enteros. Así ninguna clave se queda en cero
   * sólo porque otra llegó antes. Lo que no cabe en ningún turno se reporta.
   */
  function repartir(estado, reg, fecha, claves) {
    const base = calcularTodo(estado, reg, fecha).filas;
    const objetivo = claves && claves.length ? claves : base.map((f) => f.clave);
    const libre = cupos(estado, base, objetivo);

    const falta = {}, mult = {}, pref = {}, dado = {};
    base.filter((f) => objetivo.includes(f.clave)).forEach((f) => {
      const cfg = estado.params.prod[f.clave];
      falta[f.clave] = f.sugeridoQQ;
      mult[f.clave] = Number(cfg.mult) || 0;
      pref[f.clave] = (cfg.turnos || []).filter((t) => (estado.params.turnos[t] || {}).activo !== false);
      dado[f.clave] = {};
    });

    const conCupo = (c) => pref[c].find((t) => (libre[t] || 0) > 1e-9);

    for (let vuelta = 0; vuelta < 6; vuelta++) {
      let avance = false;
      for (const turno of D.TURNOS.map((t) => t.id)) {
        const cupo = libre[turno] || 0;
        if (cupo <= 1e-9) continue;
        const cand = Object.keys(falta).filter((c) => falta[c] > 1e-9 && conCupo(c) === turno);
        if (!cand.length) continue;

        const pide = cand.reduce((a, c) => a + falta[c], 0);
        if (pide <= cupo + 1e-9) {
          // cabe todo: cada clave recibe lo que le falta
          cand.forEach((c) => {
            const dar = alMultiploAbajo(Math.min(falta[c], libre[turno]), mult[c]) ||
                        (libre[turno] + 1e-9 >= mult[c] ? mult[c] : 0);
            if (dar <= 0) return;
            dado[c][turno] = redondea((dado[c][turno] || 0) + dar, 2);
            libre[turno] = redondea(libre[turno] - dar, 2);
            falta[c] = redondea(falta[c] - dar, 2);
            avance = true;
          });
        } else {
          // no cabe: reparto proporcional, redondeando hacia abajo al múltiplo
          const parte = {};
          cand.forEach((c) => {
            const bruto = cupo * (falta[c] / pide);
            parte[c] = { bruto, dar: alMultiploAbajo(Math.min(bruto, falta[c]), mult[c]) };
          });
          cand.forEach((c) => {
            const dar = parte[c].dar;
            if (dar <= 0) return;
            dado[c][turno] = redondea((dado[c][turno] || 0) + dar, 2);
            libre[turno] = redondea(libre[turno] - dar, 2);
            falta[c] = redondea(falta[c] - dar, 2);
            avance = true;
          });
          // el sobrante se da de a un múltiplo al que quedó más corto
          let guarda = 0;
          while (libre[turno] > 1e-9 && guarda++ < 200) {
            const elegible = cand
              .filter((c) => falta[c] > 1e-9 && mult[c] > 0 && libre[turno] + 1e-9 >= mult[c])
              .sort((a, b) => (parte[b].bruto - (dado[b][turno] || 0)) - (parte[a].bruto - (dado[a][turno] || 0)));
            if (!elegible.length) break;
            const c = elegible[0], dar = Math.min(mult[c], falta[c]);
            dado[c][turno] = redondea((dado[c][turno] || 0) + dar, 2);
            libre[turno] = redondea(libre[turno] - dar, 2);
            falta[c] = redondea(falta[c] - dar, 2);
            avance = true;
          }
        }
      }
      if (!avance) break;
    }

    /* Turnos con mínimo: si quedaron por debajo, se completan con las claves
       que ese turno sabe hacer, empezando por la de menor cobertura. */
    D.TURNOS.forEach((t) => {
      const cfg = estado.params.turnos[t.id] || {};
      const minimo = Number(cfg.minimo) || 0;
      if (cfg.activo === false || minimo <= 0) return;
      let usado = redondea((cfg.tope || 0) - (libre[t.id] || 0), 2);
      if (usado >= minimo - 1e-9) return;
      const aptas = base
        .filter((f) => objetivo.includes(f.clave) && pref[f.clave] && pref[f.clave].includes(t.id))
        .sort((a, b) => {
          const ca = a.promDia > 0 ? a.teoricoHoy / a.promDia : 1e9;
          const cb = b.promDia > 0 ? b.teoricoHoy / b.promDia : 1e9;
          return ca - cb;
        });
      let guarda = 0;
      while (usado < minimo - 1e-9 && guarda++ < 200) {
        const f = aptas.find((x) => (mult[x.clave] || 0) > 0 && usado + mult[x.clave] <= (cfg.tope || 0) + 1e-9);
        if (!f) break;
        const m = mult[f.clave];
        dado[f.clave][t.id] = redondea((dado[f.clave][t.id] || 0) + m, 2);
        libre[t.id] = redondea((libre[t.id] || 0) - m, 2);
        usado = redondea(usado + m, 2);
      }
    });

    Object.keys(dado).forEach((c) => { reg.turnos[c] = dado[c]; });
    const sinCupo = Object.keys(falta)
      .filter((c) => falta[c] > 1e-9)
      .map((c) => ({ clave: c, qq: redondea(falta[c], 2) }));
    return { sinCupo };
  }

  function limpiarReparto(reg, claves) {
    (claves && claves.length ? claves : Object.keys(reg.turnos)).forEach((c) => { reg.turnos[c] = {}; });
  }

  const api = {
    redondea, alMultiploArriba, alMultiploAbajo, politica, vidaUtil, produceEse,
    diasACubrir, offsetsACubrir, tramoCalendario, matrizDesdeCalendario, matrizDe,
    ventaDe, calcularFila, calcularTodo, resumenTurnos, repartir, limpiarReparto, cupos,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Calculo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
