/* Interfaz: tablero de producción, inventario, historial, promedios y ajustes. */
(function () {
  'use strict';
  const D = window.Datos, C = window.Calculo, X = window.Excel;
  const VERSION = 'V.2026.41';
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
  const ui = { fecha: ultimaFecha || D.hoyISO(), abierta: null, tab: 'prod', sinCupo: null, sinTurnoHoy: null, famMatriz: '', vistaHist: 'turno', filtroPed: 'vivos', ventaClave: 'CZ5', pedResFecha: '' };
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
      kpi('Sugerido total', n1(sug) + ' QQ') +
      kpi('Decidido', n1(dec) + ' QQ', dec > 0 ? 'bien' : '') +
      kpi('Claves con faltante', faltan, faltan ? 'alerta' : 'bien') +
      kpi('Turnos al tope', `${tope} de ${Object.values(t.turnos).filter((x) => x.activo).length}`);

    // --- el sugerido partido por planta ---
    const pl = t.plantas;
    const tarjetas = D.PLANTAS.map((x) => {
      const v = pl[x.id];
      const pct = v.tope > 0 ? Math.min(100, Math.round((v.decidido / v.tope) * 100)) : 0;
      return `<div class="planta ${v.trabaja ? '' : 'apagado'}">
        <b>${esc(v.nombre)}${v.trabaja ? '' : ' <span class="dim" style="font-weight:400;font-size:.8rem">no trabaja hoy</span>'}</b>
        <div class="qq"><strong>${n1(v.sugerido)}</strong><span>QQ sugeridos</span></div>
        <div class="barra"><i style="width:${pct}%"></i></div>
        <span class="dim" style="font-size:.82rem">${n2(v.decidido)} decididos de ${n2(v.tope)} QQ de capacidad</span>
      </div>`;
    }).join('');
    const amb = pl.AMBAS;
    const extra = amb.sugerido > 0 ? `<div class="planta ambas">
        <b>Más de una planta</b>
        <div class="qq"><strong>${n1(amb.sugerido)}</strong><span>QQ sugeridos</span></div>
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
        <div class="qq"><strong>${n2(x.usado)}</strong><span>de ${n2(x.tope)} QQ</span></div>
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
    if (exc.length) av.push(['err', 'Hay turnos pasados de tope', exc.map((x) => `${x.nombre}: ${n2(x.usado)} de ${n2(x.tope)} QQ`).join(' · ')]);
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

    /* Lo que la foto de Zona 2 dejó en el día anterior, por persona. Sin esto
       la lectura se guarda y no se ve desde el día a producir, que es donde
       uno la busca. */
    function lineaAyerZ2(turnos) {
      const fA = D.sumarDias(ui.fecha, -1);
      const porT = D.porTurnoDe(fA);
      const hay = turnos.some((x) => Number(porT[x.id]) > 0);
      const total = turnos.reduce((a, x) => a + (Number(porT[x.id]) || 0), 0);
      const det = turnos.map((x) => `${esc(x.nombre)} <b>${porT[x.id] ? n2(porT[x.id]) : '—'}</b>`).join(' · ');
      return `<div class="ayerz2${hay ? '' : ' nada'}">
        <span>Producido el ${esc(D.fechaCorta(fA))}</span>
        ${hay ? `${det} · <b>${n2(C.redondea(total, 2))} QQ</b>`
          : 'Todavía no se ha leído la foto de ese día. Se lee con «Leer foto Z2» y queda guardada en el día de la hoja.'}
      </div>`;
    }

    const cuerpo = D.areasUsadas().map((area) => {
      const turnos = D.turnosDeArea(area.id);
      const filas = D.clavesDeArea(area.id).map((c) => porClave[c]).filter(Boolean);
      if (!filas.length) return '';
      const ids = turnos.map((x) => x.id);
      const th = `<tr>
        ${th2('Clave', '', 'l')}
        ${th2('Stock + prod', dAyer)}${th2('Teórico PM hoy', dHoy)}${th2('Sugerido QQ', 'hasta donde cabe')}
        ${turnos.map((x) => th2(x.nombre + (x.rota ? ` · ${D.momentoDeTurno(x.id, ui.fecha)}` : ''), dHoy)).join('')}
        ${th2('Decidido QQ', dHoy)}${th2('= Bolsas', dHoy)}
        ${th2('Teórico PM mañana', dMan)}${th2('Cobertura', '')}${th2('Alerta', '', 'l')}</tr>`;
      const tb = filas.map((f) => filaProd(f, turnos, ids, t.turnos)).join('');
      const sumArea = filas.reduce((a, f) => a + decididoEn(f, ids), 0);
      const bolsasArea = filas.reduce((a, f) => a + decididoEn(f, ids) * f.rend, 0);
      /* Fila de totales: el sugerido del área y lo que lleva cada turno. Es lo
         que se mira para saber si la jornada cabe antes de guardar. El sugerido
         suma el que cabe, no la necesidad cruda: la cruda ya está arriba. */
      const sugArea = filas.reduce((a, f) => a + sugeridoQueCabe(f, turnos, t.turnos), 0);
      const porTurno = turnos.map((x) =>
        C.redondea(filas.reduce((a, f) => a + (Number(f.asign[x.id]) || 0), 0), 2));
      /* La capacidad del área es la suma de los topes de sus turnos activos. */
      const topeArea = turnos.reduce((a, x) => a + ((t.turnos[x.id] || {}).tope || 0), 0);
      /* Todas las casillas del total llevan las mismas dos líneas —el número
         arriba y el tope abajo— aunque la de abajo vaya vacía. Si no, la
         columna que sí tiene tope empuja su número hacia arriba y la fila
         queda despareja. */
      const celTot = (valor, abajo) => `<td><b>${valor}</b>`
        + `<span class="mini">${abajo || '&nbsp;'}</span></td>`;
      const pie = `<tr class="totales">
        <td class="l">TOTAL</td><td></td><td></td>
        ${celTot(sugArea ? n2(C.redondea(sugArea, 2)) : '—')}
        ${porTurno.map((v, i) => {
          const cupo = t.turnos[turnos[i].id] || {};
          return celTot(v ? n2(v) : '—', cupo.tope ? `de ${n2(cupo.tope)}` : '');
        }).join('')}
        ${celTot(sumArea ? n2(C.redondea(sumArea, 2)) : '—', `de ${n2(C.redondea(topeArea, 2))}`)}
        ${celTot(bolsasArea ? n0(bolsasArea) : '—')}
        <td></td><td></td><td></td></tr>`;
      const cubre = rotuloCubre(filas);
      const planta = (D.PLANTAS.find((x) => x.id === area.planta) || {}).nombre || area.planta;
      const trabaja = t.plantas[area.planta] ? t.plantas[area.planta].trabaja : true;
      /* Zona 2 entrega su producción al día siguiente, en la foto. Ese dato se
         guarda en el día de la hoja —el anterior— y desde acá no se vería,
         así que se muestra: es la forma de comprobar que la lectura entró, y
         es lo que alimenta la columna QQ PM Z2 de la hoja de bolsa. */
      const ayer = area.id === 'Z2' ? lineaAyerZ2(turnos) : '';
      return `<div class="card ${trabaja ? '' : 'apagado'}" style="margin-bottom:14px;padding:0;overflow:hidden">
        <div style="display:flex;align-items:baseline;gap:12px;padding:12px 16px;flex-wrap:wrap">
          <h3 style="margin:0">${esc(area.nombre)}</h3>
          <span class="chip nada">${esc(planta)}</span>
          <span class="dim" style="font-size:.86rem">${filas.length} claves · ${n2(sumArea)} QQ · ${n0(bolsasArea)} bolsas</span>
          <span class="dim" style="font-size:.86rem;margin-left:auto">${trabaja ? 'Cubre: ' + cubre : 'Esta planta no trabaja hoy'}</span>
        </div>
        ${ayer}
        <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0">
          <table><thead>${th}</thead><tbody>${tb}</tbody><tfoot>${pie}</tfoot></table>
        </div></div>`;
    }).join('');
    $('#famCont').innerHTML = cuerpo;

    /* El botón de sincronizar de la barra se muestra según esté encendida.
       Antes se quedaba escondido hasta entrar a Parámetros y sólo se veía
       porque el `hidden` no estaba surtiendo efecto. */
    const bSync = $('#btnSync');
    if (bSync) bSync.hidden = !window.Sync.activo();

    const nd2 = Object.keys(D.estado.dias).filter((f) => D.estado.dias[f].cerrado).length;
    $('#barInfo').innerHTML = `<b>${D.fechaCorta(ui.fecha)}</b> · ${n1(dec)} QQ decididos · `
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

  /**
   * Lo más que esa clave podría producirse en esa área: la suma de los topes
   * de sus turnos que trabajan ese día, y el máximo diario del producto si lo
   * tiene. Un turno sin tope escrito no se cuenta como cero —sería apagar la
   * clave por un parámetro en blanco— sino como sin límite.
   */
  function topeDeClave(clave, turnos, cupos) {
    const cfg = D.estado.params.prod[clave] || {};
    const suyos = turnos.filter((x) => D.puedeEnTurno(clave, x.id)
      && C.turnoTrabaja(D.estado.params, x.id, ui.fecha));
    let cap;
    if (!suyos.length) cap = 0;
    else if (suyos.some((x) => !(((cupos || {})[x.id] || {}).tope > 0))) cap = Infinity;
    else cap = suyos.reduce((a, x) => a + cupos[x.id].tope, 0);
    const md = Number(cfg.maxDia) > 0 ? Number(cfg.maxDia) : Infinity;
    return Math.min(cap, md);
  }

  /** El sugerido ya recortado a lo que de verdad cabe, al múltiplo de abajo. */
  function sugeridoQueCabe(f, turnos, cupos) {
    const tope = topeDeClave(f.clave, turnos, cupos);
    if (!isFinite(tope)) return f.sugeridoQQ;
    let v = Math.min(f.sugeridoQQ, tope);
    const m = Number((D.estado.params.prod[f.clave] || {}).mult) || 0;
    if (m > 0) v = Math.floor(v / m + 1e-9) * m;
    return C.redondea(Math.max(0, v), 2);
  }

  function filaProd(f, turnos, ids, cupos) {
    const cfg = D.estado.params.prod[f.clave];
    const sugCabe = sugeridoQueCabe(f, turnos, cupos);
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
          <span class="mini">${n0(f.rend)} bolsas/QQ</span></button></td>
      <td class="num">${n0(f.disponible)}</td>
      <td class="num">${n0(f.teoricoHoy)}</td>
      <td class="num sug ${sugCabe ? '' : 'cero'}">${sugCabe ? n2(sugCabe) : '—'}
        ${sugCabe < f.sugeridoQQ - 1e-9
          ? `<span class="mini">de ${n2(f.sugeridoQQ)} que hacen falta</span>` : ''}</td>
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
        ${n2(f.prodAyerQQ)} QQ producidos ese día (${n0(f.prodAyerB)} bolsas)${f.yaContado ? ', que no se suman porque ese conteo ya los trae' : ''},
        menos ${n0(f.ventaHoy)} que se venden hoy.</p>
        <p>Hay que llegar hasta la próxima corrida, o sea <b>${f.nDias} día${f.nDias > 1 ? 's' : ''}</b> de venta
        (${dias}), más <b>${p.colchon}</b> de colchón. En total el objetivo es cubrir
        <b>${f.objetivoDias} días</b>.</p>
        <p>${f.sugeridoQQ > 0
            ? `Faltan ${n0(Math.max(0, Math.min(f.necesidad, f.topeVida)))} bolsas, que a ${n0(f.rend)} bolsas por quintal y en múltiplos de ${n2(f.mult)} QQ dan <b>${n2(f.sugeridoQQ)} QQ</b>.`
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
          ${li('<b>Sugerido</b>', '<b>' + n2(f.sugeridoQQ) + ' QQ</b>', '')}
          ${li('Decidido', n2(f.decididoQQ) + ' QQ', '')}
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
      <th>PROD AYER QQ<span class="sub2">${esc(dProd)}</span></th>
      <th>BOLSAS<span class="sub2">QQ × rendimiento</span></th>
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

  /* El conteo de CZ5, por empaque. Va en Cálculos, no en Inventario: se
     alimenta de corrido y tenerlo acá evita el ir y venir entre pestañas.
     Igual se guarda en el día, no en la hoja suelta de los cálculos. */
  function pintarCz5() {
    const cont = $('#cz5Cont');
    if (!cont) return;
    const V = window.Venta;
    const d = V.cz5De(ui.fecha);
    const fila = (x) => {
      const v = Number(d.puesto[x.id]) || 0;
      return `<tr>
        <td class="l clave">${esc(x.nombre)}<span class="mini">${esc(x.unidad)}</span></td>
        <td><input class="inqq" inputmode="decimal" data-cz5="${esc(x.id)}"
          value="${d.puesto[x.id]}" aria-label="${esc(x.nombre)} en ${esc(x.unidad)}"></td>
        <td class="num dim">${v ? n0(v * x.uni) : ''}</td></tr>`;
    };
    const emp = V.CZ5.filter((x) => x.empaque).map(fila).join('');
    const con = V.CONTEO.map(fila).join('');
    const nota = d.fAyer
      ? `el cierre del ${esc(D.fechaCorta(d.fAyer))}`
      : 'todavía no hay un día anterior con conteo';
    cont.innerHTML = `<div class="lcols">
      <div class="tablabox">
        <table>
          <thead><tr><th class="l">Lo que entró</th><th>Cantidad</th><th>Unidades</th></tr></thead>
          <tbody>
            <tr><td class="l clave">Inventario AM<span class="mini">${nota}</span></td>
              <td class="num dim">${d.amUni ? `${n2(d.amP)} parr` : '—'}</td>
              <td class="num dim">${d.amUni ? n0(d.amUni) : '—'}</td></tr>
            ${emp}
          </tbody>
          <tfoot><tr class="totales"><td class="l">DISPONIBLE</td><td></td>
            <td class="num"><b>${d.dispUni ? n0(d.dispUni) : '—'}</b></td></tr></tfoot>
        </table></div>
      <div class="tablabox">
        <table>
          <thead><tr><th class="l">Conteo de la tarde</th><th>Cantidad</th><th>Unidades</th></tr></thead>
          <tbody>${con}</tbody>
          <tfoot><tr class="totales"><td class="l">INV PM</td>
            <td class="num">${d.invUni ? `${n2(d.invP)} parr` : ''}</td>
            <td class="num"><b>${d.invUni ? n0(d.invUni) : '—'}</b></td></tr></tfoot>
        </table></div>
      </div>
      <div class="kpis" style="margin-top:12px">
        ${kpi('Disponible del día', d.dispUni ? n0(d.dispUni) : '—')}
        ${kpi('Quedó en el conteo', d.invUni ? n0(d.invUni) : '—')}
        ${kpi('Venta del día', d.venta == null ? '—' : n0(d.venta), d.venta != null && d.venta < 0 ? 'alerta' : '')}
        ${kpi('En parrillas', d.ventaP == null ? '—' : n2(d.ventaP))}
      </div>
      ${d.venta != null && d.venta < 0 ? `<div class="aviso warn" style="margin-top:10px">
        <h4>La venta sale negativa</h4><p>Quedó más de lo que había disponible. Suele ser que
        falte anotar lo que se empacó hoy, o que el conteo de ayer haya quedado corto.</p></div>` : ''}
      ${bloqueCz3Cz5()}`;
  }

  /* El CZ3 / CZ5 de perchas va pegado al conteo: es la misma conversación
     —cuánto CZ3 hay y cuánto se vuelve CZ5— y separarlos obligaba a bajar. */
  function bloqueCz3Cz5() {
    const S = window.Secundarios;
    const datos = S.leer();
    const cz = S.calcCz(datos.cz || {}, ui.fecha);
    const inCz = (k, lbl) => `<input class="inqq" inputmode="decimal" enterkeyhint="next"
      data-scz="${k}" value="${esc((datos.cz || {})[k] ?? '')}" aria-label="${esc(lbl)}">`;
    const lineas = [
      ['20CZ3', inCz('parr20', 'Parrillas de 20CZ3'), 'parrillas', `${n2(cz.b20)} bolsas`, ''],
      ['CZ3 perchas (OH)', inCz('ohBolsas', 'Perchas OH'), 'perchas', `${n2(cz.ohParr)} parrillas`, ''],
      [`Producción PM${cz.turnoPM ? ` · ${cz.turnoPM}` : ''}`, inCz('prodQQ', 'Quintales producidos PM'), 'QQ',
        `${n2(cz.prodBolsas)} perchas`,
        cz.manual ? 'escrito a mano' : (cz.prodQQauto ? `del reparto: ${n2(cz.prodQQauto)} QQ` : 'sin reparto ese día')],
      ['CZ5', inCz('cz5Bolsas', 'Perchas de CZ5'), 'perchas', `${n2(cz.cz5Parr)} parrillas`, ''],
      ['Empacar', inCz('empacar', 'A empacar'), 'perchas', '', ''],
    ];
    return `<h4 class="subrot" style="margin-top:18px">CZ3 / CZ5 (0134)</h4>
      <p class="dim" style="font-size:.84rem;margin:0 2px 10px">
        Una percha son ${S.PERCHA} parrillas; un quintal de CZ3 da ${n0(cz.rend)} bolsas y
        ${S.CZ3_POR_PERCHA} bolsas hacen una percha.
      </p>
      <div class="tablabox"><table>
        <thead><tr><th class="l">Fila</th><th>OH</th><th class="l">Unidad</th>
          <th class="l">Equivale a</th><th class="l">De dónde</th></tr></thead>
        <tbody>${lineas.map(([n, inp, u, eq, de]) => `<tr>
          <td class="l clave">${esc(n)}</td><td>${inp}</td><td class="l dim">${esc(u)}</td>
          <td class="l dim">${esc(eq)}</td><td class="l dim">${esc(de)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="kpis" style="margin-top:12px">
        ${kpi('Total perchas CZ3', n2(cz.total))}
        ${kpi('Quedan tras CZ5', n2(cz.quedan), cz.quedan < 0 ? 'alerta' : '')}
        ${kpi('Libres tras empacar', n2(cz.libres), cz.libres < 0 ? 'alerta' : 'bien')}
      </div>`;
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

  /**
   * Lo que se puede pedir: primero las presentaciones con que llegan los
   * pedidos —ordenadas por uso, así lo frecuente queda arriba— y después las
   * claves del catálogo que no tienen presentación, para que nada quede sin
   * poder pedirse. El valor lleva el prefijo que dice cuál de las dos es.
   */
  function opcionesPedido() {
    const conPres = new Set();
    const pres = D.presentaciones().map((p) => {
      if (p.clave) conPres.add(p.clave);
      const dest = p.clave ? p.clave : 'no entra al cálculo';
      return `<option value="c:${esc(p.cod)}">${esc(p.cod)} · ${esc(p.desc)} — ${esc(dest)}</option>`;
    }).join('');
    const sueltas = D.activos().filter((p) => !conPres.has(p.clave))
      .map((p) => `<option value="k:${esc(p.clave)}">${esc(p.clave)}${p.alias ? ` · ${esc(p.alias)}` : ''} — en bolsas</option>`)
      .join('');
    return `<optgroup label="Presentaciones de preventa">${pres}</optgroup>`
      + (sueltas ? `<optgroup label="Otras claves, en bolsas">${sueltas}</optgroup>` : '');
  }

  /** Lo elegido en el formulario, ya resuelto a presentación o clave suelta. */
  function elegidoPedido() {
    const v = $('#pdClave').value || '';
    if (v.startsWith('c:')) {
      const p = D.presentacionDe(v.slice(2));
      return p ? { pres: p, clave: p.clave, uxb: p.uxb || 1 } : null;
    }
    if (v.startsWith('k:')) return { pres: null, clave: v.slice(2), uxb: 1 };
    return null;
  }

  /** La pista bajo el formulario: en qué se convierte lo que se está pidiendo. */
  function pistaPedido() {
    const el = elegidoPedido();
    const cant = Math.max(0, Math.round(Number($('#pdBolsas').value) || 0));
    $('#pdLblCant').textContent = el && el.pres && el.uxb > 1 ? 'Unidades' : 'Bolsas';
    if (!el) { $('#pdPista').textContent = 'Elegí un producto.'; return; }
    const partes = [];
    if (el.pres && el.uxb > 1) {
      const bolsas = cant ? Math.ceil(cant / el.uxb) : 0;
      partes.push(`${n0(cant)} unidades de ${el.uxb} = <b>${n0(bolsas)} bolsas</b>`);
      if (el.pres.bxp) partes.push(`${n2(C.redondea(bolsas / el.pres.bxp, 2))} parrillas`);
    } else if (cant) partes.push(`<b>${n0(cant)} bolsas</b>`);
    partes.push(el.clave
      ? `va a <b>${esc(el.clave)}</b>`
      : '<b>no entra al cálculo de producción</b>');
    $('#pdPista').innerHTML = partes.join(' · ')
      + '. La fecha y el cliente se quedan puestos para seguir agregando.';
  }

  function pintarPedidos() {
    const lista = D.pedidosLista();
    const antes = $('#pdClave').value;
    $('#pdClave').innerHTML = opcionesPedido();
    if (antes) $('#pdClave').value = antes;
    $('#pdClientes').innerHTML = D.clientes().map((c) => `<option value="${esc(c)}">`).join('');
    if (!$('#pdFecha').value) $('#pdFecha').value = D.sumarDias(D.hoyISO(), 1);
    pistaPedido();

    const porEstado = { pendiente: 0, vencido: 0, entregado: 0, cancelado: 0 };
    lista.forEach((p) => { porEstado[D.estadoPedido(p)]++; });
    const vivos = D.pedidosVivos();
    const bolsasVivas = vivos.reduce((a, p) => a + (Number(p.bolsas) || 0), 0);
    const hoyToca = D.pedidosQueCuentan().filter(tocaHoy);
    const suman = D.pedidosQueCuentan().length;
    $('#kpisPed').innerHTML =
      kpi('Pedidos pendientes', porEstado.pendiente) +
      kpi('Bolsas comprometidas', n0(bolsasVivas)) +
      kpi('Suman al sugerido', suman, suman ? 'alerta' : '') +
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
      <th class="l">Día entrega</th><th class="l">Cliente</th><th class="l">Producto</th>
      <th>Unidades</th><th>Bolsas</th><th>QQ</th><th class="l">Suma</th>
      <th class="l">Producir antes de</th><th class="l">Estado</th><th class="l"></th></tr>`;

    pintarResumenPed();

    if (!visibles.length) {
      $('#tbodyPed').innerHTML = `<tr><td colspan="10" class="l dim" style="padding:18px">`
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
      /* Una presentación sin clave del catálogo se captura igual, pero no hay
         nada que producir: se dice, para que no parezca que se perdió. */
      const sinCalc = !p.clave || !D.estado.params.prod[p.clave];
      const nombre = p.codigo || ficha.alias || p.clave;
      const destino = ficha.alias || p.clave;
      const pie = sinCalc ? 'no entra al cálculo'
        : (p.codigo && destino !== nombre ? destino : '');
      return `<tr class="${e === 'vencido' ? 'ojo' : ''}">
        <td class="l clave">${esc(D.fechaCorta(p.fecha))}</td>
        <td class="l">${esc(p.cliente || '—')}</td>
        <td class="l clave">${esc(nombre)}${pie ? `<span class="mini">${esc(pie)}</span>` : ''}</td>
        <td class="num dim">${p.unidades ? n0(p.unidades) : ''}</td>
        <td><input class="inqq" style="width:90px" inputmode="numeric" data-pedb="${esc(p.id)}"
            value="${p.bolsas}" aria-label="Bolsas de ${esc(nombre)}"></td>
        <td class="num dim">${qq == null ? '' : n2(qq)}</td>
        <td class="l"><label class="sw" title="${sinCalc ? 'Esta clave no se produce acá' : 'Suma al sugerido de producción'}">
          <input type="checkbox" data-pedcta="${esc(p.id)}" ${p.cuenta ? 'checked' : ''}
            ${sinCalc ? 'disabled' : ''}></label></td>
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

  /** El primer día de entrega que todavía tiene pedidos vivos, o mañana. */
  function diaResumenPed() {
    if (ui.pedResFecha) return ui.pedResFecha;
    const hoy = D.hoyISO();
    const f = D.pedidosLista()
      .filter((p) => { const e = D.estadoPedido(p); return e === 'pendiente' || e === 'vencido'; })
      .map((p) => p.fecha).filter((x) => x >= hoy).sort()[0];
    ui.pedResFecha = f || D.sumarDias(hoy, 1);
    return ui.pedResFecha;
  }

  /**
   * Lo pedido para un día, junto. La fila es la PRESENTACIÓN tal como la
   * compra el cliente, no la clave madre: 15PL1U y 15PL1 llevan línea aparte
   * aunque las dos se produzcan como 15PL1, y el 20CZ5 va por su cuenta
   * aunque salga del CZ3. Lo que acá se mira es qué hay que empacar y en
   * cuántas parrillas cabe, no qué hay que producir.
   */
  function pintarResumenPed() {
    const cont = $('#pedResumen');
    if (!cont) return;
    const fecha = diaResumenPed();
    $('#pedResFecha').value = fecha;

    const delDia = D.pedidosLista().filter((p) => p.fecha === fecha
      && !['entregado', 'cancelado'].includes(D.estadoPedido(p)));

    if (!delDia.length) {
      cont.innerHTML = `<p class="dim" style="margin:12px 2px 0;font-size:.9rem">`
        + `Sin pedidos pendientes para el ${esc(D.fechaCorta(fecha))}.</p>`;
      return;
    }

    const filas = new Map();
    delDia.forEach((p) => {
      /* La presentación manda. Un pedido capturado directo en bolsas, sin
         presentación, se agrupa por su clave y lo dice. */
      const cod = p.codigo || p.clave || '—';
      if (!filas.has(cod)) {
        const pres = p.codigo ? D.presentacionDe(p.codigo) : null;
        filas.set(cod, {
          cod, desc: pres ? pres.desc : '', bxp: pres ? Number(pres.bxp) || 0 : 0,
          sinPres: !pres, bolsas: 0, unidades: 0,
        });
      }
      const f = filas.get(cod);
      f.bolsas += Number(p.bolsas) || 0;
      f.unidades += Number(p.unidades) || 0;
    });

    const orden = [...filas.values()].sort((a, b) => b.bolsas - a.bolsas || a.cod.localeCompare(b.cod));
    orden.forEach((f) => {
      f.parr = f.bxp ? Math.floor(f.bolsas / f.bxp) : 0;
      f.sueltas = f.bxp ? f.bolsas - f.parr * f.bxp : f.bolsas;
    });
    const totB = orden.reduce((a, f) => a + f.bolsas, 0);
    const totU = orden.reduce((a, f) => a + f.unidades, 0);
    const totP = orden.reduce((a, f) => a + f.parr, 0);

    const parrilla = (f) => {
      if (!f.bxp) return '<span class="dim">sin parrilla</span>';
      return `<b>${n0(f.parr)}</b> <span class="dim">parr</span>`
        + (f.sueltas ? ` + <b>${n0(f.sueltas)}</b> <span class="dim">b</span>` : '');
    };

    cont.innerHTML = `<div class="tablabox" style="margin-top:12px">
      <table class="resped">
        <thead><tr><th class="l">Clave</th><th>Unidades</th><th>Bolsas</th>
          <th class="l">Parrillas + bolsa</th><th class="l">Bolsas por parrilla</th></tr></thead>
        <tbody>${orden.map((f) => `<tr>
          <td class="l clave">${esc(f.cod)}${f.desc || f.sinPres
            ? `<span class="mini">${esc(f.sinPres ? 'capturado en bolsas, sin presentación' : f.desc)}</span>` : ''}</td>
          <td class="num dim">${f.unidades ? n0(f.unidades) : ''}</td>
          <td class="num"><b>${n0(f.bolsas)}</b></td>
          <td class="l">${parrilla(f)}</td>
          <td class="l dim">${f.bxp ? n0(f.bxp) : ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="totales"><td class="l">TOTAL</td>
          <td class="num dim">${totU ? n0(totU) : ''}</td>
          <td class="num"><b>${n0(totB)}</b></td>
          <td class="l"><b>${n0(totP)}</b> <span class="dim">parr</span></td>
          <td></td></tr></tfoot>
      </table></div>
      <p class="dim" style="font-size:.85rem;margin:10px 2px 0">
        ${delDia.length} pedido${delDia.length === 1 ? '' : 's'} para el
        ${esc(D.fechaCorta(fecha))} · ${orden.length} ${orden.length === 1 ? 'presentación' : 'presentaciones'}.
        Las bolsas por parrilla salen del catálogo de presentaciones, en Parámetros.
      </p>`;
  }

  // ================= TRASLADOS A ZONA 2 =================
  /**
   * El papel de la mañana: qué baja de Zona 18 a Zona 2 y en qué camión. Va en
   * una ventana aparte, como el resumen, porque se arma una vez al día y se
   * manda; tenerlo siempre abierto en Producción sólo alargaría la pestaña.
   */
  function abrirTraslado(fecha) {
    const T = window.Traslado;
    const m = document.createElement('div');
    m.className = 'lector resumen';
    m.innerHTML = `<div class="lcaja" style="max-width:1000px">
      <div class="lbar">
        <h3>Traslados a Zona 2</h3>
        <span class="dim" id="trFecha"></span>
        <button class="btn sec mini" type="button" id="trCerrar" style="margin-left:auto">Cerrar</button>
      </div>
      <div class="lcuerpo rescuerpo">
        <div class="card rescard">
          <div class="fila" style="align-items:center">
            <button class="btn mini" type="button" id="trImg">Imagen para WhatsApp</button>
            <span class="dim" style="font-size:.84rem" id="trNota"></span>
          </div>
        </div>
        <div id="trVista"></div>
      </div>
    </div>`;
    document.body.appendChild(m);
    document.body.style.overflow = 'hidden';
    const q = (s) => m.querySelector(s);
    const cerrar = () => { document.body.style.overflow = ''; m.remove(); };

    function pintar() {
      const p = T.plan(fecha);
      q('#trFecha').textContent = D.fechaCorta(fecha);
      q('#trNota').innerHTML = p.sinCamiones
        ? 'No hay camiones puestos para este día en Parámetros.'
        : `<b>${n0(p.pedido)}</b> parrillas hacen falta · caben <b>${n0(p.capacidad)}</b> `
          + `en ${p.camiones.length} ${p.camiones.length === 1 ? 'camión' : 'camiones'}`
          + (p.sobraParrillas ? ` · quedan <b>${n0(p.sobraParrillas)}</b> para Zona 18` : ' · entra todo');

      const avisos = [];
      if (p.sinUxp.length) avisos.push(['warn', 'Faltan unidades por parrilla',
        `${p.sinUxp.join(', ')} no tiene${p.sinUxp.length === 1 ? '' : 'n'} cuántas unidades sin `
        + 'empacar lleva una parrilla, así que no se pueden pasar a camión. Se pone en Parámetros.']);
      if (!p.lista.length) avisos.push(['', 'Hoy no hay que bajar nada',
        'El conteo de anoche cubre la venta de hoy en todas las claves que viajan.']);

      q('#trVista').innerHTML = avisos.map(([c, h, t]) =>
        `<div class="aviso ${c}"><h4>${esc(h)}</h4><p>${esc(t)}</p></div>`).join('')
        + (p.lista.length ? `<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
          <div style="padding:12px 16px"><h3 style="margin:0 0 3px;font-size:.95rem">Lo que falta</h3>
            <p class="sub" style="margin:0">El conteo de anoche contra la venta de hoy. El orden es
              el de urgencia: primero el que se vacía antes.</p></div>
          <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0">
          <table><thead><tr><th class="l">Clave</th><th>Conteo</th><th>Venta hoy</th>
            <th>Faltan bolsas</th><th>Unidades</th><th>Uni × parrilla</th><th>Parrillas</th>
            <th class="l">Por qué</th></tr></thead>
          <tbody>${p.lista.map((f) => `<tr>
            <td class="l clave">${esc(f.alias)}</td>
            <td class="num dim">${n0(f.conteo)}</td>
            <td class="num dim">${n0(f.venta)}</td>
            <td class="num">${n0(f.bolsas)}</td>
            <td class="num dim">${n0(f.unidades)}</td>
            <td class="num dim">${f.uxp || '—'}</td>
            <td class="num"><b>${f.parrillas ? n0(f.parrillas) : '—'}</b></td>
            <td class="l dim">${esc(f.motivo)}</td></tr>`).join('')}</tbody>
          </table></div></div>` : '')
        + (p.camiones.length ? `<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
          <div style="padding:12px 16px"><h3 style="margin:0 0 3px;font-size:.95rem">La carga</h3>
            <p class="sub" style="margin:0">Los camiones del día, en el orden en que salen.</p></div>
          <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0">
          <table><thead><tr><th class="l">Camión</th><th>Capacidad</th><th>Cargado</th>
            <th class="l">Qué lleva</th></tr></thead>
          <tbody>${p.camiones.map((c) => `<tr>
            <td class="l clave">${esc(c.id)}${c.resta
              ? `<span class="mini">${n0(c.total)} − ${n0(c.resta)} de arrastre</span>` : ''}</td>
            <td class="num dim">${n0(c.capacidad)}</td>
            <td class="num"><b>${n0(c.usado)}</b></td>
            <td class="l">${c.carga.length
              ? c.carga.map((x) => `<span class="chip ${x.partida ? 'vida' : 'ok'}">`
                + `${esc(x.alias)} ${n0(x.parrillas)}</span>`).join(' ')
              : '<span class="dim">vacío</span>'}</td></tr>`).join('')}</tbody>
          ${p.sobra.length ? `<tfoot><tr class="totales">
            <td class="l">QUEDA PARA ZONA 18</td><td></td>
            <td class="num"><b>${n0(p.sobraParrillas)}</b></td>
            <td class="l">${p.sobra.map((x) => `<span class="chip falta">`
              + `${esc(x.alias)} ${n0(x.parrillas)}</span>`).join(' ')}</td></tr></tfoot>` : ''}
          </table></div></div>` : '');
    }

    pintar();
    q('#trCerrar').onclick = cerrar;
    m.addEventListener('click', (e) => { if (e.target === m) cerrar(); });
    q('#trImg').onclick = async () => {
      try {
        const R = window.Resumen;
        const { cv, nombre, plan: p } = T.imagen(fecha);
        if (!p.lista.length) { aviso('Hoy no hay nada que bajar.', 'warn'); return; }
        const res = await R.compartir(await R.aBlob(cv), nombre, 'Traslados a Zona 2');
        aviso(res === 'compartido' ? 'Traslados compartidos.'
          : (res === 'cancelado' ? 'Cancelado.' : `Traslados ${res}.`));
      } catch (err) { aviso('No se pudo armar la imagen: ' + err.message, 'err'); }
    };
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
    $('#inMu1').value = b.mu1 || '';

    const fs = B.enTotal(B.calcular(fecha));
    const t = B.totales(fs);
    const d0 = D.fechaCorta(fecha);
    const d1 = D.fechaCorta(B.fechaPrevia(fecha));

    /* Dos pisos de encabezado: arriba el día y abajo su mañana y su tarde,
       como en la hoja de papel. */
    $('#theadBolsa').innerHTML = `<tr class="grupo">
        <th rowspan="2" class="l">P PROD</th><th rowspan="2" class="l">CLAVE</th>
        <th rowspan="2">RENDIM<br><span class="mini2">bolsas/QQ</span></th>
        <th colspan="2" class="bloque">${esc(d1.toUpperCase())}</th>
        <th colspan="2" class="bloque">${esc(d0.toUpperCase())}</th>
        <th rowspan="2">PROD<br>AM</th><th rowspan="2">PROD<br>PM</th>
        <th rowspan="2">OH<br><span class="mini2">ya impreso</span></th>
        <th rowspan="2">EMPAQUE<br>AM</th><th rowspan="2">EMPAQUE<br>PM</th>
        <th rowspan="2">A<br>IMPRIMIR</th></tr>
      <tr><th>QQ AM</th><th>QQ PM</th><th>QQ AM</th><th>QQ PM</th></tr>`;

    const cel = (v) => `<td class="num dim">${v ? n2(v) : ''}</td>`;
    const vacio = '<td></td>';
    $('#tbodyBolsa').innerHTML = fs.map((f) => {
      const calc = f.tipo === 'planta' || f.tipo === 'union';
      const cls = [f.tipo === 'union' ? 'suma' : (calc ? '' : 'aparte'),
        f.final ? '' : 'nocuenta'].filter(Boolean).join(' ');
      const pie = f.nota ? f.nota : (f.final ? '' : 'el total va en la fila de abajo');
      return `<tr${cls ? ` class="${cls}"` : ''}>
        <td class="num dim">${esc(f.pprod)}</td>
        <td class="l clave">${esc(f.nombre)}${pie ? `<span class="mini">${esc(pie)}</span>` : ''}</td>
        <td class="num dim">${f.rend ? n0(f.rend) : ''}</td>
        ${calc ? cel(f.qq[1].AM) + cel(f.qq[1].PM) + cel(f.qq[0].AM) + cel(f.qq[0].PM)
               : vacio + vacio + vacio + vacio}
        <td class="num${f.final ? '' : ' dim'}">${f.prodAM ? n0(f.prodAM) : ''}</td>
        <td class="num${f.final ? '' : ' dim'}">${f.prodPM ? n0(f.prodPM) : ''}</td>
        <td>${f.final && f.tipo !== 'manual'
          ? `<input class="inqq" inputmode="decimal" enterkeyhint="next"
              data-bcampo="oh" data-bid="${esc(f.id)}" value="${f.oh || ''}"
              aria-label="OH de ${esc(f.nombre)}">`
          : ''}</td>
        <td class="num bolsas">${f.empAM ? n0(f.empAM) : ''}</td>
        <td class="num bolsas">${f.empPM ? n0(f.empPM) : ''}</td>
        <td>${f.manual
          ? `<input class="inqq${f.auto ? ' auto' : ''}" inputmode="decimal" enterkeyhint="next"
              data-bcampo="manual" data-bid="${esc(f.id)}"
              value="${f.auto ? '' : (f.total || '')}"
              placeholder="${f.fijo ? n0(f.fijo) : ''}"
              aria-label="A imprimir de ${esc(f.nombre)}">`
          : `<b class="num">${f.total ? n0(f.total) : ''}</b>`}</td>
      </tr>`;
    }).join('');

    /* Sin fila de totales: los mismos números están en las tarjetas de arriba
       y abajo de la tabla sólo estorban a la hora de leer las claves. */
    $('#tfootBolsa').innerHTML = '';

    $('#kpisBolsa').innerHTML =
      kpi('Bolsas a imprimir', n0(t.total)) +
      kpi('Empaque AM', n0(t.empAM)) +
      kpi('Empaque PM', n0(t.empPM)) +
      kpi('Claves con bolsa', fs.filter((f) => f.cuenta && f.total > 0).length);

    const av = [];
    const conCalc = fs.filter((f) => f.tipo === 'planta' || f.tipo === 'union');
    const sinQQ = conCalc.filter((f) => !f.qqAM && !f.qqPM).length;
    if (conCalc.length && sinQQ === conCalc.length) {
      av.push(['warn', 'Todavía no hay reparto de esos días',
        'Los quintales salen de la pestaña Producción, del día a producir o del anterior según '
        + 'lo que tenga puesto cada clave. Reparte ahí y esta tabla se llena sola.']);
    }
    /* El sábado la hoja lleva encima el domingo estimado. Hay que decirlo: son
       quintales que todavía no existen, y de qué domingos salieron. */
    const dom = B.promDomingos(D.estado.params, fecha);
    if (dom) {
      const planta = (D.PLANTAS.find((x) => x.id === dom.planta) || {}).nombre || dom.planta;
      const qqDom = Object.values(dom.qq).reduce((a, f) =>
        a + Object.values(f).reduce((x, v) => x + v, 0), 0);
      av.push(dom.dias.length
        ? ['', `Esta hoja lleva el domingo de ${planta} sumado encima`,
          `Son ${n2(C.redondea(qqDom, 2))} QQ estimados, el promedio de `
          + `${dom.dias.length} domingo${dom.dias.length > 1 ? 's' : ''}: `
          + `${dom.dias.map((f) => D.fechaCorta(f)).join(' · ')}. `
          + 'La bolsa del domingo se manda a imprimir hoy, y esa producción todavía no existe. '
          + 'Se apaga o se cambian los domingos en Parámetros → Impresión de bolsa.']
        : ['warn', `No hay domingos capturados de ${planta}`,
          'La hoja del sábado debería llevar el domingo estimado encima, pero no hay ningún '
          + 'domingo con producción de esa planta para sacar el promedio.']);
    }

    const fuera = B.ignorados(fecha);
    if (fuera.length) {
      av.push(['warn', fuera.length === 1
        ? 'Hay producción del día que no está entrando en la hoja'
        : `Hay ${fuera.length} producciones del día que no están entrando en la hoja`,
        fuera.slice(0, 8).map((x) => `${x.nombre} ${n2(x.qq)} QQ en ${x.turno}`).join(' · ')
        + (fuera.length > 8 ? ` y ${fuera.length - 8} más` : '')
        + '. Ese turno está en «—». Se prende en Parámetros → Impresión de bolsa, '
        + 'en «De dónde salen los quintales».']);
    }
    av.push(['', `Los quintales salen del ${d0} y del ${d1}`,
      'Cada clave dice, turno por turno, si sus quintales cuentan para PROD AM o para PROD PM y '
      + 'de cuál de los dos días se leen. Eso se cambia en Parámetros → Impresión de bolsa. '
      + 'EMPAQUE AM = PROD AM − OH, EMPAQUE PM = PROD PM, y A IMPRIMIR los suma.']);
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
    const belcaCard = tarjetaSec('BELCA', 'Lo preparado se cuenta en parrillas del cliente; lo que falta se'
      + ' convierte a parrillas de bodega, que son las que hay que bajar.',
      `<table><thead><tr>
        <th class="l">Clave</th>${th2('Parrillas', 'listas')}${th2('Bolsas', 'sueltas')}
        ${th2('Preparado', 'bolsas')}${th2('Pedido', 'bolsas')}${th2('Falta', 'bolsas')}
        ${th2('Falta', 'parr + sueltas')}${th2('Bajar', 'parrillas')}
      </tr></thead><tbody>${filasB}</tbody></table>`);

    /* El orden de las tarjetas es el de la jornada, no el del código: el CZ3 /
       CZ5 ya salió arriba pegado al conteo, y el PL1 cierra. */
    const porId = Object.fromEntries(partes.map((h, i) => [S.TABLAS[i].id, h]));
    $('#secCont').innerHTML = [porId.esp, porId.s16, belcaCard, porId.mg, porId.pl1]
      .filter(Boolean).join('');
    pintarCz5();
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
    { id: 'venta',  nombre: 'Venta real' },
  ];

  /**
   * La venta real día por día y mes por mes. Sale de restar: lo que había más
   * lo que se produjo, menos lo que quedó en el conteo. No es el promedio que
   * mueve el sugerido —ése es histórico y se carga del libro—, es el dato de
   * cada día, que sirve para ver si ese promedio sigue valiendo.
   */
  function pintarVenta() {
    const V = window.Venta;
    const cont = $('#histVenta');
    const esCz5 = ui.ventaClave === 'CZ5';
    const serie = esCz5 ? V.serieCz5() : V.serieClave(ui.ventaClave);
    const meses = V.porMes(serie, 'venta');
    const unidad = esCz5 ? 'unidades' : 'bolsas';

    const opciones = `<option value="CZ5" ${esCz5 ? 'selected' : ''}>CZ5 · por empaque, en unidades</option>`
      + D.productos().filter((p) => p.activo !== false).map((p) =>
        `<option value="${esc(p.clave)}" ${ui.ventaClave === p.clave ? 'selected' : ''}>`
        + `${esc(p.clave)}${p.alias ? ` · ${esc(p.alias)}` : ''}</option>`).join('');

    const total = meses.reduce((a, m) => a + m.total, 0);
    const dias = meses.reduce((a, m) => a + m.dias, 0);

    cont.innerHTML = `<div class="card" style="margin-bottom:14px">
        <div class="fila" style="align-items:flex-end">
          <div class="campo"><label for="inVentaClave">Producto</label>
            <select id="inVentaClave" style="min-width:250px">${opciones}</select></div>
          <p class="sub" style="margin:0 0 6px">
            ${esCz5
              ? 'Disponible del día −  lo que quedó en el conteo, en unidades. Sólo salen los días con conteo de CZ5.'
              : 'Stock de ayer + lo producido − el INV PM del día, en bolsas. Sólo salen los días con INV PM.'}
          </p>
        </div>
      </div>
      <div class="kpis" style="margin-bottom:14px">
        ${kpi('Días con dato', dias)}
        ${kpi(`Venta total · ${unidad}`, n0(total))}
        ${kpi('Promedio por día', dias ? n0(Math.round(total / dias)) : '—')}
        ${kpi('Meses', meses.length)}
      </div>`
      + (meses.length ? `<div class="card" style="margin-bottom:14px">
          <h3 style="margin-top:0">Venta por mes <span class="dim" style="font-weight:400">· ${esc(unidad)}</span></h3>
          <div id="ventaGrafica"></div>
        </div>` : `<div class="aviso warn"><h4>Todavía no hay con qué calcular</h4>
          <p>${esCz5
            ? 'Hace falta el conteo de CZ5 de por lo menos un día. Se anota en Inventario.'
            : 'Hace falta el INV PM de por lo menos un día guardado.'}</p></div>`);

    /* La tabla de abajo: el mes y el detalle de los últimos días. */
    const filasMes = meses.slice().reverse().map((m) => `<tr>
      <td class="l clave">${esc(V.nombreMes(m.mes))}</td>
      <td class="num"><b>${n0(m.total)}</b></td>
      <td class="num dim">${m.dias}</td>
      <td class="num dim">${n0(m.prom)}</td>
      <td class="num dim">${n0(m.min)}</td>
      <td class="num dim">${n0(m.max)}</td></tr>`).join('');
    $('#theadHist').innerHTML = `<tr><th class="l">Mes</th><th>Venta ${esc(unidad)}</th>
      <th>Días</th><th>Promedio</th><th>Mínimo</th><th>Máximo</th></tr>`;
    $('#tbodyHist').innerHTML = filasMes
      || `<tr><td colspan="6" class="l dim" style="padding:18px">Sin meses que mostrar.</td></tr>`;

    if (meses.length) dibujarVenta(meses, unidad);
  }

  /** La gráfica de barras del mes, dibujada a mano como el resto del app. */
  function dibujarVenta(meses, unidad) {
    const caja = $('#ventaGrafica');
    if (!caja) return;
    const ultimos = meses.slice(-24);
    const ESC = 2;
    const ancho = Math.max(560, ultimos.length * 58 + 70);
    const alto = 260;
    const cv = document.createElement('canvas');
    cv.width = ancho * ESC; cv.height = alto * ESC;
    const g = cv.getContext('2d');
    const css = getComputedStyle(document.body);
    const tinta = css.getPropertyValue('--ink') || '#E8EEF6';
    const suave = css.getPropertyValue('--muted') || '#8A9AAE';
    const linea = css.getPropertyValue('--line') || '#24324A';
    const barra = css.getPropertyValue('--accent') || '#4ADE9B';

    const mx = 54, my = 18, pie = 34;
    const anchoUtil = ancho - mx - 16;
    const altoUtil = alto - my - pie;
    const tope = Math.max(...ultimos.map((m) => m.total), 1);
    /* Una escala redonda: la barra más alta no toca el techo. */
    const paso = Math.pow(10, Math.floor(Math.log10(tope)));
    const techo = Math.ceil(tope / paso) * paso;

    g.font = `${11 * ESC}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = (techo / 4) * i;
      const y = my + altoUtil - (altoUtil * i) / 4;
      g.strokeStyle = linea.trim(); g.lineWidth = 1 * ESC;
      g.beginPath(); g.moveTo(mx * ESC, y * ESC); g.lineTo((mx + anchoUtil) * ESC, y * ESC); g.stroke();
      g.fillStyle = suave.trim(); g.textAlign = 'right';
      g.fillText(v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)), (mx - 8) * ESC, y * ESC);
    }

    /* Con pocos meses la barra no se estira de lado a lado: queda del ancho
       de siempre y el grupo se centra, que es lo que se lee bien. */
    const w = Math.min(anchoUtil / ultimos.length, 92);
    const bw = w * 0.64;
    const centro = (anchoUtil - ultimos.length * w) / 2;
    ultimos.forEach((m, i) => {
      const h = (m.total / techo) * altoUtil;
      const x = mx + centro + i * w + (w - bw) / 2;
      g.fillStyle = barra.trim();
      g.fillRect(x * ESC, (my + altoUtil - h) * ESC, bw * ESC, h * ESC);
      g.fillStyle = suave.trim(); g.textAlign = 'center';
      g.save();
      g.translate((x + bw / 2) * ESC, (my + altoUtil + 12) * ESC);
      g.fillText(window.Venta.nombreMes(m.mes), 0, 0);
      g.restore();
      g.fillStyle = tinta.trim();
      g.font = `700 ${10 * ESC}px system-ui, sans-serif`;
      g.fillText(m.total >= 1000 ? `${Math.round(m.total / 1000)}k` : String(Math.round(m.total)),
        (x + bw / 2) * ESC, (my + altoUtil - h - 9) * ESC);
      g.font = `${11 * ESC}px system-ui, sans-serif`;
    });

    cv.style.cssText = 'max-width:100%;height:auto;display:block;border-radius:9px';
    caja.innerHTML = '';
    caja.appendChild(cv);
  }

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
      $('#histVenta').hidden = true;
      return;
    }
    $('#avisosHist').innerHTML = '';
    $('#histVista').innerHTML = VISTAS.map((v) =>
      `<button class="btn ${ui.vistaHist === v.id ? '' : 'sec'} mini" type="button" data-vista="${v.id}">${esc(v.nombre)}</button>`).join('');

    const esVenta = ui.vistaHist === 'venta';
    $('#histVenta').hidden = !esVenta;
    if (esVenta) { pintarVenta(); return; }

    const claves = D.claves();
    let th = '', tb = '';
    if (ui.vistaHist === 'turno') {
      th = `<tr><th class="l">Fecha</th><th class="l">Día</th>${D.TURNOS.map((t) => `<th>${esc(t.nombre)}</th>`).join('')}<th>Total QQ</th><th class="l"></th></tr>`;
      tb = fechas.map((f) => {
        const pt = D.porTurnoDe(f);
        const tot = D.TURNOS.reduce((a, t) => a + (Number(pt[t.id]) || 0), 0);
        return `<tr><td class="l">${esc(D.fechaCorta(f))}</td><td class="l dim">${esc(D.nombreDia(f))}</td>
          ${D.TURNOS.map((t) => celda(pt[t.id])).join('')}
          <td class="num"><b>${n2(tot)}</b></td>${acciones(f)}</tr>`;
      }).join('');
    } else if (ui.vistaHist === 'planta') {
      th = `<tr><th class="l">Fecha</th><th class="l">Día</th>${D.PLANTAS.map((p) => `<th>${esc(p.nombre)}</th>`).join('')}<th>Total QQ</th><th class="l"></th></tr>`;
      tb = fechas.map((f) => {
        const pp = D.porPlantaDe(f);
        const tot = D.PLANTAS.reduce((a, p) => a + (Number(pp[p.id]) || 0), 0);
        return `<tr><td class="l">${esc(D.fechaCorta(f))}</td><td class="l dim">${esc(D.nombreDia(f))}</td>
          ${D.PLANTAS.map((p) => celda(pp[p.id])).join('')}
          <td class="num"><b>${n2(tot)}</b></td>${acciones(f)}</tr>`;
      }).join('');
    } else if (ui.vistaHist === 'clave') {
      th = `<tr><th class="l">Fecha</th><th class="l">Día</th>${claves.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Total QQ</th><th class="l"></th></tr>`;
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
      /* Los que rotan no llevan selector: el momento se los da la rotación. */
      const mom = t.rota
        ? `<span class="chip mom">${esc(D.momentoDeTurno(t.id, ui.fecha))}</span><span class="mini">rota cada domingo</span>`
        : `<select data-tmom="${t.id}" aria-label="Momento de ${t.nombre}">
            ${['AM', 'PM'].map((m) => `<option value="${m}" ${D.momentoDeTurno(t.id) === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>`;
      return `<tr><td class="l clave">${esc(t.nombre)}<span class="mini">${esc(t.papel)}</span></td>
        <td><select data-tpl="${t.id}" aria-label="Planta de ${t.nombre}">
          ${D.PLANTAS.map((x) => `<option value="${x.id}" ${D.plantaDeTurno(t.id) === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}
        </select></td>
        <td class="l">${mom}</td>
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
        <td><input class="inqq" inputmode="decimal" data-pmax="${p.clave}" value="${c.maxDia ?? ''}" placeholder="sin tope" aria-label="Máximo diario ${p.clave}"></td>
        <td><select data-prep="${p.clave}" aria-label="Reparto ${p.clave}" style="min-width:118px">
          <option value="cascada" ${c.reparto !== 'porcentaje' ? 'selected' : ''}>Por orden</option>
          <option value="porcentaje" ${c.reparto === 'porcentaje' ? 'selected' : ''}>Por porcentaje</option>
        </select>${c.reparto === 'porcentaje' ? `<span class="mini">${esc((c.turnos || [])
            .map((t) => `${(D.turnoPorId[t] || {}).nombre || t} ${Number((c.pesos || {})[t]) || 0}%`)
            .join(' · '))}</span>` : ''}</td>
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
        <p class="sub">El tope son los quintales que el turno alcanza a hacer. El mínimo obliga a dejarlo trabajando aunque el sugerido sea cero.
          El momento dice si el turno es de mañana o de tarde: con eso se sabe a quién apaga un feriado de medio día y de quién sale la columna QQ PM Z2 de la hoja de bolsa.</p>
        <div class="tablabox"><table><thead><tr><th class="l">Turno</th><th class="l">Planta</th><th class="l">Momento</th><th>Tope QQ</th><th>Mínimo QQ</th><th class="l">Estado</th></tr></thead><tbody>${turnos}</tbody></table></div>
        <p class="dim" style="font-size:.84rem;margin:10px 2px">
          Capacidad por planta: ${D.PLANTAS.map((x) => `<b>${esc(x.nombre)}</b> ${n2(topePlanta[x.id])} QQ`).join(' · ')}.</p>
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
          ${th2('Clave', '', 'l')}${th2('Planta', '', 'l')}${th2('Bolsas/QQ', '')}${th2('Múltiplo QQ', '')}
          ${th2('Colchón', 'vacío = familia')}${th2('Vida útil', 'vacío = familia')}
          ${th2('Máx QQ/día', 'moldes × vueltas')}${th2('Reparto', 'entre sus turnos')}
          ${th2('Turnos que la pueden hacer', '', 'l')}${th2('Prod. ya en el conteo', '')}
          ${th2('Activo', '')}<th class="l"></th></tr></thead>
          <tbody>${prods}</tbody></table></div>
        <p class="dim" style="font-size:.84rem;margin:10px 2px">
          «Prod. ya en el conteo» es para el producto que se hace de mañana y que el INV PM de ese día ya trae adentro:
          su producción no se vuelve a sumar en el teórico PM.
          <br><b>Máx QQ/día</b> corta el sugerido: por mucho que haga falta, no hay más moldes ni más vueltas.
          Se junta con el tope del turno, y manda el que sea menor.
          <br><b>Reparto</b> dice cómo se parte entre sus turnos: <b>por orden</b> llena el primero de la lista
          y pasa al siguiente; <b>por porcentaje</b> le da a cada uno su parte, redondeando hacia arriba.
          Los porcentajes se ponen en «Editar».
          <br><b>Colchón</b> y <b>vida útil</b> vacíos heredan los de la familia; con un número puesto,
          ese producto manda sobre su familia.</p>
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
        <h3>Impresión de bolsa</h3>
        <p class="sub">
          Qué filas salen en esa hoja y en qué orden. Cada ficha es una fila de la hoja: una clave
          que se hace en dos plantas lleva una por planta, y se puede quitar una sin tocar la otra.
          Lo que no se imprime sólo estorba a la hora de decidir, así que acá se quita; una clave
          nueva entra sola, al final. Para mover una fila, agarrá la ficha del asa
          <span class="agarre">⠿</span> y arrastrala a donde la querés.
        </p>
        <div class="fila" style="margin-bottom:10px">
          <button class="btn ghost mini" type="button" id="btnBolsaTodas">Marcar todas</button>
          <button class="btn sec mini" type="button" id="btnBolsaNinguna">Quitar todas</button>
          <button class="btn sec mini" type="button" id="btnBolsaOrden">Orden de siempre</button>
          <span class="dim" style="font-size:.84rem" id="bolsaCuenta"></span>
        </div>
        <div id="bolsaClaves"></div>
        <h4 class="subrot" style="margin-top:18px">De dónde salen los quintales</h4>
        <p class="dim" style="font-size:.84rem;margin:0 2px 10px">
          La hoja toma la producción sola, del reparto. Acá se dice, clave por clave y turno por
          turno, si esos quintales cuentan para <b>PROD AM</b> o para <b>PROD PM</b>, y si se leen
          del <b>día a producir</b> o del <b>día anterior</b>. Un turno en «—» no entra.
          Sin tocar nada, cada turno cuenta en su propio momento y en el día a producir.
          <button class="btn sec mini" type="button" id="btnBolsaFuentesDef"
            style="margin-left:6px">Volver a lo de siempre</button>
        </p>
        <div id="bolsaFuentes"></div>
        <h4 class="subrot" style="margin-top:18px">El domingo que se imprime el sábado</h4>
        <p class="dim" style="font-size:.84rem;margin:0 2px 10px">
          La bolsa del domingo se manda a imprimir el sábado, cuando esa producción todavía no
          existe. Los sábados la hoja le suma encima el promedio de los últimos domingos
          capturados de esa planta, turno por turno, y cada turno entra por la cubeta que tenga
          puesta arriba. Un domingo sin nada capturado no cuenta como cero: se salta.
        </p>
        <div class="fila" style="align-items:flex-end;margin:0 2px 4px">
          <label class="sw"><input type="checkbox" id="chkBolsaDom"> Sumar el domingo estimado</label>
          <div class="campo"><label for="inBolsaDomPlanta">Planta</label>
            <select id="inBolsaDomPlanta" style="min-width:150px">
              ${D.PLANTAS.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}
            </select></div>
          <div class="campo"><label for="inBolsaDomSem">Domingos a promediar</label>
            <input class="inqq" inputmode="numeric" id="inBolsaDomSem" style="width:90px"></div>
        </div>
        <h4 class="subrot" style="margin-top:18px">Cantidades fijas por día de la semana</h4>
        <p class="dim" style="font-size:.84rem;margin:0 2px 10px">
          Las claves que se cuentan a mano pueden llevar una cantidad fija en ciertos días: bolsa
          que se manda a imprimir sin esperar producción, porque el dato se sabe de antemano.
          Se marcan los días y se escribe la cantidad; sin días o sin cantidad no pasa nada.
          En la hoja el número sale en gris, y lo que se escriba encima manda ese día.
        </p>
        <div id="bolsaFijos"></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Traslados a Zona 2</h3>
        <p class="sub">
          El pan que se hornea en Zona 18 y se empaca en Zona 2. Cada mañana se compara el
          <b>conteo de anoche</b> contra la <b>venta de hoy</b>: lo que falta baja. Las bolsas se
          pasan a unidades y de ahí a parrillas con las <b>unidades sin empacar</b> que cabe una,
          que no es lo mismo que las bolsas por parrilla del producto ya empacado.
        </p>
        <div class="fila" style="align-items:flex-end;margin:0 2px 4px">
          <label class="sw"><input type="checkbox" id="chkTrasArrastre">
            Descontar las parrillas de arrastre</label>
          <div class="campo"><label for="inTrasCarga">Cómo se carga</label>
            <select id="inTrasCarga" style="min-width:230px">
              <option value="completos">Completar a los que caben enteros</option>
              <option value="orden">Por orden estricto de urgencia</option>
            </select></div>
        </div>
        <h4 class="subrot" style="margin-top:18px">Claves que bajan</h4>
        <p class="dim" style="font-size:.84rem;margin:0 2px 10px">
          <b>Uni × parrilla</b> son las unidades sin empacar que lleva una parrilla. La
          <b>regla</b> dice cómo entra la clave: por el conteo contra la venta, porque se produjo
          el día anterior —el caso del 12BLL— o todos los días.
        </p>
        <div id="trasClaves"></div>
        <h4 class="subrot" style="margin-top:18px">Camiones</h4>
        <p class="dim" style="font-size:.84rem;margin:0 2px 10px">
          En el orden en que salen. <b>Total</b> es la capacidad del furgón y <b>arrastre</b> las
          parrillas vacías que vienen de vuelta; lo que queda es lo que puede llevar producto.
          Un camión sin días marcados no entra en el plan.
        </p>
        <div id="trasCamiones"></div>
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
        <h4 class="subrot" style="margin-top:18px">Qué se sincroniza desde este equipo</h4>
        <p class="dim" style="font-size:.84rem;margin:0 2px 10px">
          Se elige <b>por equipo</b> y no viaja con la sincronización: la tablet puede quedarse
          sin los pedidos mientras la laptop los lleva. Una parte apagada no se manda ni se trae
          —lo de acá se queda acá y lo del servidor queda como estaba—, pero se sigue guardando
          en este equipo. Al volver a encenderla, si los dos lados dicen lo mismo no pregunta
          nada; si difieren, pregunta una vez cuál vale.
        </p>
        <div id="syncPartes"></div>
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
    pintarBolsaClaves();
    pintarBolsaFuentes();
    pintarBolsaFijos();
    pintarTraslado();
    const bd = D.estado.params.bolsaDomingo;
    $('#chkBolsaDom').checked = bd.activo !== false;
    $('#inBolsaDomPlanta').value = bd.planta;
    $('#inBolsaDomSem').value = bd.semanas;
  }

  /* Las letras de los días, con lunes = 0 como todo el app. */
  const LETRA_DIA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  /* Las claves que se cuentan a mano y pueden llevar cantidad fija por día.
     Son las de la hoja que no salen del reparto: los manuales y el 12MU1. */
  function clavesFijables() {
    return window.Bolsa.EXTRAS.filter((e) => e.tipo === 'manual');
  }

  const REGLAS_TRAS = [
    ['conteo', 'El conteo no cubre la venta'],
    ['produccionAyer', 'Se produjo el día anterior'],
    ['siempre', 'Todos los días'],
  ];

  /** Las dos tablas del traslado: qué baja y en qué camión cabe. */
  function pintarTraslado() {
    const cont = $('#trasClaves');
    if (!cont) return;
    const t = D.estado.params.traslado || { claves: {}, camiones: [] };
    $('#chkTrasArrastre').checked = t.arrastre !== false;
    $('#inTrasCarga').value = t.carga === 'orden' ? 'orden' : 'completos';

    const claves = Object.keys(t.claves || {})
      .sort((a, b) => Number(!!t.claves[b].viaja) - Number(!!t.claves[a].viaja) || a.localeCompare(b));
    cont.innerHTML = `<div class="tablabox"><table>
      <thead><tr><th class="l">Clave</th><th>Baja</th><th style="width:110px">Uni × parrilla</th>
        <th class="l">Regla</th><th class="l" style="width:100%"></th></tr></thead>
      <tbody>${claves.map((c) => {
        const k = t.claves[c];
        const alias = (D.fichaPorClave(c) || {}).alias;
        return `<tr>
          <td class="l clave">${esc(c)}${alias && alias !== c ? `<span class="mini">${esc(alias)}</span>` : ''}</td>
          <td><label class="sw"><input type="checkbox" data-trv="${esc(c)}" ${k.viaja ? 'checked' : ''}
            aria-label="${esc(c)} baja a Zona 2"></label></td>
          <td><input class="inqq" inputmode="numeric" data-tru="${esc(c)}" value="${k.uxp || ''}"
            placeholder="—" aria-label="Unidades sin empacar por parrilla de ${esc(c)}"></td>
          <td class="l"><select data-trr="${esc(c)}" aria-label="Regla de ${esc(c)}">
            ${REGLAS_TRAS.map(([id, n]) =>
              `<option value="${id}" ${k.regla === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select></td>
          <td class="l dim">${k.viaja ? (k.uxp ? `${n0(k.uxp)} unidades por parrilla` : 'falta el dato de parrilla') : 'no baja'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;

    $('#trasCamiones').innerHTML = `<div class="tablabox"><table>
      <thead><tr><th class="l">Camión</th><th style="width:90px">Total</th>
        <th style="width:90px">Arrastre</th><th>Producto</th><th class="l">Días</th></tr></thead>
      <tbody>${(t.camiones || []).map((c, i) => {
        const neto = Math.max(0, (c.total || 0) - (t.arrastre !== false ? (c.arrastre || 0) : 0));
        return `<tr>
          <td class="l clave">${esc(c.id)}</td>
          <td><input class="inqq" inputmode="numeric" data-trct="${i}" value="${c.total || ''}"
            aria-label="Parrillas totales del ${esc(c.id)}"></td>
          <td><input class="inqq" inputmode="numeric" data-trca="${i}" value="${c.arrastre || ''}"
            aria-label="Parrillas de arrastre del ${esc(c.id)}"></td>
          <td class="num"><b>${n0(neto)}</b></td>
          <td class="l"><div class="fila diasf">${LETRA_DIA.map((l, j) => `<label class="sw diaf">
            <input type="checkbox" data-trcd="${i}" value="${j}" ${(c.dias || []).includes(j) ? 'checked' : ''}
              aria-label="${NOMBRE_DIA[j]} del ${esc(c.id)}"> ${l}</label>`).join('')}</div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /** Cantidad fija por día de la semana para las claves de cálculo manual. */
  function pintarBolsaFijos() {
    const cont = $('#bolsaFijos');
    if (!cont) return;
    const fijos = D.estado.params.bolsaFijos || {};
    const filas = clavesFijables().map((e) => {
      const f = fijos[e.id] || {};
      const dias = Array.isArray(f.dias) ? f.dias : [];
      const toques = LETRA_DIA.map((l, i) => `<label class="sw diaf">
          <input type="checkbox" data-fdia="${esc(e.id)}" value="${i}" ${dias.includes(i) ? 'checked' : ''}
            aria-label="${NOMBRE_DIA[i]} de ${esc(e.nombre)}"> ${l}</label>`).join('');
      return `<tr><td class="l clave">${esc(e.nombre)}</td>
        <td class="l"><div class="fila diasf">${toques}</div></td>
        <td><input class="inqq" inputmode="numeric" data-fcant="${esc(e.id)}"
          value="${f.cantidad || ''}" placeholder="—"
          aria-label="Cantidad fija de ${esc(e.nombre)}"></td>
        <td class="l dim">${dias.length && f.cantidad
          ? `${n0(f.cantidad)} los ${dias.map((i) => NOMBRE_DIA[i]).join(' y ')}`
          : 'sin cantidad fija'}</td></tr>`;
    }).join('');
    cont.innerHTML = `<div class="tablabox"><table>
      <thead><tr><th class="l">Clave</th><th class="l">Días</th>
        <th style="width:110px">A imprimir</th><th class="l" style="width:100%"></th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  }

  /* De dónde salen los quintales de cada clave en la hoja de bolsa: turno por
     turno, a qué cubeta van y de cuál de los dos días se leen. */
  function pintarBolsaFuentes() {
    const cont = $('#bolsaFuentes');
    if (!cont) return;
    const P = D.estado.params;
    const B = window.Bolsa;
    const ETIQ = { '': '—', AM: 'AM', PM: 'PM' };
    const DIA = { hoy: 'día a producir', ayer: 'día anterior' };
    const filas = D.productos().filter((p) => p.activo !== false).map((p) => {
      const turnos = B.turnosDeClave(p.clave);
      if (!turnos.length) {
        return `<tr><td class="l clave">${esc(p.alias || p.clave)}</td>
          <td class="l dim">Sin turnos: marcale una planta en Productos.</td></tr>`;
      }
      const celdas = turnos.map((t) => {
        const v = B.fuenteDe(P, p.clave, t.id);
        const sel = (dia) => `<select data-bfuente="${esc(p.clave)}" data-bturno="${esc(t.id)}"
            data-bdia="${dia}" title="${esc(t.nombre)}, ${DIA[dia]}"
            aria-label="${esc(t.nombre)} de ${esc(p.clave)}, ${DIA[dia]}">
            ${B.DESTINOS.map((o) =>
              `<option value="${o}" ${o === v[dia] ? 'selected' : ''}>${esc(ETIQ[o])}</option>`).join('')}
          </select>`;
        return `<div class="fuente${v.hoy || v.ayer ? '' : ' apagada'}">
          <span title="${esc(t.nombre)} · ${esc(D.plantaDeTurno(t.id))}">${esc(t.nombre)}</span>
          <i>hoy</i>${sel('hoy')}<i>ant</i>${sel('ayer')}</div>`;
      }).join('');
      return `<tr><td class="l clave">${esc(p.alias || p.clave)}</td>
        <td class="l"><div class="fuentes">${celdas}</div></td></tr>`;
    }).join('');
    cont.innerHTML = `<div class="tablabox"><table>
      <thead><tr><th class="l">Clave</th>
        <th class="l">Cada turno, con lo que produjo el día a producir («hoy»)
          y el día anterior («ant»)</th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  }

  /* Las claves de Impresión de bolsa, en el mismo orden de la hoja. Las filas
     de más —las sumas, MU1 y las que se cuentan a mano— también se pueden
     quitar: también estorban. */
  function pintarBolsaClaves() {
    const cont = $('#bolsaClaves');
    if (!cont) return;
    const P = D.estado.params;
    const B = window.Bolsa;
    /* Una ficha por fila de la hoja, en el orden en que salen. Una clave que
       se hace en dos plantas lleva dos fichas, porque son dos filas; la
       casilla es la misma para las dos, porque entra o sale como clave. */
    const items = B.filas(P, true).map((f) => ({
      fila: f.id,
      nombre: f.nombre,
      pprod: f.pprod || '',
      extra: f.tipo !== 'clave',
      dentro: B.filaDentro(P, f),
    }));
    const ficha = (x) => `<div class="sw rejilla" data-fila="${esc(x.fila)}">
      <span class="agarre" title="Arrastra para mover esta fila" aria-hidden="true">⠿</span>
      <input type="checkbox" data-bfila="${esc(x.fila)}" ${x.dentro ? 'checked' : ''}
        aria-label="${esc(x.nombre)} en la hoja">
      <span class="nom" title="${esc(x.nombre)}">${esc(x.nombre)}</span>
      ${x.pprod ? `<span class="pl">${esc(x.pprod)}</span>` : ''}
      ${x.extra ? '<span class="pl man">manual</span>' : ''}</div>`;
    cont.innerHTML = `<div class="rej" id="bolsaRej">${items.map(ficha).join('')}</div>`;
    const dentro = items.filter((x) => x.dentro).length;
    $('#bolsaCuenta').textContent = `${dentro} de ${items.length} filas en la hoja.`;
    arrastrarFilas($('#bolsaRej'));
  }

  /**
   * Mover las filas de la hoja de bolsa arrastrándolas. Va con eventos de
   * puntero y no con el arrastre del navegador, que en la tablet no dispara
   * con el dedo. Se agarra del asa para que la casilla siga siendo una
   * casilla; mientras se arrastra, la ficha se mete en el hueco por donde va
   * pasando, así se ve dónde va a quedar antes de soltar.
   */
  function arrastrarFilas(rej) {
    if (!rej) return;
    let ficha = null, movio = false;
    rej.querySelectorAll('.agarre').forEach((asa) => {
      asa.addEventListener('pointerdown', (e) => {
        ficha = asa.closest('.sw');
        movio = false;
        asa.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      asa.addEventListener('pointermove', (e) => {
        if (!ficha) return;
        if (!movio) { movio = true; ficha.classList.add('arrastrando'); }
        const bajo = document.elementFromPoint(e.clientX, e.clientY);
        const otra = bajo && bajo.closest ? bajo.closest('.sw.rejilla') : null;
        if (!otra || otra === ficha || otra.parentNode !== rej) return;
        const c = otra.getBoundingClientRect();
        /* Antes o después según de qué lado del centro vaya el dedo. */
        const antes = e.clientX < c.left + c.width / 2;
        rej.insertBefore(ficha, antes ? otra : otra.nextSibling);
      });
      const soltar = () => {
        if (!ficha) return;
        const movida = movio;
        ficha.classList.remove('arrastrando');
        ficha = null; movio = false;
        if (!movida) return;
        D.estado.params.bolsaOrden = [...rej.querySelectorAll('.sw.rejilla')]
          .map((x) => x.dataset.fila);
        D.guardarParams();
        pintarBolsaClaves();
        pintarBolsa();
        aviso('Orden guardado.');
      };
      asa.addEventListener('pointerup', soltar);
      asa.addEventListener('pointercancel', soltar);
    });
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
    const off = S.apagadas();
    if (off.length) {
      partes.push(`Sin sincronizar desde este equipo: <b>${esc(off.map((p) => p.nombre).join(', '))}</b>.`);
    }
    $('#estadoSync').innerHTML = partes.join(' ');
    const b = $('#btnSync');
    if (b) b.hidden = !S.activo();

    const cont = $('#syncPartes');
    if (cont) {
      const on = S.partes();
      cont.innerHTML = `<div class="rej">${S.PARTES.map((p) => `
        <label class="sw rejilla" title="${esc(p.detalle)}">
          <input type="checkbox" data-sparte="${esc(p.id)}" ${on[p.id] ? 'checked' : ''}>
          <span class="nom">${esc(p.nombre)}</span></label>`).join('')}</div>
        <p class="dim" style="font-size:.8rem;margin:8px 2px 0">
          ${S.PARTES.map((p) => `<b>${esc(p.nombre)}</b>: ${esc(p.detalle)}`).join(' · ')}</p>`;
    }
  }

  // ================= TECLADO EN LAS TABLAS =================
  /* Llenar una hoja es moverse por la cuadrícula, no por el orden de la
     página. Sin esto, el Tab del navegador se sale de la tabla al primer botón
     que encuentra —sincronizar, guardar el día— y hay que volver con el dedo.

     Enter y las flechas bajan y suben por la misma columna; al llegar al final
     siguen en la columna de al lado, como una hoja de cálculo. Tab y Shift+Tab
     van por el orden de la tabla, de izquierda a derecha y luego a la fila de
     abajo, y dan la vuelta al llegar al final en vez de soltar el foco. Escape
     suelta el foco, que es la salida cuando se quiere ir a los botones. */

  /** Una firma estable del campo, para volver a encontrarlo tras el repintado. */
  function firmaCampo(el) {
    const d = el.dataset || {};
    const ks = Object.keys(d).filter((k) => d[k] !== '' && d[k] != null).sort();
    if (!ks.length) return null;
    return ks.map((k) => {
      const attr = 'data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      return `[${attr}="${CSS.escape(String(d[k]))}"]`;
    }).join('');
  }

  const camposDe = (tabla) => [...tabla.querySelectorAll('input.inqq:not([disabled])')]
    .filter((x) => x.offsetParent !== null);

  /** El de al lado en el orden de la tabla, dando la vuelta. */
  function vecinoOrden(tabla, el, paso) {
    const todos = camposDe(tabla);
    const i = todos.indexOf(el);
    if (i < 0 || todos.length < 2) return null;
    return todos[(i + paso + todos.length) % todos.length];
  }

  /** El de arriba o abajo en la misma columna; al final, la columna siguiente. */
  function vecinoColumna(tabla, el, paso) {
    const celda = el.closest('td');
    if (!celda) return vecinoOrden(tabla, el, paso);
    const col = celda.cellIndex;
    const enCol = camposDe(tabla).filter((x) => {
      const c = x.closest('td');
      return c && c.cellIndex === col;
    });
    const i = enCol.indexOf(el);
    if (i < 0) return vecinoOrden(tabla, el, paso);
    const n = enCol[i + paso];
    if (n) return n;
    /* Se acabó la columna: se sigue por la de al lado, arriba o abajo según
       hacia dónde se venía. */
    const todos = camposDe(tabla);
    const cols = [...new Set(todos.map((x) => {
      const c = x.closest('td');
      return c ? c.cellIndex : -1;
    }))].sort((a, b) => a - b);
    const ic = cols.indexOf(col);
    const sigCol = cols[ic + (paso > 0 ? 1 : -1)];
    if (sigCol === undefined) return null;
    const enSig = todos.filter((x) => {
      const c = x.closest('td');
      return c && c.cellIndex === sigCol;
    });
    return paso > 0 ? enSig[0] : enSig[enSig.length - 1];
  }

  /**
   * Mueve el foco. El valor se guarda al salir del campo y eso vuelve a pintar
   * la tabla, así que el destino se identifica antes y se busca otra vez
   * después del repintado.
   */
  function saltarA(destino) {
    const tabla = destino.closest('table');
    const firma = firmaCampo(destino);
    const col = destino.closest('td') ? destino.closest('td').cellIndex : -1;
    const fila = destino.closest('tr') ? destino.closest('tr').rowIndex : -1;
    const panel = destino.closest('.panel') || document;
    const idTabla = tabla && tabla.closest('[id]') ? tabla.closest('[id]').id : '';
    setTimeout(() => {
      let n = null;
      if (firma) {
        const dentro = idTabla ? document.getElementById(idTabla) : panel;
        n = (dentro || panel).querySelector('input.inqq' + firma);
      }
      if (!n && tabla && tabla.isConnected && fila >= 0 && col >= 0) {
        const f = tabla.rows[fila];
        const c = f && f.cells[col];
        n = c && c.querySelector('input.inqq');
      }
      if (n) { n.focus(); if (n.select) n.select(); }
    }, 0);
  }

  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el || !el.matches || !el.matches('input.inqq')) return;
    if (e.key === 'Escape') { el.blur(); return; }
    const tabla = el.closest('table');
    if (!tabla) return;
    let destino = null;
    if (e.key === 'Enter') destino = vecinoColumna(tabla, el, e.shiftKey ? -1 : 1);
    else if (e.key === 'ArrowDown') destino = vecinoColumna(tabla, el, 1);
    else if (e.key === 'ArrowUp') destino = vecinoColumna(tabla, el, -1);
    else if (e.key === 'Tab') destino = vecinoOrden(tabla, el, e.shiftKey ? -1 : 1);
    else return;
    e.preventDefault();
    if (!destino || destino === el) return;
    el.blur();
    saltarA(destino);
  });

  /** Una pasada de sincronización, con los avisos que correspondan. */
  async function sincronizar(manual, eleccion) {
    const S = window.Sync;
    if (!S.activo()) { if (manual) aviso('La sincronización está apagada. Enciéndela en Parámetros.', 'err'); return; }
    if (manual) espera(true, 'Sincronizando…');
    try {
      const r = await S.sincronizar({ manual, eleccion: eleccion || null });
      if (!r.ok) { if (manual) aviso('No se sincronizó: ' + r.motivo, 'err'); return; }

      /* Lo que llegó del otro equipo puede traer entregados viejos: se
         archivan acá también, para que no vuelvan a entrar por la puerta de
         atrás en cada sincronización. */
      D.archivarPedidos();
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
    else if (d.bfila) {
      /* La lista guarda lo que NO entra. Puede traer la clave entera, de
         versiones anteriores, así que al volver a marcar una fila se cambia esa
         entrada por las de sus hermanas: lo que se ve marcado es lo que queda. */
      const fuera = new Set(P.bolsaFuera || []);
      const clave = d.bfila.includes('|') ? d.bfila.split('|')[0] : null;
      if (v) {
        fuera.delete(d.bfila);
        if (clave && fuera.has(clave)) {
          fuera.delete(clave);
          window.Bolsa.filas(P, true).forEach((f) => {
            if (f.tipo === 'clave' && f.clave === clave && f.id !== d.bfila) fuera.add(f.id);
          });
        }
      } else fuera.add(d.bfila);
      P.bolsaFuera = [...fuera];
      D.guardarParams(); pintarBolsaClaves(); pintarBolsa(); return true;
    }
    else if (d.pmax) P.prod[d.pmax].maxDia = v === '' ? null : Math.max(0, num(v, 0)) || null;
    else if (d.prep) {
      P.prod[d.prep].reparto = t.value === 'porcentaje' ? 'porcentaje' : 'cascada';
      D.guardarParams(); pintarParametros(); pintarProduccion(); return true;
    }
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
    else if (d.sparte) {
      window.Sync.fijarParte(d.sparte, v);
      pintarSync();
      aviso(v ? `${d.sparte === 'dias' ? 'El día' : 'Esa parte'} vuelve a sincronizarse desde este equipo.`
        : 'Esa parte deja de sincronizarse desde este equipo. Se sigue guardando acá.');
      return true;
    }
    else if (d.bfuente) {
      const todo = P.bolsaFuentes || (P.bolsaFuentes = {});
      const fila = todo[d.bfuente] || (todo[d.bfuente] = {});
      /* Se parte de lo que ese turno tiene hoy —aunque sea lo de fábrica— para
         no borrar el otro día al tocar uno solo. */
      const actual = window.Bolsa.fuenteDe(P, d.bfuente, d.bturno);
      fila[d.bturno] = { ...actual, [d.bdia]: ['AM', 'PM'].includes(t.value) ? t.value : '' };
      D.guardarParams(); pintarBolsaFuentes(); pintarBolsaClaves(); pintarBolsa(); return true;
    }
    else if (t.id === 'chkTrasArrastre' || t.id === 'inTrasCarga') {
      const tr = P.traslado;
      if (t.id === 'chkTrasArrastre') tr.arrastre = v;
      else tr.carga = t.value === 'orden' ? 'orden' : 'completos';
      D.guardarParams(); pintarTraslado(); return true;
    }
    else if (d.trv || d.tru || d.trr) {
      const c = d.trv || d.tru || d.trr;
      const k = P.traslado.claves[c] || (P.traslado.claves[c] = { viaja: false, uxp: 0, regla: 'conteo' });
      if (d.trv) k.viaja = v;
      else if (d.tru) k.uxp = Math.max(0, Math.round(num(v, 0)));
      else k.regla = ['conteo', 'produccionAyer', 'siempre'].includes(t.value) ? t.value : 'conteo';
      D.guardarParams(); pintarTraslado(); return true;
    }
    else if (d.trct || d.trca || d.trcd) {
      const i = Number(d.trct ?? d.trca ?? d.trcd);
      const cam = (P.traslado.camiones || [])[i];
      if (!cam) return true;
      if (d.trct) cam.total = Math.max(0, Math.round(num(v, 0)));
      else if (d.trca) cam.arrastre = Math.max(0, Math.round(num(v, 0)));
      else {
        const j = Number(t.value);
        const otros = (cam.dias || []).filter((x) => x !== j);
        cam.dias = (t.checked ? [...otros, j] : otros).sort((a, b) => a - b);
      }
      D.guardarParams(); pintarTraslado(); return true;
    }
    else if (d.fdia || d.fcant) {
      const id = d.fdia || d.fcant;
      const todo = P.bolsaFijos || (P.bolsaFijos = {});
      const f = todo[id] || (todo[id] = { dias: [], cantidad: 0 });
      if (d.fdia) {
        const i = Number(t.value);
        const otros = (f.dias || []).filter((x) => x !== i);
        f.dias = (t.checked ? [...otros, i] : otros).sort((a, b) => a - b);
      } else {
        f.cantidad = Math.max(0, Math.round(num(v, 0)));
      }
      /* Se guarda a medias —primero los días, después la cantidad— y sólo
         llena hace algo; vacía del todo, se borra. */
      if (!f.dias.length && !f.cantidad) delete todo[id];
      D.guardarParams(); pintarBolsaFijos(); pintarBolsa(); return true;
    }
    else if (d.tmom) {
      P.turnos[d.tmom].momento = t.value === 'PM' ? 'PM' : 'AM';
      D.guardarParams(); pintarParametros(); pintarProduccion(); return true;
    }
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
    /* Un solo toque deja la casilla lista para escribir encima, en toda la
       app: se selecciona lo que haya en vez de dejar el cursor en medio del
       número. El Tab sigue el orden de la tabla, que es el natural. */
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t.matches && t.matches('input.inqq') && !t.disabled) {
        try { t.select(); } catch (_) { /* algunos tipos no se seleccionan */ }
      }
    });
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
      /* En la tablet la tira de módulos no cabe entera y rueda de lado. Si el
         que queda activo está fuera de vista —al abrir el app con el último
         módulo guardado, por ejemplo— se trae a la vista. */
      const bot = $(tabs[k]);
      if (bot && bot.parentElement) {
        bot.parentElement.scrollTo({ left: Math.max(0, bot.offsetLeft - 16), behavior: 'smooth' });
      }
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
      const el = elegidoPedido();
      const cant = D.num($('#pdBolsas').value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { aviso('Falta el día de entrega.', 'err'); $('#pdFecha').focus(); return; }
      if (!el) { aviso('Falta el producto.', 'err'); $('#pdClave').focus(); return; }
      if (!cant || Number.isNaN(cant) || cant <= 0) {
        aviso('La cantidad tiene que ser un número mayor que cero.', 'err'); $('#pdBolsas').focus(); return;
      }
      /* Con presentación se captura en unidades y el app saca las bolsas; una
         clave suelta se pide en bolsas y no hay nada que convertir. */
      const enUnidades = !!(el.pres && el.uxb > 1);
      const p = D.nuevoPedido({
        fecha, cliente: $('#pdCliente').value,
        codigo: el.pres ? el.pres.cod : '',
        clave: el.clave,
        unidades: enUnidades ? cant : 0,
        bolsas: enUnidades ? null : cant,
        cuenta: $('#pdCuenta').checked,
      });
      D.guardarPedidos();
      /* La fecha y el cliente se quedan: un pedido suele traer varias claves. */
      $('#pdBolsas').value = '';
      pintarPedidos(); pintarProduccion();
      const quien = el.pres ? el.pres.cod : el.clave;
      aviso(`${quien}: ${enUnidades ? `${n0(cant)} unidades = ` : ''}${n0(p.bolsas)} bolsas `
        + `para ${D.fechaCorta(fecha)}${p.cuenta ? ', suman al sugerido' : ''}.`);
      $('#pdBolsas').focus();
    };
    ['#pdClave', '#pdBolsas'].forEach((s) => {
      $(s).addEventListener('input', pistaPedido);
      $(s).addEventListener('change', pistaPedido);
    });
    $('#pdBolsas').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#btnAgregarPed').click(); }
    });

    $('#btnResumen').onclick = () => window.Resumen.abrir(ui.fecha, aviso);
    $('#btnTraslado').onclick = () => abrirTraslado(ui.fecha);
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
      } else if (e.target.id === 'pedResFecha') {
        ui.pedResFecha = e.target.value || '';
        pintarResumenPed();
      } else if (e.target.id === 'inVentaClave') {
        ui.ventaClave = e.target.value; pintarVenta();
      } else if (d.cz5) {
        window.Venta.escribirCz5(ui.fecha, d.cz5, e.target.value);
        pintarCz5();
      } else if (d.pedcta) {
        const p = D.estado.pedidos[d.pedcta];
        if (p) p.cuenta = e.target.checked;
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
        } else if (id === 'chkBolsaDom' || id === 'inBolsaDomPlanta' || id === 'inBolsaDomSem') {
          if (id === 'chkBolsaDom') P.bolsaDomingo.activo = e.target.checked;
          else if (id === 'inBolsaDomPlanta') P.bolsaDomingo.planta = e.target.value;
          else P.bolsaDomingo.semanas = Math.max(1, Math.round(Number(e.target.value) || 4));
          D.guardarParams(); pintarParametros(); pintarBolsa(); return;
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
      const dudo = res.dudosas && res.dudosas.length
        ? ` Revisa ${res.dudosas.length} celda${res.dudosas.length > 1 ? 's' : ''}.` : '';
      if (!n) {
        aviso('La hoja no trajo ninguna clave de Zona 2. No se guardó nada.', 'err');
        return;
      }
      aviso(`Producción de Zona 2 guardada en el ${D.fechaCorta(destino)}: `
        + `${n} claves, ${n2(C.redondea(qq, 2))} qq.${dudo}`);
      /* La hoja casi siempre es del día anterior, así que lo leído no aparece
         en la tabla que se está viendo. Se dice dónde quedó y se ofrece ir,
         porque si no parece que no se guardó. */
      if (destino !== ui.fecha) {
        const ir = await preguntar('La hoja es de otro día',
          `Lo leído quedó guardado en el <b>${esc(D.fechaCorta(destino))}</b>, que es la fecha de `
          + `la hoja, y el día a producir es el <b>${esc(D.fechaCorta(ui.fecha))}</b>. `
          + `Desde acá lo ves en la línea «Producido el ${esc(D.fechaCorta(destino))}» de la `
          + `tarjeta de Zona 2, y alimenta la columna QQ PM Z2 de la hoja de bolsa.`,
          'Ir a ese día');
        if (ir === true) {
          ui.fecha = destino;
          ui.abierta = null; ui.sinCupo = null; ui.sinTurnoHoy = null;
          $('#inFecha').value = destino;
          recordarFecha(); pintarProduccion(); pintarInventario();
        }
      }
    });

    // impresión bolsa
    $('#inFechaBolsa').onchange = (e) => {
      ui.fechaBolsa = e.target.value || D.hoyISO(); pintarBolsa();
    };
    $('#inMu1').onchange = (e) => {
      window.Bolsa.escribir(ui.fechaBolsa, 'mu1', null, e.target.value);
      pintarBolsa();
    };
    $('#tbodyBolsa').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.matches('input.inqq')) return;
      window.Bolsa.escribir(ui.fechaBolsa, t.dataset.bcampo, t.dataset.bid, t.value);
      pintarBolsa();
    });
    /* Enter baja por la misma columna, que es como se llena una hoja así: una
       columna entera de arriba abajo, no una fila a la vez. */
    /* Un toque en la celda del teléfono o la tablet selecciona lo que hay,
       para escribir encima sin tener que borrar. */
    $('#btnBolsaPdf').onclick = async () => {
      try {
        const { blob, nombre } = window.Bolsa.pdf(ui.fechaBolsa);
        const r = await descargar(blob, nombre, window.Archivo.TIPO_PDF);
        if (r.modo === 'cancelado') return;
        aviso(`Hoja completa guardada${donde(r)}: carta acostada, en una hoja.`);
      } catch (err) { aviso('No se pudo armar el PDF: ' + err.message, 'err'); }
    };
    $('#btnOrdenPdf').onclick = async () => {
      try {
        const { blob, nombre, lineas } = window.Bolsa.ordenPdf(ui.fechaBolsa);
        if (!lineas) { aviso('Todavía no hay nada que imprimir ese día.', 'warn'); return; }
        const r = await descargar(blob, nombre, window.Archivo.TIPO_PDF);
        if (r.modo === 'cancelado') return;
        aviso(`Orden guardada${donde(r)}: ${lineas} claves en ¼ de carta.`);
      } catch (err) { aviso('No se pudo armar la orden: ' + err.message, 'err'); }
    };
    $('#btnHojaImg').onclick = async () => {
      try {
        const R = window.Resumen;
        const { cv, nombre } = window.Bolsa.hojaImagen(ui.fechaBolsa);
        const res = await R.compartir(await R.aBlob(cv), nombre, 'Impresión de bolsa');
        aviso(res === 'compartido' ? 'Hoja compartida.'
          : (res === 'cancelado' ? 'Cancelado.' : `Hoja ${res}.`));
      } catch (err) { aviso('No se pudo armar la imagen: ' + err.message, 'err'); }
    };
    $('#btnOrdenImg').onclick = async () => {
      try {
        const R = window.Resumen;
        const { cv, nombre, lineas } = window.Bolsa.ordenImagen(ui.fechaBolsa);
        if (!lineas) { aviso('Todavía no hay nada que imprimir ese día.', 'warn'); return; }
        const res = await R.compartir(await R.aBlob(cv), nombre, 'Impresión de bolsa');
        aviso(res === 'compartido' ? 'Orden compartida.'
          : (res === 'cancelado' ? 'Cancelado.' : `Orden ${res}.`));
      } catch (err) { aviso('No se pudo armar la imagen: ' + err.message, 'err'); }
    };

    // cálculos secundarios
    /* Escucha toda la pestaña, no sólo la lista de tarjetas: el CZ3 / CZ5 vive
       dentro de la tarjeta del conteo, que está fuera de `#secCont`. */
    $('#pSec').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.matches('input.inqq')) return;
      const S = window.Secundarios, d = t.dataset;
      /* El conteo de CZ5 comparte tarjeta pero no hoja: lo suyo se guarda en
         el día y lo atiende su propio manejador. */
      if (d.cz5) return;
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

      if (e.target.closest('#btnBolsaTodas')) {
        P.bolsaFuera = []; D.guardarParams(); pintarBolsaClaves(); pintarBolsa();
        aviso('Todas las filas entran en la hoja de bolsa.'); return;
      }
      if (e.target.closest('#btnBolsaNinguna')) {
        P.bolsaFuera = [...new Set(window.Bolsa.filas(P, true).map((f) => f.id))];
        D.guardarParams(); pintarBolsaClaves(); pintarBolsa();
        aviso('Hoja de bolsa vacía: marca las que sí uses.'); return;
      }
      if (e.target.closest('#btnBolsaFuentesDef')) {
        P.bolsaFuentes = {}; D.guardarParams(); pintarBolsaFuentes(); pintarBolsaClaves(); pintarBolsa();
        aviso('Cada turno vuelve a contar en su propio momento y en el día a producir.'); return;
      }
      if (e.target.closest('#btnBolsaOrden')) {
        P.bolsaOrden = []; D.guardarParams(); pintarBolsaClaves(); pintarBolsa();
        aviso('La hoja vuelve al orden de las áreas de producción.'); return;
      }

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
        ${campo('fpRend', 'Rendimiento (por QQ)', c.rend, 'number', 'min="1" step="1"')}
        ${campo('fpMult', 'Múltiplo de producción (QQ)', c.mult, 'number', 'min="0" step="0.01"')}
        ${campo('fpCod', 'Código', c.codigo ?? '')}
      </div>
      <div class="fila" style="margin-top:10px">
        ${D.PLANTAS.map((x) => `<label class="sw"><input type="checkbox" data-fppl="${x.id}"
          ${(c.plantas || {})[x.id] ? 'checked' : ''}> Se produce en ${esc(x.nombre)}</label>`).join('')}
      </div>
      <div class="fila" style="margin-top:10px">
        ${campo('fpMax', 'Máximo QQ al día', c.maxDia ?? '', 'number', 'min="0" step="0.5"')}
        <div class="campo"><label for="fpRep">Reparto entre sus turnos</label>
          <select id="fpRep" style="min-width:150px">
            <option value="cascada" ${c.reparto !== 'porcentaje' ? 'selected' : ''}>Por orden</option>
            <option value="porcentaje" ${c.reparto === 'porcentaje' ? 'selected' : ''}>Por porcentaje</option>
          </select></div>
      </div>
      ${(c.turnos || []).length ? `<div class="fila" style="margin-top:10px">
        ${(c.turnos || []).map((t) => `<div class="campo">
          <label for="fpPeso_${t}">% en ${esc((D.turnoPorId[t] || {}).nombre || t)}</label>
          <input type="number" id="fpPeso_${t}" data-fppeso="${t}" min="0" step="1"
            value="${Number((c.pesos || {})[t]) || ''}" style="width:104px"></div>`).join('')}
      </div>
      <p class="dim" style="font-size:.84rem;margin:8px 2px 0">
        Los porcentajes sólo se usan con el reparto «por porcentaje». No hace falta que sumen
        100: lo que importa es la proporción entre ellos.</p>` : ''}
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
          maxDia: Number($('#fpMax').value) > 0 ? Number($('#fpMax').value) : null,
          reparto: $('#fpRep').value === 'porcentaje' ? 'porcentaje' : 'cascada',
          pesos: Object.fromEntries([...document.querySelectorAll('[data-fppeso]')]
            .map((i) => [i.dataset.fppeso, Number(i.value) || 0])
            .filter(([, v]) => v > 0)),
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
