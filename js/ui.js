/* Interfaz: tablero de producción, inventario, historial, promedios y ajustes. */
(function () {
  'use strict';
  const D = window.Datos, C = window.Calculo, X = window.Excel;
  const VERSION = 'V.2026.7';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => (v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('es-GT'));
  const n1 = (v) => (v == null || !isFinite(v) ? '' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 1 }));
  const n2 = (v) => (v == null || !isFinite(v) ? '' : Number(v).toLocaleString('es-GT', { maximumFractionDigits: 2 }));

  /* Recordar el día en curso: la tablet se bloquea y al volver no hay que buscarlo. */
  const ultimaFecha = (() => {
    try { const f = localStorage.getItem('panprod_fecha'); return /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? f : null; }
    catch (_) { return null; }
  })();
  const ui = { fecha: ultimaFecha || D.hoyISO(), abierta: null, tab: 'prod', sinCupo: null, sinTurnoHoy: null, famMatriz: '', vistaHist: 'turno' };
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
  function preguntar(titulo, cuerpo, textoSi = 'Aceptar') {
    const ocupado = $('#espera').className === 'show';
    if (ocupado) $('#espera').className = '';
    return new Promise((res) => {
      $('#modalTit').textContent = titulo;
      $('#modalCuerpo').innerHTML = cuerpo;
      $('#modalSi').textContent = textoSi;
      const m = $('#modal'); m.classList.add('show');
      const cerrar = (v) => {
        m.classList.remove('show');
        $('#modalSi').onclick = null; $('#modalNo').onclick = null;
        if (ocupado) $('#espera').className = 'show';
        res(v);
      };
      $('#modalSi').onclick = () => cerrar(true);
      $('#modalNo').onclick = () => cerrar(false);
      m.onclick = (e) => { if (e.target === m) cerrar(false); };
    });
  }

  function descargar(blob, nombre) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = u; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 15000);
  }

  // ---------- estado del día ----------
  const reg = () => D.registro(ui.fecha);
  const calc = () => C.calcularTodo(D.estado, reg(), ui.fecha);

  // ================= PRODUCCIÓN =================
  const familiasUsadas = () => D.FAMILIAS.filter((f) => D.activos().some((p) => p.familia === f.id));

  const turnosDeFamilia = (famId) => {
    const ids = new Set();
    D.activos().forEach((p) => {
      if (p.familia !== famId) return;
      (p.turnos || []).forEach((t) => { if ((D.estado.params.turnos[t] || {}).activo !== false) ids.add(t); });
    });
    return D.TURNOS.filter((t) => ids.has(t.id));
  };

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
        <b>Cualquiera de las dos</b>
        <div class="qq"><strong>${n1(amb.sugerido)}</strong><span>qq sugeridos</span></div>
        <span class="dim" style="font-size:.82rem">${esc(amb.claves.join(', '))} — la planta la define el turno donde se reparta</span>
      </div>` : '';
    $('#plantas').innerHTML = tarjetas + extra;

    // --- turnos ---
    $('#turnos').innerHTML = Object.values(t.turnos).map((x) => {
      const pct = Math.min(100, Math.round(x.pct * 100));
      const cls = [!x.activo && 'apagado', x.excedido && 'excedido', !x.excedido && x.pct >= 0.999 && 'lleno', x.bajoMinimo && 'bajo'].filter(Boolean).join(' ');
      return `<div class="turno ${cls}">
        <b>${esc(x.nombre)}</b><span class="papel">${esc(x.papel)}${x.trabaja ? '' : ' · no trabaja hoy'}</span>
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

    // --- una tabla por familia ---
    const cuerpo = familiasUsadas().map((fam) => {
      const turnos = turnosDeFamilia(fam.id);
      const filas = t.filas.filter((f) => f.familia === fam.id);
      if (!filas.length) return '';
      const th = `<tr>
        <th class="l">Clave</th>
        <th>Stock + prod</th><th>Teórico PM hoy</th><th>Sugerido qq</th>
        ${turnos.map((x) => `<th>${esc(x.nombre)}</th>`).join('')}
        <th>Decidido qq</th><th>Teórico PM mañana</th><th>Cobertura</th><th class="l">Alerta</th></tr>`;
      const tb = filas.map((f) => filaProd(f, turnos)).join('');
      const sumFam = filas.reduce((a, f) => a + f.decididoQQ, 0);
      const cubre = rotuloCubre(filas);
      return `<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
        <div style="display:flex;align-items:baseline;gap:12px;padding:12px 16px;flex-wrap:wrap">
          <h3 style="margin:0">${esc(fam.nombre)}</h3>
          <span class="dim" style="font-size:.86rem">${filas.length} claves · ${n2(sumFam)} qq decididos</span>
          <span class="dim" style="font-size:.86rem;margin-left:auto">Cubre: ${cubre}</span>
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

  function filaProd(f, turnos) {
    const cfg = D.estado.params.prod[f.clave];
    const cob = f.cobertura;
    const cobCls = cob == null ? '' : (cob < 1 ? 'baja' : (cob > f.cobMax ? 'alta' : ''));
    const chip = { OK: 'ok', FALTANTE: 'falta', EXCESO: 'exceso', 'TOPE VIDA UTIL': 'vida',
      'MENOS DE UN LOTE': 'vida', 'SIN VENTA': 'nada' }[f.alerta] || 'nada';
    const inputs = turnos.map((x) => {
      const puede = (cfg.turnos || []).includes(x.id);
      const v = f.asign[x.id];
      return `<td><input class="inqq ${puede ? '' : 'na'} ${v ? 'puesto' : ''}" inputmode="decimal"
        ${puede ? '' : 'disabled tabindex="-1"'} data-clave="${esc(f.clave)}" data-turno="${x.id}"
        value="${v ? n2(v) : ''}" aria-label="${esc(f.clave)} en ${esc(x.nombre)}"></td>`;
    }).join('');
    const abierta = ui.abierta === f.clave;
    const det = abierta ? `<tr class="detalle"><td colspan="${7 + turnos.length}">${explicacion(f)}</td></tr>` : '';
    return `<tr data-fila="${esc(f.clave)}">
      <td class="l clave"><button type="button" class="verDet" data-clave="${esc(f.clave)}"
          style="background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:0;text-align:left">
          ${esc(f.clave)} <span style="color:var(--muted);font-weight:400">${abierta ? '▾' : '▸'}</span>
          <span class="mini">${n0(f.rend)} bolsas/qq</span></button></td>
      <td class="num">${n0(f.disponible)}</td>
      <td class="num">${n0(f.teoricoHoy)}</td>
      <td class="num sug ${f.sugeridoQQ ? '' : 'cero'}">${f.sugeridoQQ ? n2(f.sugeridoQQ) : '—'}</td>
      ${inputs}
      <td class="num"><b>${f.decididoQQ ? n2(f.decididoQQ) : '—'}</b></td>
      <td class="num ${f.teoricoManana < 0 ? 'neg' : ''}">${n0(f.teoricoManana)}</td>
      <td class="num cob ${cobCls}">${cob == null ? '—' : n1(cob) + ' d'}</td>
      <td class="l"><span class="chip ${chip}">${esc(f.alerta)}</span></td>
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
        <td class="num dim">${n0(f.ventaHoy)}</td>
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
      descargar(blob, t ? `${t.nombre.replace(/[^\w]+/g, '_')}_${hoy}.xlsx` : `Historial_Produccion_${hoy}.xlsx`);
      aviso(t ? `Exportado ${t.titulo}.` : `Exportados ${fechas.length} días en ${hojas.length} tablas.`);
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
        <td class="num dim">${Math.max(1, c.vidaUtil - c.minDespacho)} d</td></tr>`;
    }).join('');

    const prods = D.productos().map((p) => {
      const c = P.prod[p.clave], pol = C.politica(P, p.clave);
      const chips = D.TURNOS.map((t) => `<label class="sw turnochip" title="${esc(t.nombre)} · ${esc(D.plantaDeTurno(t.id))}">
        <input type="checkbox" data-pt="${p.clave}" data-tid="${t.id}" ${(c.turnos || []).includes(t.id) ? 'checked' : ''}> ${esc(t.nombre)}</label>`).join('');
      const des = C.turnosUtiles(P, p.clave).desajuste;
      return `<tr${des ? ' class="ojo"' : ''}>
        <td class="l clave">${esc(p.clave)}${des ? '<span class="mini neg">sin turno en su planta</span>' : ''}</td>
        <td class="l pz">
          <label class="sw"><input type="checkbox" data-pz2="${p.clave}" ${c.z2 ? 'checked' : ''}> Z2</label>
          <label class="sw"><input type="checkbox" data-pz18="${p.clave}" ${c.z18 !== false ? 'checked' : ''}> Z18</label></td>
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
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Vida útil por familia</h3>
        <p class="sub">La cobertura máxima sale de la vida útil menos los días que el producto debe conservar al despacharse.</p>
        <div class="tablabox"><table><thead><tr><th class="l">Familia</th><th>Vida útil (d)</th><th>Mínimo al despachar (d)</th><th>Colchón (d)</th><th>Cobertura máx.</th></tr></thead><tbody>${familias}</tbody></table></div>
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
        <div class="fila" style="margin-top:12px">
          <div class="campo"><label for="inFeriados">Fechas sin producción (una por línea, AAAA-MM-DD)</label>
            <textarea id="inFeriados" style="min-width:260px">${esc((P.feriados || []).join('\n'))}</textarea></div>
        </div>
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
    const g = D.misDefecto();
    $('#estadoDef').innerHTML = g
      ? `Guardados el <b>${esc(g.guardadoEn ? D.fechaCorta(g.guardadoEn.slice(0, 10)) : 'alguna vez')}</b>. `
        + '«Volver a mis valores» regresa a esa configuración.'
      : 'Todavía no has guardado ninguno: «Volver a mis valores» te deja los de fábrica.';
    $('#btnVolverDef').disabled = !g;
    pintarMatriz();
    pintarLector();
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
        const si = await preguntar('Estos dos equipos nunca se habían comparado',
          `<p>Hay <b>${r.total}</b> ${r.total === 1 ? 'cosa que está distinta' : 'cosas que están distintas'} aquí y allá,
             y no hay manera de saber cuál es la buena.</p>
           <p class="dim">${esc(r.indecisos.slice(0, 14).join(' · '))}${r.indecisos.length > 14 ? ' …' : ''}</p>
           <p>Lo demás ya quedó igual en los dos. ¿Con cuál me quedo para esto?</p>`,
          'Lo de este equipo');
        $('#modalNo').textContent = 'Cancelar';
        return sincronizar(manual, si ? 'local' : 'remoto');
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
    pintarProduccion(); pintarInventario(); pintarHistorial(); pintarPromedios();
    if (ui.tab === 'param') pintarParametros(); else pintarSync();
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
    else if (d.prend) P.prod[d.prend].rend = Math.max(1, num(v, 1));
    else if (d.pmult) P.prod[d.pmult].mult = Math.max(0, Math.round(num(v, 0) * 100) / 100);
    else if (d.pcol) P.prod[d.pcol].colchon = v === '' ? null : Math.max(0, num(v, 0));
    else if (d.pvu) P.prod[d.pvu].vidaUtil = v === '' ? null : Math.max(1, num(v, 21));
    else if (d.pact) P.prod[d.pact].activo = v;
    else if (d.pz2) { P.prod[d.pz2].z2 = v; D.guardarParams(); pintarParametros(); return true; }
    else if (d.pz18) { P.prod[d.pz18].z18 = v; D.guardarParams(); pintarParametros(); return true; }
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
    if (toco) { D.guardarParams(); if (['fvu', 'fmd', 'fco', 'pcol', 'pvu'].some((k) => d[k])) pintarParametros(); }
    return toco;
  }

  function enlazar() {
    // pestañas
    const paneles = { prod: '#pProd', inv: '#pInv', hist: '#pHist', prom: '#pProm', param: '#pParam' };
    const tabs = { prod: '#tabProd', inv: '#tabInv', hist: '#tabHist', prom: '#tabProm', param: '#tabParam' };
    window.irA = (k) => {
      ui.tab = k;
      Object.keys(paneles).forEach((x) => {
        $(paneles[x]).hidden = x !== k;
        $(tabs[x]).setAttribute('aria-selected', String(x === k));
      });
      try { localStorage.setItem('panprod_tab', k); } catch (_) {}
      if (k === 'prod') pintarProduccion();
      if (k === 'inv') pintarInventario();
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
        else if (id === 'inFeriados') P.feriados = e.target.value.split('\n').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
        else return;
        D.guardarParams();
      }
    });

    document.addEventListener('click', (e) => {
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
    async function entraEn(fecha) {
      if (!fecha || fecha === ui.fecha) return ui.fecha;
      const si = await preguntar('La hoja trae otra fecha',
        `<p>La hoja dice <b>${esc(D.fechaCorta(fecha))}</b> y estás trabajando el <b>${esc(D.fechaCorta(ui.fecha))}</b>.</p>
         <p>¿Guardo el INV PM en el día de la hoja?</p>`, 'Usar el de la hoja');
      if (!si) return ui.fecha;
      ui.fecha = fecha; ui.abierta = null; recordarFecha();
      return fecha;
    }

    $('#btnFoto').onclick = () => window.Lector.abrir(async (res) => {
      const destino = await entraEn(res.fecha);
      const n = aplicarCrudo(res.crudo, destino);
      if (res.blob) descargar(res.blob, res.nombre);
      pintarInventario(); pintarProduccion();
      aviso(`INV PM de ${n} claves en ${D.fechaCorta(destino)}.`
        + (res.blob ? ' El Excel se descargó.' : '')
        + (res.dudosas && res.dudosas.length ? ` Revisa: ${res.dudosas.join(', ')}.` : ''));
    });

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
    $('#btnRespaldo').onclick = () => {
      const data = { version: VERSION, fecha: new Date().toISOString(), params: D.estado.params, prom: D.estado.prom, dias: D.estado.dias };
      descargar(new Blob([JSON.stringify(data)], { type: 'application/json' }), `Respaldo_Produccion_${D.hoyISO().replace(/-/g, '_')}.json`);
      aviso('Respaldo descargado. Guárdalo fuera de la tablet.');
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
        D.estado.dias = d.dias;
        D.guardarParams(); D.guardarProm(); D.guardarDias();
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
        <label class="sw"><input type="checkbox" id="fpZ2" ${c.z2 ? 'checked' : ''}> Se produce en Zona 2</label>
        <label class="sw"><input type="checkbox" id="fpZ18" ${c.z18 !== false ? 'checked' : ''}> Se produce en Zona 18</label>
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
          z2: $('#fpZ2').checked,
          z18: $('#fpZ18').checked,
        };
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
    enlazar(); instalacion(); autodetectarLector(); arrancarSync();
    let t = 'prod';
    try { t = localStorage.getItem('panprod_tab') || 'prod'; } catch (_) {}
    window.irA(['prod', 'inv', 'hist', 'prom', 'param'].includes(t) ? t : 'prod');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
