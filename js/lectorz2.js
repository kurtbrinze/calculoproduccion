/* Lector de la hoja de producción de la planta Zona 2.

   La hoja que mandan a diario trae, a la derecha, una columna por persona con
   los quintales que hizo cada una de cada clave. Eso es lo único que se lee:
   el inventario sigue entrando por el lector de INV PM, que ya trabaja bien.

   Usa el mismo motor que el lector de inventario —reducción de la foto, envío
   y reintento— y sólo cambia qué se le pide y cómo se muestra. Lo que devuelve
   es una matriz clave × turno en quintales, lista para pasarla al reparto del
   día. */
(function () {
  'use strict';
  const D = window.Datos;
  const L = window.Lector;
  const esc = L.esc, num = L.num, fmt = L.fmt, ddmmaaaa = L.ddmmaaaa;

  const SISTEMA = 'Eres un transcriptor de hojas de producción de panadería. Tu única tarea es copiar números manuscritos con exactitud literal. Un número mal copiado hace que la panadería produzca de más o de menos, así que ante la duda marcas la celda como dudosa en lugar de adivinar.';

  /** Los turnos de la planta, en el orden en que salen impresos en la hoja. */
  const turnosZ2 = () => D.turnosDeArea('Z2');
  /** Las claves de la planta, en el orden de la hoja. */
  const clavesZ2 = () => D.clavesDeArea('Z2');

  function instruccion() {
    const claves = clavesZ2();
    const turnos = turnosZ2().map((t) => t.nombre.toUpperCase());
    return `Esta foto es la hoja de producción diaria de una panadería, con el título "HOY" y la fecha escrita a mano arriba a la izquierda.

La tabla tiene una fila por clave de producto y, a la derecha, un bloque de columnas con el nombre de una persona en cada una, escrito en vertical. Esas columnas traen los quintales que produjo cada persona de cada clave.

Las personas, en el orden en que aparecen de izquierda a derecha:
${turnos.join(', ')}

Las claves, en el orden impreso de arriba hacia abajo:
${claves.join(', ')}

Reglas, en orden de importancia:

1. Copia ÚNICAMENTE el bloque de columnas de las personas. IGNORA por completo las columnas STOCK AYER, PRODUC AYER, CONSUMO HOY, STOCK TEOR. HOY, STOCK REAL HOY, CONSUMO MAÑANA y QQ HOY: esos números no van al resultado.
2. Una celda vacía es null, no cero. No rellenes una celda vacía con el valor de otra fila ni de otra columna.
3. Los valores llevan decimales: 5.50, 0.35, 2.5. Cópialos tal cual, con el punto decimal donde esté escrito. Un "250" junto a un "0.35" en la misma celda son dos celdas distintas de columnas vecinas: fíjate en las líneas de la tabla.
4. La letra se escribe un poco más abajo de la línea impresa. Asigna cada número a la clave cuya fila lo contiene, contando las filas desde la primera clave.
5. Un número tachado no cuenta; usa el que lo corrige, y si no hay corrección pon null.
6. No calcules nada. No sumes ni completes totales. Copia lo escrito.
7. Si un dígito o la columna a la que pertenece un número no se distingue con seguridad, pon tu mejor lectura y agrega "CLAVE|PERSONA" a "dudosas".

Si la hoja trae una clave que no está en la lista, omítela. Si una clave de la lista no aparece en la hoja, inclúyela igual con todos sus valores en null.

Lee también la fecha escrita arriba a la izquierda, junto a "HOY", y devuélvela como AAAA-MM-DD. Está en formato DD-MM-AA.

Responde SOLO con un objeto JSON, sin texto antes ni después, con esta forma:

{"fecha":"AAAA-MM-DD","turnos":{"CLAVE":{"PERSONA":numero_o_null}},"dudosas":["CLAVE|PERSONA"]}

Incluye TODAS las claves de la lista, en el mismo orden, y dentro de cada una TODAS las personas, aunque su valor sea null.`;
  }

  /**
   * Abre el lector. `alAplicar({fecha, matriz, dudosas})` recibe los quintales
   * por clave y turno; quien llama decide en qué día los escribe.
   */
  function abrir(alAplicar) {
    const claves = clavesZ2();
    const turnos = turnosZ2();
    const porNombre = {};
    turnos.forEach((t) => { porNombre[t.nombre.toUpperCase()] = t.id; });

    const vacia = () => Object.fromEntries(claves.map((c) => [c, {}]));
    const st = { dataUrl: null, b64: null, mime: null, fecha: null,
      vals: vacia(), crudos: {}, dudosas: new Set(), leido: false };

    const m = document.createElement('div');
    m.className = 'lector';
    m.innerHTML = `
      <div class="lcaja">
        <div class="lbar">
          <h3>Leer producción Z2</h3>
          <span class="dim" id="zEstado"></span>
          <button class="btn sec mini" type="button" id="zCerrar" style="margin-left:auto">Cerrar</button>
        </div>
        <div class="lcuerpo">
          <div class="card" style="margin-bottom:12px">
            <p class="sub" style="margin-top:0">
              Toma la foto de la hoja completa y plana. La app copia sólo el bloque
              de columnas de las personas; el inventario de la izquierda se descarta.
            </p>
            <div class="fila">
              <button class="btn ghost" type="button" id="zCam">Tomar foto</button>
              <button class="btn ghost" type="button" id="zGal">Elegir imagen</button>
              <button class="btn" type="button" id="zLeer" disabled>Leer la foto</button>
              <div class="campo" style="margin-left:auto"><label for="zFecha">Fecha de la hoja</label>
                <input type="date" id="zFecha" style="min-width:160px"></div>
            </div>
            <input type="file" id="zCamIn" accept="image/*" capture="environment" hidden>
            <input type="file" id="zGalIn" accept="image/*" hidden>
            <div id="zPrev" hidden></div>
          </div>
          <div id="zAvisos"></div>
          <div class="kpis" id="zSum"></div>
          <div id="zTabla"></div>
        </div>
        <div class="lpie">
          <span class="dim" id="zNombre"></span>
          <button class="btn" type="button" id="zAplicar" disabled>Pasar al reparto del día</button>
        </div>
      </div>
      <div class="lvisor" id="zVisor"><img id="zVisorImg" alt="Foto de la producción"></div>`;
    document.body.appendChild(m);
    document.body.style.overflow = 'hidden';
    const q = (s) => m.querySelector(s);

    const cerrar = () => { document.body.style.overflow = ''; m.remove(); };
    const decir = (t, err) => { q('#zEstado').textContent = t || ''; q('#zEstado').className = err ? 'dim neg' : 'dim'; };

    function estado() {
      const modo = L.cfg('modo', '');
      decir(modo === 'llave'
        ? (L.cfg('key') ? 'Lector: llave en este dispositivo.' : 'Falta la llave — ponla en Parámetros.')
        : modo === 'servidor'
          ? (L.cfg('url') ? 'Lector: servidor propio.' : 'Falta la dirección — ponla en Parámetros.')
          : 'Lector sin configurar — ve a Parámetros.');
    }

    function pintar() {
      q('#zLeer').disabled = !st.b64;
      q('#zFecha').value = st.fecha || '';
      q('#zNombre').textContent = st.leido && st.fecha ? `Hoja del ${ddmmaaaa(st.fecha)}` : '';
      if (!st.leido) { q('#zTabla').innerHTML = ''; q('#zSum').innerHTML = ''; q('#zAvisos').innerHTML = ''; q('#zAplicar').disabled = true; return; }

      const malos = [];
      let total = 0, conDato = 0;
      const porTurno = Object.fromEntries(turnos.map((t) => [t.id, 0]));
      const filas = claves.map((c) => {
        let suma = 0;
        const celdas = turnos.map((t) => {
          const v = st.vals[c][t.id];
          const bad = Number.isNaN(v);
          if (bad) malos.push(`${c} · ${t.nombre}`);
          if (!bad && v != null) { suma += v; porTurno[t.id] += v; conDato++; }
          const dud = st.dudosas.has(c + '|' + t.id);
          const val = bad ? (st.crudos[c + '|' + t.id] ?? '') : (v == null ? '' : v);
          return `<td><input class="inqq${bad ? ' mal' : ''}${dud ? ' dud' : ''}" style="width:72px"
            inputmode="decimal" enterkeyhint="next" data-c="${esc(c)}" data-t="${t.id}"
            value="${esc(val)}" aria-label="${esc(c)} en ${esc(t.nombre)}"></td>`;
        }).join('');
        total += suma;
        return `<tr><td class="l clave">${esc(c)}</td>${celdas}
          <td class="num"><b>${suma ? fmt(Math.round(suma * 100) / 100) : ''}</b></td></tr>`;
      }).join('');

      const pie = turnos.map((t) => `<td class="num"><b>${porTurno[t.id] ? fmt(Math.round(porTurno[t.id] * 100) / 100) : ''}</b></td>`).join('');
      q('#zTabla').innerHTML = `<div class="card" style="padding:0;overflow:hidden">
        <div style="display:flex;gap:10px;align-items:baseline;padding:11px 14px">
          <h3 style="margin:0;font-size:.95rem">Quintales por persona</h3>
          <span class="dim" style="font-size:.84rem;margin-left:auto">${conDato} celdas con dato</span></div>
        <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0;max-height:none">
          <table><thead><tr><th class="l">Clave</th>
            ${turnos.map((t) => `<th>${esc(t.nombre)}</th>`).join('')}<th>Total qq</th></tr></thead>
            <tbody>${filas}</tbody>
            <tfoot><tr><td class="l">TOTAL</td>${pie}
              <td class="num"><b>${fmt(Math.round(total * 100) / 100)}</b></td></tr></tfoot>
          </table></div></div>`;

      q('#zSum').innerHTML =
        `<div class="kpi"><span>Celdas con dato</span><strong>${conDato}</strong></div>`
        + `<div class="kpi"><span>Quintales en total</span><strong>${fmt(Math.round(total * 100) / 100)}</strong></div>`
        + (st.dudosas.size ? `<div class="kpi alerta"><span>Por revisar</span><strong>${st.dudosas.size}</strong></div>` : '')
        + (malos.length ? `<div class="kpi alerta"><span>No son número</span><strong>${malos.length}</strong></div>` : '');

      const av = [`<div class="aviso"><h4>Revisa contra la foto antes de pasar los datos</h4>
        <p>Las columnas van pegadas y la letra se corre de fila con facilidad. Las celdas
        marcadas <b>revisar</b> son las que el lector no vio con claridad.</p></div>`];
      if (malos.length) av.push(`<div class="aviso err"><h4>Hay valores que no son número</h4>
        <p>Corrige ${malos.slice(0, 8).map((c) => esc(c)).join(', ')}${malos.length > 8 ? ' y otros' : ''} antes de continuar.</p></div>`);
      q('#zAvisos').innerHTML = av.join('');
      q('#zAplicar').disabled = !st.leido || !!malos.length;
    }

    async function elegir(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) { decir('Eso no es una imagen.', true); return; }
      try {
        const r = await L.reducir(file);
        st.dataUrl = r.dataUrl; st.b64 = r.b64; st.mime = r.mime;
        st.leido = false;
        q('#zPrev').hidden = false;
        q('#zPrev').innerHTML = `<img src="${r.dataUrl}" alt="Foto de la producción" id="zThumb">`;
        q('#zVisorImg').src = r.dataUrl;
        decir(`Foto lista (${r.w}×${r.h}). Toca «Leer la foto».`);
        pintar();
      } catch (err) { decir(err.message, true); }
    }

    async function leer() {
      if (!st.b64) return;
      const modo = L.cfg('modo', '');
      if (!modo) { decir('Primero configura el lector en Parámetros.', true); return; }
      q('#zLeer').disabled = true;
      decir('Leyendo la foto…');
      try {
        const data = await L.enviar(st, modo, { sistema: SISTEMA, instruccion: instruccion() }, decir);
        /* Un servidor de lectura viejo contesta siempre la hoja de inventario,
           sin mirar las instrucciones. Se dice en vez de dejar la tabla vacía
           sin explicación. */
        if (!data || !data.turnos) {
          throw new Error('la respuesta no trae la producción por persona. '
            + 'Si usas servidor propio, necesita una versión que acepte instrucciones; '
            + 'mientras tanto el modo llave sí funciona.');
        }
        st.fecha = (data.fecha && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) ? data.fecha : null;
        st.dudosas = new Set((data.dudosas || []).map((x) => {
          const [c, p] = String(x).split('|');
          const id = porNombre[String(p || '').trim().toUpperCase()];
          return id ? `${String(c).trim().toUpperCase()}|${id}` : String(x);
        }));
        const dst = vacia();
        claves.forEach((c) => {
          const fila = data.turnos[c] || {};
          turnos.forEach((t) => {
            /* El lector contesta con el nombre de la persona; adentro se
               trabaja con el id del turno. */
            const v = fila[t.nombre.toUpperCase()] !== undefined ? fila[t.nombre.toUpperCase()]
              : (fila[t.nombre] !== undefined ? fila[t.nombre] : fila[t.id]);
            dst[c][t.id] = num(v);
          });
        });
        st.vals = dst;
        st.leido = true;
        pintar();
        decir(st.fecha ? `Listo. Fecha leída: ${ddmmaaaa(st.fecha)}.` : 'Listo, pero no se leyó la fecha. Escríbela arriba.');
        if (!st.fecha) q('#zFecha').focus();
      } catch (err) {
        decir('No se pudo leer: ' + err.message, true);
        q('#zLeer').disabled = false;
      }
    }

    // --- eventos ---
    q('#zCerrar').onclick = cerrar;
    q('#zCam').onclick = () => q('#zCamIn').click();
    q('#zGal').onclick = () => q('#zGalIn').click();
    ['#zCamIn', '#zGalIn'].forEach((s) => {
      q(s).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; elegir(f); };
    });
    q('#zLeer').onclick = leer;
    q('#zAplicar').onclick = () => {
      if (!st.fecha) { decir('Falta la fecha de la hoja.', true); q('#zFecha').focus(); return; }
      const matriz = {};
      claves.forEach((c) => {
        const fila = {};
        turnos.forEach((t) => {
          const v = st.vals[c][t.id];
          if (v != null && !Number.isNaN(v) && v !== 0) fila[t.id] = v;
        });
        if (Object.keys(fila).length) matriz[c] = fila;
      });
      const res = { fecha: st.fecha, matriz, dudosas: [...st.dudosas] };
      cerrar();
      alAplicar(res);
    };
    q('#zFecha').addEventListener('change', (e) => {
      st.fecha = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null;
      q('#zNombre').textContent = st.leido && st.fecha ? `Hoja del ${ddmmaaaa(st.fecha)}` : '';
    });
    q('#zTabla').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.matches('input.inqq')) return;
      const raw = t.value.trim();
      st.vals[t.dataset.c][t.dataset.t] = num(raw);
      st.crudos[t.dataset.c + '|' + t.dataset.t] = raw;
      pintar();
    });
    /* Enter y Tab bajan por la columna de la misma persona, que es como se
       teclea una hoja así: una persona a la vez, de arriba abajo. */
    q('#zTabla').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input.inqq')) return;
      e.preventDefault();
      const col = e.target.dataset.t;
      const ins = [...m.querySelectorAll(`#zTabla input.inqq[data-t="${col}"]`)];
      const next = ins[ins.indexOf(e.target) + 1];
      if (next) { next.focus(); next.select(); } else e.target.blur();
    });
    const visor = (on) => { q('#zVisor').classList.toggle('show', on); };
    m.addEventListener('click', (e) => {
      if (e.target.id === 'zThumb') visor(true);
      else if (e.target.id === 'zVisor' || e.target.id === 'zVisorImg') visor(false);
    });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') visor(false); });

    estado(); pintar();
  }

  window.LectorZ2 = { abrir, instruccion, SISTEMA };
})();
