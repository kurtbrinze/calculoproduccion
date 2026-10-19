/* Lector de la hoja de inventario.

   Es el mismo motor del app "Inventario Pana": manda la foto al lector, muestra
   las dos tablas completas para cotejarlas contra la hoja, guarda el Excel con
   el nombre de la fecha y devuelve los valores crudos por clave impresa.

   Los productos diferenciados se arman después, en el módulo de Inventario,
   porque aquí todavía se trabaja con las claves tal como vienen en la hoja. */
(function () {
  'use strict';
  const D = window.Datos;
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
  const HOJAS = [
    { nombre: 'PAN BLANCO', claves: PAN_BLANCO, key: 'pan_blanco' },
    { nombre: 'PASTEL Y MASAS DULCES', claves: PASTEL, key: 'pastel' },
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const fmt = (n) => (n == null || Number.isNaN(n) ? '' : Number(n).toLocaleString('es-GT'));
  const ddmmaaaa = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };

  const cfg = (k, d = '') => { try { return localStorage.getItem('panprod_' + k) ?? d; } catch (_) { return d; } };
  const setCfg = (k, v) => { try { localStorage.setItem('panprod_' + k, v); } catch (_) {} };

  // ---------- instrucciones para el lector ----------
  const SISTEMA = 'Eres un transcriptor de hojas de inventario de panadería. Tu única tarea es copiar números manuscritos con exactitud literal. Un número mal copiado hace que la panadería produzca de más o de menos, así que ante la duda marcas la clave como dudosa en lugar de adivinar.';

  const instruccion = () => `Esta foto es una hoja "STOCK DE PRODUCTO TERMINADO" con dos tablas lado a lado.

IZQUIERDA (PAN BLANCO), filas en este orden exacto:
${PAN_BLANCO.join(', ')}

DERECHA (PASTEL Y MASAS DULCES), filas en este orden exacto:
${PASTEL.join(', ')}

Cada tabla tiene tres columnas: CLAVE (impresa), DETALLE / CONTEO (sumas a mano) y TOTAL.

Reglas, en orden de importancia:

1. Copia ÚNICAMENTE la columna TOTAL, la de más a la derecha de cada tabla. IGNORA por completo la columna DETALLE / CONTEO: sus sumas no van al resultado.
2. Si la celda TOTAL de una clave está vacía, su valor es null. No la rellenes con el detalle ni con el total de otra fila, aunque el detalle tenga un número.
3. La letra se escribe un poco más abajo de la línea impresa. Asigna cada TOTAL a la clave cuya fila lo contiene, siguiendo el orden de arriba hacia abajo. Verifica que no se te corra una fila: cuenta las filas desde la primera clave.
4. Un número tachado no cuenta; usa el que lo corrige, y si no hay corrección pon null.
5. No calcules nada. No sumes, no multipliques, no corrijas lo que parezca inconsistente. Copia lo escrito.
6. Si un dígito no se distingue con seguridad, pon tu mejor lectura y agrega la clave a "dudosas".

Lee también la fecha escrita arriba a la derecha junto a "FECHA:" y devuélvela como AAAA-MM-DD. Está en formato DD/MM/AA.

Responde SOLO con un objeto JSON, sin texto antes ni después, con esta forma:

{"fecha":"AAAA-MM-DD","pan_blanco":{"CLAVE":numero_o_null},"pastel":{"CLAVE":numero_o_null},"dudosas":["CLAVE"]}

Incluye TODAS las claves de ambas listas, en el mismo orden, aunque su valor sea null.`;

  /* Saca el objeto JSON aunque venga envuelto en ``` o con texto alrededor. */
  function parseJson(texto) {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto);
    for (const c of [fence && fence[1], texto]) {
      if (!c) continue;
      const a = c.indexOf('{'), b = c.lastIndexOf('}');
      if (a < 0 || b <= a) continue;
      try { return JSON.parse(c.slice(a, b + 1)); } catch (_) { /* siguiente */ }
    }
    return null;
  }

  /* Reduce la foto antes de enviarla: la letra sigue legible y el envío no se
     cae en la conexión de la tablet. */
  function reducir(file, maxLado = 2000, calidad = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const e = Math.min(1, maxLado / Math.max(img.width, img.height));
        const w = Math.round(img.width * e), h = Math.round(img.height * e);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL('image/jpeg', calidad);
        resolve({ dataUrl, b64: dataUrl.split(',')[1], mime: 'image/jpeg', w, h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen.')); };
      img.src = url;
    });
  }

  // ---------- envío ----------
  /* `tarea` lleva las instrucciones de qué leer. El servidor de inventario
     viejo las ignora y responde siempre con la hoja de stock; por eso quien
     pide otra cosa revisa que la respuesta traiga lo suyo. */
  async function viaServidor(st, tarea) {
    const url = cfg('url').trim();
    if (!url) throw new Error('Falta la dirección del lector. Configúrala en Parámetros.');
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: st.b64, media_type: st.mime,
        ...(tarea ? { instruccion: tarea.instruccion, sistema: tarea.sistema } : {}),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `El lector respondió ${res.status}.`);
    return data;
  }

  async function viaLlave(st, tarea) {
    const key = cfg('key').trim();
    if (!key) throw new Error('Falta la llave. Pégala en Parámetros.');
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-api-key': key,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg('modelo', MODELO), max_tokens: 4096,
          system: (tarea && tarea.sistema) || SISTEMA,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: st.mime, data: st.b64 } },
            { type: 'text', text: (tarea && tarea.instruccion) || instruccion() }] }],
        }),
      });
    } catch (err) {
      throw new Error('No se pudo contactar a la API desde el navegador. Revisa la señal; si sigue, usa el modo servidor. (' + err.message + ')');
    }
    const crudo = await res.text();
    if (!res.ok) {
      let det = crudo.slice(0, 300);
      try { det = JSON.parse(crudo).error?.message || det; } catch (_) {}
      if (res.status === 401) det = 'La llave no es válida o fue revocada.';
      if (res.status === 429) det = 'Demasiadas peticiones o sin saldo. Revisa tu cuenta.';
      throw new Error(`La API respondió ${res.status}: ${det}`);
    }
    const payload = JSON.parse(crudo);
    const texto = (payload.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const data = parseJson(texto);
    if (!data) throw new Error('El lector no devolvió datos legibles. Repite la foto con la hoja completa y plana.');
    return data;
  }

  /**
   * Manda la foto por el camino configurado y reintenta una vez cuando la
   * respuesta viene mal formada: casi siempre sale a la segunda y ahorra
   * tener que repetir la foto.
   */
  async function enviar(st, modo, tarea, avisar) {
    const una = () => (modo === 'llave' ? viaLlave(st, tarea) : viaServidor(st, tarea));
    try { return await una(); }
    catch (err) {
      if (!/legibles|JSON|Unexpected|parse/i.test(err.message)) throw err;
      if (avisar) avisar('La primera lectura vino incompleta. Reintentando…');
      return una();
    }
  }

  // ---------- Excel con el formato de siempre ----------
  const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const WBRELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const WB = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PAN BLANCO" sheetId="1" r:id="rId1"/><sheet name="PASTEL Y MASAS DULCES" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="14"/><color rgb="FF1F4E78"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5496"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6DCE4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="double"><color rgb="FF8EA9DB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="3" fontId="3" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function hojaXml(titulo, claves, valores) {
    const first = 4, last = first + claves.length - 1, totalRow = last + 1;
    const filas = [];
    filas.push(`<row r="1" spans="1:2" ht="20" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>${esc(titulo)}</t></is></c><c r="B1" s="1"/></row>`);
    filas.push(`<row r="3" spans="1:2"><c r="A3" s="2" t="inlineStr"><is><t>CLAVE</t></is></c><c r="B3" s="2" t="inlineStr"><is><t>TOTAL</t></is></c></row>`);
    claves.forEach((clave, i) => {
      const r = first + i, v = valores[clave];
      const b = v == null || Number.isNaN(v) ? `<c r="B${r}" s="4"/>` : `<c r="B${r}" s="4"><v>${v}</v></c>`;
      filas.push(`<row r="${r}" spans="1:2"><c r="A${r}" s="3" t="inlineStr"><is><t>${esc(clave)}</t></is></c>${b}</row>`);
    });
    filas.push(`<row r="${totalRow}" spans="1:2"><c r="A${totalRow}" s="5" t="inlineStr"><is><t>TOTAL GENERAL</t></is></c><c r="B${totalRow}" s="6"><f>SUM(B${first}:B${last})</f></c></row>`);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B${totalRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="B4" sqref="B4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="25" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/></cols><sheetData>${filas.join('')}</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  }

  async function construirXlsx(st) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CT);
    zip.folder('_rels').file('.rels', RELS);
    const xl = zip.folder('xl');
    xl.file('workbook.xml', WB);
    xl.file('styles.xml', STYLES);
    xl.folder('_rels').file('workbook.xml.rels', WBRELS);
    const ws = xl.folder('worksheets');
    HOJAS.forEach((h, i) => {
      ws.file(`sheet${i + 1}.xml`, hojaXml(`INVENTARIO - ${h.nombre} (${ddmmaaaa(st.fecha)})`, h.claves, st.vals[h.key]));
    });
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: MIME });
  }

  const nombreArchivo = (st) => (st.fecha ? st.fecha.replace(/-/g, '_') : 'SIN_FECHA') + '_Inventario.xlsx';

  // ================= pantalla =================
  /**
   * Abre el lector. `alAplicar({fecha, crudo})` recibe los valores por clave
   * impresa; quien llama decide en qué día los escribe.
   */
  function abrir(alAplicar) {
    const st = { dataUrl: null, b64: null, mime: null, fecha: null,
      vals: { pan_blanco: {}, pastel: {} }, crudos: {}, dudosas: new Set(), leido: false, blob: null };

    const m = document.createElement('div');
    m.className = 'lector';
    m.innerHTML = `
      <div class="lcaja">
        <div class="lbar">
          <h3>Leer INV PM</h3>
          <span class="dim" id="lEstado"></span>
          <button class="btn sec mini" type="button" id="lCerrar" style="margin-left:auto">Cerrar</button>
        </div>
        <div class="lcuerpo">
          <div class="card" style="margin-bottom:12px">
            <p class="sub" style="margin-top:0">
              Toma la foto de la hoja completa y plana. La app copia sólo la columna TOTAL;
              la de DETALLE / CONTEO se descarta.
            </p>
            <div class="fila">
              <button class="btn ghost" type="button" id="lCam">Tomar foto</button>
              <button class="btn ghost" type="button" id="lGal">Elegir imagen</button>
              <button class="btn" type="button" id="lLeer" disabled>Leer la foto</button>
              <div class="campo" style="margin-left:auto"><label for="lFecha">Fecha de la hoja</label>
                <input type="date" id="lFecha" style="min-width:160px"></div>
            </div>
            <input type="file" id="lCamIn" accept="image/*" capture="environment" hidden>
            <input type="file" id="lGalIn" accept="image/*" hidden>
            <div id="lPrev" hidden></div>
          </div>
          <div id="lAvisos"></div>
          <div class="kpis" id="lSum"></div>
          <div class="lcols" id="lTablas"></div>
        </div>
        <div class="lpie">
          <span class="dim" id="lNombre"></span>
          <button class="btn sec" type="button" id="lGuardar" disabled>Descargar el Excel</button>
          <button class="btn" type="button" id="lAplicar" disabled>Pasar a INV PM</button>
        </div>
      </div>
      <div class="lvisor" id="lVisor"><img id="lVisorImg" alt="Foto del inventario"></div>`;
    document.body.appendChild(m);
    document.body.style.overflow = 'hidden';
    const q = (s) => m.querySelector(s);

    const cerrar = () => { document.body.style.overflow = ''; m.remove(); };
    const decir = (t, err) => { q('#lEstado').textContent = t || ''; q('#lEstado').className = err ? 'dim neg' : 'dim'; };

    function estado() {
      const modo = cfg('modo', '');
      q('#lEstado').textContent = modo === 'llave'
        ? (cfg('key') ? 'Lector: llave en este dispositivo.' : 'Falta la llave — ponla en Parámetros.')
        : modo === 'servidor'
          ? (cfg('url') ? 'Lector: servidor propio.' : 'Falta la dirección — ponla en Parámetros.')
          : 'Lector sin configurar — ve a Parámetros.';
    }

    function pintar() {
      q('#lLeer').disabled = !st.b64;
      q('#lGuardar').disabled = !st.leido;
      q('#lAplicar').disabled = !st.leido;
      q('#lFecha').value = st.fecha || '';
      q('#lNombre').textContent = st.leido ? nombreArchivo(st) : '';
      if (!st.leido) { q('#lTablas').innerHTML = ''; q('#lSum').innerHTML = ''; q('#lAvisos').innerHTML = ''; return; }

      const malos = [];
      let total = 0, conDato = 0;
      q('#lTablas').innerHTML = HOJAS.map((h) => {
        let suma = 0, n = 0;
        const filas = h.claves.map((clave) => {
          const v = st.vals[h.key][clave];
          const bad = Number.isNaN(v);
          if (bad) malos.push(clave);
          if (!bad && v != null) { suma += v; n++; }
          const dud = st.dudosas.has(clave);
          const val = bad ? (st.crudos[h.key + '|' + clave] ?? '') : (v == null ? '' : v);
          return `<tr${dud ? ' class="dud"' : ''}>
            <td class="l clave">${esc(clave)}${dud ? '<span class="chip vida mini2">revisar</span>' : ''}</td>
            <td><input class="inqq${bad ? ' mal' : ''}" style="width:92px" inputmode="decimal" enterkeyhint="next"
              data-h="${h.key}" data-c="${esc(clave)}" value="${esc(val)}" aria-label="TOTAL de ${esc(clave)}"></td></tr>`;
        }).join('');
        suma = Math.round(suma); total += suma; conDato += n;
        return `<div class="card" style="padding:0;overflow:hidden">
          <div style="display:flex;gap:10px;align-items:baseline;padding:11px 14px">
            <h3 style="margin:0;font-size:.95rem">${esc(h.nombre)}</h3>
            <span class="dim" style="font-size:.84rem;margin-left:auto">${n} con dato · ${fmt(suma)}</span></div>
          <div class="tablabox" style="border:0;border-top:1px solid var(--line);border-radius:0;max-height:none">
            <table><tbody>${filas}</tbody></table></div></div>`;
      }).join('');

      q('#lSum').innerHTML =
        `<div class="kpi"><span>Claves con dato</span><strong>${conDato}</strong></div>`
        + `<div class="kpi"><span>Unidades en total</span><strong>${fmt(total)}</strong></div>`
        + (st.dudosas.size ? `<div class="kpi alerta"><span>Por revisar</span><strong>${st.dudosas.size}</strong></div>` : '')
        + (malos.length ? `<div class="kpi alerta"><span>No son número</span><strong>${malos.length}</strong></div>` : '');

      const av = [`<div class="aviso"><h4>Revisa contra la foto antes de pasar los datos</h4>
        <p>Un número mal leído se convierte en producción de más o de menos. Las filas marcadas
        <b>revisar</b> son las que el lector no vio con claridad.</p></div>`];
      if (malos.length) av.push(`<div class="aviso err"><h4>Hay valores que no son número</h4>
        <p>Corrige ${malos.map((c) => esc(c)).join(', ')} antes de continuar.</p></div>`);
      q('#lAvisos').innerHTML = av.join('');
      q('#lGuardar').disabled = !st.leido || !!malos.length;
      q('#lAplicar').disabled = !st.leido || !!malos.length;
    }

    async function elegir(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) { decir('Eso no es una imagen.', true); return; }
      try {
        const r = await reducir(file);
        st.dataUrl = r.dataUrl; st.b64 = r.b64; st.mime = r.mime;
        st.leido = false; st.blob = null;
        q('#lPrev').hidden = false;
        q('#lPrev').innerHTML = `<img src="${r.dataUrl}" alt="Foto del inventario" id="lThumb">`;
        q('#lVisorImg').src = r.dataUrl;
        decir(`Foto lista (${r.w}×${r.h}). Toca «Leer la foto».`);
        pintar();
      } catch (err) { decir(err.message, true); }
    }

    async function leer() {
      if (!st.b64) return;
      const modo = cfg('modo', '');
      if (!modo) { decir('Primero configura el lector en Parámetros.', true); return; }
      q('#lLeer').disabled = true;
      decir('Leyendo la foto…');
      try {
        /* Cuando la respuesta viene mal formada se reintenta una vez: casi
           siempre sale a la segunda y evita tener que repetir la foto. */
        const data = await enviar(st, modo, null, decir);
        st.fecha = (data.fecha && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) ? data.fecha : null;
        st.dudosas = new Set((data.dudosas || []).map(String));
        HOJAS.forEach((h) => {
          const src = data[h.key] || {};
          const dst = {};
          h.claves.forEach((c) => { dst[c] = num(src[c]); });
          st.vals[h.key] = dst;
        });
        st.leido = true; st.blob = null;
        pintar();
        decir(st.fecha ? `Listo. Fecha leída: ${ddmmaaaa(st.fecha)}.` : 'Listo, pero no se leyó la fecha. Escríbela arriba.');
        if (!st.fecha) q('#lFecha').focus();
      } catch (err) {
        decir('No se pudo leer: ' + err.message, true);
        q('#lLeer').disabled = false;
      }
    }

    const blobDe = async () => (st.blob || (st.blob = await construirXlsx(st)));

    async function guardar() {
      if (!st.fecha) { decir('Falta la fecha de la hoja.', true); q('#lFecha').focus(); return; }
      const nombre = nombreArchivo(st);
      try {
        const r = await window.Archivo.guardar(await blobDe(), nombre, {
          tipo: { description: 'Libro de Excel', accept: { [MIME]: ['.xlsx'] } },
        });
        if (r.modo === 'cancelado') return;
        decir(`Guardado ${nombre}${r.modo === 'carpeta' ? ' en ' + r.donde : ''}.`);
      } catch (err) { decir('No se pudo guardar: ' + err.message, true); }
    }

    /** Junta las dos hojas en un solo mapa por clave impresa. */
    function crudoPlano() {
      const out = {};
      HOJAS.forEach((h) => {
        h.claves.forEach((c) => {
          const v = st.vals[h.key][c];
          if (v != null && !Number.isNaN(v)) out[String(c).trim().toUpperCase()] = v;
        });
      });
      return out;
    }

    // --- eventos ---
    q('#lCerrar').onclick = cerrar;
    q('#lCam').onclick = () => q('#lCamIn').click();
    q('#lGal').onclick = () => q('#lGalIn').click();
    ['#lCamIn', '#lGalIn'].forEach((s) => {
      q(s).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; elegir(f); };
    });
    q('#lLeer').onclick = leer;
    q('#lGuardar').onclick = guardar;
    q('#lAplicar').onclick = async () => {
      if (!st.fecha) { decir('Falta la fecha de la hoja.', true); q('#lFecha').focus(); return; }
      let blob = null;
      try { blob = await blobDe(); } catch (_) { /* el Excel es opcional al pasar */ }
      const res = { fecha: st.fecha, crudo: crudoPlano(), dudosas: [...st.dudosas], blob, nombre: nombreArchivo(st) };
      cerrar();
      alAplicar(res);
    };
    q('#lFecha').addEventListener('change', (e) => {
      st.fecha = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null;
      st.blob = null; q('#lNombre').textContent = st.leido ? nombreArchivo(st) : '';
    });
    q('#lTablas').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.matches('input.inqq')) return;
      const h = t.dataset.h, c = t.dataset.c, raw = t.value.trim();
      st.vals[h][c] = num(raw);
      st.crudos[h + '|' + c] = raw;
      st.blob = null;
      pintar();
    });
    q('#lTablas').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input.inqq')) return;
      e.preventDefault();
      const ins = [...m.querySelectorAll('#lTablas input.inqq')];
      const next = ins[ins.indexOf(e.target) + 1];
      if (next) next.focus(); else e.target.blur();
    });
    const visor = (on) => { q('#lVisor').classList.toggle('show', on); };
    m.addEventListener('click', (e) => {
      if (e.target.id === 'lThumb') visor(true);
      else if (e.target.id === 'lVisor' || e.target.id === 'lVisorImg') visor(false);
    });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') visor(false); });

    estado(); pintar();
  }

  window.Lector = {
    abrir, cfg, setCfg, MODELO, PAN_BLANCO, PASTEL, HOJAS,
    // el motor, que reusa el lector de producción de Zona 2
    reducir, enviar, parseJson, num, fmt, esc, ddmmaaaa,
  };
})();
