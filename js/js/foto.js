/* Lectura de la foto del inventario: manda la imagen al lector y llena la
   columna de inventario del día. La llave puede vivir en un servidor propio o
   en este dispositivo; se configura en Ajustes. */
(function () {
  'use strict';
  const D = window.Datos;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const cfg = (k, d = '') => { try { return localStorage.getItem('panprod_' + k) ?? d; } catch (_) { return d; } };
  const setCfg = (k, v) => { try { localStorage.setItem('panprod_' + k, v); } catch (_) {} };
  const MODELO = 'claude-opus-5';

  /* Las dos listas de la hoja de papel, en el orden impreso. */
  const PAN_BLANCO = ['12BLL','10FP8','10HD7','5HC1','5HD2','10HD6','5HD8','5HE8','5HG7','5HM4',
    '10HM5','10HR3','20MA1','MA3','16PA1','6PC4','15PL1','PL1U','15PL1U','8PL1','PL1T','10PM3',
    'S11T','S11','S16','S19','S25','S26','S32','12WY1','12WYK','SE2','5ST2','12WYK+P','12PB2',
    '6HD12','10WY1M','10WY1G','IN16','CZ3','CZ5','10CZ4'];
  const PASTEL = ['almohada','brazo','bola berlin','bombom','borracho','relampago','corbata',
    'cartucho','casita','cuadro','dona','empanada','gaznate','marquesote','milhoja','pañuelo',
    'parrilla','pio','pie','tartaleta','MG1','MGN','MG4','6CG2N','6CG2V','6CHO','6QU1','12QU1',
    '10CH2','EN1','ES1','ES2','PS4','5CHD','10CHD','EN4','10EN4','ME4','MR1','10MR1','MASC',
    'MA5M','SE5','RY5','RY1'];

  const SISTEMA = 'Eres un transcriptor de hojas de inventario de panadería. Tu única tarea es copiar números manuscritos con exactitud literal. Un número mal copiado hace que la panadería produzca de más o de menos, así que ante la duda marcas la clave como dudosa en lugar de adivinar.';

  const instruccion = () => `Esta foto es una hoja "STOCK DE PRODUCTO TERMINADO" con dos tablas lado a lado.

IZQUIERDA (PAN BLANCO), filas en este orden exacto:
${PAN_BLANCO.join(', ')}

DERECHA (PASTEL Y MASAS DULCES), filas en este orden exacto:
${PASTEL.join(', ')}

Cada tabla tiene tres columnas: CLAVE (impresa), DETALLE / CONTEO (sumas a mano) y TOTAL.

Reglas, en orden de importancia:

1. Copia ÚNICAMENTE la columna TOTAL, la de más a la derecha de cada tabla. IGNORA por completo la columna DETALLE / CONTEO.
2. Si la celda TOTAL de una clave está vacía, su valor es null. No la rellenes con el detalle ni con el total de otra fila.
3. La letra se escribe un poco más abajo de la línea impresa. Asigna cada TOTAL a la clave cuya fila lo contiene, contando las filas desde la primera clave.
4. Un número tachado no cuenta; usa el que lo corrige, y si no hay corrección pon null.
5. No calcules nada. No sumes, no multipliques, no corrijas lo que parezca inconsistente. Copia lo escrito.
6. Si un dígito no se distingue con seguridad, pon tu mejor lectura y agrega la clave a "dudosas".

Lee también la fecha escrita arriba a la derecha junto a "FECHA:" y devuélvela como AAAA-MM-DD. Está en formato DD/MM/AA.

Responde SOLO con un objeto JSON, sin texto antes ni después:

{"fecha":"AAAA-MM-DD","pan_blanco":{"CLAVE":numero_o_null},"pastel":{"CLAVE":numero_o_null},"dudosas":["CLAVE"]}

Incluye TODAS las claves de ambas listas, aunque su valor sea null.`;

  function sacarJson(texto) {
    const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto);
    for (const c of [cerca && cerca[1], texto]) {
      if (!c) continue;
      const a = c.indexOf('{'), b = c.lastIndexOf('}');
      if (a < 0 || b <= a) continue;
      try { return JSON.parse(c.slice(a, b + 1)); } catch (_) { /* siguiente */ }
    }
    return null;
  }

  /* Reduce la foto: la letra sigue legible y el envío no se cae en la tablet. */
  function reducir(file, maxLado = 2000, calidad = 0.85) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const e = Math.min(1, maxLado / Math.max(img.width, img.height));
        const w = Math.round(img.width * e), h = Math.round(img.height * e);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const d = cv.toDataURL('image/jpeg', calidad);
        res({ dataUrl: d, b64: d.split(',')[1], w, h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo abrir la imagen.')); };
      img.src = url;
    });
  }

  async function viaServidor(b64) {
    const url = cfg('url').trim();
    if (!url) throw new Error('Falta la dirección del lector. Configúrala en Ajustes.');
    const r = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: b64, media_type: 'image/jpeg' }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error((d && d.error) || `El lector respondió ${r.status}.`);
    return d;
  }

  async function viaLlave(b64) {
    const key = cfg('key').trim();
    if (!key) throw new Error('Falta la llave. Pégala en Ajustes.');
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-api-key': key,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg('modelo', MODELO), max_tokens: 4096, system: SISTEMA,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: instruccion() }] }],
        }),
      });
    } catch (err) {
      throw new Error('No se pudo contactar a la API desde el navegador. ' + err.message);
    }
    const crudo = await r.text();
    if (!r.ok) {
      let det = crudo.slice(0, 300);
      try { det = JSON.parse(crudo).error?.message || det; } catch (_) {}
      if (r.status === 401) det = 'La llave no es válida o fue revocada.';
      if (r.status === 429) det = 'Sin saldo o demasiadas peticiones seguidas.';
      throw new Error(`La API respondió ${r.status}: ${det}`);
    }
    const p = JSON.parse(crudo);
    const texto = (p.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const d = sacarJson(texto);
    if (!d) throw new Error('El lector no devolvió datos legibles. Repite la foto con la hoja completa y plana.');
    return d;
  }

  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  /** Deja sólo las 21 claves que el tablero usa. */
  function aClaves(data) {
    const todo = {};
    ['pan_blanco', 'pastel'].forEach((k) => {
      Object.entries(data[k] || {}).forEach(([cl, v]) => { todo[String(cl).trim().toUpperCase()] = num(v); });
    });
    const out = {}, falta = [];
    D.PRODUCTOS.forEach((p) => {
      const v = todo[p.clave.toUpperCase()] ?? (p.alias ? todo[p.alias.toUpperCase()] : undefined);
      if (v != null) out[p.clave] = v; else falta.push(p.clave);
    });
    return { inv: out, falta };
  }

  // ---------- pantalla ----------
  function abrir(alAplicar) {
    const m = document.createElement('div');
    m.className = 'modal show';
    m.innerHTML = `<div class="caja" style="max-width:560px">
      <h3>Leer la foto del inventario</h3>
      <p>La app copia sólo la columna TOTAL. Revisa los números contra la foto antes de aplicarlos.</p>
      <div class="fila">
        <button class="btn ghost" type="button" id="fCam">Tomar foto</button>
        <button class="btn ghost" type="button" id="fGal">Elegir imagen</button>
      </div>
      <input type="file" id="fCamIn" accept="image/*" capture="environment" hidden>
      <input type="file" id="fGalIn" accept="image/*" hidden>
      <div id="fPrev" style="margin:12px 0" hidden></div>
      <div id="fRes" style="margin:10px 0"></div>
      <div class="fila" style="margin-top:14px">
        <button class="btn sec" type="button" id="fCerrar" style="flex:1">Cerrar</button>
        <button class="btn" type="button" id="fLeer" style="flex:1" disabled>Leer la foto</button>
      </div></div>`;
    document.body.appendChild(m);
    const q = (s) => m.querySelector(s);
    let b64 = null, leido = null;

    const elegir = async (file) => {
      if (!file) return;
      try {
        const r = await reducir(file);
        b64 = r.b64;
        q('#fPrev').hidden = false;
        q('#fPrev').innerHTML = `<img src="${r.dataUrl}" alt="Foto" style="max-width:100%;max-height:40vh;border-radius:9px">`;
        q('#fLeer').disabled = false;
      } catch (err) { q('#fRes').innerHTML = `<div class="aviso err"><p>${esc(err.message)}</p></div>`; }
    };
    q('#fCam').onclick = () => q('#fCamIn').click();
    q('#fGal').onclick = () => q('#fGalIn').click();
    ['#fCamIn', '#fGalIn'].forEach((s) => { q(s).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; elegir(f); }; });

    q('#fLeer').onclick = async () => {
      if (!b64) return;
      q('#fLeer').disabled = true;
      q('#fRes').innerHTML = '<div class="aviso"><p>Leyendo la foto…</p></div>';
      try {
        const modo = cfg('modo', '');
        if (!modo) throw new Error('Primero elige en Ajustes dónde vive la llave del lector.');
        const data = modo === 'llave' ? await viaLlave(b64) : await viaServidor(b64);
        const { inv, falta } = aClaves(data);
        leido = { inv, fecha: data.fecha || null, dudosas: data.dudosas || [] };
        const n = Object.keys(inv).length;
        q('#fRes').innerHTML = `<div class="aviso"><h4>Leídas ${n} de ${D.PRODUCTOS.length} claves</h4>
          <p>${data.fecha ? 'Fecha en la hoja: <b>' + esc(data.fecha) + '</b>. ' : ''}
          ${falta.length ? 'Sin valor: ' + esc(falta.join(', ')) + '.' : ''}
          ${(data.dudosas || []).length ? ' Revisar: <b>' + esc((data.dudosas || []).join(', ')) + '</b>.' : ''}</p></div>`;
        q('#fLeer').textContent = 'Aplicar al inventario';
        q('#fLeer').disabled = false;
        q('#fLeer').onclick = () => { alAplicar(leido); m.remove(); };
      } catch (err) {
        q('#fRes').innerHTML = `<div class="aviso err"><h4>No se pudo leer</h4><p>${esc(err.message)}</p></div>`;
        q('#fLeer').disabled = false;
      }
    };
    q('#fCerrar').onclick = () => m.remove();
    m.onclick = (e) => { if (e.target === m) m.remove(); };
  }

  window.Foto = { abrir, cfg, setCfg, MODELO };
})();
