/* Interfaz: tablero de producción, inventario, historial, promedios y ajustes. */
(function () {
  'use strict';
  const D = window.Datos, C = window.Calculo, X = window.Excel;
  const VERSION = 'V.3';
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
  const ui = { fecha: ultimaFecha || D.hoyISO(), abierta: null, tab: 'prod', sinCupo: null, famMatriz: '' };
  const recordarFecha = () => { try { localStorage.setItem('panprod_fecha', ui.fecha); } catch (_) {} };

  // ---------- avisos ----------
  let tToast;
  function aviso(msg, tipo) {
    const el = $('#toast'); el.textContent = msg; el.className = 'show' + (tipo === 'err' ? ' err' : '');
    clearTimeout(tToast); tToast = setTimeout(() => { el.className = ''; }, tipo === 'err' ? 6500 : 3200);
  }
  const espera = (on, msg) => { $('#esperaMsg').textContent = msg || 'Procesando…'; $('#espera').className = on ? 'show' : ''; };

  function preguntar(titulo, cuerpo, textoSi = 'Aceptar') {
    return new Promise((res) => {
      $('#modalTit').textContent = titulo;
      $('#modalCuerpo').innerHTML = cuerpo;
      $('#modalSi').textContent = textoSi;
      const m = $('#modal'); m.classList.add('show');
      const cerrar = (v) => { m.classList.remove('show'); $('#modalSi').onclick = null; $('#modalNo').onclick = null; res(v); };
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
  const familiasUsadas = () => D.FAMILIAS.filter((f) => D.PRODUCTOS.some((p) =>
    (D.estado.params.prod[p.clave] || {}).familia === f.id && D.estado.params.prod[p.clave].activo !== false));

  const turnosDeFamilia = (famId) => {
    const ids = new Set();
    D.PRODUCTOS.forEach((p) => {
      const cfg = D.estado.params.prod[p.clave] || {};
      if (cfg.familia !== famId || cfg.activo === false) return;
      (cfg.turnos || []).forEach((t) => { if ((D.estado.params.turnos[t] || {}).activo !== false) ids.add(t); });
    });
    return D.TURNOS.filter((t) => ids.has(t.id));
  };

  function pintarProduccion() {
    const t = calc();
    const r = reg();
    $('#inFecha').value = ui.fecha;
    $('#inFactor').value = D.estado.params.factorTemporada;
    $('#lblDia').textContent = D.nombreDia(ui.fecha);
    const offs = C.offsetsACubrir(D.estado.params, ui.fecha, null);
    $('#lblCubrir').textContent = `Cubre ${offs.length} día${offs.length > 1 ? 's' : ''}: `
      + offs.map((o) => D.fechaCorta(D.sumarDias(ui.fecha, o))).join(', ');

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

    // --- turnos ---
    $('#turnos').innerHTML = Object.values(t.turnos).map((x) => {
      const pct = Math.min(100, Math.round(x.pct * 100));
      const cls = [!x.activo && 'apagado', x.excedido && 'excedido', !x.excedido && x.pct >= 0.999 && 'lleno', x.bajoMinimo && 'bajo'].filter(Boolean).join(' ');
      return `<div class="turno ${cls}">
        <b>${esc(x.nombre)}</b><span class="papel">${esc(x.papel)}</span>
        <div class="qq"><strong>${n2(x.usado)}</strong><span>de ${n2(x.tope)} qq</span></div>
        <div class="barra"><i style="width:${pct}%"></i></div>
        ${x.excedido ? '<span class="chip falta" style="margin-top:7px">Pasa el tope</span>'
          : x.bajoMinimo ? `<span class="chip exceso" style="margin-top:7px">Mínimo ${n2(x.minimo)}</span>` : ''}
      </div>`;
    }).join('');

    // --- avisos ---
    const av = [];
    const sinInv = t.filas.filter((f) => r.inv[f.clave] == null).length;
    if (sinInv === t.filas.length) av.push(['warn', 'Falta el inventario', 'Sin inventario el teórico PM sale de cero. Captúralo en la pestaña Inventario.']);
    else if (sinInv) av.push(['warn', `${sinInv} claves sin inventario`, 'Las que están vacías se calculan como si no hubiera existencia.']);
    const exc = Object.values(t.turnos).filter((x) => x.excedido);
    if (exc.length) av.push(['err', 'Hay turnos pasados de tope', exc.map((x) => `${x.nombre}: ${n2(x.usado)} de ${n2(x.tope)} qq`).join(' · ')]);
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
        <th>Inv + prod</th><th>Teórico PM hoy</th><th>Sugerido qq</th>
        ${turnos.map((x) => `<th>${esc(x.nombre)}</th>`).join('')}
        <th>Decidido qq</th><th>Teórico PM mañana</th><th>Cobertura</th><th class="l">Alerta</th></tr>`;
      const tb = filas.map((f) => filaProd(f, turnos)).join('');
      const sumFam = filas.reduce((a, f) => a + f.decididoQQ, 0);
      const offsFam = C.offsetsACubrir(D.estado.params, ui.fecha, fam.id);
      const cubre = offsFam.map((o) => D.fechaCorta(D.sumarDias(ui.fecha, o))).join(', ');
      return `<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
        <div style="display:flex;align-items:baseline;gap:12px;padding:12px 16px;flex-wrap:wrap">
          <h3 style="margin:0">${esc(fam.nombre)}</h3>
          <span class="dim" style="font-size:.86rem">${filas.length} claves · ${n2(sumFam)} qq decididos</span>
          <span class="dim" style="font-size:.86rem;margin-left:auto">Cubre: ${esc(cubre)}</span>
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
    const dias = f.ventas.map((v, i) => `${D.fechaCorta(D.sumarDias(ui.fecha, i + 1))}: ${n0(v)}`).join(' · ');
    const li = (t, v, cls = '') => `<li><span>${t}</span><span class="v ${cls}">${v}</span></li>`;
    const falta = f.teoricoManana < 0;
    return `<div class="expl">
      <div>
        <h4>POR QUÉ ESTE SUGERIDO</h4>
        <p>Hoy cierras con <b>${n0(f.teoricoHoy)}</b> bolsas: ${n0(f.inv)} de inventario más
        ${n2(f.prodHoyQQ)} qq producidos hoy (${n0(f.prodHoyB)} bolsas), menos ${n0(f.ventaHoy)} que se venden hoy.</p>
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
          ${li('Inventario de cierre', n0(f.inv) + ' b')}
          ${li('Producción de hoy', n2(f.prodHoyQQ) + ' qq = ' + n0(f.prodHoyB) + ' b')}
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
  function pintarInventario() {
    const r = reg(), t = calc();
    $('#tbodyInv').innerHTML = t.filas.map((f) => {
      const real = r.real[f.clave];
      const dif = real == null ? null : real - f.teoricoHoy;
      return `<tr>
        <td class="l clave">${esc(f.clave)}</td>
        <td><input class="inqq" style="width:96px" inputmode="numeric" data-inv="${esc(f.clave)}"
            value="${r.inv[f.clave] == null ? '' : r.inv[f.clave]}" aria-label="Inventario ${esc(f.clave)}"></td>
        <td><input class="inqq" inputmode="decimal" data-prodhoy="${esc(f.clave)}"
            value="${r.prodHoy[f.clave] == null ? '' : r.prodHoy[f.clave]}" aria-label="Producción hoy ${esc(f.clave)}"></td>
        <td class="num dim">${n0(f.prodHoyB)}</td>
        <td class="num"><b>${n0(f.disponible)}</b></td>
        <td><input class="inqq" style="width:96px" inputmode="numeric" data-real="${esc(f.clave)}"
            value="${real == null ? '' : real}" aria-label="Conteo real ${esc(f.clave)}"></td>
        <td class="num ${dif != null && Math.abs(dif) > f.rend ? 'neg' : 'dim'}">${dif == null ? '' : (dif > 0 ? '+' : '') + n0(dif)}</td>
      </tr>`;
    }).join('');
    const faltan = t.filas.filter((f) => r.inv[f.clave] == null).length;
    $('#avisosInv').innerHTML = faltan
      ? `<div class="aviso warn"><h4>${faltan} claves sin inventario</h4><p>Escríbelas o tráelas del Excel. Sin ese dato el teórico sale de cero.</p></div>` : '';
  }

  // ================= PROMEDIOS =================
  function pintarPromedios() {
    $('#theadProm').innerHTML = `<tr><th class="l">Clave</th>${D.DIAS.map((d) => `<th>${d.slice(0, 3)}</th>`).join('')}<th>Semana</th></tr>`;
    $('#tbodyProm').innerHTML = D.PRODUCTOS.map((p) => {
      const fila = D.estado.prom[p.clave] || [0, 0, 0, 0, 0, 0, 0];
      const tot = fila.reduce((a, b) => a + (Number(b) || 0), 0);
      return `<tr><td class="l clave">${esc(p.clave)}</td>
        ${D.DIAS.map((d, i) => `<td><input class="inqq" style="width:82px" inputmode="numeric"
          data-prom="${esc(p.clave)}" data-dia="${i}" value="${fila[i] ?? 0}" aria-label="${esc(p.clave)} ${d}"></td>`).join('')}
        <td class="num dim">${n0(tot)}</td></tr>`;
    }).join('');
  }

  // ================= HISTORIAL =================
  function pintarHistorial() {
    const fechas = Object.keys(D.estado.dias).sort().reverse();
    $('#kpisHist').innerHTML =
      kpi('Días guardados', fechas.length) +
      kpi('Primer día', fechas.length ? D.fechaCorta(fechas[fechas.length - 1]) : '—') +
      kpi('Último día', fechas.length ? D.fechaCorta(fechas[0]) : '—');
    if (!fechas.length) {
      $('#avisosHist').innerHTML = '<div class="aviso"><h4>Todavía no hay días guardados</h4><p>Al terminar un día, el botón <b>Guardar el día</b> lo deja aquí.</p></div>';
      $('#theadHist').innerHTML = ''; $('#tbodyHist').innerHTML = ''; return;
    }
    $('#avisosHist').innerHTML = '';
    $('#theadHist').innerHTML = `<tr><th class="l">Fecha</th><th class="l">Día</th>
      ${D.TURNOS.map((t) => `<th>${esc(t.nombre)}</th>`).join('')}<th>Total qq</th><th class="l"></th></tr>`;
    $('#tbodyHist').innerHTML = fechas.map((f) => {
      const r = D.estado.dias[f];
      const porTurno = D.TURNOS.map((t) =>
        Object.keys(r.turnos).reduce((a, c) => a + (Number((r.turnos[c] || {})[t.id]) || 0), 0));
      const tot = porTurno.reduce((a, b) => a + b, 0);
      return `<tr><td class="l">${esc(D.fechaCorta(f))}</td><td class="l dim">${esc(D.nombreDia(f))}</td>
        ${porTurno.map((v) => `<td class="num ${v ? '' : 'dim'}">${v ? n2(v) : '—'}</td>`).join('')}
        <td class="num"><b>${n2(tot)}</b></td>
        <td class="l"><button class="btn sec mini" data-abrir="${f}">Abrir</button>
        <button class="btn sec mini" data-borrar="${f}">Borrar</button></td></tr>`;
    }).join('');
  }

  // ================= AJUSTES =================
  function pintarParametros() {
    const P = D.estado.params;
    const cal = P.calendario.map((c, i) => `<tr>
      <td class="l clave">${esc(D.DIAS[i])}</td>
      <td><label class="sw"><input type="checkbox" data-cal="${i}" ${c.produce ? 'checked' : ''}> produce</label></td>
      <td><input class="inqq" inputmode="decimal" data-calf="${i}" value="${c.factor}" aria-label="Factor de ${D.DIAS[i]}"></td>
    </tr>`).join('');

    const turnos = D.TURNOS.map((t) => {
      const c = P.turnos[t.id];
      return `<tr><td class="l clave">${esc(t.nombre)}<span class="mini">${esc(t.papel)}</span></td>
        <td><input class="inqq" inputmode="decimal" data-tope="${t.id}" value="${c.tope}" aria-label="Tope ${t.nombre}"></td>
        <td><input class="inqq" inputmode="decimal" data-min="${t.id}" value="${c.minimo}" aria-label="Mínimo ${t.nombre}"></td>
        <td><label class="sw"><input type="checkbox" data-tact="${t.id}" ${c.activo !== false ? 'checked' : ''}> activo</label></td></tr>`;
    }).join('');

    const familias = D.FAMILIAS.map((f) => {
      const c = P.familias[f.id];
      return `<tr><td class="l clave">${esc(f.nombre)}</td>
        <td><input class="inqq" inputmode="numeric" data-fvu="${f.id}" value="${c.vidaUtil}" aria-label="Vida útil ${f.nombre}"></td>
        <td><input class="inqq" inputmode="numeric" data-fmd="${f.id}" value="${c.minDespacho}" aria-label="Mínimo al despachar ${f.nombre}"></td>
        <td><input class="inqq" inputmode="decimal" data-fco="${f.id}" value="${c.colchon}" aria-label="Colchón ${f.nombre}"></td>
        <td class="num dim">${Math.max(1, c.vidaUtil - c.minDespacho)} d</td></tr>`;
    }).join('');

    const prods = D.PRODUCTOS.map((p) => {
      const c = P.prod[p.clave], pol = C.politica(P, p.clave);
      const chips = D.TURNOS.map((t) => `<label class="sw" style="margin-right:9px;font-size:.84rem">
        <input type="checkbox" data-pt="${p.clave}" data-tid="${t.id}" ${(c.turnos || []).includes(t.id) ? 'checked' : ''}> ${esc(t.nombre)}</label>`).join('');
      return `<tr>
        <td class="l clave">${esc(p.clave)}</td>
        <td><input class="inqq" inputmode="decimal" data-prend="${p.clave}" value="${c.rend}" aria-label="Rendimiento ${p.clave}"></td>
        <td><input class="inqq" inputmode="decimal" step="0.01" data-pmult="${p.clave}" value="${c.mult}" aria-label="Múltiplo ${p.clave}"></td>
        <td><input class="inqq" inputmode="decimal" data-pcol="${p.clave}" value="${c.colchon ?? ''}" placeholder="${pol.colchon}" aria-label="Colchón ${p.clave}"></td>
        <td><input class="inqq" inputmode="numeric" data-pvu="${p.clave}" value="${c.vidaUtil ?? ''}" placeholder="${pol.vidaUtil}" aria-label="Vida útil ${p.clave}"></td>
        <td class="l" style="min-width:330px">${chips}</td>
        <td><label class="sw"><input type="checkbox" data-pact="${p.clave}" ${c.activo !== false ? 'checked' : ''}></label></td></tr>`;
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
        <div class="tablabox"><table><thead><tr><th class="l">Turno</th><th>Tope qq</th><th>Mínimo qq</th><th class="l">Estado</th></tr></thead><tbody>${turnos}</tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Vida útil por familia</h3>
        <p class="sub">La cobertura máxima sale de la vida útil menos los días que el producto debe conservar al despacharse.</p>
        <div class="tablabox"><table><thead><tr><th class="l">Familia</th><th>Vida útil (d)</th><th>Mínimo al despachar (d)</th><th>Colchón (d)</th><th>Cobertura máx.</th></tr></thead><tbody>${familias}</tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Calendario de producción</h3>
        <p class="sub">Los días sin producción alargan el horizonte: el viernes tiene que cubrir hasta el lunes.</p>
        <div class="tablabox"><table><thead><tr><th class="l">Día</th><th class="l">Produce</th><th>Factor de venta</th></tr></thead><tbody>${cal}</tbody></table></div>
        <div class="fila" style="margin-top:12px">
          <div class="campo"><label for="inFeriados">Fechas sin producción (una por línea, AAAA-MM-DD)</label>
            <textarea id="inFeriados" style="min-width:260px">${esc((P.feriados || []).join('\n'))}</textarea></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Productos</h3>
        <p class="sub">El múltiplo admite dos decimales. Colchón y vida útil vacíos heredan los de la familia.</p>
        <div class="tablabox"><table><thead><tr>
          <th class="l">Clave</th><th>Bolsas/qq</th><th>Múltiplo qq</th><th>Colchón</th><th>Vida útil</th>
          <th class="l">Turnos que la pueden hacer</th><th>Activo</th></tr></thead><tbody>${prods}</tbody></table></div>
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
        <h3>Datos desde el libro de cálculo</h3>
        <p class="sub">Trae rendimientos e inventario de <b>Calculo_Produccion_IA.xlsx</b> sin tener que escribirlos.</p>
        <div class="fila">
          <button class="btn ghost" id="btnImportRend" type="button">Traer rendimientos</button>
          <button class="btn sec" id="btnResetParam" type="button">Volver a los valores de fábrica</button>
          <input type="file" id="fileRend" accept=".xlsx" hidden>
        </div>
      </div>`;

    $('#inModo').value = P.horizonteModo;
    $('#selFam').value = ui.famMatriz || '';
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
      ? (propia ? P.cobertura.familias[fam] : (P.cobertura.general || C.matrizDesdeCalendario(P)))
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

  function pintarLector() {
    const F = window.Foto, m = F.cfg('modo', '');
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
    if (window.Foto.cfg('modo', '')) return;
    try {
      const r = await fetch('./api/extract');
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.ok) {
        window.Foto.setCfg('modo', 'servidor');
        window.Foto.setCfg('url', new URL('./api/extract', location.href).href);
      }
    } catch (_) { /* no hay lector aquí */ }
  }

  // ================= eventos =================
  /** La matriz que se está editando; la crea copiando lo que se ve si no existía. */
  function matrizDestino(crear) {
    const P = D.estado.params, fam = ui.famMatriz || '';
    const base = () => JSON.parse(JSON.stringify(
      D.matrizValida(P.cobertura.general) ? P.cobertura.general : C.matrizDesdeCalendario(P)));
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
      ui.fecha = e.target.value || D.hoyISO(); ui.abierta = null; ui.sinCupo = null;
      recordarFecha(); pintarProduccion();
    };
    $('#inFactor').onchange = (e) => {
      const n = Number(e.target.value); D.estado.params.factorTemporada = Number.isFinite(n) && n > 0 ? n : 1;
      D.guardarParams(); pintarProduccion();
    };
    $('#btnRepartir').onclick = () => {
      const r = C.repartir(D.estado, reg(), ui.fecha);
      ui.sinCupo = r.sinCupo;
      D.guardarDias(); pintarProduccion();
      aviso(r.sinCupo.length ? `Repartido. ${r.sinCupo.length} claves no cupieron completas.` : 'Repartido entre los turnos.');
    };
    $('#btnLimpiar').onclick = () => {
      C.limpiarReparto(reg()); ui.sinCupo = null; D.guardarDias(); pintarProduccion(); aviso('Reparto borrado.');
    };

    document.addEventListener('change', (e) => {
      const d = e.target.dataset || {};
      if (d.clave && d.turno) {
        const v = D.num(e.target.value);
        const r = reg();
        if (v == null || v === 0) delete r.turnos[d.clave][d.turno];
        else if (!Number.isNaN(v)) r.turnos[d.clave][d.turno] = Math.round(v * 100) / 100;
        D.guardarDias(); pintarProduccion();
      } else if (d.inv || d.prodhoy || d.real) {
        const clave = d.inv || d.prodhoy || d.real;
        const campo = d.inv ? 'inv' : (d.prodhoy ? 'prodHoy' : 'real');
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
      if (e.target.closest('#btnDesdeCal')) {
        const P = D.estado.params;
        const fam = ui.famMatriz || '';
        const nueva = C.matrizDesdeCalendario(P);
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
        };
      });
      r.cerrado = true; r.guardadoEn = new Date().toISOString();
      if (D.guardarDias()) { aviso(`Guardado ${D.fechaCorta(ui.fecha)}.`); pintarProduccion(); }
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
      const ayer = D.sumarDias(ui.fecha, -1), prev = D.estado.dias[ayer];
      if (!prev) { aviso('No hay nada guardado del día anterior.', 'err'); return; }
      const r = reg(); let n = 0;
      D.PRODUCTOS.forEach((p) => {
        const v = prev.real[p.clave] != null ? prev.real[p.clave] : prev.inv[p.clave];
        if (v != null) { r.inv[p.clave] = v; n++; }
      });
      D.guardarDias(); pintarInventario(); aviso(`Traídas ${n} claves de ${D.fechaCorta(ayer)}.`);
    };
    $('#btnFoto').onclick = () => window.Foto.abrir(async (res) => {
      // Primero se decide a qué día entra, y recién ahí se escribe.
      if (res.fecha && res.fecha !== ui.fecha) {
        const si = await preguntar('La hoja trae otra fecha',
          `<p>La foto dice <b>${esc(D.fechaCorta(res.fecha))}</b> y estás trabajando el <b>${esc(D.fechaCorta(ui.fecha))}</b>.</p>
           <p>¿Guardo el inventario en el día de la foto?</p>`,
          'Usar el de la foto');
        if (si) { ui.fecha = res.fecha; ui.abierta = null; recordarFecha(); }
      }
      const r = reg(); let n = 0;
      Object.entries(res.inv).forEach(([c, v]) => { r.inv[c] = v; n++; });
      D.guardarDias(); pintarInventario(); pintarProduccion();
      aviso(`Inventario de ${n} claves en ${D.fechaCorta(ui.fecha)}. Revísalo contra la foto antes de decidir.`);
    });

    $('#btnImportInv').onclick = () => $('#fileInv').click();
    $('#fileInv').onchange = (e) => importar(e, async (libro) => {
      const { inv, n, origen } = await X.leerInventario(libro);
      if (!n) throw new Error('No encontré inventario en ese archivo.');
      const r = reg(); Object.entries(inv).forEach(([c, v]) => { r.inv[c] = v; });
      D.guardarDias(); pintarInventario();
      return `Inventario de ${n} claves (${origen}).`;
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
    $('#btnExportHist').onclick = async () => {
      const fechas = Object.keys(D.estado.dias);
      if (!fechas.length) { aviso('No hay días guardados.', 'err'); return; }
      espera(true, 'Armando el Excel…');
      try {
        const { blob } = await X.escribirLibro(X.hojasHistorial(D.estado.dias), 'historial.xlsx');
        const hoy = D.hoyISO().replace(/-/g, '_');
        descargar(blob, `Historial_Produccion_${hoy}.xlsx`);
        aviso(`Exportados ${fechas.length} días.`);
      } catch (err) { aviso('No se pudo exportar: ' + err.message, 'err'); }
      finally { espera(false); }
    };
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
      if (e.target.closest('#btnResetParam')) {
        preguntar('Volver a los ajustes de fábrica', '<p>Se pierden topes, múltiplos, vida útil y calendario que hayas cambiado.</p>', 'Restaurar')
          .then((si) => { if (si) { D.estado.params = D.paramsPorDefecto(); D.guardarParams(); pintarParametros(); aviso('Parámetros restaurados.'); } });
      }
    });
    document.addEventListener('change', (e) => {
      const F = window.Foto, id = e.target.id;
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

  async function importar(e, fn) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    espera(true, `Leyendo ${f.name}…`);
    try { aviso(await fn(await X.abrir(f))); }
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

  // ---------- arranque ----------
  function iniciar() {
    $('#badgeVer').textContent = VERSION;
    enlazar(); instalacion(); autodetectarLector();
    let t = 'prod';
    try { t = localStorage.getItem('panprod_tab') || 'prod'; } catch (_) {}
    window.irA(['prod', 'inv', 'hist', 'prom', 'param'].includes(t) ? t : 'prod');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
