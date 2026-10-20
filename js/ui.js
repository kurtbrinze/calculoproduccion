/* Interfaz: tablero de producción, inventario, historial, promedios y ajustes. */
(function () {
  'use strict';
  const D = window.Datos, C = window.Calculo, X = window.Excel;
  const VERSION = 'V.2026.19';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => (v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('es-GT'));
  const n1 = (v) => (v == null || !isFinite(v) ? '' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 1 }));
  const n2 = (v) => (v == null || !isFinite(v) ? '' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 2 }));
  const TIPO_XLSX = { description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } };
  const TIPO_JSON = { description: 'Respaldo', accept: { 'application/json': ['.json'] } };

  /* Recordar el día en curso: la tablet se bloquea y al volver no hay que buscarlo. */
  const ultimaFecha = (() => {
    try { const f = localStorage.getItem('panprod_fecha'); return /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? f : null; }
    catch (_) { return null; }
  })();
  const ui = { fecha: ultimaFecha || D.hoyISO(), abierta: null, tab: 'prod', sinCupo: null, sinTurnoHoy: null, famMatriz: '', vistaHist: 'turno', filtroPed: 'vivos' };
  const recordarFecha = () => { try { localStorage.setItem('panprod_fecha', ui.fecha); } catch (_) {} };

  // ---------- avisos ----------
  let tToast;
  function aviso(msg, tipo) {
    const el = $('#toast'); el.textContent = msg; el.className = 'show' + (tipo === 'err' ? ' err' : '');
    clearTimeout(tToast); tToast = setTimeout(() => { el.className = ''; }, tipo === 'err' ? 6500 : 3200);
  }
  const espera = (on, msg) => { $('#esperaMsg').textContent = msg || 'Procesando…'; $('#espera').className = on ? 'show' : ''; };

  /* La pantalla de espera se baja mientras hay una pregunta: si no, tapa los
     botones del cuadro y en la tablet no hay manera de contestar. */
  /**
   * Pregunta de dos botones: devuelve true o false.
   * Con `textoOtro` aparece un tercer botón en medio y devuelve 'otro'.
   * Cancelar —y tocar fuera del cuadro— siempre devuelve false, que siempre
   * quiere decir no hacer nada.
   */
  function preguntar(titulo, cuerpo, textoSi = 'Aceptar', textoOtro = null) {
    const ocupado = $('#espera').className === 'show';
    if (ocupado) $('#espera').className = '';
    return new Promise((res) => {
      $('#modalTit').textContent = titulo;
      $('#modalCuerpo').innerHTML = cuerpo;
      $('#modalSi').textContent = textoSi;
      $('#modalNo').textContent = 'Cancelar';
      const otro = $('#modalOtro');
      otro.hidden = !textoOtro;
      if (textoOtro) otro.textContent = textoOtro;
      const m = $('#modal'); m.classList.add('show');
      const cerrar = (v) => {
        m.classList.remove('show');
        $('#modalSi').onclick = null; $('#modalNo').onclick = null; otro.onclick = null;
        otro.hidden = true;
        if (ocupado) $('#espera').className = 'show';
        res(v);
      };
      $('#modalSi').onclick = () => cerrar(true);
      $('#modalNo').onclick = () => cerrar(false);
      otro.onclick = () => cerrar('otro');
      m.onclick = (e) => { if (e.target === m) cerrar(false); };
    });
  }

  /* Todo lo que el app entrega pasa por aquí: si hay una carpeta elegida va
     directo ahí, y si no, a la carpeta de Descargas del navegador. */
  const descargar = (blob, nombre, tipo) => window.Archivo.guardar(blob, nombre, { tipo });
  const donde = (r) => (r && r.modo === 'carpeta' ? ` en ${r.donde}` : '');

  // ---------- estado del día ----------
  const reg = () => D.registro(ui.fecha);
  const calc = () => C.calcularTodo(D.estado, reg(), ui.fecha);

  // ================= PRODUCCIÓN =================
  /* Dos renglones de encabezado: el nombre arriba y de qué día habla abajo,
     igual que en Inventario. Sin eso no se sabe si lo que se ve es de hoy o
     del día anterior. */
  const th2 = (titulo, sub, cls) =>
    `<th${cls ? ` class="${cls}"` : ''}>${esc(titulo)}${sub ? `<span class="sub2">${esc(sub)}</span>` : ''}</th>`;

  function pintarProduccion() {
    const t = calc();
    const r = reg();
    $('#inFecha').value = ui.fecha;
    $('#inFactor').value = D.estado.params.factorTemporada;
    $('#lblDia').textContent = D.nombreDia(ui.fecha);
    $('#lblCubrir').innerHTML = rotuloCubre(t.filas, true);

    // --- indicadores ---
    const sug = t.filas.reduce((a, f) => a + f.sugeridoQQ, 0);
    const dec = t.filas.reduce((a, f) => a + f.decididoQQ, 0);
    const faltan = t.filas.filter((f) => f.alerta === 'FALTANTE').length;
    const tope = Object.values(t.turnos).filter((x) => x.activo && x.pct >= 0.999).length;
    $('#kpis').innerHTML =
      kpi('Sugerido total', n1(sug) + ' qq') +
      kpi('Decidido', n1(dec) + ' qq', dec > 0 ? 'bien' : '') +
      kpi('Claves con faltante', faltan, faltan ? 'alerta' : 'bien') +
      kpi('Turnos al tope', `${tope} de ${Object.values(t.turnos).filter((x) => x.activo).length}`);

    // --- el sugerido partido por planta ---
    const pl = t.plantas;
    const tarjetas = D.PLANTAS.map((x) => {
      const v = pl[x.id];
      const pct = v.tope > 0 ? Math.min(100, Math.round((v.decidido / v.tope) * 100)) : 0;
      return `<div class="planta ${v.trabaja ? '' : 'apagado'}">
        <b>${esc(v.nombre)}${v.trabaja ? '' : ' <span class="dim" style="font-weight:400;font-size:.8rem">no trabaja hoy</span>'}</b>
        <div class="qq"><strong>${n1(v.sugerido)}</strong><span>qq sugeridos</span></div>
        <div class="barra"><i style="width:${pct}%"></i></div>
        <span class="dim" style="font-size:.82rem">${n2(v.decidido)} decididos de ${n2(v.tope)} qq de capacidad</span>
      </div>`;
    }).join('');
    const amb = pl.AMBAS;
    const extra = amb.sugerido > 0 ? `<div class="planta ambas">
        <b>Más de una planta</b>
        <div class="qq"><strong>${n1(amb.sugerido)}</strong><span>qq sugeridos</span></div>
        <span class="dim" style="font-size:.82rem">${esc(amb.claves.join(', '))} — la planta la define el turno donde se reparta</span>
      </div>` : '';
    $('#plantas').innerHTML = tarjetas + extra;

    // --- turnos ---
    $('#turnos').innerHTML = Object.values(t.turnos).map((x) => {
      const pct = Math.min(100, Math.round(x.pct * 100));
      const cls = [!x.activo && 'apagado', x.excedido && 'excedido', !x.excedido && x.pct >= 0.999 && 'lleno', x.bajoMinimo && 'bajo'].filter(Boolean).join(' ');
      return `<div class="turno ${cls}">
        <b>${esc(x.nombre)}${x.rota ? ` <span class="chip mom">${esc(x.momento)}</span>` : ''}</b>
        <span class="papel">${esc(x.papel)}${x.trabaja ? '' : ' · no trabaja hoy'}</span>
        <div class="qq"><strong>${n2(x.usado)}</strong><span>de ${n2(x.tope)} qq</span></div>
        <div class="barra"><i style="width:${pct}%"></i></div>
        ${x.excedido ? '<span class="chip falta" style="margin-top:7px">Pasa el tope</span>'
          : x.bajoMinimo ? `<span class="chip exceso" style="margin-top:7px">Mínimo ${n2(x.minimo)}</span>` : ''}
      </div>`;
    }).join('');

    // --- avisos ---
    const av = [];
    const sinInv = t.filas.filter((f) => !f.stockAyer).length;
    if (sinInv === t.filas.length) av.push(['warn', 'Falta el stock de ayer',
      'Sin él el teórico PM sale de cero. Cárgalo en la pestaña Inventario con «Cargar STOCK AYER».']);
    else if (sinInv) av.push(['warn', `${sinInv} claves sin stock de ayer`,
      'Las que están vacías se calculan como si no hubiera existencia.']);
    const conPed = t.filas.filter((f) => f.pedidoBolsas > 0);
    if (conPed.length) {
      const b = conPed.reduce((a, f) => a + f.pedidoBolsas, 0);
      av.push(['', conPed.length === 1
        ? `Hoy entra una clave con pedido especial: ${n0(b)} bolsas`
        : `Hoy entran ${conPed.length} claves con pedido especial: ${n0(b)} bolsas`,
        conPed.map((f) => `${f.clave} ${n0(f.pedidoBolsas)} b`).join(' · ')
        + '. Ya están sumadas al sugerido; el detalle de cada clave dice para quién y para cuándo.']);
    }
    const enRiesgo = t.filas.filter((f) => f.faltaPedido > 0);
    if (enRiesgo.length) {
      av.push(['err', enRiesgo.length === 1 ? 'Un pedido no queda cubierto' : `${enRiesgo.length} pedidos no quedan cubiertos`,
        enRiesgo.map((f) => `${f.clave} faltan ${n0(f.faltaPedido)} b`).join(' · ')
        + '. Sube un tope de turno, muévelo a otro turno, o escribe los quintales a mano.']);
    }
    const paran = D.PLANTAS.filter((x) => t.plantas[x.id] && !t.plantas[x.id].trabaja);
    if (paran.length) av.push(['', `${paran.map((x) => x.nombre).join(' y ')} no trabaja${paran.length > 1 ? 'n' : ''} este día`,
      'Sus turnos quedan fuera del reparto. El calendario de cada planta se cambia en Parámetros.']);
    const desaj = t.filas.filter((f) => C.turnosUtiles(D.estado.params, f.clave).desajuste);
    if (desaj.length) av.push(['warn',
      desaj.length === 1 ? `${desaj[0].clave} está marcada para una planta donde ningún turno suyo trabaja`
                         : `${desaj.length} claves marcadas para una planta donde ningún turno suyo trabaja`,
      desaj.map((f) => `${f.clave} (${f.plantas.join(' y ')})`).join(' · ')
      + '. Se siguen repartiendo en sus turnos de siempre, así que el sugerido por planta no cuadra con lo decidido. '
      + 'Se arregla en Parámetros: o marcas la otra planta, o le das un turno de la planta marcada.']);
    const exc = Object.values(t.turnos).filter((x) => x.excedido);
    if (exc.length) av.push(['err', 'Hay turnos pasados de tope', exc.map((x) => `${x.nombre}: ${n2(x.usado)} de ${n2(x.tope)} qq`).join(' · ')]);
    if (ui.sinTurnoHoy && ui.sinTurnoHoy.length) {
      av.push(['', `${ui.sinTurnoHoy.length} claves no se pueden producir este día`,
        ui.sinTurnoHoy.map((x) => `${x.clave} ${n2(x.qq)} qq`).join(' · ')
        + '. Sus turnos son de una planta que hoy descansa, así que el sugerido queda para la próxima corrida.']);
    }
    if (ui.sinCupo && ui.sinCupo.length) {
      av.push(['warn', `No cupo todo: faltan ${n2(ui.sinCupo.reduce((a, x) => a + x.qq, 0))} qq de turno`,
        ui.sinCupo.map((x) => `${x.clave} ${n2(x.qq)} qq`).join(' · ')
        + '. Se puede subir un tope en Parámetros, mover claves a otro turno, o dejarlo así y vigilar la cobertura.']);
    }
    $('#avisosProd').innerHTML = av.map(([c, h, p]) => `<div class="aviso ${c}"><h4>${esc(h)}</h4><p>${esc(p)}</p></div>`).join('');

    // --- una tabla por área de producción ---
    const dHoy = D.fechaCorta(ui.fecha);
    const dAyer = t.ctx.fStock ? D.fechaCorta(t.ctx.fStock) : 'sin conteo';
    const dMan = D.fechaCorta(D.sumarDias(ui.fecha, 1));
    const porClave = Object.fromEntries(t.filas.map((f) => [f.clave, f]));

    const cuerpo = D.areasUsadas().map((area) => {
      const turnos = D.turnosDeArea(area.id);
      const filas = D.clavesDeArea(area.id).map((c) => porClave[c]).filter(Boolean);
      if (!filas.length) return '';
      const ids = turnos.map((x) => x.id);
      const th = `<tr>
        ${th2('Clave', '', 'l')}
        ${th2('Stock + prod', dAyer)}${th2('Teórico PM hoy', dHoy)}${th2('Sugerido qq', dHoy)}
        ${turnos.map((x) => th2(x.nombre + (x.rota ? ` · ${D.momentoDeTurno(x.id, ui.fecha)}` : ''), dHoy)).join('')}
        ${th2('Decidido qq', dHoy)}${th2('= Bolsas', dHoy)}
        ${th2('Teórico PM mañana', dMan)}${th2('Cobertura', '')}${th2('Alerta', '', 'l')}</tr>`;
      const tb = filas.map((f) => filaProd(f, turnos, ids)).join('');
      const sumArea = filas.reduce((a, f) => a + decididoEn(f, ids), 0);
      const bolsasArea = filas.reduce((a, f) => a + decididoEn(f, ids) * f.rend, 0);
      const cubre = rotuloCubre(filas);
      const planta = (D.PLANTAS.find((x) => x.id === area.planta) || {}).nombre || area.planta;
      const trabaja = t.plantas[area.planta] ? t.plantas[area.planta].trabaja : true;
      return `<div class="card ${trabaja ? '' : 'apagado'}" style="margin-bottom:14px;padding:0;overflow:hidden">
        <div style="display:flex;align-items:baseline;gap:12px;padding:12px 16px;flex-wrap:wrap">
          <h3 style="margin:0">${esc(area.nombre)}</h3>
          <span class="chip nada">${esc(planta)}</span>
          <span class="dim" style="font-size:.86rem">${filas.length} claves · ${n2(sumArea)} qq · ${n0(bolsasArea)} bolsas</span>
          <span class="dim" style="font-size:.86rem;margin-left:auto">${trabaja ? 'Cubre: ' + cubre : 'Esta planta no trabaja hoy'}</span>
        </div>
        <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0">
          <table><thead>${th}</thead><tbody>${tb}</tbody></table>
        </div></div>`;
    }).join('');
    $('#famCont').innerHTML = cuerpo;

    const nd2 = Object.keys(D.estado.dias).filter((f) => D.estado.dias[f].cerrado).length;
    $('#barInfo').innerHTML = `<b>${D.fechaCorta(ui.fecha)}</b> · ${n1(dec)} qq decididos · `
      + (nd2 === 1 ? '1 día guardado' : `${nd2} días guardados`);
  }

  const kpi = (t, v, cls = '') => `<div class="kpi ${cls}"><span>${esc(t)}</span><strong>${esc(v)}</strong></div>`;

  /** Las plantas donde se produce algo de esa familia. */
  function plantasDeFamilia(famId) {
    const out = new Set();
    D.activos().forEach((p) => {
      if (famId && p.familia !== famId) return;
      C.plantasDe(D.estado.params, p.clave).forEach((x) => out.add(x));
    });
    return [...out];
  }

  /**
   * Qué días cubre el cálculo. Como cada planta tiene su calendario, las filas
   * no siempre coinciden: cuando difieren se nombra la planta de cada tramo.
   */
  function rotuloCubre(filas, conPrefijo) {
    if (!filas.length) return '';
    const grupos = new Map();
    filas.forEach((f) => {
      const k = f.offs.join(',');
      if (!grupos.has(k)) grupos.set(k, f.offs);
    });
    const dias = (offs) => offs.map((o) => D.fechaCorta(D.sumarDias(ui.fecha, o))).join(', ');
    if (grupos.size === 1) {
      const offs = [...grupos.values()][0];
      return (conPrefijo ? `Cubre ${offs.length} día${offs.length > 1 ? 's' : ''}: ` : '') + esc(dias(offs));
    }
    /* Varios tramos: se nombra la planta cuyo propio calendario da cada uno,
       que es lo que explica la diferencia. */
    const nombre = (id) => (D.PLANTAS.find((x) => x.id === id) || {}).nombre || id;
    return [...grupos.values()].map((offs) => {
      const k = offs.join(',');
      const suyas = D.PLANTAS
        .filter((x) => C.offsetsACubrir(D.estado.params, ui.fecha, null, [x.id]).join(',') === k)
        .map((x) => nombre(x.id));
      return `<b>${esc(suyas.length ? suyas.join(' y ') : offs.length + ' días')}</b> ${esc(dias(offs))}`;
    }).join(' · ');
  }

  /* Lo decidido dentro de un área: sólo los turnos de esa tarjeta. Una clave
     que se hace en las dos plantas sale en las dos, y cada una muestra lo
     suyo en vez de repetir el total. */
  function decididoEn(f, ids) {
    if (!ids) return f.decididoQQ;
    return C.redondea(ids.reduce((a, t) => a + (Number(f.asign[t]) || 0), 0), 2);
  }

  function filaProd(f, turnos, ids) {
    const cfg = D.estado.params.prod[f.clave];
    const cob = f.cobertura;
    const cobCls = cob == null ? '' : (cob < 1 ? 'baja' : (cob > f.cobMax ? 'alta' : ''));
    const chip = { OK: 'ok', FALTANTE: 'falta', EXCESO: 'exceso', 'TOPE VIDA UTIL': 'vida',
      'MENOS DE UN LOTE': 'vida', 'SIN VENTA': 'nada', 'PEDIDO EN RIESGO': 'falta' }[f.alerta] || 'nada';
    const chipPed = f.pedidoBolsas > 0 && f.alerta !== 'PEDIDO EN RIESGO'
      ? '<span class="chip ped" style="margin-left:5px">PEDIDO</span>' : '';
    const inputs = turnos.map((x) => {
      const puede = D.puedeEnTurno(f.clave, x.id);
      const v = f.asign[x.id];
      return `<td><input class="inqq ${puede ? '' : 'na'} ${v ? 'puesto' : ''}" inputmode="decimal"
        ${puede ? '' : 'disabled tabindex="-1"'} data-clave="${esc(f.clave)}" data-turno="${x.id}"
        value="${v ? n2(v) : ''}" aria-label="${esc(f.clave)} en ${esc(x.nombre)}"></td>`;
    }).join('');
    const abierta = ui.abierta === f.clave;
    const det = abierta ? `<tr class="detalle"><td colspan="${8 + turnos.length}">${explicacion(f)}</td></tr>` : '';
    const dec = decididoEn(f, ids);
    /* Si la clave se hace en más de una planta, la tarjeta muestra su parte;
       el total de la clave queda a la vista para no perderlo. */
    const otras = ids && f.decididoQQ - dec > 1e-9
      ? `<span class="mini">${n2(f.decididoQQ)} en total</span>` : '';
    return `<tr data-fila="${esc(f.clave)}">
      <td class="l clave"><button type="button" class="verDet" data-clave="${esc(f.clave)}"
          style="background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:0;text-align:left">
          ${esc(f.clave)} <span style="color:var(--muted);font-weight:400">${abierta ? '▾' : '▸'}</span>
          <span class="mini">${n0(f.rend)} bolsas/qq</span></button></td>
      <td class="num">${n0(f.disponible)}</td>
      <td class="num">${n0(f.teoricoHoy)}</td>
      <td class="num sug ${f.sugeridoQQ ? '' : 'cero'}">${f.sugeridoQQ ? n2(f.sugeridoQQ) : '—'}</td>
      ${inputs}
      <td class="num"><b>${dec ? n2(dec) : '—'}</b>${otras}</td>
      <td class="num bolsas">${dec ? n0(dec * f.rend) : '—'}</td>
      <td class="num ${f.teoricoManana < 0 ? 'neg' : ''}">${n0(f.teoricoManana)}</td>
      <td class="num cob ${cobCls}">${cob == null ? '—' : n1(cob) + ' d'}</td>
      <td class="l"><span class="chip ${chip}">${esc(f.alerta)}</span>${chipPed}</td>
    </tr>${det}`;
  }

  /** Explica en palabras de dónde sale el sugerido de esa clave. */
  function explicacion(f) {
    const p = C.politica(D.estado.params, f.clave);
    const dias = f.ventas.map((v, i) => `${D.fechaCorta(D.sumarDias(ui.fecha, f.offs[i]))}: ${n0(v)}`).join(' · ');
    const li = (t, v, cls = '') => `<li><span>${t}</span><span class="v ${cls}">${v}</span></li>`;
    const falta = f.teoricoManana < 0;
    return `<div class="expl">
      <div>
        <h4>POR QUÉ ESTE SUGERIDO</h4>
        <p>Hoy cierras con <b>${n0(f.teoricoHoy)}</b> bolsas: ${n0(f.stockAyer)} del cierre
        ${f.fechaStock ? 'del ' + esc(D.fechaCorta(f.fechaStock)) : 'anterior'} más
        ${n2(f.prodAyerQQ)} qq producidos ese día (${n0(f.prodAyerB)} bolsas)${f.yaContado ? ', que no se suman porque ese conteo ya los trae' : ''},
        menos ${n0(f.ventaHoy)} que se venden hoy.</p>
        <p>Hay que llegar hasta la próxima corrida, o sea <b>${f.nDias} día${f.nDias > 1 ? 's' : ''}</b> de venta
        (${dias}), más <b>${p.colchon}</b> de colchón. En total el objetivo es cubrir
        <b>${f.objetivoDias} días</b>.</p>
        <p>${f.sugeridoQQ > 0
            ? `Faltan ${n0(Math.max(0, Math.min(f.necesidad, f.topeVida)))} bolsas, que a ${n0(f.rend)} bolsas por quintal y en múltiplos de ${n2(f.mult)} qq dan <b>${n2(f.sugeridoQQ)} qq</b>.`
            : (f.bajoLote
                ? `Faltan ${n0(f.necesidad)} bolsas, pero el lote más chico es ${n2(f.mult)} qq (${n0(f.mult * f.rend)} bolsas) y se pasaría de largo. Si aun así quieres hacerlo, escríbelo a mano.`
                : (f.necesidad <= 0 ? 'Con lo que ya hay alcanza, por eso no sugiere producir.'
                                    : 'El tope de vida útil no deja producir más por ahora.'))}</p>
        ${f.pedidos.length ? `<p><b>Pedidos especiales incluidos:</b> ${f.pedidos.map((p) =>
            `${n0(p.bolsas)} b para ${esc(p.cliente || 'sin cliente')}, entrega ${esc(D.fechaCorta(p.fecha))}`).join(' · ')}.
            Se producen con ${f.anticipacion} día${f.anticipacion === 1 ? '' : 's'} de anticipación.</p>` : ''}
        ${f.faltaPedido > 0 ? `<p class="neg"><b>Ojo:</b> faltan ${n0(f.faltaPedido)} bolsas para cubrir el pedido.</p>` : ''}
        ${falta ? `<p class="neg"><b>Ojo:</b> con lo decidido, mañana cierras en ${n0(f.teoricoManana)} bolsas.</p>` : ''}
      </div>
      <div>
        <h4>EL CÁLCULO PASO A PASO</h4>
        <ul class="pasos">
          ${li('Stock de ayer', n0(f.stockAyer) + ' b')}
          ${li('Producción de ayer', n2(f.prodAyerQQ) + ' qq = ' + n0(f.prodAyerB) + ' b')}
          ${li('Venta de hoy', '− ' + n0(f.ventaHoy) + ' b')}
          ${li('<b>Teórico PM hoy</b>', '<b>' + n0(f.teoricoHoy) + ' b</b>', '')}
          ${li(`Demanda de ${f.nDias} día${f.nDias > 1 ? 's' : ''}`, n0(f.demanda) + ' b')}
          ${f.pedidoBolsas > 0 ? li('De eso, pedidos especiales', '<b>' + n0(f.pedidoBolsas) + ' b</b>') : ''}
          ${li(`Stock de seguridad (${p.colchon} d)`, n0(f.seguridad) + ' b')}
          ${li('Necesidad', n0(f.necesidad) + ' b')}
          ${li(`Tope por vida útil (${p.cobMax} d)`, n0(f.topeVida) + ' b')}
          ${li('<b>Sugerido</b>', '<b>' + n2(f.sugeridoQQ) + ' qq</b>', '')}
          ${li('Decidido', n2(f.decididoQQ) + ' qq', '')}
          ${li('<b>Teórico PM mañana</b>', `<b class="${f.teoricoManana < 0 ? 'neg' : ''}">${n0(f.teoricoManana)} b</b>`)}
          ${li('Cobertura resultante', f.cobertura == null ? '—' : n1(f.cobertura) + ' días')}
        </ul>
        <p class="dim" style="font-size:.82rem;margin-top:8px">
          Vida útil ${p.vidaUtil} días, con ${p.minDespacho} de mínimo al despachar.</p>
      </div></div>`;
  }

  // ================= INVENTARIO =================
  /* Para calcular el miércoles se parte del cierre del martes más lo que se
     produjo el martes, y se le resta la venta promedio del miércoles. */
  function pintarInventario() {
    const r = reg(), t = calc(), P = D.estado.params;
    const ctx = t.ctx;
    const dStock = ctx.fStock ? D.fechaCorta(ctx.fStock) : 'sin día previo';
    const dProd = ctx.fProd ? D.fechaCorta(ctx.fProd) : 'sin día previo';
    const dHoy = D.fechaCorta(ui.fecha);

    $('#invTit').innerHTML = `Inventario para producir el <b>${esc(dHoy)}</b>`;
    $('#theadInv').innerHTML = `<tr>
      <th class="l">Clave</th>
      <th>STOCK AYER<span class="sub2">${esc(dStock)}</span></th>
      <th>PROD AYER qq<span class="sub2">${esc(dProd)}</span></th>
      <th>BOLSAS<span class="sub2">qq × rendimiento</span></th>
      <th>CONSUMO HOY<span class="sub2">promedio ${esc(D.nombreDia(ui.fecha).toLowerCase())}</span></th>
      <th>TEÓRICO PM<span class="sub2">stock + bolsas − consumo</span></th>
      <th>INV PM<span class="sub2">${esc(dHoy)}</span></th>
      <th>DIFERENCIA<span class="sub2">teórico − inv</span></th></tr>`;

    $('#tbodyInv').innerHTML = t.filas.map((f) => {
      const dif = f.difVenta;
      const difTxt = dif == null ? '' : (dif > 0 ? '+' : '') + n0(dif);
      const difCls = dif == null ? 'dim' : (Math.abs(dif) > f.rend ? 'neg' : 'dim');
      const difTit = dif == null ? '' : (dif > 0 ? 'vendió más que el promedio' : (dif < 0 ? 'vendió menos que el promedio' : 'igual al promedio'));
      return `<tr>
        <td class="l clave">${esc(f.clave)}${f.yaContado ? '<span class="mini">prod. ya contada</span>' : ''}</td>
        <td><input class="inqq ${f.stockEsAuto ? 'auto' : ''}" style="width:98px" inputmode="numeric"
            data-stock="${esc(f.clave)}" value="${r.stockAyer[f.clave] == null ? '' : r.stockAyer[f.clave]}"
            placeholder="${f.stockAyer ? n0(f.stockAyer) : '0'}" aria-label="Stock de ayer ${esc(f.clave)}"></td>
        <td><input class="inqq ${f.prodEsAuto ? 'auto' : ''}" inputmode="decimal"
            data-prodayer="${esc(f.clave)}" value="${r.prodAyer[f.clave] == null ? '' : r.prodAyer[f.clave]}"
            placeholder="${f.prodAyerQQ ? n2(f.prodAyerQQ) : '0'}" aria-label="Producción de ayer ${esc(f.clave)}"></td>
        <td class="num ${f.yaContado ? 'tach' : 'dim'}" title="${f.yaContado ? 'No se suma: ese conteo ya la trae adentro' : ''}">${n0(f.prodAyerBruto)}</td>
        <td class="num ${f.pedidoHoy > 0 ? 'conped' : 'dim'}" title="${f.pedidoHoy > 0
          ? 'Incluye ' + n0(f.pedidoHoy) + ' bolsas de pedidos especiales' : ''}">${n0(f.ventaHoy)}${f.pedidoHoy > 0 ? ' *' : ''}</td>
        <td class="num"><b>${n0(f.teoricoHoy)}</b></td>
        <td><input class="inqq" style="width:98px" inputmode="numeric" data-invpm="${esc(f.clave)}"
            value="${f.invPM == null ? '' : f.invPM}" aria-label="INV PM ${esc(f.clave)}"></td>
        <td class="num ${difCls}" title="${esc(difTit)}">${difTxt}</td>
      </tr>`;
    }).join('');

    // --- avisos ---
    const av = [];
    const sinStock = t.filas.filter((f) => !f.stockAyer).length;
    const sinInv = t.filas.filter((f) => f.invPM == null).length;
    if (!ctx.fStock) av.push(['warn', 'No hay un día anterior guardado',
      'El STOCK AYER sale en blanco. Escríbelo a mano o guarda primero el día anterior.']);
    else if (sinStock) av.push(['warn', `${sinStock} claves sin stock de ayer`,
      `Se toman como cero. El dato viene del INV PM del ${dStock}.`]);
    const pedHoy = t.filas.filter((f) => f.pedidoHoy > 0);
    if (pedHoy.length) {
      const cortos = pedHoy.filter((f) => f.teoricoHoy <= 0);
      av.push([cortos.length ? 'warn' : '', `El consumo de hoy trae ${n0(pedHoy.reduce((a, f) => a + f.pedidoHoy, 0))} bolsas de pedidos especiales`,
        pedHoy.map((f) => `${f.clave} ${n0(f.pedidoHoy)} b`).join(' · ')
        + (cortos.length ? `. En ${cortos.map((f) => f.clave).join(', ')} el teórico PM queda en cero: puede no alcanzar.` : '. Van marcadas con * en CONSUMO HOY.')]);
    }
    if (sinInv === t.filas.length) av.push(['', 'Falta el INV PM de hoy',
      'Es el conteo del cierre. Léelo de la foto o impórtalo; sirve para medir la venta real contra el promedio.']);
    $('#avisosInv').innerHTML = av.map(([c, h, p2]) => `<div class="aviso ${c}"><h4>${esc(h)}</h4><p>${esc(p2)}</p></div>`).join('');

    $('#pistaInv').innerHTML = 'Los números en gris de <b>STOCK AYER</b> y <b>PROD AYER</b> se toman solos del día anterior. '
      + 'Si escribes encima, ese valor manda y queda en blanco sobre el fondo.';
    pintarDiferenciados(r, P);
  }

  /** Las claves que se arman sumando varias presentaciones de la hoja. */
  function pintarDiferenciados(r, P) {
    const dif = (P.diferenciados || []).filter((d) => d.activo !== false);
    if (!dif.length) { $('#difCont').innerHTML = ''; return; }
    const { detalle } = D.aplicarDiferenciados(P, r.crudo || {});
    const hayFoto = Object.keys(r.crudo || {}).length > 0;

    const filas = detalle.map((d) => {
      const partes = d.partes.map((p) => {
        const f = p.div !== 1 ? `${p.clave}×${n2(p.mult)}/${p.div}` : (p.mult !== 1 ? `${p.clave}×${n2(p.mult)}` : p.clave);
        const v = p.crudo == null ? '—' : n0(p.crudo);
        return `<span class="parte"><b>${esc(f)}</b><i>${v}</i><em>${p.aporte == null ? '' : n1(p.aporte)}</em></span>`;
      }).join('');
      return `<tr>
        <td class="l clave">${esc(d.destino)}</td>
        <td class="l">${partes}</td>
        <td class="num"><b>${d.total == null ? '—' : n0(d.total)}</b></td></tr>`;
    }).join('');

    $('#difCont').innerHTML = `<div class="card" style="margin-top:14px;padding:0;overflow:hidden">
      <div style="padding:12px 16px">
        <h3 style="margin:0 0 4px">Productos diferenciados</h3>
        <p class="sub" style="margin:0">
          Presentaciones distintas del mismo producto. El INV PM de estas claves sale de sumar sus partes
          tal como vienen en la hoja; el total se aproxima al entero de abajo.
          ${hayFoto ? '' : 'Se llenan al leer la foto o al importar el Excel del inventario.'}
        </p>
      </div>
      <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0">
        <table><thead><tr><th class="l">Clave</th><th class="l">Partes · valor · aporte</th><th>Total INV PM</th></tr></thead>
        <tbody>${filas}</tbody></table></div></div>`;
  }

  /** Mete en el día lo que vino de la foto o del Excel del inventario. */
  function aplicarCrudo(crudo, fecha) {
    const r = D.registro(fecha);
    r.crudo = { ...(r.crudo || {}), ...crudo };
    const { inv } = D.aplicarDiferenciados(D.estado.params, r.crudo);
    let n = 0;
    Object.entries(inv).forEach(([c, v]) => { if (c in r.invPM) { r.invPM[c] = v; n++; } });
    D.guardarDias();
    return n;
  }

  // ================= PROMEDIOS =================
  function pintarPromedios() {
    $('#theadProm').innerHTML = `<tr><th class="l">Clave</th>${D.DIAS.map((d) => `<th>${d.slice(0, 3)}</th>`).join('')}<th>Semana</th></tr>`;
    $('#tbodyProm').innerHTML = D.productos().map((p) => {
      const fila = D.estado.prom[p.clave] || [0, 0, 0, 0, 0, 0, 0];
      const tot = fila.reduce((a, b) => a + (Number(b) || 0), 0);
      return `<tr><td class="l clave">${esc(p.clave)}</td>
        ${D.DIAS.map((d, i) => `<td><input class="inqq" style="width:82px" inputmode="numeric"
          data-prom="${esc(p.clave)}" data-dia="${i}" value="${fila[i] ?? 0}" aria-label="${esc(p.clave)} ${d}"></td>`).join('')}
        <td class="num dim">${n0(tot)}</td></tr>`;
    }).join('');
  }

  // ================= PEDIDOS ESPECIALES =================
  const ETIQ_PED = {
    pendiente: { txt: 'Pendiente', chip: 'ok' },
    hoy: { txt: 'Se produce hoy', chip: 'vida' },
    vencido: { txt: 'Vencido', chip: 'falta' },
    entregado: { txt: 'Entregado', chip: 'nada' },
    cancelado: { txt: 'Cancelado', chip: 'nada' },
  };

  /** Si hoy es el último día para producir ese pedido. */
  function tocaHoy(p) {
    if (D.estadoPedido(p) !== 'pendiente') return false;
    const ant = C.anticipacionDe(D.estado.params, p.clave);
    const plantas = C.plantasDe(D.estado.params, p.clave);
    const limite = D.sumarDias(p.fecha, -ant);
    return limite <= ui.fecha || limite < C.proximaCorrida(D.estado.params, ui.fecha, plantas);
  }

  function pintarPedidos() {
    const lista = D.pedidosLista();
    $('#pdClave').innerHTML = D.activos().map((p) =>
      `<option value="${esc(p.clave)}">${esc(p.clave)}</option>`).join('');
    $('#pdClientes').innerHTML = D.clientes().map((c) => `<option value="${esc(c)}">`).join('');
    if (!$('#pdFecha').value) $('#pdFecha').value = D.sumarDias(D.hoyISO(), 1);
    $('#pdPista').textContent = 'La fecha y el cliente se quedan puestos para seguir agregando claves del mismo pedido.';

    const porEstado = { pendiente: 0, vencido: 0, entregado: 0, cancelado: 0 };
    lista.forEach((p) => { porEstado[D.estadoPedido(p)]++; });
    const vivos = D.pedidosVivos();
    const bolsasVivas = vivos.reduce((a, p) => a + (Number(p.bolsas) || 0), 0);
    const hoyToca = vivos.filter(tocaHoy);
    $('#kpisPed').innerHTML =
      kpi('Pedidos pendientes', porEstado.pendiente) +
      kpi('Bolsas comprometidas', n0(bolsasVivas)) +
      kpi(`Para producir el ${D.fechaCorta(ui.fecha)}`, hoyToca.length, hoyToca.length ? 'alerta' : '') +
      kpi('Vencidos sin cerrar', porEstado.vencido, porEstado.vencido ? 'alerta' : 'bien');

    const av = [];
    if (porEstado.vencido) av.push(['warn',
      porEstado.vencido === 1 ? 'Hay un pedido vencido sin cerrar' : `${porEstado.vencido} pedidos vencidos sin cerrar`,
      'Ya pasó su fecha de entrega y dejaron de contar para el cálculo. Márcalos entregados o cancélalos para que no estorben.']);
    if (hoyToca.length) av.push(['', `${hoyToca.length} pedido${hoyToca.length === 1 ? '' : 's'} hay que producirlo${hoyToca.length === 1 ? '' : 's'} el ${D.fechaCorta(ui.fecha)}`,
      hoyToca.map((p) => `${p.clave} ${n0(p.bolsas)} b para ${p.cliente || 'sin cliente'} (${D.fechaCorta(p.fecha)})`).join(' · ')]);
    $('#avisosPed').innerHTML = av.map(([c, h, t]) => `<div class="aviso ${c}"><h4>${esc(h)}</h4><p>${esc(t)}</p></div>`).join('');

    $('#pedFiltros').innerHTML = [['vivos', 'Pendientes'], ['todos', 'Todos'], ['cerrados', 'Cerrados']]
      .map(([id, t]) => `<button class="btn ${ui.filtroPed === id ? '' : 'sec'} mini" type="button" data-fped="${id}">${t}</button>`).join('');

    const visibles = lista.filter((p) => {
      const e = D.estadoPedido(p);
      if (ui.filtroPed === 'vivos') return e === 'pendiente' || e === 'vencido';
      if (ui.filtroPed === 'cerrados') return e === 'entregado' || e === 'cancelado';
      return true;
    });

    $('#theadPed').innerHTML = `<tr>
      <th class="l">Día entrega</th><th class="l">Cliente</th><th class="l">Clave</th>
      <th>Bolsas</th><th>qq</th><th class="l">Producir antes de</th><th class="l">Estado</th><th class="l"></th></tr>`;

    if (!visibles.length) {
      $('#tbodyPed').innerHTML = `<tr><td colspan="8" class="l dim" style="padding:18px">`
        + (lista.length ? 'No hay pedidos con ese filtro.' : 'Todavía no hay pedidos. Agrega el primero arriba.')
        + '</td></tr>';
      return;
    }

    $('#tbodyPed').innerHTML = visibles.map((p) => {
      const e = D.estadoPedido(p);
      const ficha = D.fichaPorClave(p.clave) || {};
      const qq = ficha.rend ? p.bolsas / ficha.rend : null;
      const ant = C.anticipacionDe(D.estado.params, p.clave);
      const limite = D.sumarDias(p.fecha, -ant);
      const et = ETIQ_PED[e === 'pendiente' && tocaHoy(p) ? 'hoy' : e];
      return `<tr class="${e === 'vencido' ? 'ojo' : ''}">
        <td class="l clave">${esc(D.fechaCorta(p.fecha))}</td>
        <td class="l">${esc(p.cliente || '—')}</td>
        <td class="l clave">${esc(ficha.alias || p.clave)}</td>
        <td><input class="inqq" style="width:96px" inputmode="numeric" data-pedb="${esc(p.id)}"
            value="${p.bolsas}" aria-label="Bolsas de ${esc(p.clave)}"></td>
        <td class="num dim">${qq == null ? '' : n2(qq)}</td>
        <td class="l dim">${esc(D.fechaCorta(limite))}${ant ? ` <span class="mini2">${ant} d antes</span>` : ''}</td>
        <td class="l"><span class="chip ${et.chip}">${esc(et.txt)}</span></td>
        <td class="l acc">
          ${e === 'pendiente' || e === 'vencido'
            ? `<button class="btn sec mini" type="button" data-pedent="${esc(p.id)}">Entregado</button>`
            : `<button class="btn sec mini" type="button" data-pedreab="${esc(p.id)}">Reabrir</button>`}
          <button class="btn sec mini" type="button" data-pedborrar="${esc(p.id)}" aria-label="Borrar">×</button></td>
      </tr>`;
    }).join('');
  }

  // ================= IMPRESIÓN BOLSA =================
  /* La fecha de esta pestaña sigue a la de Producción: es la misma jornada.
     Se puede mover aparte para revisar un día viejo sin perder el de trabajo. */
  function pintarBolsa() {
    const B = window.Bolsa;
    const fecha = ui.fechaBolsa || ui.fecha;
    ui.fechaBolsa = fecha;
    const b = D.estado.bolsa[fecha] || {};
    $('#inFechaBolsa').value = fecha;
    $('#inHd7z2').value = b.hd7z2 || '';
    $('#inMu1').value = b.mu1 || '';

    const fs = B.enTotal(B.calcular(fecha));
    const t = B.totales(fs);
    const dAM = D.fechaCorta(fecha);
    const dPM = D.fechaCorta(D.sumarDias(fecha, 1));

    $('#theadBolsa').innerHTML = `<tr>
      ${th2('P PROD', '')}${th2('ITEM', '', 'l')}${th2('RENDIM', 'bolsas/qq')}
      ${th2('QQ AM Z18', dAM)}${th2('QQ PM Z18', dAM)}${th2('QQ PM Z2', dAM)}${th2('QQ AM Z2', dAM)}
      ${th2('PROD AM', dAM)}${th2('PROD PM', dAM)}${th2('OH', 'ya impreso')}
      ${th2('EMPAQUE AM', dPM)}${th2('EMPAQUE PM', dAM)}${th2('TOTAL PROD', '')}</tr>`;

    const celQQ = (f, k) => `<td class="num dim">${f.qq[k] ? n2(f.qq[k]) : ''}</td>`;
    $('#tbodyBolsa').innerHTML = fs.map((f) => {
      const calc = f.tipo === 'clave' || f.tipo === 'suma';
      const cls = [f.tipo === 'suma' ? 'suma' : (calc ? '' : 'aparte'),
        f.cuenta === false ? 'nocuenta' : ''].filter(Boolean).join(' ');
      const pie = f.nota ? f.nota : (f.cuenta === false ? 'va en la fila 2 + 18' : '');
      return `<tr${cls ? ` class="${cls}"` : ''}>
        <td class="num dim">${esc(f.pprod)}</td>
        <td class="l clave">${esc(f.nombre)}${pie ? `<span class="mini">${esc(pie)}</span>` : ''}</td>
        <td class="num dim">${f.rend ? n0(f.rend) : ''}</td>
        ${calc ? celQQ(f, 'amZ18') + celQQ(f, 'pmZ18') + celQQ(f, 'pmZ2') : '<td></td><td></td><td></td>'}
        <td>${calc && !f.sinMano ? `<input class="inqq ${f.amZ2Manual ? 'puesto' : ''}" inputmode="decimal"
          enterkeyhint="next" data-bcampo="qqAmZ2" data-bid="${esc(f.id)}"
          value="${f.amZ2Manual ? n2(f.qq.amZ2) : ''}"
          aria-label="QQ AM Z2 de ${esc(f.nombre)}">${f.plan && !f.amZ2Manual
            ? `<button type="button" class="plan" data-bplan="${esc(f.id)}" data-bval="${f.plan}"
                title="Lo que el reparto puso en Zona 2 ese día. Tócalo para copiarlo.">${n2(f.plan)}</button>`
            : ''}` : (calc ? `<span class="num dim">${f.qq.amZ2 ? n2(f.qq.amZ2) : ''}</span>` : '')}</td>
        <td class="num">${f.prodAM ? n0(f.prodAM) : ''}</td>
        <td class="num">${f.prodPM ? n0(f.prodPM) : ''}</td>
        <td><input class="inqq" inputmode="decimal" enterkeyhint="next"
          data-bcampo="oh" data-bid="${esc(f.id)}" value="${f.oh || ''}"
          aria-label="OH de ${esc(f.nombre)}"></td>
        <td class="num bolsas">${f.empAM ? n0(f.empAM) : ''}</td>
        <td class="num bolsas">${f.empPM ? n0(f.empPM) : ''}</td>
        <td>${f.manual
          ? `<input class="inqq" inputmode="decimal" enterkeyhint="next"
              data-bcampo="manual" data-bid="${esc(f.id)}" value="${f.total || ''}"
              aria-label="Total de ${esc(f.nombre)}">`
          : `<b class="num">${f.total ? n0(f.total) : ''}</b>`}</td>
      </tr>`;
    }).join('');

    $('#tfootBolsa').innerHTML = `<tr>
      <td></td><td class="l">TOTAL</td><td></td><td></td><td></td><td></td><td></td>
      <td class="num"><b>${n0(t.prodAM)}</b></td><td class="num"><b>${n0(t.prodPM)}</b></td><td></td>
      <td class="num"><b>${n0(t.empAM)}</b></td><td class="num"><b>${n0(t.empPM)}</b></td>
      <td class="num"><b>${n0(t.total)}</b></td></tr>`;

    $('#kpisBolsa').innerHTML =
      kpi('Bolsas a imprimir', n0(t.total)) +
      kpi(`Empaque AM · ${dPM}`, n0(t.empAM)) +
      kpi(`Empaque PM · ${dAM}`, n0(t.empPM)) +
      kpi('Claves con bolsa', fs.filter((f) => f.total > 0).length);

    const av = [];
    const sinQQ = fs.filter((f) => (f.tipo === 'clave' || f.tipo === 'suma')
      && !f.qq.amZ18 && !f.qq.pmZ18 && !f.qq.amZ2 && !f.qq.pmZ2).length;
    if (sinQQ === fs.filter((f) => f.tipo === 'clave' || f.tipo === 'suma').length) {
      av.push(['warn', 'Todavía no hay reparto de ese día',
        'Los quintales salen de la pestaña Producción. Reparte ahí y esta tabla se llena sola.']);
    }
    av.push(['', 'El empaque va cruzado a propósito',
      `EMPAQUE AM sale de PROD PM y EMPAQUE PM de PROD AM: la bolsa que se imprime en la `
      + `mañana del ${dPM} lleva el pan hecho la tarde del ${dAM}.`]);
    $('#avisosBolsa').innerHTML = av.map(([c, h, p]) =>
      `<div class="aviso ${c}"><h4>${esc(h)}</h4><p>${esc(p)}</p></div>`).join('');
  }

  // ================= CÁLCULOS SECUNDARIOS =================
  function pintarSecundarios() {
    const S = window.Secundarios;
    const datos = S.leer();
    const partes = [];

    S.TABLAS.forEach((t0) => {
      const t = S.resolver(t0, datos);
      const th = t.cols.map((c) => `<th class="${c.ancho || ''}">${esc(c.t)}</th>`).join('');
      const tb = t.filas.map((f) => `<tr>${t.cols.map((c) => {
        if (c.k === 'clave') {
          return `<td class="l clave">${esc(f.clave)}${f.espejo
            ? '<span class="mini">viene de arriba</span>' : ''}</td>`;
        }
        if (c.entra) {
          return `<td><input class="inqq${f.espejo ? ' espejo' : ''}" inputmode="decimal" enterkeyhint="next"
            data-st="${t.id}" data-sf="${esc(f.id)}" data-sc="${c.k}"
            value="${esc(f.v[c.k])}" aria-label="${esc(c.t)} de ${esc(f.clave)}"></td>`;
        }
        const v = f.calc[c.k];
        return `<td class="num ${c.fuerte ? '' : 'dim'}">${v ? (c.fuerte ? `<b>${n2(v)}</b>` : n2(v)) : ''}</td>`;
      }).join('')}</tr>`).join('');
      const pies = t.pies.map((p) => `<tr><td class="l">${esc(p.t)}</td>
        ${t.cols.slice(1, -1).map(() => '<td></td>').join('')}
        <td class="num"><b>${n2(p.valor)}</b></td></tr>`).join('');
      partes.push(tarjetaSec(t.nombre, t.nota,
        `<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody>
         <tfoot>${pies}</tfoot></table>`));
    });

    // --- BELCA ---
    const belca = S.calcBelca(datos.belca || {});
    const filasB = belca.map((f) => `<tr>
      <td class="l clave">${esc(f.clave)}<span class="mini">${f.cliente} por parrilla al cliente · ${f.bodega} en bodega</span></td>
      <td><input class="inqq" inputmode="decimal" enterkeyhint="next" data-sb="${f.id}" data-sc="parr"
        value="${esc((datos.belca || {})[f.id] ? ((datos.belca[f.id] || {}).parr ?? '') : '')}" aria-label="Parrillas listas ${esc(f.clave)}"></td>
      <td><input class="inqq" inputmode="decimal" enterkeyhint="next" data-sb="${f.id}" data-sc="bolsas"
        value="${esc((datos.belca || {})[f.id] ? ((datos.belca[f.id] || {}).bolsas ?? '') : '')}" aria-label="Bolsas sueltas ${esc(f.clave)}"></td>
      <td class="num dim">${f.listo ? n2(f.listo) : ''}</td>
      <td><input class="inqq" inputmode="decimal" enterkeyhint="next" data-sb="${f.id}" data-sc="oc"
        value="${esc((datos.belca || {})[f.id] ? ((datos.belca[f.id] || {}).oc ?? '') : '')}" aria-label="Pedido ${esc(f.clave)}"></td>
      <td class="num ${f.falta ? 'neg' : ''}"><b>${f.falta ? n2(f.falta) : '—'}</b></td>
      <td class="num dim">${f.falta ? `${n2(f.parrFalta)} + ${n2(f.sueltasFalta)}` : ''}</td>
      <td class="num"><b>${f.pedir ? n2(f.pedir) : '—'}</b></td></tr>`).join('');
    partes.push(tarjetaSec('BELCA', 'Lo preparado se cuenta en parrillas del cliente; lo que falta se'
      + ' convierte a parrillas de bodega, que son las que hay que bajar.',
      `<table><thead><tr>
        <th class="l">Clave</th>${th2('Parrillas', 'listas')}${th2('Bolsas', 'sueltas')}
        ${th2('Preparado', 'bolsas')}${th2('Pedido', 'bolsas')}${th2('Falta', 'bolsas')}
        ${th2('Falta', 'parr + sueltas')}${th2('Bajar', 'parrillas')}
      </tr></thead><tbody>${filasB}</tbody></table>`));

    // --- CZ3 / CZ5 ---
    const cz = S.calcCz(datos.cz || {}, ui.fecha);
    const inCz = (k, lbl) => `<input class="inqq" inputmode="decimal" enterkeyhint="next"
      data-scz="${k}" value="${esc((datos.cz || {})[k] ?? '')}" aria-label="${esc(lbl)}">`;
    const lineas = [
      ['20CZ3', inCz('parr20', 'Parrillas de 20CZ3'), 'parrillas', `${n2(cz.b20)} bolsas`, ''],
      ['CZ3 perchas (OH)', inCz('ohBolsas', 'Bolsas OH'), 'bolsas', `${n2(cz.ohParr)} parrillas`, ''],
      [`Producción PM${cz.turnoPM ? ` · ${cz.turnoPM}` : ''}`, inCz('prodQQ', 'Quintales producidos PM'), 'qq',
        `${n2(cz.prodBolsas)} perchas`,
        cz.manual ? 'escrito a mano' : (cz.prodQQauto ? `del reparto: ${n2(cz.prodQQauto)} qq` : 'sin reparto ese día')],
      ['CZ5', inCz('cz5Bolsas', 'Perchas de CZ5'), 'perchas', `${n2(cz.cz5Parr)} parrillas`, ''],
      ['Empacar', inCz('empacar', 'A empacar'), 'perchas', '', ''],
    ];
    partes.push(tarjetaSec('CZ3 / CZ5 (0134)',
      `Una percha son ${S.PERCHA} parrillas; un quintal de CZ3 da ${n0(cz.rend)} bolsas y `
      + `${S.CZ3_POR_PERCHA} bolsas hacen una percha.`,
      `<table><thead><tr><th class="l">Fila</th><th>Se escribe</th><th class="l">Unidad</th>
        <th class="l">Equivale a</th><th class="l">De dónde</th></tr></thead><tbody>
        ${lineas.map(([n, inp, u, eq, de]) => `<tr>
          <td class="l clave">${esc(n)}</td><td>${inp}</td><td class="l dim">${esc(u)}</td>
          <td class="l dim">${esc(eq)}</td><td class="l dim">${esc(de)}</td></tr>`).join('')}
      </tbody></table>`,
      `<div class="kpis" style="margin:0;padding:12px 14px 14px">
        ${kpi('Total perchas CZ3', n2(cz.total))}
        ${kpi('Quedan tras CZ5', n2(cz.quedan), cz.quedan < 0 ? 'alerta' : '')}
        ${kpi('Libres tras empacar', n2(cz.libres), cz.libres < 0 ? 'alerta' : 'bien')}
      </div>`));

    $('#secCont').innerHTML = partes.join('');
  }

  const tarjetaSec = (titulo, nota, tabla, extra) =>
    `<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
      <div style="padding:12px 16px">
        <h3 style="margin:0 0 3px;font-size:.95rem">${esc(titulo)}</h3>
        ${nota ? `<p class="sub" style="margin:0">${esc(nota)}</p>` : ''}
      </div>
      <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0;max-height:none">
        ${tabla}</div>${extra || ''}</div>`;

  // ================= HISTORIAL =================
  const VISTAS = [
    { id: 'turno',  nombre: 'Por turno' },
    { id: 'planta', nombre: 'Por planta' },
    { id: 'clave',  nombre: 'Por clave' },
    { id: 'inv',    nombre: 'Inventario INV PM' },
  ];

  function pintarHistorial() {
    const fechas = Object.keys(D.estado.dias).sort().reverse();
    $('#kpisHist').innerHTML =
      kpi('Días guardados', fechas.length) +
      kpi('Primer día', fechas.length ? D.fechaCorta(fechas[fechas.length - 1]) : '—') +
      kpi('Último día', fechas.length ? D.fechaCorta(fechas[0]) : '—');

    $('#histTablas').innerHTML = X.tablasHistorial({}).map((t) =>
      `<button class="btn sec mini" type="button" data-tabla="${t.id}">${esc(t.titulo)}</button>`).join('');

    if (!fechas.length) {
      $('#avisosHist').innerHTML = '<div class="aviso"><h4>Todavía no hay días guardados</h4>'
        + '<p>Al terminar un día, el botón <b>Guardar el día</b> lo deja aquí. '
        + 'Si ya tienes historial en Excel, súbelo con <b>Subir historial de Excel</b>.</p></div>';
      $('#histVista').innerHTML = ''; $('#theadHist').innerHTML = ''; $('#tbodyHist').innerHTML = '';
      return;
    }
    $('#avisosHist').innerHTML = '';
    $('#histVista').innerHTML = VISTAS.map((v) =>
      `<button class="btn ${ui.vistaHist === v.id ? '' : 'sec'} mini" type="button" data-vista="${v.id}">${esc(v.nombre)}</button>`).join('');

    const claves = D.claves();
    let th = '', tb = '';
    if (ui.vistaHist === 'turno') {
      th = `<tr><th class="l">Fecha</th><th class="l">Día</th>${D.TURNOS.map((t) => `<th>${esc(t.nombre)}</th>`).join('')}<th>Total qq</th><th class="l"></th></tr>`;
      tb = fechas.map((f) => {
        const pt = D.porTurnoDe(f);
        const tot = D.TURNOS.reduce((a, t) => a + (Number(pt[t.id]) || 0), 0);
        return `<tr><td class="l">${esc(D.fechaCorta(f))}</td><td class="l dim">${esc(D.nombreDia(f))}</td>
          ${D.TURNOS.map((t) => celda(pt[t.id])).join('')}
          <td class="num"><b>${n2(tot)}</b></td>${acciones(f)}</tr>`;
      }).join('');
    } else if (ui.vistaHist === 'planta') {
      th = `<tr><th class="l">Fecha</th><th class="l">Día</th>${D.PLANTAS.map((p) => `<th>${esc(p.nombre)}</th>`).join('')}<th>Total qq</th><th class="l"></th></tr>`;
      tb = fechas.map((f) => {
        const pp = D.porPlantaDe(f);
        const tot = D.PLANTAS.reduce((a, p) => a + (Number(pp[p.id]) || 0), 0);
        return `<tr><td class="l">${esc(D.fechaCorta(f))}</td><td class="l dim">${esc(D.nombreDia(f))}</td>
          ${D.PLANTAS.map((p) => celda(pp[p.id])).join('')}
          <td class="num"><b>${n2(tot)}</b></td>${acciones(f)}</tr>`;
      }).join('');
    } else if (ui.vistaHist === 'clave') {
      th = `<tr><th class="l">Fecha</th><th class="l">Día</th>${claves.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Total qq</th><th class="l"></th></tr>`;
      tb = fechas.map((f) => {
        const pc = D.produccionDe(f);
        const tot = claves.reduce((a, c) => a + (Number(pc[c]) || 0), 0);
        return `<tr><td class="l">${esc(D.fechaCorta(f))}</td><td class="l dim">${esc(D.nombreDia(f))}</td>
          ${claves.map((c) => celda(pc[c])).join('')}
          <td class="num"><b>${n2(tot)}</b></td>${acciones(f)}</tr>`;
      }).join('');
    } else {
      th = `<tr><th class="l">Fecha</th><th class="l">Día</th>${claves.map((c) => `<th>${esc(c)}</th>`).join('')}<th class="l"></th></tr>`;
      tb = fechas.map((f) => {
        const r = D.migrar(D.estado.dias[f]);
        return `<tr><td class="l">${esc(D.fechaCorta(f))}</td><td class="l dim">${esc(D.nombreDia(f))}</td>
          ${claves.map((c) => { const v = r.invPM[c]; return `<td class="num ${v == null ? 'dim' : ''}">${v == null ? '—' : n0(v)}</td>`; }).join('')}
          ${acciones(f)}</tr>`;
      }).join('');
    }
    $('#theadHist').innerHTML = th;
    $('#tbodyHist').innerHTML = tb;
  }

  const celda = (v) => `<td class="num ${v ? '' : 'dim'}">${v ? n2(v) : '—'}</td>`;
  const acciones = (f) => `<td class="l"><button class="btn sec mini" data-abrir="${f}">Abrir</button>`
    + `<button class="btn sec mini" data-borrar="${f}">Borrar</button></td>`;

  /** Descarga una sola tabla del historial. */
  async function exportarTabla(id) {
    const fechas = Object.keys(D.estado.dias);
    if (!fechas.length) { aviso('No hay días guardados.', 'err'); return; }
    espera(true, 'Armando el Excel…');
    try {
      const todas = X.tablasHistorial(D.estado.dias);
      const t = id === 'todo' ? null : todas.find((x) => x.id === id);
      const hojas = t ? [t] : todas;
      const { blob } = await X.escribirLibro(hojas, 'historial.xlsx');
      const hoy = D.hoyISO().replace(/-/g, '_');
      const r = await descargar(blob, t ? `${t.nombre.replace(/[^\w]+/g, '_')}_${hoy}.xlsx` : `Historial_Produccion_${hoy}.xlsx`, TIPO_XLSX);
      if (r.modo === 'cancelado') return;
      aviso((t ? `Exportado ${t.titulo}` : `Exportados ${fechas.length} días en ${hojas.length} tablas`) + donde(r) + '.');
    } catch (err) { aviso('No se pudo exportar: ' + err.message, 'err'); }
    finally { espera(false); }
  }

  // ================= AJUSTES =================
  function pintarParametros() {
    const P = D.estado.params;
    const cal = P.calendario.map((c, i) => `<tr>
      <td class="l clave">${esc(D.DIAS[i])}</td>
      ${D.PLANTAS.map((x) => `<td class="l"><label class="sw">
        <input type="checkbox" data-calp="${i}" data-pid="${x.id}" ${(c.plantas || {})[x.id] ? 'checked' : ''}>
        produce</label></td>`).join('')}
      <td><input class="inqq" inputmode="decimal" data-calf="${i}" value="${c.factor}" aria-label="Factor de ${D.DIAS[i]}"></td>
    </tr>`).join('');

    const turnos = D.TURNOS.map((t) => {
      const c = P.turnos[t.id];
      return `<tr><td class="l clave">${esc(t.nombre)}<span class="mini">${esc(t.papel)}</span></td>
        <td><select data-tpl="${t.id}" aria-label="Planta de ${t.nombre}">
          ${D.PLANTAS.map((x) => `<option value="${x.id}" ${D.plantaDeTurno(t.id) === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}
        </select></td>
        <td><input class="inqq" inputmode="decimal" data-tope="${t.id}" value="${c.tope}" aria-label="Tope ${t.nombre}"></td>
        <td><input class="inqq" inputmode="decimal" data-min="${t.id}" value="${c.minimo}" aria-label="Mínimo ${t.nombre}"></td>
        <td><label class="sw"><input type="checkbox" data-tact="${t.id}" ${c.activo !== false ? 'checked' : ''}> activo</label></td></tr>`;
    }).join('');

    const topePlanta = {};
    D.PLANTAS.forEach((x) => {
      topePlanta[x.id] = D.turnosDePlanta(x.id)
        .filter((t) => (P.turnos[t.id] || {}).activo !== false)
        .reduce((a, t) => a + (Number((P.turnos[t.id] || {}).tope) || 0), 0);
    });

    const familias = D.FAMILIAS.map((f) => {
      const c = P.familias[f.id];
      return `<tr><td class="l clave">${esc(f.nombre)}</td>
        <td><input class="inqq" inputmode="numeric" data-fvu="${f.id}" value="${c.vidaUtil}" aria-label="Vida útil ${f.nombre}"></td>
        <td><input class="inqq" inputmode="numeric" data-fmd="${f.id}" value="${c.minDespacho}" aria-label="Mínimo al despachar ${f.nombre}"></td>
        <td><input class="inqq" inputmode="decimal" data-fco="${f.id}" value="${c.colchon}" aria-label="Colchón ${f.nombre}"></td>
        <td><input class="inqq" inputmode="numeric" data-fant="${f.id}" value="${c.anticipacion ?? ''}"
            placeholder="${P.pedidos.anticipacion}" aria-label="Anticipación de pedidos ${f.nombre}"></td>
        <td class="num dim">${Math.max(1, c.vidaUtil - c.minDespacho)} d</td></tr>`;
    }).join('');

    const prods = D.productos().map((p) => {
      const c = P.prod[p.clave], pol = C.politica(P, p.clave);
      const chips = D.TURNOS.map((t) => `<label class="sw turnochip" title="${esc(t.nombre)} · ${esc(D.plantaDeTurno(t.id))}">
        <input type="checkbox" data-pt="${p.clave}" data-tid="${t.id}" ${(c.turnos || []).includes(t.id) ? 'checked' : ''}> ${esc(t.nombre)}</label>`).join('');
      const des = C.turnosUtiles(P, p.clave).desajuste;
      return `<tr${des ? ' class="ojo"' : ''}>
        <td class="l clave">${esc(p.clave)}${des ? '<span class="mini neg">sin turno en su planta</span>' : ''}</td>
        <td class="l pz">${D.PLANTAS.map((x) => `<label class="sw" title="${esc(x.nombre)}">
          <input type="checkbox" data-ppl="${p.clave}" data-plid="${x.id}"
            ${(c.plantas || {})[x.id] ? 'checked' : ''}> ${esc(x.id)}</label>`).join('')}</td>
        <td><input class="inqq" inputmode="decimal" data-prend="${p.clave}" value="${c.rend}" aria-label="Rendimiento ${p.clave}"></td>
        <td><input class="inqq" inputmode="decimal" step="0.01" data-pmult="${p.clave}" value="${c.mult}" aria-label="Múltiplo ${p.clave}"></td>
        <td><input class="inqq" inputmode="decimal" data-pcol="${p.clave}" value="${c.colchon ?? ''}" placeholder="${pol.colchon}" aria-label="Colchón ${p.clave}"></td>
        <td><input class="inqq" inputmode="numeric" data-pvu="${p.clave}" value="${c.vidaUtil ?? ''}" placeholder="${pol.vidaUtil}" aria-label="Vida útil ${p.clave}"></td>
        <td class="l chips">${chips}</td>
        <td><label class="sw"><input type="checkbox" data-pcon="${p.clave}" ${c.prodEnConteo ? 'checked' : ''}></label></td>
        <td><label class="sw"><input type="checkbox" data-pact="${p.clave}" ${c.activo !== false ? 'checked' : ''}></label></td>
        <td class="l acc">
          <button class="btn sec mini" type="button" data-editar="${esc(p.clave)}">Editar</button>
          <button class="btn sec mini" type="button" data-quitar="${esc(p.clave)}" title="Quitar del catálogo" aria-label="Quitar ${esc(p.clave)}">×</button></td></tr>`;
    }).join('');

    const dif = (P.diferenciados || []).map((d, i) => {
      const partes = d.partes.map((x, j) => `<span class="parte edit">
        <input class="inqq mini3 cl" data-dpc="${i}" data-j="${j}" value="${esc(x.clave)}" aria-label="Clave de la parte">
        <span>×</span>
        <input class="inqq mini3" inputmode="decimal" data-dpm="${i}" data-j="${j}" value="${x.mult}" aria-label="Multiplicar por">
        <span>÷</span>
        <input class="inqq mini3" inputmode="decimal" data-dpd="${i}" data-j="${j}" value="${x.div}" aria-label="Dividir entre">
        <button class="x" type="button" data-dquitar="${i}" data-j="${j}" aria-label="Quitar la parte">×</button></span>`).join('');
      return `<tr>
        <td class="l clave">${esc(d.destino)}</td>
        <td class="l">${partes}<button class="btn sec mini" type="button" data-dmas="${i}">+ parte</button></td>
        <td><label class="sw"><input type="checkbox" data-dact="${i}" ${d.activo !== false ? 'checked' : ''}></label></td>
        <td class="l"><button class="btn sec mini" type="button" data-dborrar="${i}">Borrar</button></td></tr>`;
    }).join('');

    $('#paramCuerpo').innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h3>Cómo se calcula el horizonte</h3>
        <p class="sub">Cuántos días de venta tiene que aguantar lo que se produce hoy.</p>
        <div class="fila">
          <div class="campo"><label for="inModo">Modo</label>
            <select id="inModo" style="min-width:210px">
              <option value="calendario">Hasta la próxima corrida</option>
              <option value="tabla">Según la tabla de días</option>
              <option value="fijo">Número fijo de días</option>
            </select></div>
          <div class="campo"><label for="inCorte">Cubrir hasta la corrida N°</label>
            <input type="number" id="inCorte" min="1" max="5" style="width:110px" value="${P.cortePorProduccion}"></div>
          <div class="campo"><label for="inFijo">Días fijos</label>
            <input type="number" id="inFijo" min="1" max="14" style="width:110px" value="${P.horizonteFijo}"></div>
          <div class="campo"><label for="inFactor2">Factor temporada</label>
            <input type="number" id="inFactor2" step="0.05" min="0" style="width:110px" value="${P.factorTemporada}"></div>
          <div class="campo"><label for="inAnt">Anticipación de pedidos (d)</label>
            <input type="number" id="inAnt" min="0" max="14" style="width:110px" value="${P.pedidos.anticipacion}"></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Días de venta a cubrir</h3>
        <p class="sub">
          Para cada día de cálculo se marca qué días de venta tiene que aguantar la producción.
          Cada familia puede tener su propia tabla.
        </p>
        <div class="fila" style="margin-bottom:10px">
          <div class="campo"><label for="selFam">Tabla de</label>
            <select id="selFam" style="min-width:200px">
              <option value="">General (todas las familias)</option>
              ${D.FAMILIAS.map((f) => `<option value="${f.id}">${esc(f.nombre)}</option>`).join('')}
            </select></div>
          <div class="campo" id="cpPropia" hidden><label>&nbsp;</label>
            <label class="sw"><input type="checkbox" id="chkPropia"> Tabla propia de esta familia</label></div>
          <div class="campo"><label>&nbsp;</label>
            <button class="btn sec mini" type="button" id="btnDesdeCal">Generar desde el calendario</button></div>
        </div>
        <div id="matrizCont"></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Turnos y topes</h3>
        <p class="sub">El tope son los quintales que el turno alcanza a hacer. El mínimo obliga a dejarlo trabajando aunque el sugerido sea cero.</p>
        <div class="tablabox"><table><thead><tr><th class="l">Turno</th><th class="l">Planta</th><th>Tope qq</th><th>Mínimo qq</th><th class="l">Estado</th></tr></thead><tbody>${turnos}</tbody></table></div>
        <p class="dim" style="font-size:.84rem;margin:10px 2px">
          Capacidad por planta: ${D.PLANTAS.map((x) => `<b>${esc(x.nombre)}</b> ${n2(topePlanta[x.id])} qq`).join(' · ')}.</p>
        <div class="fila" style="margin-top:12px;align-items:flex-end">
          <div class="campo"><label for="inRotDesde">Semana de referencia (un domingo)</label>
            <input type="date" id="inRotDesde" value="${esc(P.rotacion.desde)}" style="min-width:160px"></div>
          <div class="campo"><label for="inRotAm">Esa semana trabajó de mañana</label>
            <select id="inRotAm" style="min-width:130px">
              ${D.rotacionDe(P.rotacion.desde).map((t) =>
                `<option value="${t.id}" ${P.rotacion.amPrimero === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}
            </select></div>
          <p class="dim" style="font-size:.84rem;margin:0 0 6px">
            Byron y Julio se cambian la mañana por la tarde cada domingo. Esta semana:
            ${D.rotacionDe(ui.fecha).map((t) => `<b>${esc(t.nombre)}</b> ${t.momento}`).join(' · ')}.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Vida útil por familia</h3>
        <p class="sub">
          La cobertura máxima sale de la vida útil menos los días que el producto debe conservar al despacharse.
          La anticipación vacía hereda la general de arriba: son los días que hay entre producir un pedido especial y entregarlo.
        </p>
        <div class="tablabox"><table><thead><tr><th class="l">Familia</th><th>Vida útil (d)</th><th>Mínimo al despachar (d)</th><th>Colchón (d)</th><th>Anticip. pedidos (d)</th><th>Cobertura máx.</th></tr></thead><tbody>${familias}</tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Calendario de producción</h3>
        <p class="sub">
          Cada planta tiene su propio calendario. Los días sin producción alargan el horizonte:
          si Zona 18 no trabaja el domingo, su viernes tiene que cubrir hasta el lunes, mientras que
          Zona 2, que sí trabaja el domingo, cubre menos días.
        </p>
        <div class="tablabox"><table><thead><tr><th class="l">Día</th>
          ${D.PLANTAS.map((x) => `<th class="l">${esc(x.nombre)}</th>`).join('')}
          <th>Factor de venta</th></tr></thead><tbody>${cal}</tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Feriados</h3>
        <p class="sub">
          En panadería el feriado no es un día sin trabajo: se descansa el día anterior y se
          produce el día del feriado. Al agregar uno queda así, y de ahí se cambia celda por
          celda tocándola. Las filas de empaque son para el equipo: no entran al cálculo.
        </p>
        <div class="fila" style="margin-bottom:10px">
          <div class="campo"><label for="inFerFecha">Fecha del feriado</label>
            <input type="date" id="inFerFecha" style="min-width:160px"></div>
          <div class="campo"><label for="inFerNom">Nombre</label>
            <input type="text" id="inFerNom" placeholder="Feriado" style="min-width:150px"></div>
          <div class="campo"><label>&nbsp;</label>
            <button class="btn ghost mini" type="button" id="btnAddFeriado">Agregar feriado</button></div>
        </div>
        <div id="feriados"></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Productos</h3>
        <p class="sub">El múltiplo admite dos decimales. Colchón y vida útil vacíos heredan los de la familia.</p>
        <div class="fila" style="margin-bottom:10px">
          <button class="btn ghost mini" type="button" id="btnNuevoProd">Agregar producto</button>
          <span class="dim" style="font-size:.84rem">«Editar» sirve para cambiar la clave, por ejemplo IN16 a LS19B, sin perder el historial.</span>
        </div>
        <div class="tablabox"><table><thead><tr>
          <th class="l">Clave</th><th class="l">Planta</th><th>Bolsas/qq</th><th>Múltiplo qq</th><th>Colchón</th><th>Vida útil</th>
          <th class="l">Turnos que la pueden hacer</th><th>Prod. ya<br>en el conteo</th><th>Activo</th><th class="l"></th></tr></thead>
          <tbody>${prods}</tbody></table></div>
        <p class="dim" style="font-size:.84rem;margin:10px 2px">
          «Prod. ya en el conteo» es para el producto que se hace de mañana y que el INV PM de ese día ya trae adentro:
          su producción no se vuelve a sumar en el teórico PM.</p>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Productos diferenciados</h3>
        <p class="sub">
          Presentaciones distintas del mismo producto. El inventario de la clave destino sale de sumar sus partes:
          cada una aporta <b>valor × multiplicar ÷ dividir</b>, y el total se aproxima al entero de abajo.
        </p>
        <div class="fila" style="margin-bottom:10px">
          <button class="btn ghost mini" type="button" id="btnNuevoDif">Agregar cálculo</button>
        </div>
        <div class="tablabox"><table><thead><tr>
          <th class="l">Clave destino</th><th class="l">Partes</th><th>Activo</th><th class="l"></th></tr></thead>
          <tbody>${dif}</tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Lector de fotos</h3>
        <p class="sub">Leer letra manuscrita necesita una llave de la API de Anthropic. Elige dónde guardarla; los pasos están en LECTOR.md.</p>
        <div class="fila" style="gap:16px">
          <label class="sw"><input type="radio" name="modoLector" id="modoLlave"> Llave en este dispositivo</label>
          <label class="sw"><input type="radio" name="modoLector" id="modoServidor"> Servidor propio</label>
          <span class="dim" id="estadoLector"></span>
        </div>
        <div class="fila" style="margin-top:10px">
          <div class="campo" id="cpKey" hidden><label for="inKey">Llave</label>
            <input type="password" id="inKey" placeholder="sk-ant-..." autocomplete="off" style="min-width:260px"></div>
          <div class="campo" id="cpUrl" hidden><label for="inUrl">Dirección del lector</label>
            <input type="url" id="inUrl" placeholder="https://tu-app.vercel.app/api/extract" style="min-width:300px"></div>
          <div class="campo"><label for="inModelo">Modelo</label>
            <input type="text" id="inModelo" style="min-width:180px"></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Dónde se guardan los archivos</h3>
        <p class="sub">
          El PDF y las imágenes del resumen, el Excel del historial y el respaldo. Por defecto van
          a la carpeta de Descargas del navegador.
        </p>
        <div class="fila" id="carpFila"></div>
        <p class="dim" style="font-size:.84rem;margin:11px 2px 0" id="carpNota"></p>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Sincronizar entre equipos</h3>
        <p class="sub">
          Para que la laptop y la tablet trabajen sobre los mismos datos. Se mezcla por partes:
          si capturaste el inventario en una y repartiste la producción en la otra, se conservan las dos.
        </p>
        <div class="fila">
          <label class="sw"><input type="checkbox" id="chkSync"> Sincronización encendida</label>
          <div class="campo"><label for="inSyncClave">Clave de sincronización</label>
            <input type="password" id="inSyncClave" autocomplete="off" placeholder="la misma en los dos equipos" style="min-width:240px"></div>
          <div class="campo"><label>&nbsp;</label>
            <button class="btn ghost mini" type="button" id="btnSyncYa">Sincronizar ahora</button></div>
          <div class="campo"><label>&nbsp;</label>
            <button class="btn sec mini" type="button" id="btnSyncOlvidar">Empezar de cero</button></div>
        </div>
        <p class="dim" style="font-size:.84rem;margin:11px 2px 0" id="estadoSync"></p>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Mis valores por defecto</h3>
        <p class="sub">
          Cuando la configuración de arriba ya quedó como la quieres, guárdala como tu punto de partida.
          Desde ahí puedes probar cambios y volver a lo tuyo sin perder la calibración.
        </p>
        <div class="fila">
          <button class="btn ghost" id="btnFijarDef" type="button">Sobrescribir con lo que hay ahora</button>
          <button class="btn sec" id="btnVolverDef" type="button">Volver a mis valores</button>
          <button class="btn sec" id="btnResetParam" type="button">Volver a los de fábrica</button>
        </div>
        <p class="dim" style="font-size:.84rem;margin:11px 2px 0" id="estadoDef"></p>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Datos desde el libro de cálculo</h3>
        <p class="sub">Trae rendimientos e inventario de <b>Calculo_Produccion_IA.xlsx</b> sin tener que escribirlos.</p>
        <div class="fila">
          <button class="btn ghost" id="btnImportRend" type="button">Traer rendimientos</button>
          <input type="file" id="fileRend" accept=".xlsx" hidden>
        </div>
      </div>`;

    $('#inModo').value = P.horizonteModo;
    $('#selFam').value = ui.famMatriz || '';
    $('#chkSync').checked = window.Sync.cfg('syncOn') === '1';
    $('#inSyncClave').value = window.Sync.clave();
    pintarSync();
    pintarCarpeta();
    const g = D.misDefecto();
    $('#estadoDef').innerHTML = g
      ? `Guardados el <b>${esc(g.guardadoEn ? D.fechaCorta(g.guardadoEn.slice(0, 10)) : 'alguna vez')}</b>. `
        + '«Volver a mis valores» regresa a esa configuración.'
      : 'Todavía no has guardado ninguno: «Volver a mis valores» te deja los de fábrica.';
    $('#btnVolverDef').disabled = !g;
    pintarMatriz();
    pintarLector();
    pintarFeriados();
  }

  // ---------- feriados ----------
  /* Una tabla por feriado: filas = planta (y las de empaque) partidas en AM y
     PM, columnas = los días de la ventana. Es la misma hoja que se manda por
     WhatsApp, por eso se dibuja así y no como una lista de fechas. */
  function pintarFeriados() {
    const P = D.estado.params;
    const cont = $('#feriados');
    if (!cont) return;
    const lista = (P.feriados || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!lista.length) {
      cont.innerHTML = '<p class="dim" style="font-size:.88rem;margin:0 2px">'
        + 'No hay feriados puestos. El calendario de la semana manda solo.</p>';
      return;
    }
    cont.innerHTML = lista.map((f) => tablaFeriado(f, P)).join('');
  }

  function tablaFeriado(f, P) {
    const dias = D.diasFeriado(f);
    const i = (P.feriados || []).indexOf(f);
    const filas = [];
    D.PLANTAS.forEach((p) => {
      D.MOMENTOS.forEach((mo, k) => {
        filas.push({ rotulo: k === 0 ? p.nombre : '', mo, fila: D.filaPlanta(p.id, mo), grupo: p.id, prod: true });
      });
    });
    (P.empaque || []).forEach((e) => {
      D.MOMENTOS.forEach((mo, k) => {
        filas.push({ rotulo: k === 0 ? e.nombre : '', mo, fila: D.filaEmpaque(e.id, mo), grupo: 'EMP', prod: false });
      });
    });
    const cuerpo = filas.map((r) => `<tr${r.prod ? '' : ' class="emp"'}>
      <td class="l">${esc(r.rotulo)}</td><td class="l mom">${r.mo}</td>
      ${dias.map((iso) => {
        const v = (f.dias[iso] || {})[r.fila] || 'SI';
        const e = D.ESTADOS.find((x) => x.id === v) || D.ESTADOS[0];
        return `<td><button type="button" class="celfer ${v.toLowerCase()}"
          data-fer="${i}" data-dia="${iso}" data-cel="${esc(r.fila)}"
          title="Tócala para cambiarla">${esc(e.nombre)}</button></td>`;
      }).join('')}</tr>`).join('');
    return `<div class="card fercard" style="margin-bottom:12px;padding:0;overflow:hidden">
      <div style="display:flex;gap:10px;align-items:baseline;padding:11px 14px;flex-wrap:wrap">
        <h3 style="margin:0;font-size:.95rem">${esc(f.nombre)}</h3>
        <span class="chip vida">${esc(D.fechaCorta(f.fecha))}</span>
        <span class="dim" style="font-size:.84rem;margin-left:auto">
          <button class="btn ghost mini" type="button" data-ferimg="${i}">Compartir imagen</button>
          <button class="btn sec mini" type="button" data-ferdel="${i}">Quitar</button></span>
      </div>
      <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0">
        <table class="tfer"><thead><tr><th class="l">Planta</th><th></th>
          ${dias.map((iso) => `<th${iso === f.fecha ? ' class="hoyfer"' : ''}>${esc(D.nombreDia(iso))}
            <span class="sub2">${esc(D.fechaCorta(iso))}</span></th>`).join('')}
        </tr></thead><tbody>${cuerpo}</tbody></table>
      </div></div>`;
  }

  /**
   * La tabla del feriado como imagen, para mandarla por WhatsApp. Es el mismo
   * dibujo que el resumen del día: así los dos mensajes que recibe el equipo
   * se ven como del mismo lugar.
   */
  async function compartirFeriado(f) {
    if (!f) return;
    const R = window.Resumen, P = D.estado.params, COL = R.COL;
    const dias = D.diasFeriado(f);
    const AN_ROT = 108, AN_MO = 34, AN_DIA = 96;
    const H_TIT = 30, H_CAB = 34, H_FILA = 24;
    const filas = [];
    D.PLANTAS.forEach((p) => D.MOMENTOS.forEach((mo, k) => filas.push({
      rotulo: k === 0 ? p.nombre.toUpperCase() : '', mo, fila: D.filaPlanta(p.id, mo), prod: true,
      primera: k === 0,
    })));
    (P.empaque || []).forEach((e) => D.MOMENTOS.forEach((mo, k) => filas.push({
      rotulo: k === 0 ? e.nombre.toUpperCase() : '', mo, fila: D.filaEmpaque(e.id, mo), prod: false,
      primera: k === 0,
    })));

    const an = AN_ROT + AN_MO + dias.length * AN_DIA;
    const al = H_TIT + H_CAB + filas.length * H_FILA;
    const { cv, g } = R.lienzo(an, al);

    R.celda(g, 0, 0, an, H_TIT, {
      fondo: COL.naranja, texto: `${f.nombre.toUpperCase()}  ${D.fechaCorta(f.fecha)}`,
      color: COL.blanco, fuente: 'bold 14px system-ui, sans-serif', borde: COL.naranja,
    });
    let y = H_TIT;
    R.celda(g, 0, y, AN_ROT + AN_MO, H_CAB, { fondo: COL.verde, borde: COL.verde });
    dias.forEach((iso, i) => {
      const x = AN_ROT + AN_MO + i * AN_DIA;
      const esFer = iso === f.fecha;
      R.celda(g, x, y, AN_DIA, H_CAB, {
        fondo: esFer ? COL.naranja : COL.verde, borde: esFer ? COL.naranja : COL.verde,
      });
      g.fillStyle = COL.blanco;
      g.textAlign = 'center';
      g.font = 'bold 11px system-ui, sans-serif';
      g.fillText(D.nombreDia(iso), x + AN_DIA / 2, y + 12);
      g.font = '10px system-ui, sans-serif';
      g.fillText(D.fechaCorta(iso), x + AN_DIA / 2, y + 24);
    });
    y += H_CAB;

    filas.forEach((r) => {
      const fondoRot = r.prod ? COL.verdeSuave : COL.gris;
      R.celda(g, 0, y, AN_ROT, H_FILA, {
        fondo: fondoRot, texto: r.rotulo, alinear: 'left',
        fuente: r.primera ? 'bold 11px system-ui, sans-serif' : '11px system-ui, sans-serif',
      });
      R.celda(g, AN_ROT, y, AN_MO, H_FILA, {
        fondo: fondoRot, texto: r.mo, fuente: '10px system-ui, sans-serif', color: COL.grisTexto,
      });
      dias.forEach((iso, i) => {
        const v = (f.dias[iso] || {})[r.fila] || 'SI';
        const e = D.ESTADOS.find((x) => x.id === v) || D.ESTADOS[0];
        R.celda(g, AN_ROT + AN_MO + i * AN_DIA, y, AN_DIA, H_FILA, {
          texto: e.nombre, fondo: COL.blanco,
          color: v === 'NO' ? COL.naranja : (v === 'X' ? COL.grisTexto : COL.tinta),
          fuente: v === 'NO' ? 'bold 11px system-ui, sans-serif' : '11px system-ui, sans-serif',
        });
      });
      y += H_FILA;
    });

    const base = /feriado/i.test(f.nombre) ? f.nombre : `Feriado ${f.nombre}`;
    const nombre = `${base} ${String(f.fecha).replace(/-/g, '_')}.png`;
    const res = await R.compartir(await R.aBlob(cv), nombre, 'Feriado');
    aviso(res === 'compartido' ? 'Imagen compartida.'
      : (res === 'cancelado' ? 'Cancelado.' : 'Imagen descargada.'));
  }

  /** Tabla 7x7: fila = día de cálculo, columna = día de venta. */
  function pintarMatriz() {
    const P = D.estado.params;
    const fam = ui.famMatriz || '';
    const propia = fam ? D.matrizValida(P.cobertura.familias[fam]) : true;
    $('#cpPropia').hidden = !fam;
    $('#chkPropia').checked = propia;

    const m = fam
      ? (propia ? P.cobertura.familias[fam] : (P.cobertura.general || C.matrizDesdeCalendario(P, plantasDeFamilia(fam))))
      : (P.cobertura.general || C.matrizDesdeCalendario(P));
    const editable = !fam || propia;

    const filas = D.DIAS.map((dia, i) => `<tr>
      <td class="l clave">${esc(dia)}</td>
      ${D.DIAS.map((dv, j) => `<td style="text-align:center">
        <input type="checkbox" data-mx="${i}" data-my="${j}" ${m[i][j] ? 'checked' : ''}
          ${editable ? '' : 'disabled'} aria-label="${esc(dia)} cubre ${esc(dv)}"
          style="${i === j ? 'outline:2px solid var(--line-2);outline-offset:2px' : ''}"></td>`).join('')}
      <td class="num dim">${D.DIAS.filter((_, j) => m[i][j]).length} d</td></tr>`).join('');

    $('#matrizCont').innerHTML = `
      ${P.horizonteModo !== 'tabla'
        ? '<div class="aviso warn"><h4>Esta tabla no se está usando</h4><p>Arriba, en <b>Modo</b>, hay que elegir «Según la tabla de días». Al marcar algo aquí se cambia solo.</p></div>'
        : ''}
      ${fam && !propia ? '<div class="aviso"><p>Esta familia sigue la tabla general. Marca «Tabla propia» para darle sus propios días.</p></div>' : ''}
      <div class="tablabox"><table><thead><tr>
        <th class="l">Día del cálculo</th>
        ${D.DIAS.map((d) => `<th>${esc(d.slice(0, 3))}</th>`).join('')}
        <th>Días</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="dim" style="font-size:.84rem;margin:9px 2px">
        El recuadro marcado en cada fila es el mismo día del cálculo. Marcarlo cuenta la venta de hoy,
        que ya se restó en el teórico PM, así que funciona como un día extra de colchón.</p>`;
  }

  /** Resumen de cómo va la sincronización. */
  function pintarSync() {
    const S = window.Sync;
    if (!$('#estadoSync')) return;
    const u = S.ultima();
    const n = S.escrituras();
    const partes = [];
    if (!S.activo()) {
      partes.push(ui.syncHay === false
        ? 'Este despliegue no trae el módulo de sincronización. Hace falta publicarlo en Vercel con un almacén Blob; los pasos están en SINCRONIZAR.md.'
        : 'Apagada. Enciéndela y escribe la misma clave en los dos equipos.');
    } else {
      partes.push(u ? `Última vez: <b>${esc(new Date(u).toLocaleString('es-GT'))}</b>.` : 'Todavía no se ha sincronizado.');
      partes.push(`${n} de 2,000 guardados este mes.`);
      if (n >= S.TOPE_AVISO) partes.push('<b class="neg">Vas cerca del límite del plan gratis.</b>');
    }
    $('#estadoSync').innerHTML = partes.join(' ');
    const b = $('#btnSync');
    if (b) b.hidden = !S.activo();
  }

  /** Una pasada de sincronización, con los avisos que correspondan. */
  async function sincronizar(manual, eleccion) {
    const S = window.Sync;
    if (!S.activo()) { if (manual) aviso('La sincronización está apagada. Enciéndela en Parámetros.', 'err'); return; }
    if (manual) espera(true, 'Sincronizando…');
    try {
      const r = await S.sincronizar({ manual, eleccion: eleccion || null });
      if (!r.ok) { if (manual) aviso('No se sincronizó: ' + r.motivo, 'err'); return; }

      refrescarTodo();

      /* Quedaron cosas sin decidir: lo claro ya se aplicó, pero no se sube
         nada hasta que él diga con cuál se queda. */
      if (r.pendiente === 'eleccion') {
        const traido = r.traidos.length ? ` Se trajeron ${r.traidos.length} cosas que no tenían duda.` : '';
        if (!manual) {
          aviso((r.total === 1
            ? 'Hay algo distinto entre los dos equipos.'
            : `Hay ${r.total} cosas distintas entre los dos equipos.`)
            + traido + ' Toca Sincronizar para resolverlo.');
          pintarSync();
          return;
        }
        espera(false);
        /* Tres caminos de verdad: no hacer nada, mandar lo de aquí, o traer lo
           del servidor. Antes «Cancelar» no cancelaba: traía lo del otro
           equipo sin decirlo, que es lo contrario de lo que dice el botón. */
        const q = await preguntar('Estos dos equipos nunca se habían comparado',
          `<p>Hay <b>${r.total}</b> ${r.total === 1 ? 'cosa que está distinta' : 'cosas que están distintas'} aquí y allá,
             y no hay manera de saber cuál es la buena.</p>
           <p class="dim">${esc(r.indecisos.slice(0, 14).join(' · '))}${r.indecisos.length > 14 ? ' …' : ''}</p>
           <p>Lo demás ya quedó igual en los dos. La decisión es sólo para lo de arriba:
             lo que está en un solo lado se conserva de cualquier manera.</p>`,
          'Lo de este equipo', 'Lo del otro equipo');
        /* Cancelar es cancelar: no sube, no baja, no toca nada. */
        if (q === false) { if (manual) aviso('Sin cambios: no se sincronizó.'); return; }
        return sincronizar(manual, q === 'otro' ? 'remoto' : 'local');
      }

      if (r.baseOk === false) {
        aviso('Se sincronizó, pero no cupo la memoria de la comparación en este equipo. '
          + 'Exporta el historial y borra días viejos, o la próxima vez volverá a preguntar.', 'err');
      }

      const t = [];
      if (r.traidos.length) t.push(`${r.traidos.length} de la otra`);
      if (r.subido) t.push('subido');
      if (r.conflictos.length) t.push(`${r.conflictos.length} en conflicto`);
      if (manual || r.traidos.length || r.conflictos.length) {
        aviso(t.length ? `Sincronizado: ${t.join(', ')}.` : 'Sincronizado, no había nada nuevo.');
      }
      if (r.conflictos.length) {
        preguntar('Se cambió lo mismo en los dos equipos',
          `<p>Quedó lo de <b>este</b> equipo en: ${esc(r.conflictos.join(', '))}.</p>
           <p>Si lo bueno era lo de la otra, cámbialo ahí y vuelve a sincronizar.</p>`, 'Entendido');
      }
    } catch (err) {
      if (manual) aviso('No se sincronizó: ' + err.message, 'err');
      else console.warn('sync', err);
    } finally { if (manual) espera(false); }
  }

  /** Vuelve a pintar todo lo que pudo cambiar al traer datos de la otra. */
  function refrescarTodo() {
    pintarProduccion(); pintarInventario(); pintarPedidos(); pintarHistorial(); pintarPromedios();
    if (ui.tab === 'param') pintarParametros(); else pintarSync();
  }

  /** La carpeta fija, en Parámetros. */
  async function pintarCarpeta() {
    if (!$('#carpFila')) return;
    const A = window.Archivo;
    const c = await A.carpeta();
    $('#carpFila').innerHTML = c
      ? `<span class="dim">Carpeta elegida: <b>${esc(c.nombre)}</b></span>
         <button class="btn sec mini" type="button" id="btnCarpCambiar">Cambiar</button>
         <button class="btn sec mini" type="button" id="btnCarpQuitar">Quitar</button>`
      : (A.haySoporte()
        ? '<span class="dim">Ahora van a Descargas.</span>'
          + '<button class="btn ghost mini" type="button" id="btnCarpCambiar">Elegir una carpeta fija</button>'
        : '<span class="dim">Van a Descargas.</span>');
    $('#carpNota').innerHTML = A.haySoporte()
      ? 'Al elegir una carpeta, los archivos caen directo ahí sin pasar por Descargas. '
        + 'Chrome pide confirmar el permiso una vez cada vez que lo reabres.'
      : 'Elegir carpeta sólo se puede en Chrome o Edge de computadora. En la tablet siempre van a '
        + 'Descargas o al menú de compartir.';
  }

  function pintarLector() {
    const F = window.Lector, m = F.cfg('modo', '');
    $('#modoLlave').checked = m === 'llave';
    $('#modoServidor').checked = m === 'servidor';
    $('#cpKey').hidden = m !== 'llave';
    $('#cpUrl').hidden = m !== 'servidor';
    $('#inKey').value = F.cfg('key');
    $('#inUrl').value = F.cfg('url');
    $('#inModelo').value = F.cfg('modelo', F.MODELO);
    $('#estadoLector').textContent = m === 'llave'
      ? (F.cfg('key') ? 'Listo: llave en este dispositivo.' : 'Falta pegar la llave.')
      : m === 'servidor'
        ? (F.cfg('url') ? 'Listo: ' + F.cfg('url') : 'Falta la dirección.')
        : 'Sin configurar.';
  }

  /* Si la app se sirve desde un sitio que trae el lector incluido, lo usa sin pedir nada. */
  async function autodetectarLector() {
    if (window.Lector.cfg('modo', '')) return;
    try {
      const r = await fetch('./api/extract');
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.ok) {
        window.Lector.setCfg('modo', 'servidor');
        window.Lector.setCfg('url', new URL('./api/extract', location.href).href);
      }
    } catch (_) { /* no hay lector aquí */ }
  }

  // ================= eventos =================
  /** La matriz que se está editando; la crea copiando lo que se ve si no existía. */
  function matrizDestino(crear) {
    const P = D.estado.params, fam = ui.famMatriz || '';
    const base = () => JSON.parse(JSON.stringify(
      D.matrizValida(P.cobertura.general) ? P.cobertura.general
        : C.matrizDesdeCalendario(P, fam ? plantasDeFamilia(fam) : null)));
    if (fam) {
      if (!D.matrizValida(P.cobertura.familias[fam])) {
        if (!crear) return null;
        P.cobertura.familias[fam] = base();
      }
      return P.cobertura.familias[fam];
    }
    if (!D.matrizValida(P.cobertura.general)) {
      if (!crear) return null;
      P.cobertura.general = base();
    }
    return P.cobertura.general;
  }

  function cambiosParametros(e) {
    const t = e.target, P = D.estado.params;
    const v = t.type === 'checkbox' ? t.checked : t.value.trim();
    const num = (x, d) => { const n = Number(String(x).replace(',', '.')); return Number.isFinite(n) ? n : d; };
    const d = t.dataset;

    if (t.id === 'selFam') { ui.famMatriz = t.value; pintarMatriz(); return true; }
    if (t.id === 'chkPropia') {
      const fam = ui.famMatriz || '';
      if (!fam) return true;
      if (v) matrizDestino(true); else P.cobertura.familias[fam] = null;
      D.guardarParams(); pintarMatriz(); return true;
    }
    if (d.mx != null && d.my != null) {
      const m = matrizDestino(true);
      m[+d.mx][+d.my] = v;
      P.horizonteModo = 'tabla';
      $('#inModo').value = 'tabla';
      D.guardarParams(); pintarMatriz(); return true;
    }

    let toco = true;
    if (d.calp != null) {
      const c = P.calendario[+d.calp];
      c.plantas = { ...(c.plantas || {}), [d.pid]: v };
      c.produce = D.PLANTAS.some((x) => c.plantas[x.id]);
      D.guardarParams(); pintarParametros(); return true;
    }
    if (d.cal != null) P.calendario[+d.cal].produce = v;
    else if (d.calf != null) P.calendario[+d.calf].factor = num(v, 1);
    else if (d.tope) P.turnos[d.tope].tope = Math.max(0, num(v, 0));
    else if (d.min) P.turnos[d.min].minimo = Math.max(0, num(v, 0));
    else if (d.tact) P.turnos[d.tact].activo = v;
    else if (d.fvu) P.familias[d.fvu].vidaUtil = Math.max(1, num(v, 21));
    else if (d.fmd) P.familias[d.fmd].minDespacho = Math.max(0, num(v, 0));
    else if (d.fco) P.familias[d.fco].colchon = Math.max(0, num(v, 0));
    else if (d.fant) P.familias[d.fant].anticipacion = v === '' ? null : Math.max(0, Math.round(num(v, 0)));
    else if (d.prend) P.prod[d.prend].rend = Math.max(1, num(v, 1));
    else if (d.pmult) P.prod[d.pmult].mult = Math.max(0, Math.round(num(v, 0) * 100) / 100);
    else if (d.pcol) P.prod[d.pcol].colchon = v === '' ? null : Math.max(0, num(v, 0));
    else if (d.pvu) P.prod[d.pvu].vidaUtil = v === '' ? null : Math.max(1, num(v, 21));
    else if (d.pact) P.prod[d.pact].activo = v;
    else if (d.ppl) {
      const f = P.prod[d.ppl];
      f.plantas = { ...f.plantas, [d.plid]: v };
      /* Sin ninguna planta el producto no se puede hacer en ningún lado: se
         deja al menos la que acaba de desmarcar para no dejarlo huérfano. */
      if (!Object.values(f.plantas).some(Boolean)) f.plantas[d.plid] = true;
      D.guardarParams(); pintarParametros(); return true;
    }
    else if (d.pcon) P.prod[d.pcon].prodEnConteo = v;
    else if (d.tpl) { P.turnos[d.tpl].planta = t.value; D.guardarParams(); pintarParametros(); return true; }
    else if (d.dact != null) { P.diferenciados[+d.dact].activo = v; D.guardarParams(); return true; }
    else if (d.dpc != null) { P.diferenciados[+d.dpc].partes[+d.j].clave = String(t.value).trim().toUpperCase(); }
    else if (d.dpm != null) { P.diferenciados[+d.dpm].partes[+d.j].mult = num(v, 0); }
    else if (d.dpd != null) { P.diferenciados[+d.dpd].partes[+d.j].div = num(v, 1) || 1; }
    else if (d.pt) {
      const lista = P.prod[d.pt].turnos || [];
      P.prod[d.pt].turnos = v ? [...new Set([...lista, d.tid])].sort(
        (a, b) => D.TURNOS.findIndex((x) => x.id === a) - D.TURNOS.findIndex((x) => x.id === b))
        : lista.filter((x) => x !== d.tid);
    } else toco = false;
    if (toco) { D.guardarParams(); if (['fvu', 'fmd', 'fco', 'fant', 'pcol', 'pvu'].some((k) => d[k])) pintarParametros(); }
    return toco;
  }

  function enlazar() {
    // pestañas
    const paneles = { prod: '#pProd', inv: '#pInv', ped: '#pPed', bolsa: '#pBolsa',
      sec: '#pSec', hist: '#pHist', prom: '#pProm', param: '#pParam' };
    const tabs = { prod: '#tabProd', inv: '#tabInv', ped: '#tabPed', bolsa: '#tabBolsa',
      sec: '#tabSec', hist: '#tabHist', prom: '#tabProm', param: '#tabParam' };
    window.irA = (k) => {
      ui.tab = k;
      Object.keys(paneles).forEach((x) => {
        $(paneles[x]).hidden = x !== k;
        $(tabs[x]).setAttribute('aria-selected', String(x === k));
      });
      try { localStorage.setItem('panprod_tab', k); } catch (_) {}
      if (k === 'prod') pintarProduccion();
      if (k === 'inv') pintarInventario();
      if (k === 'ped') pintarPedidos();
      if (k === 'bolsa') pintarBolsa();
      if (k === 'sec') pintarSecundarios();
      if (k === 'hist') pintarHistorial();
      if (k === 'prom') pintarPromedios();
      if (k === 'param') pintarParametros();
      window.scrollTo({ top: 0 });
    };
    Object.keys(tabs).forEach((k) => { $(tabs[k]).onclick = () => window.irA(k); });

    // producción
    $('#inFecha').onchange = (e) => {
      ui.fecha = e.target.value || D.hoyISO(); ui.abierta = null; ui.sinCupo = null; ui.sinTurnoHoy = null;
      recordarFecha(); pintarProduccion();
    };
    $('#inFactor').onchange = (e) => {
      const n = Number(e.target.value); D.estado.params.factorTemporada = Number.isFinite(n) && n > 0 ? n : 1;
      D.guardarParams(); pintarProduccion();
    };
    $('#btnRepartir').onclick = () => {
      const r = C.repartir(D.estado, reg(), ui.fecha);
      ui.sinCupo = r.sinCupo; ui.sinTurnoHoy = r.sinTurnoHoy;
      D.guardarDias(); pintarProduccion();
      aviso(r.sinCupo.length ? `Repartido. ${r.sinCupo.length} claves no cupieron completas.` : 'Repartido entre los turnos.');
    };
    $('#btnAgregarPed').onclick = () => {
      const fecha = $('#pdFecha').value;
      const clave = $('#pdClave').value;
      const bolsas = D.num($('#pdBolsas').value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { aviso('Falta el día de entrega.', 'err'); $('#pdFecha').focus(); return; }
      if (!clave) { aviso('Falta la clave.', 'err'); return; }
      if (!bolsas || Number.isNaN(bolsas) || bolsas <= 0) { aviso('Las bolsas tienen que ser un número mayor que cero.', 'err'); $('#pdBolsas').focus(); return; }
      D.nuevoPedido({ fecha, cliente: $('#pdCliente').value, clave, bolsas });
      D.guardarPedidos();
      /* La fecha y el cliente se quedan: un pedido suele traer varias claves. */
      $('#pdBolsas').value = '';
      pintarPedidos(); pintarProduccion();
      aviso(`${clave}: ${n0(bolsas)} bolsas para ${D.fechaCorta(fecha)}.`);
      $('#pdClave').focus();
    };
    $('#pdBolsas').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#btnAgregarPed').click(); }
    });

    $('#btnResumen').onclick = () => window.Resumen.abrir(ui.fecha, aviso);
    $('#btnLimpiar').onclick = () => {
      C.limpiarReparto(reg()); ui.sinCupo = null; ui.sinTurnoHoy = null; D.guardarDias(); pintarProduccion(); aviso('Reparto borrado.');
    };

    document.addEventListener('change', (e) => {
      const d = e.target.dataset || {};
      if (d.clave && d.turno) {
        const v = D.num(e.target.value);
        const r = reg();
        if (v == null || v === 0) delete r.turnos[d.clave][d.turno];
        else if (!Number.isNaN(v)) r.turnos[d.clave][d.turno] = Math.round(v * 100) / 100;
        D.guardarDias(); pintarProduccion();
      } else if (d.stock || d.prodayer || d.invpm) {
        const clave = d.stock || d.prodayer || d.invpm;
        const campo = d.stock ? 'stockAyer' : (d.prodayer ? 'prodAyer' : 'invPM');
        const v = D.num(e.target.value);
        reg()[campo][clave] = (v == null || Number.isNaN(v)) ? null : v;
        D.guardarDias(); pintarInventario();
      } else if (d.pedb) {
        const v = D.num(e.target.value);
        const p = D.estado.pedidos[d.pedb];
        if (p && v != null && !Number.isNaN(v) && v > 0) p.bolsas = Math.round(v);
        D.guardarPedidos(); pintarPedidos(); pintarProduccion();
      } else if (d.prom) {
        const v = D.num(e.target.value);
        const fila = D.estado.prom[d.prom] || (D.estado.prom[d.prom] = [0, 0, 0, 0, 0, 0, 0]);
        fila[+d.dia] = (v == null || Number.isNaN(v)) ? 0 : Math.round(v);
        D.guardarProm(); pintarPromedios();
      } else if (e.target.closest('#pParam')) {
        if (cambiosParametros(e)) return;
        const id = e.target.id, P = D.estado.params;
        if (id === 'inModo') P.horizonteModo = e.target.value;
        else if (id === 'inCorte') P.cortePorProduccion = Math.max(1, Number(e.target.value) || 1);
        else if (id === 'inFijo') P.horizonteFijo = Math.max(1, Number(e.target.value) || 1);
        else if (id === 'inFactor2') P.factorTemporada = Math.max(0, Number(e.target.value) || 1);
        else if (id === 'inAnt') P.pedidos.anticipacion = Math.max(0, Math.round(Number(e.target.value) || 0));
        /* La referencia se guarda en el domingo de esa semana, así da igual
           qué día del rango se elija. */
        else if (id === 'inRotDesde') {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) P.rotacion.desde = D.domingoDe(v);
          D.guardarParams(); pintarParametros(); pintarProduccion(); return;
        } else if (id === 'inRotAm') {
          P.rotacion.amPrimero = e.target.value;
          D.guardarParams(); pintarParametros(); pintarProduccion(); return;
        }
        else return;
        D.guardarParams();
      }
    });

    document.addEventListener('click', (e) => {
      const fp = e.target.closest('[data-fped]');
      if (fp) { ui.filtroPed = fp.dataset.fped; pintarPedidos(); return; }
      const pe = e.target.closest('[data-pedent]');
      if (pe) {
        D.estado.pedidos[pe.dataset.pedent].estado = 'entregado';
        D.guardarPedidos(); pintarPedidos(); pintarProduccion(); aviso('Pedido marcado entregado.');
        return;
      }
      const pr = e.target.closest('[data-pedreab]');
      if (pr) {
        D.estado.pedidos[pr.dataset.pedreab].estado = 'pendiente';
        D.guardarPedidos(); pintarPedidos(); pintarProduccion(); aviso('Pedido reabierto.');
        return;
      }
      const pb = e.target.closest('[data-pedborrar]');
      if (pb) {
        const p = D.estado.pedidos[pb.dataset.pedborrar];
        preguntar('Borrar el pedido',
          `<p>Se quita <b>${esc(p.clave)}</b>, ${esc(n0(p.bolsas))} bolsas para ${esc(p.cliente || 'sin cliente')}
             del ${esc(D.fechaCorta(p.fecha))}.</p>
           <p>Si ya se entregó, mejor márcalo entregado: así queda el registro.</p>`, 'Borrar')
          .then((si) => {
            if (!si) return;
            delete D.estado.pedidos[pb.dataset.pedborrar];
            D.guardarPedidos(); pintarPedidos(); pintarProduccion(); aviso('Pedido borrado.');
          });
        return;
      }
      const tb = e.target.closest('[data-tabla]');
      if (tb) { exportarTabla(tb.dataset.tabla); return; }
      const vi = e.target.closest('[data-vista]');
      if (vi) { ui.vistaHist = vi.dataset.vista; pintarHistorial(); return; }
      if (e.target.closest('#btnDesdeCal')) {
        const P = D.estado.params;
        const fam = ui.famMatriz || '';
        const nueva = C.matrizDesdeCalendario(P, fam ? plantasDeFamilia(fam) : null);
        if (fam) P.cobertura.familias[fam] = nueva; else P.cobertura.general = nueva;
        P.horizonteModo = 'tabla';
        $('#inModo').value = 'tabla';
        D.guardarParams(); pintarMatriz();
        aviso('Tabla armada con los días del calendario. Ahora se puede ajustar a mano.');
        return;
      }
      const b = e.target.closest('.verDet');
      if (b) { ui.abierta = ui.abierta === b.dataset.clave ? null : b.dataset.clave; pintarProduccion(); return; }
      const ab = e.target.closest('[data-abrir]');
      if (ab) { ui.fecha = ab.dataset.abrir; recordarFecha(); window.irA('prod'); aviso('Abierto ' + D.fechaCorta(ui.fecha)); return; }
      const bo = e.target.closest('[data-borrar]');
      if (bo) {
        preguntar('Borrar el día', `<p>Se quita ${esc(D.fechaCorta(bo.dataset.borrar))} del historial. No se puede deshacer.</p>`, 'Borrar')
          .then((si) => { if (si) { delete D.estado.dias[bo.dataset.borrar]; D.guardarDias(); pintarHistorial(); aviso('Día borrado.'); } });
      }
    });

    // guardar / reiniciar
    $('#btnGuardarDia').onclick = () => {
      const r = reg(), t = calc();
      r.calc = {};
      t.filas.forEach((f) => {
        r.calc[f.clave] = {
          sugeridoQQ: f.sugeridoQQ, teoricoHoy: Math.round(f.teoricoHoy),
          teoricoManana: Math.round(f.teoricoManana),
          cobertura: f.cobertura == null ? null : Math.round(f.cobertura * 10) / 10,
          alerta: f.alerta, promDia: Math.round(f.promDia),
          stockAyer: Math.round(f.stockAyer), prodAyerQQ: f.prodAyerQQ,
          difVenta: f.difVenta == null ? null : Math.round(f.difVenta),
        };
      });
      r.cerrado = true; r.guardadoEn = new Date().toISOString();
      if (D.guardarDias()) { aviso(`Guardado ${D.fechaCorta(ui.fecha)}.`); pintarProduccion(); sincronizar(false); }
      else aviso('No se pudo guardar: el almacenamiento del navegador está lleno. Descarga un respaldo y borra días viejos.', 'err');
    };
    $('#btnReiniciar').onclick = async () => {
      if (await preguntar('Empezar de nuevo',
        '<p>Borra el inventario, la producción y el reparto <b>de este día</b>. Los ajustes, los promedios y el historial no se tocan.</p>', 'Borrar el día')) {
        D.estado.dias[ui.fecha] = D.registroVacio(ui.fecha);
        D.guardarDias(); ui.abierta = null; pintarProduccion(); pintarInventario(); aviso('Día en blanco.');
      }
    };

    // inventario
    $('#btnCopiarAyer').onclick = () => {
      const f = D.diaPrevio(ui.fecha, 'inv');
      if (!f) { aviso('No hay ningún día anterior con INV PM guardado.', 'err'); return; }
      const prev = D.migrar(D.estado.dias[f]), r = reg();
      let n = 0;
      D.claves().forEach((c) => {
        const v = prev.invPM[c];
        if (v != null) { r.stockAyer[c] = v; n++; }
      });
      D.guardarDias(); pintarInventario();
      aviso(`STOCK AYER cargado con el INV PM de ${D.fechaCorta(f)}: ${n} claves.`);
    };

    /* El INV PM es el cierre del día de la hoja: primero se decide a qué día
       entra y recién después se escribe. */
    async function entraEn(fecha, que) {
      if (!fecha || fecha === ui.fecha) return ui.fecha;
      const si = await preguntar('La hoja trae otra fecha',
        `<p>La hoja dice <b>${esc(D.fechaCorta(fecha))}</b> y estás trabajando el <b>${esc(D.fechaCorta(ui.fecha))}</b>.</p>
         <p>¿Guardo ${esc(que || 'el INV PM')} en el día de la hoja?</p>`, 'Usar el de la hoja');
      if (!si) return ui.fecha;
      ui.fecha = fecha; ui.abierta = null; recordarFecha();
      return fecha;
    }

    $('#btnFoto').onclick = () => window.Lector.abrir(async (res) => {
      const destino = await entraEn(res.fecha);
      const n = aplicarCrudo(res.crudo, destino);
      if (res.blob) await descargar(res.blob, res.nombre, TIPO_XLSX);
      pintarInventario(); pintarProduccion();
      aviso(`INV PM de ${n} claves en ${D.fechaCorta(destino)}.`
        + (res.blob ? ' El Excel se descargó.' : '')
        + (res.dudosas && res.dudosas.length ? ` Revisa: ${res.dudosas.join(', ')}.` : ''));
    });

    /* La foto de Zona 2 trae lo que YA se produjo, así que pisa el reparto de
       esos turnos en vez de sumarse: lo que diga la hoja es lo que hubo. Los
       demás turnos no se tocan.
       Va al día que dice la hoja, sin preguntar: esa foto llega al día
       siguiente y siempre trae la producción de ayer. Preguntarlo todos los
       días sería un clic de más para la respuesta de siempre. */
    $('#btnFotoZ2').onclick = () => window.LectorZ2.abrir(async (res) => {
      const destino = res.fecha || ui.fecha;
      const r = D.registro(destino);
      const ids = D.turnosDeArea('Z2').map((t) => t.id);
      let n = 0;
      D.clavesDeArea('Z2').forEach((c) => {
        if (!r.turnos[c]) r.turnos[c] = {};
        ids.forEach((t) => { delete r.turnos[c][t]; });
        const fila = res.matriz[c];
        if (!fila) return;
        Object.entries(fila).forEach(([t, v]) => { r.turnos[c][t] = v; });
        n++;
      });
      D.guardarDias();
      pintarInventario(); pintarProduccion();
      const qq = Object.values(res.matriz).reduce((a, f) =>
        a + Object.values(f).reduce((x, v) => x + v, 0), 0);
      aviso(`Producción de Zona 2 guardada en el ${D.fechaCorta(destino)}`
        + `${destino !== ui.fecha ? ', que es el día de la hoja' : ''}: `
        + `${n} claves, ${n2(C.redondea(qq, 2))} qq.`
        + (res.dudosas && res.dudosas.length ? ` Revisa ${res.dudosas.length} celda${res.dudosas.length > 1 ? 's' : ''}.` : ''));
    });

    // impresión bolsa
    $('#inFechaBolsa').onchange = (e) => {
      ui.fechaBolsa = e.target.value || D.hoyISO(); pintarBolsa();
    };
    ['#inHd7z2', '#inMu1'].forEach((s) => {
      $(s).onchange = (e) => {
        window.Bolsa.escribir(ui.fechaBolsa, s === '#inHd7z2' ? 'hd7z2' : 'mu1', null, e.target.value);
        pintarBolsa();
      };
    });
    $('#tbodyBolsa').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.matches('input.inqq')) return;
      window.Bolsa.escribir(ui.fechaBolsa, t.dataset.bcampo, t.dataset.bid, t.value);
      pintarBolsa();
    });
    /* La sugerencia del reparto se copia tocándola, no entra sola: lo que va
       en esa columna es lo que de verdad se produjo hoy en Zona 2. */
    $('#tbodyBolsa').addEventListener('click', (e) => {
      const p = e.target.closest('[data-bplan]');
      if (!p) return;
      window.Bolsa.escribir(ui.fechaBolsa, 'qqAmZ2', p.dataset.bplan, p.dataset.bval);
      pintarBolsa();
    });
    /* Enter baja por la misma columna, que es como se llena una hoja así: una
       columna entera de arriba abajo, no una fila a la vez. */
    $('#tbodyBolsa').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input.inqq')) return;
      e.preventDefault();
      const campo = e.target.dataset.bcampo;
      const ins = [...document.querySelectorAll(`#tbodyBolsa input.inqq[data-bcampo="${campo}"]`)];
      const i = ins.indexOf(e.target);
      /* Al cambiar el valor la tabla se vuelve a pintar, así que el siguiente
         campo se busca después de ese repintado. */
      const sig = ins[i + 1];
      const id = sig && sig.dataset.bid;
      e.target.blur();
      if (!id) return;
      setTimeout(() => {
        const n = document.querySelector(`#tbodyBolsa input.inqq[data-bcampo="${campo}"][data-bid="${CSS.escape(id)}"]`);
        if (n) { n.focus(); n.select(); }
      }, 0);
    });
    /* Un toque en la celda del teléfono o la tablet selecciona lo que hay,
       para escribir encima sin tener que borrar. */
    $('#tbodyBolsa').addEventListener('focusin', (e) => {
      if (e.target.matches('input.inqq')) e.target.select();
    });
    $('#btnBolsaPdf').onclick = async () => {
      try {
        const { blob, nombre } = window.Bolsa.pdf(ui.fechaBolsa);
        const r = await descargar(blob, nombre, window.Archivo.TIPO_PDF);
        if (r.modo === 'cancelado') return;
        aviso(`PDF guardado${donde(r)}.`);
      } catch (err) { aviso('No se pudo armar el PDF: ' + err.message, 'err'); }
    };

    // cálculos secundarios
    $('#secCont').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.matches('input.inqq')) return;
      const S = window.Secundarios, d = t.dataset;
      const datos = S.leer();
      if (d.st) S.escribir(datos, d.st, d.sf, d.sc, t.value);
      else if (d.sb) {
        if (!datos.belca) datos.belca = {};
        if (!datos.belca[d.sb]) datos.belca[d.sb] = {};
        const v = String(t.value).trim();
        if (v === '') delete datos.belca[d.sb][d.sc]; else datos.belca[d.sb][d.sc] = v;
        S.grabar(datos);
      } else if (d.scz) {
        if (!datos.cz) datos.cz = {};
        const v = String(t.value).trim();
        if (v === '') delete datos.cz[d.scz]; else datos.cz[d.scz] = v;
        S.grabar(datos);
      }
      pintarSecundarios();
    });
    /* Enter baja por la misma columna, igual que en impresión de bolsa. */
    $('#secCont').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input.inqq')) return;
      e.preventDefault();
      const tabla = e.target.closest('table');
      const i = [...tabla.querySelectorAll('input.inqq')].indexOf(e.target);
      const col = [...e.target.closest('tr').children].indexOf(e.target.closest('td'));
      const sig = [...tabla.querySelectorAll('tbody tr')]
        .map((r) => r.children[col] && r.children[col].querySelector('input.inqq'))
        .filter(Boolean);
      const act = sig.indexOf(e.target);
      const n = sig[act + 1];
      e.target.blur();
      if (n) setTimeout(() => { n.focus(); n.select(); }, 0);
      else if (i < 0) { /* sin tabla, nada que hacer */ }
    });
    $('#secCont').addEventListener('focusin', (e) => {
      if (e.target.matches('input.inqq')) e.target.select();
    });
    $('#btnSecLimpiar').onclick = async () => {
      if (!await preguntar('Limpiar los cálculos',
        '<p>Se borra todo lo escrito en esta pestaña. No afecta inventario, producción ni historial.</p>',
        'Limpiar')) return;
      window.Secundarios.limpiar(); pintarSecundarios(); aviso('Cálculos en cero.');
    };

    $('#btnImportInv').onclick = () => $('#fileInv').click();
    $('#fileInv').onchange = (e) => importar(e, async (libro, archivo) => {
      const { crudo, origen } = await X.leerInventario(libro);
      if (!crudo || !Object.keys(crudo).length) throw new Error('No encontré inventario en ese archivo.');
      const m = /(\d{4})[_-](\d{2})[_-](\d{2})/.exec(archivo.name || '');
      const destino = await entraEn(m ? `${m[1]}-${m[2]}-${m[3]}` : null);
      const n = aplicarCrudo(crudo, destino);
      pintarInventario(); pintarProduccion();
      return `INV PM de ${n} claves en ${D.fechaCorta(destino)} (${origen}).`;
    });

    // promedios
    $('#btnImportProm').onclick = () => $('#fileProm').click();
    $('#fileProm').onchange = (e) => importar(e, async (libro) => {
      const { prom, n } = await X.leerPromedios(libro);
      Object.assign(D.estado.prom, prom); D.guardarProm(); pintarPromedios();
      return `Promedios actualizados en ${n} claves.`;
    });
    $('#btnResetProm').onclick = async () => {
      if (await preguntar('Volver a los promedios de fábrica', '<p>Se pierden los cambios que hayas hecho a mano.</p>', 'Restaurar')) {
        D.estado.prom = JSON.parse(JSON.stringify(D.PROM_INICIAL)); D.guardarProm(); pintarPromedios(); aviso('Promedios restaurados.');
      }
    };

    // historial
    $('#btnExportHist').onclick = () => exportarTabla('todo');
    $('#btnImportHist').onclick = () => $('#fileHist').click();
    $('#fileHist').onchange = (e) => importar(e, async (libro) => {
      const { dias, resumen } = await X.leerHistorial(libro);
      if (!resumen.dias) {
        throw new Error('No encontré hojas de historial. Deben llamarse Hx Prod, Hx Prod_x_Turno o Hx Inv.');
      }
      const nuevos = Object.keys(dias).filter((f) => !D.estado.dias[f]).length;
      const pisa = Object.keys(dias).length - nuevos;
      const si = await preguntar('Subir historial',
        `<p>El archivo trae <b>${resumen.dias} días</b> en ${esc(resumen.hojas.join(', '))}.</p>
         <p>${nuevos} se agregan${pisa ? ` y ${pisa} ya existen: en esos se completa lo que falte sin borrar lo que ya hay` : ''}.</p>`,
        'Subir');
      if (!si) return 'Cancelado.';
      Object.entries(dias).forEach(([f, nuevo]) => {
        if (!D.estado.dias[f]) { D.estado.dias[f] = nuevo; return; }
        const r = D.migrar(D.estado.dias[f]);
        Object.entries(nuevo.invPM).forEach(([c, v]) => { if (r.invPM[c] == null) r.invPM[c] = v; });
        r.prodImport = { ...(nuevo.prodImport || {}), ...(r.prodImport || {}) };
        r.turnoImport = { ...(nuevo.turnoImport || {}), ...(r.turnoImport || {}) };
      });
      D.guardarDias(); pintarHistorial();
      return `Historial subido: ${resumen.dias} días.`;
    });
    $('#btnRespaldo').onclick = async () => {
      const data = { version: VERSION, fecha: new Date().toISOString(),
        params: D.estado.params, prom: D.estado.prom, pedidos: D.estado.pedidos,
        dias: D.estado.dias, bolsa: D.estado.bolsa };
      const r = await descargar(new Blob([JSON.stringify(data)], { type: 'application/json' }),
        `Respaldo_Produccion_${D.hoyISO().replace(/-/g, '_')}.json`, TIPO_JSON);
      if (r.modo === 'cancelado') return;
      aviso('Respaldo guardado' + donde(r) + '. Guárdalo fuera de la tablet.');
    };
    $('#btnRestaurar').onclick = () => $('#fileResp').click();
    $('#fileResp').onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (!d || typeof d !== 'object' || !d.dias) throw new Error('El archivo no es un respaldo de esta app.');
        if (!await preguntar('Restaurar respaldo',
          `<p>Reemplaza ajustes, promedios e historial por los del archivo (${Object.keys(d.dias).length} días).</p>`, 'Restaurar')) return;
        D.estado.params = D.fusionarParams(d.params);
        if (d.prom) D.estado.prom = d.prom;
        if (d.pedidos) D.estado.pedidos = d.pedidos;
        if (d.bolsa) D.estado.bolsa = d.bolsa;
        D.estado.dias = d.dias;
        D.guardarParams(); D.guardarProm(); D.guardarPedidos(); D.guardarDias(); D.guardarBolsa();
        pintarHistorial(); aviso('Respaldo restaurado.');
      } catch (err) { aviso('No se pudo restaurar: ' + err.message, 'err'); }
    };

    // ajustes: importar rendimientos
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btnImportRend')) $('#fileRend').click();
      const P = D.estado.params;
      const ed = e.target.closest('[data-editar]');
      if (ed) { fichaProducto(ed.dataset.editar); return; }
      if (e.target.closest('#btnNuevoProd')) { fichaProducto(null); return; }

      // --- feriados ---
      if (e.target.closest('#btnAddFeriado')) {
        const fe = $('#inFerFecha').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fe)) { aviso('Pon la fecha del feriado.', 'err'); return; }
        if ((P.feriados || []).some((x) => x.fecha === fe)) { aviso('Ese feriado ya está puesto.', 'err'); return; }
        P.feriados.push(D.feriadoNuevo(fe, ($('#inFerNom').value || '').trim() || 'Feriado'));
        D.guardarParams(); pintarParametros(); pintarProduccion();
        aviso(`Feriado del ${D.fechaCorta(fe)} agregado: se descansa el día anterior y se produce el feriado.`);
        return;
      }
      /* Cada toque pasa la celda al siguiente estado. En la tablet es un solo
         toque, que es como se corrige una hoja así. */
      const cel = e.target.closest('.celfer');
      if (cel) {
        const f = P.feriados[+cel.dataset.fer];
        if (!f) return;
        const dia = f.dias[cel.dataset.dia] || (f.dias[cel.dataset.dia] = {});
        const act = dia[cel.dataset.cel] || 'SI';
        const i = D.ESTADOS.findIndex((x) => x.id === act);
        dia[cel.dataset.cel] = D.ESTADOS[(i + 1) % D.ESTADOS.length].id;
        D.guardarParams(); pintarFeriados(); pintarProduccion();
        return;
      }
      const fdel = e.target.closest('[data-ferdel]');
      if (fdel) {
        const f = P.feriados[+fdel.dataset.ferdel];
        if (!f) return;
        preguntar('Quitar el feriado',
          `<p>Los días del <b>${esc(f.nombre)}</b> vuelven al calendario de la semana.</p>`, 'Quitar')
          .then((si) => {
            if (!si) return;
            P.feriados.splice(+fdel.dataset.ferdel, 1);
            D.guardarParams(); pintarParametros(); pintarProduccion(); aviso('Feriado quitado.');
          });
        return;
      }
      const fimg = e.target.closest('[data-ferimg]');
      if (fimg) { compartirFeriado(P.feriados[+fimg.dataset.ferimg]); return; }
      const qu = e.target.closest('[data-quitar]');
      if (qu) {
        const c = qu.dataset.quitar;
        preguntar('Quitar el producto',
          `<p>Se saca <b>${esc(c)}</b> del catálogo. El historial ya guardado no se toca, pero la clave deja de aparecer.</p>
           <p>Si sólo quieres dejar de producirla, desmarca <b>Activo</b> en vez de quitarla.</p>`, 'Quitar')
          .then((si) => {
            if (!si) return;
            P.catalogo = P.catalogo.filter((x) => x !== c);
            if (!P.quitados.includes(c)) P.quitados.push(c);
            delete P.prod[c];
            D.guardarParams(); pintarParametros(); aviso(`${c} fuera del catálogo.`);
          });
        return;
      }
      if (e.target.closest('#btnNuevoDif')) {
        preguntarTexto('Nuevo cálculo', 'Clave destino (una del catálogo)', '').then((destino) => {
          if (!destino) return;
          P.diferenciados.push({ destino: destino.trim().toUpperCase(), activo: true,
            partes: [{ clave: destino.trim().toUpperCase(), mult: 1, div: 1 }] });
          D.guardarParams(); pintarParametros(); aviso('Cálculo agregado.');
        });
        return;
      }
      const dm = e.target.closest('[data-dmas]');
      if (dm) { P.diferenciados[+dm.dataset.dmas].partes.push({ clave: '', mult: 1, div: 1 }); D.guardarParams(); pintarParametros(); return; }
      const dq = e.target.closest('[data-dquitar]');
      if (dq) { P.diferenciados[+dq.dataset.dquitar].partes.splice(+dq.dataset.j, 1); D.guardarParams(); pintarParametros(); return; }
      const db = e.target.closest('[data-dborrar]');
      if (db) { P.diferenciados.splice(+db.dataset.dborrar, 1); D.guardarParams(); pintarParametros(); return; }
      if (e.target.closest('#btnResetParam')) {
        preguntar('Volver a los valores de fábrica',
          '<p>Se pierden topes, múltiplos, vida útil, plantas y calendario que hayas cambiado.</p>'
          + '<p>Lo que guardaste como <b>tus valores</b> no se toca.</p>', 'Restaurar')
          .then((si) => {
            if (!si) return;
            D.estado.params = D.paramsPorDefecto();
            D.guardarParams(); pintarParametros(); pintarProduccion();
            aviso('Parámetros de fábrica restaurados.');
          });
        return;
      }
      if (e.target.closest('#btnCarpCambiar')) {
        window.Archivo.elegirCarpeta()
          .then((n) => { if (n) aviso(`Los archivos van a quedar en ${n}.`); pintarCarpeta(); })
          .catch((err) => aviso('No se pudo elegir la carpeta: ' + err.message, 'err'));
        return;
      }
      if (e.target.closest('#btnCarpQuitar')) {
        window.Archivo.olvidarCarpeta().then(() => { pintarCarpeta(); aviso('Vuelven a ir a Descargas.'); });
        return;
      }
      if (e.target.closest('#btnSyncYa') || e.target.closest('#btnSync')) { sincronizar(true); return; }
      if (e.target.closest('#btnSyncOlvidar')) {
        preguntar('Empezar de cero la sincronización',
          '<p>Se olvida lo que este equipo sabía de la otra. En la próxima sincronización se vuelve a preguntar con cuál quedarse.</p>'
          + '<p>No borra datos: sólo la memoria de la comparación.</p>', 'Olvidar')
          .then((si) => { if (si) { window.Sync.reiniciar(); pintarSync(); aviso('Listo, la próxima vez vuelve a preguntar.'); } });
        return;
      }
      if (e.target.closest('#btnFijarDef')) {
        const hay = D.hayDefecto();
        preguntar('Sobrescribir mis valores por defecto',
          `<p>Toda la configuración de esta pantalla queda guardada como tu punto de partida:
             horizonte, días a cubrir, turnos y plantas, vida útil, calendario, productos y diferenciados.</p>
           ${hay ? '<p>Se reemplazan los que tenías guardados.</p>' : ''}`, 'Sobrescribir')
          .then((si) => {
            if (!si) return;
            D.estado.params.guardadoEn = new Date().toISOString();
            D.guardarParams();
            aviso(D.fijarDefecto() ? 'Guardados como tus valores por defecto.'
                                   : 'No se pudo guardar: el almacenamiento está lleno.', D.hayDefecto() ? '' : 'err');
            pintarParametros();
          });
        return;
      }
      if (e.target.closest('#btnVolverDef')) {
        if (!D.hayDefecto()) { aviso('Todavía no has guardado valores propios.', 'err'); return; }
        preguntar('Volver a mis valores',
          '<p>La configuración regresa a la que guardaste. Los promedios y el historial no se tocan.</p>', 'Volver')
          .then((si) => {
            if (!si) return;
            D.estado.params = D.fusionarParams(D.misDefecto());
            D.guardarParams(); pintarParametros(); pintarProduccion();
            aviso('Volviste a tus valores por defecto.');
          });
        return;
      }
    });
    document.addEventListener('change', (e) => {
      const S = window.Sync, id0 = e.target.id;
      if (id0 === 'chkSync') {
        S.setCfg('syncOn', e.target.checked ? '1' : '0');
        pintarSync();
        if (e.target.checked && S.clave()) sincronizar(true);
        return;
      }
      if (id0 === 'inSyncClave') {
        S.setCfg('syncClave', e.target.value.trim());
        pintarSync();
        aviso('Clave guardada en este equipo. Tiene que ser la misma en el otro.');
        return;
      }
      const F = window.Lector, id = e.target.id;
      if (id === 'modoLlave' || id === 'modoServidor') { F.setCfg('modo', id === 'modoLlave' ? 'llave' : 'servidor'); pintarLector(); return; }
      if (id === 'inKey') { F.setCfg('key', e.target.value.trim()); pintarLector(); aviso('Llave guardada en este dispositivo.'); return; }
      if (id === 'inUrl') { F.setCfg('url', e.target.value.trim()); pintarLector(); aviso('Dirección guardada.'); return; }
      if (id === 'inModelo') { F.setCfg('modelo', e.target.value.trim() || F.MODELO); return; }
      if (id !== 'fileRend') return;
      importar(e, async (libro) => {
        const { rend, n } = await X.leerRendimientos(libro);
        Object.entries(rend).forEach(([c, v]) => { if (D.estado.params.prod[c]) D.estado.params.prod[c].rend = v; });
        D.guardarParams(); pintarParametros();
        return `Rendimientos actualizados en ${n} claves.`;
      });
    });
  }

  /** Pide un texto en el mismo cuadro de diálogo de siempre. */
  function preguntarTexto(titulo, etiqueta, valor) {
    return preguntar(titulo,
      `<div class="campo"><label for="txtIn">${esc(etiqueta)}</label>
       <input type="text" id="txtIn" value="${esc(valor || '')}" style="min-width:240px"></div>`, 'Aceptar')
      .then((si) => (si ? ($('#txtIn') ? $('#txtIn').value.trim() : '') : null));
  }

  /**
   * Alta y cambio de clave. Renombrar arrastra la ficha, los promedios y todo
   * el historial, que es lo que hace falta cuando IN16 pasa a ser LS19B.
   */
  function fichaProducto(clave) {
    const P = D.estado.params;
    const c = clave ? P.prod[clave] : D.fichaDe({ clave: '', familia: 'SANDWICH', rend: 100, mult: 1, turnos: [] });
    const campo = (id, et, val, tipo = 'text', extra = '') =>
      `<div class="campo"><label for="${id}">${esc(et)}</label>
       <input type="${tipo}" id="${id}" value="${esc(val)}" ${extra} style="min-width:150px"></div>`;
    preguntar(clave ? `Editar ${clave}` : 'Agregar producto', `
      <div class="fila">
        ${campo('fpClave', 'Clave', c.clave || '')}
        <div class="campo"><label for="fpFam">Familia</label>
          <select id="fpFam" style="min-width:170px">
            ${D.FAMILIAS.map((f) => `<option value="${f.id}" ${c.familia === f.id ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}
          </select></div>
        ${campo('fpUni', 'Unidad de medida', c.unidad || 'bolsas')}
      </div>
      <div class="fila" style="margin-top:10px">
        ${campo('fpRend', 'Rendimiento (por qq)', c.rend, 'number', 'min="1" step="1"')}
        ${campo('fpMult', 'Múltiplo de producción (qq)', c.mult, 'number', 'min="0" step="0.01"')}
        ${campo('fpCod', 'Código', c.codigo ?? '')}
      </div>
      <div class="fila" style="margin-top:10px">
        ${D.PLANTAS.map((x) => `<label class="sw"><input type="checkbox" data-fppl="${x.id}"
          ${(c.plantas || {})[x.id] ? 'checked' : ''}> Se produce en ${esc(x.nombre)}</label>`).join('')}
      </div>
      <p class="dim" style="font-size:.84rem;margin:12px 2px 0">
        Los topes de producción salen de los turnos: marca abajo, en la tabla de productos, cuáles turnos pueden hacerla.
        ${clave ? 'Al cambiar la clave se renombra también en los promedios y en todo el historial.' : ''}</p>`,
      clave ? 'Guardar' : 'Agregar')
      .then((si) => {
        if (!si) return;
        const nueva = ($('#fpClave').value || '').trim().toUpperCase();
        if (!nueva) { aviso('La clave no puede quedar vacía.', 'err'); return; }
        if (nueva !== clave && P.prod[nueva]) { aviso(`Ya existe la clave ${nueva}.`, 'err'); return; }
        const ficha = {
          ...(clave ? c : D.fichaDe({ clave: nueva, familia: $('#fpFam').value, rend: 100, mult: 1, turnos: [] })),
          clave: nueva,
          familia: $('#fpFam').value,
          unidad: ($('#fpUni').value || 'bolsas').trim(),
          rend: Math.max(1, Number($('#fpRend').value) || 1),
          mult: Math.max(0, Math.round((Number($('#fpMult').value) || 0) * 100) / 100),
          codigo: ($('#fpCod').value || '').trim() || null,
          plantas: Object.fromEntries(D.PLANTAS.map((x) =>
            [x.id, $(`[data-fppl="${x.id}"]`).checked])),
        };
        if (!Object.values(ficha.plantas).some(Boolean)) ficha.plantas.Z18 = true;
        if (clave && nueva !== clave) renombrar(clave, nueva);
        P.prod[nueva] = ficha;
        if (!P.catalogo.includes(nueva)) P.catalogo.push(nueva);
        P.quitados = (P.quitados || []).filter((x) => x !== nueva);
        D.guardarParams(); D.guardarProm(); D.guardarDias();
        pintarParametros();
        aviso(clave ? (nueva !== clave ? `${clave} ahora es ${nueva}.` : `${nueva} actualizado.`) : `${nueva} agregado.`);
      });
  }

  /** Arrastra una clave vieja a la nueva en catálogo, promedios e historial. */
  function renombrar(viejo, nuevo) {
    const P = D.estado.params;
    P.catalogo = P.catalogo.map((x) => (x === viejo ? nuevo : x));
    if (!P.quitados.includes(viejo)) P.quitados.push(viejo);
    P.quitados = P.quitados.filter((x) => x !== nuevo);
    delete P.prod[viejo];
    (P.diferenciados || []).forEach((d) => {
      if (d.destino === viejo) d.destino = nuevo;
      d.partes.forEach((x) => { if (x.clave === viejo) x.clave = nuevo; });
    });
    if (D.estado.prom[viejo]) { D.estado.prom[nuevo] = D.estado.prom[viejo]; delete D.estado.prom[viejo]; }
    Object.values(D.estado.dias).forEach((r) => {
      D.migrar(r);
      ['invPM', 'stockAyer', 'prodAyer', 'turnos', 'calc', 'prodImport'].forEach((k) => {
        const o = r[k];
        if (o && o[viejo] !== undefined) { o[nuevo] = o[viejo]; delete o[viejo]; }
      });
    });
  }

  async function importar(e, fn) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    espera(true, `Leyendo ${f.name}…`);
    try { aviso(await fn(await X.abrir(f), f)); }
    catch (err) { aviso('No se pudo leer: ' + err.message, 'err'); }
    finally { espera(false); }
  }

  // ---------- instalación ----------
  function instalacion() {
    const btn = $('#btnInstalar');
    let ev = null;
    const puesta = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const refrescar = () => { btn.hidden = puesta(); };
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ev = e; refrescar(); });
    window.addEventListener('appinstalled', () => { ev = null; refrescar(); aviso('App instalada.'); });
    btn.onclick = async () => {
      if (ev) { const g = ev; ev = null; try { g.prompt(); await g.userChoice; } catch (_) {} refrescar(); return; }
      const ua = navigator.userAgent;
      const pasos = /iPhone|iPad|iPod/.test(ua)
        ? 'Toca Compartir y elige “Añadir a pantalla de inicio”.'
        : /Android/.test(ua)
          ? 'Abre el menú de tres puntos y elige “Instalar aplicación”.'
          : 'Busca el ícono de instalar en la barra de direcciones, o el menú del navegador.';
      preguntar('Instalar la app', `<p>${pasos}</p>`, 'Entendido');
    };
    refrescar();
  }

  /* Volver al app después de un rato es justo cuando conviene traer lo que el
     otro equipo dejó. Como ya no sube nada si nada cambió, mirar seguido no
     cuesta escrituras. */
  let ultimoFoco = Date.now();
  function vigilarFoco() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimoFoco < 120000) return;
      ultimoFoco = Date.now();
      if (window.Sync.activo()) sincronizar(false);
    });
  }

  /* Al abrir: se mira si este despliegue sabe sincronizar y, si está encendida,
     se hace una pasada para arrancar con lo último. */
  async function arrancarSync() {
    const S = window.Sync;
    try {
      const d = await S.disponible();
      ui.syncHay = !!d.hay;
      if (d.hay && d.ok && S.cfg('syncOn') === '' && !S.clave()) {
        /* Hay módulo pero nunca se configuró: se deja apagada y se avisa
           una sola vez, sin estorbar. */
        S.setCfg('syncOn', '0');
      }
    } catch (_) { ui.syncHay = false; }
    pintarSync();
    if (S.activo()) sincronizar(false);
  }

  // ---------- arranque ----------
  function iniciar() {
    $('#badgeVer').textContent = VERSION;
    enlazar(); instalacion(); autodetectarLector(); arrancarSync(); vigilarFoco();
    let t = 'prod';
    try { t = localStorage.getItem('panprod_tab') || 'prod'; } catch (_) {}
    window.irA(['prod', 'inv', 'ped', 'hist', 'prom', 'param'].includes(t) ? t : 'prod');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
