/* Motor de cálculo.

   Cadena por producto, todo en BOLSAS salvo donde diga QQ:

     stockAyer       = conteo de cierre del día anterior
     prodAyerBolsas  = quintales producidos ayer × rendimiento
     disponible      = stockAyer + prodAyerBolsas
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

  /**
   * Si ese día se produce. Con `plantas` se pregunta por unas plantas en
   * concreto: basta que una trabaje. Sin ellas, vale cualquiera.
   */
  const produceEse = (params, iso, plantas) => {
    if ((params.feriados || []).includes(iso)) return false;
    const c = params.calendario[D.indiceDia(iso)];
    if (!c) return false;
    const pl = c.plantas || {};
    const lista = plantas && plantas.length ? plantas : D.PLANTAS.map((x) => x.id);
    return lista.some((x) => (typeof pl[x] === 'boolean' ? pl[x] : !!c.produce));
  };

  /** Cuántos días seguidos hay que cubrir según el calendario de producción. */
  function tramoCalendario(params, fecha, plantas) {
    if (params.horizonteModo === 'fijo') return Math.max(1, params.horizonteFijo || 1);
    const corte = Math.max(1, params.cortePorProduccion || 1);
    let vistas = 0;
    for (let d = 1; d <= 14; d++) {
      if (produceEse(params, D.sumarDias(fecha, d), plantas)) {
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
  function offsetsACubrir(params, fecha, familia, plantas) {
    if (params.horizonteModo === 'tabla') {
      const m = matrizDe(params, familia);
      if (m) {
        const hoy = D.indiceDia(fecha);
        const offs = [];
        for (let d = 0; d < 7; d++) if (m[hoy][d]) offs.push((d - hoy + 7) % 7);
        if (offs.length) return offs.sort((a, b) => a - b);
      }
    }
    const n = tramoCalendario(params, fecha, plantas);
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  /** Compatibilidad: cuántos días cubre el cálculo. */
  function diasACubrir(params, fecha, familia, plantas) {
    return offsetsACubrir(params, fecha, familia, plantas).length;
  }

  /** Construye la matriz por defecto a partir del calendario, para arrancar igual. */
  function matrizDesdeCalendario(params, plantas) {
    const m = D.matrizVacia();
    const base = '2026-10-12';   // un lunes cualquiera: sólo importa el día de la semana
    for (let w = 0; w < 7; w++) {
      const f = D.sumarDias(base, w);
      const n = tramoCalendario(params, f, plantas);
      for (let i = 1; i <= n; i++) m[w][(w + i) % 7] = true;
    }
    return m;
  }

  /**
   * De dónde salen el stock y la producción de ayer para una fecha:
   * lo escrito a mano manda, y si está vacío se toma del día anterior guardado.
   */
  function contexto(estado, fecha) {
    const fStock = D.diaPrevio(fecha, 'inv');
    const fProd = D.diaPrevio(fecha, 'prod');
    return {
      fStock, fProd,
      prevInv: fStock ? (D.migrar(estado.dias[fStock]).invPM || {}) : {},
      prevProd: fProd ? D.produccionDe(fProd) : {},
    };
  }

  const ventaDe = (estado, params, clave, iso) => {
    const fila = estado.prom[clave] || [];
    const base = Number(fila[D.indiceDia(iso)]) || 0;
    const cal = params.calendario[D.indiceDia(iso)] || {};
    return base * (Number(params.factorTemporada) || 1) * (Number(cal.factor) || 1);
  };

  // ---------- pedidos especiales ----------
  /** Días que ese producto necesita entre producción y entrega. */
  function anticipacionDe(params, clave) {
    const p = params.prod[clave] || {};
    const f = params.familias[p.familia] || {};
    const propia = f.anticipacion;
    const base = (params.pedidos || {}).anticipacion;
    return Math.max(0, Number(propia != null ? propia : base) || 0);
  }

  /** Los pedidos vivos de una clave con entrega en esa fecha. */
  function pedidosDe(estado, clave, iso, hoy) {
    return D.pedidosVivos(hoy).filter((p) => p.clave === clave && p.fecha === iso);
  }
  const bolsasDe = (lista) => lista.reduce((a, p) => a + (Number(p.bolsas) || 0), 0);

  /**
   * Lo que de verdad sale de bodega ese día: la venta promedio más lo que haya
   * comprometido en pedidos. Las bolsas del pedido son una cantidad firme, así
   * que no se multiplican por el factor de temporada.
   */
  const demandaDe = (estado, params, clave, iso, hoy) =>
    ventaDe(estado, params, clave, iso) + bolsasDe(pedidosDe(estado, clave, iso, hoy));

  /** El próximo día que esa planta produce después de la fecha. */
  function proximaCorrida(params, fecha, plantas) {
    for (let d = 1; d <= 14; d++) {
      const f = D.sumarDias(fecha, d);
      if (produceEse(params, f, plantas)) return f;
    }
    return D.sumarDias(fecha, 14);
  }

  /**
   * Pedidos que todavía no caen en el horizonte pero que hay que adelantar:
   * la próxima corrida ya no alcanzaría a producirlos a tiempo.
   */
  function pedidosUrgentes(estado, params, clave, fecha, plantas, offs, hoy) {
    const cubiertos = new Set([fecha, ...offs.map((o) => D.sumarDias(fecha, o))]);
    const corrida = proximaCorrida(params, fecha, plantas);
    const ant = anticipacionDe(params, clave);
    return D.pedidosVivos(hoy).filter((p) => {
      if (p.clave !== clave || cubiertos.has(p.fecha)) return false;
      return D.sumarDias(p.fecha, -ant) < corrida;   // la próxima ya sería tarde
    });
  }

  /** Una fila de la pantalla de decisión. */
  function calcularFila(estado, reg, clave, fecha, ctx) {
    const params = estado.params;
    const cfg = params.prod[clave] || {};
    const rend = Number(cfg.rend) || 0;
    const c = ctx || contexto(estado, fecha);

    const stockManual = D.num(reg.stockAyer[clave]);
    const stockAuto = Number(c.prevInv[clave]);
    const stockAyer = stockManual != null && !Number.isNaN(stockManual)
      ? stockManual : (isFinite(stockAuto) ? stockAuto : 0);
    const stockEsAuto = !(stockManual != null && !Number.isNaN(stockManual));

    const prodManual = D.num(reg.prodAyer[clave]);
    const prodAuto = Number(c.prevProd[clave]);
    const prodAyerQQ = prodManual != null && !Number.isNaN(prodManual)
      ? prodManual : (isFinite(prodAuto) ? prodAuto : 0);
    const prodEsAuto = !(prodManual != null && !Number.isNaN(prodManual));

    /* El producto que se hace de mañana ya viene dentro del conteo de cierre:
       sumarlo otra vez lo contaría dos veces. */
    const yaContado = !!cfg.prodEnConteo;
    const prodAyerBruto = prodAyerQQ * rend;
    const prodAyerB = yaContado ? 0 : prodAyerBruto;

    const inv = stockAyer, prodHoyQQ = prodAyerQQ, prodHoyB = prodAyerB;
    const disponible = stockAyer + prodAyerB;
    const hoyReal = D.hoyISO();
    const pedHoy = pedidosDe(estado, clave, fecha, hoyReal);
    const ventaHoy = ventaDe(estado, params, clave, fecha) + bolsasDe(pedHoy);
    const teoricoHoy = Math.max(0, disponible - ventaHoy);

    const plantas = plantasDe(params, clave);
    const offs = offsetsACubrir(params, fecha, cfg.familia, plantas);
    const nDias = offs.length;
    const ventas = offs.map((d) => demandaDe(estado, params, clave, D.sumarDias(fecha, d), hoyReal));
    const demandaVenta = offs.reduce((a, d) => a + ventaDe(estado, params, clave, D.sumarDias(fecha, d)), 0);

    /* Los pedidos del horizonte ya van dentro de `ventas`; los de más allá se
       suman aparte cuando la próxima corrida llegaría tarde. */
    const pedHorizonte = offs.flatMap((d) => pedidosDe(estado, clave, D.sumarDias(fecha, d), hoyReal));
    const pedUrgentes = pedidosUrgentes(estado, params, clave, fecha, plantas, offs, hoyReal);
    const pedidos = [...pedHorizonte, ...pedUrgentes];
    const pedidoBolsas = bolsasDe(pedidos);
    const demanda = ventas.reduce((a, b) => a + b, 0) + bolsasDe(pedUrgentes);
    const conVenta = ventas.filter((v) => v > 0).length;
    /* El promedio diario rige el colchón y la vida útil, así que sale sólo de
       la venta corriente: un pedido grande no debe inflar el stock de seguridad. */
    const promDia = conVenta ? demandaVenta / conVenta : 0;

    const { vidaUtil: vu, minDespacho, cobMax, colchon } = politica(params, clave);
    const seguridad = Math.ceil(promDia * colchon);
    const necesidad = demanda + seguridad - teoricoHoy;
    /* El tope de vida útil cuida de no producir de más contra la venta
       promedio; un pedido es demanda firme y no se deja recortar por él. */
    const topeVida = promDia * cobMax + pedidoBolsas - teoricoHoy;
    const sugeridoB = Math.max(0, Math.min(necesidad, topeVida));
    const sugeridoQQcrudo = rend > 0 ? sugeridoB / rend : 0;
    const mult = Number(cfg.mult) || 0;
    let sugeridoQQ = alMultiploArriba(sugeridoQQcrudo, mult);
    if (mult > 0 && sugeridoQQcrudo < mult / 2) sugeridoQQ = 0;   // menos de medio lote no se arranca

    // decisión ya capturada
    const asign = reg.turnos[clave] || {};
    const decididoQQ = redondea(Object.values(asign).reduce((a, b) => a + (Number(b) || 0), 0), 2);
    const decididoB = decididoQQ * rend;
    const ventaManana = demandaDe(estado, params, clave, D.sumarDias(fecha, 1), hoyReal);
    const teoricoManana = teoricoHoy + decididoB - ventaManana;
    const cobertura = promDia > 0 ? (teoricoHoy + decididoB) / promDia : null;

    /* Si hace falta producto pero un solo lote se pasaría de largo, no es un
       faltante que la app deba resolver: se avisa aparte para decidirlo a mano. */
    const bajoLote = sugeridoQQ === 0 && necesidad > 0 && mult > 0 && sugeridoQQcrudo < mult / 2;

    /* Lo que de verdad va a quedar para el pedido, con lo decidido o, si
       todavía no se reparte, con lo sugerido. */
    const cubreB = teoricoHoy + (decididoQQ > 0 ? decididoB : sugeridoQQ * rend);
    const faltaPedido = pedidoBolsas > 0 ? Math.max(0, pedidoBolsas - cubreB) : 0;

    let alerta = 'OK';
    if (faltaPedido > 0) alerta = 'PEDIDO EN RIESGO';
    else if (demanda <= 0 && teoricoHoy <= 0) alerta = 'SIN VENTA';
    else if (bajoLote) alerta = 'MENOS DE UN LOTE';
    else if (teoricoManana < 0) alerta = 'FALTANTE';
    else if (cobertura != null && cobertura > cobMax) alerta = 'EXCESO';
    else if (necesidad > topeVida && topeVida > 0) alerta = 'TOPE VIDA UTIL';

    const invPM = D.num(reg.invPM[clave]);
    const invPMv = invPM != null && !Number.isNaN(invPM) ? invPM : null;
    /* Positivo = quedó menos producto del que decía la teoría, o sea se vendió
       más que el promedio de ese día. */
    const difVenta = invPMv == null ? null : teoricoHoy - invPMv;

    return {
      clave, familia: cfg.familia, rend, mult,
      plantas,
      stockAyer, stockEsAuto, fechaStock: c.fStock,
      prodAyerQQ, prodAyerB, prodAyerBruto, prodEsAuto, fechaProd: c.fProd, yaContado,
      invPM: invPMv, difVenta,
      inv, prodHoyQQ, prodHoyB, disponible,
      ventaHoy, teoricoHoy,
      nDias, offs, ventas, demanda, demandaVenta, promDia, seguridad,
      pedidos, pedidoBolsas, pedidoHoy: bolsasDe(pedHoy), pedHoy,
      pedUrgentes, faltaPedido, anticipacion: anticipacionDe(params, clave),
      necesidad, topeVida, cobMax, vidaUtil: vu, minDespacho, colchon,
      objetivoDias: nDias + colchon,
      sugeridoB, sugeridoQQcrudo, sugeridoQQ,
      asign, decididoQQ, decididoB, bajoLote,
      ventaManana, teoricoManana, cobertura, alerta,
    };
  }

  function calcularTodo(estado, reg, fecha) {
    const ctx = contexto(estado, fecha);
    const filas = D.activos().map((p) => calcularFila(estado, reg, p.clave, fecha, ctx));
    return { filas, turnos: resumenTurnos(estado, filas, fecha),
      plantas: resumenPlantas(estado, filas, fecha), ctx };
  }

  /** Las plantas donde esa clave se puede producir. */
  function plantasDe(params, clave) {
    const c = params.prod[clave] || {};
    const out = [];
    if (c.z18 !== false) out.push('Z18');
    if (c.z2) out.push('Z2');
    return out.length ? out : ['Z18'];
  }

  /**
   * Los turnos que esa clave puede usar de verdad: los suyos, activos y de una
   * planta donde se produce. Si la combinación no deja ninguno, se devuelven
   * todos los suyos y se marca el desajuste para avisarlo en Parámetros.
   */
  function turnosUtiles(params, clave) {
    const c = params.prod[clave] || {};
    const activos = (c.turnos || []).filter((t) => (params.turnos[t] || {}).activo !== false);
    const pl = plantasDe(params, clave);
    const enPlanta = activos.filter((t) => pl.includes(D.plantaDeTurno(t)));
    return enPlanta.length ? { turnos: enPlanta, desajuste: false }
                           : { turnos: activos, desajuste: activos.length > 0 };
  }

  /** Sugerido y decidido partidos por planta de producción. */
  function resumenPlantas(estado, filas, fecha) {
    const out = {};
    D.PLANTAS.forEach((p) => {
      const trabaja = !fecha || produceEse(estado.params, fecha, [p.id]);
      out[p.id] = { id: p.id, nombre: p.nombre, trabaja, sugerido: 0, decidido: 0, tope: 0, claves: [] };
      D.turnosDePlanta(p.id).forEach((t) => {
        const c = estado.params.turnos[t.id] || {};
        if (c.activo !== false && trabaja) out[p.id].tope = redondea(out[p.id].tope + (Number(c.tope) || 0), 2);
      });
    });
    out.AMBAS = { id: 'AMBAS', nombre: 'Cualquiera de las dos', sugerido: 0, decidido: 0, tope: 0, claves: [] };
    filas.forEach((f) => {
      const destino = f.plantas.length > 1 ? 'AMBAS' : f.plantas[0];
      if (out[destino] && f.sugeridoQQ) {
        out[destino].sugerido = redondea(out[destino].sugerido + f.sugeridoQQ, 2);
        out[destino].claves.push(f.clave);
      }
      Object.entries(f.asign).forEach(([t, v]) => {
        const n = Number(v) || 0;
        if (!n) return;
        const pl = D.plantaDeTurno(t);
        if (out[pl]) out[pl].decidido = redondea(out[pl].decidido + n, 2);
      });
    });
    return out;
  }

  /** Si ese turno trabaja esa fecha, según el calendario de su planta. */
  function turnoTrabaja(params, turnoId, fecha) {
    if (!fecha) return true;
    return produceEse(params, fecha, [D.plantaDeTurno(turnoId)]);
  }

  /** Cuánto lleva cada turno contra su tope. */
  function resumenTurnos(estado, filas, fecha) {
    const out = {};
    D.TURNOS.forEach((t) => {
      const cfg = estado.params.turnos[t.id] || {};
      const trabaja = turnoTrabaja(estado.params, t.id, fecha);
      out[t.id] = {
        id: t.id, nombre: t.nombre, papel: t.papel, momento: t.momento,
        planta: D.plantaDeTurno(t.id), trabaja,
        tope: Number(cfg.tope) || 0, minimo: Number(cfg.minimo) || 0,
        activo: cfg.activo !== false && trabaja,
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
  function cupos(estado, filas, soloClaves, fecha) {
    const res = resumenTurnos(estado, filas, fecha);
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
    const libre = cupos(estado, base, objetivo, fecha);

    const falta = {}, mult = {}, pref = {}, dado = {};
    /* Las claves cuyos turnos no trabajan ese día no entran al reparto: no es
       que no quepan, es que esa planta descansa. Se reportan aparte. */
    const sinTurnoHoy = [];
    base.filter((f) => objetivo.includes(f.clave)).forEach((f) => {
      const cfg = estado.params.prod[f.clave];
      const suyos = turnosUtiles(estado.params, f.clave).turnos;
      const hoy = suyos.filter((t) => turnoTrabaja(estado.params, t, fecha));
      if (!hoy.length) {
        dado[f.clave] = {};
        if (f.sugeridoQQ > 0) sinTurnoHoy.push({ clave: f.clave, qq: f.sugeridoQQ });
        return;
      }
      falta[f.clave] = f.sugeridoQQ;
      mult[f.clave] = Number(cfg.mult) || 0;
      pref[f.clave] = hoy;
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
      if (!turnoTrabaja(estado.params, t.id, fecha)) return;
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
    return { sinCupo, sinTurnoHoy };
  }

  function limpiarReparto(reg, claves) {
    (claves && claves.length ? claves : Object.keys(reg.turnos)).forEach((c) => { reg.turnos[c] = {}; });
  }

  const api = {
    redondea, alMultiploArriba, alMultiploAbajo, politica, vidaUtil, produceEse,
    diasACubrir, offsetsACubrir, tramoCalendario, matrizDesdeCalendario, matrizDe,
    ventaDe, demandaDe, pedidosDe, pedidosUrgentes, anticipacionDe, proximaCorrida, bolsasDe,
    contexto, calcularFila, calcularTodo, resumenTurnos, resumenPlantas,
    plantasDe, turnosUtiles, turnoTrabaja, repartir, limpiarReparto, cupos,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Calculo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
