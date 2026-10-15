/* Lectura y escritura de Excel. Lee el libro de cálculo para traer promedios,
   rendimientos e inventario, y escribe el historial en un .xlsx aparte. */
(function (raiz) {
  'use strict';
  const D = raiz.Datos;

  // ================= lectura =================
  const desesc = (s) => s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, e) => {
    if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
    if (e === 'quot') return '"'; if (e === 'apos') return "'";
    return e[1] === 'x' ? String.fromCodePoint(parseInt(e.slice(2), 16))
                        : String.fromCodePoint(parseInt(e.slice(1), 10));
  });
  const atr = (a, n) => { const m = new RegExp(n.replace(':', '\\:') + '="([^"]*)"').exec(a || ''); return m ? desesc(m[1]) : null; };
  const colNum = (c) => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  const letras = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  function textos(xml) {
    const out = [];
    if (!xml) return out;
    const re = /<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g;
    let m;
    while ((m = re.exec(xml))) {
      const inner = (m[1] || '').replace(/<rPh[\s\S]*?<\/rPh>/g, '');
      out.push((inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [])
        .map((t) => desesc(t.replace(/<[^>]+>/g, ''))).join(''));
    }
    return out;
  }

  async function abrir(file) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const leer = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
    const ss = textos(await leer('xl/sharedStrings.xml'));
    const wb = await leer('xl/workbook.xml');
    if (!wb) throw new Error('El archivo no parece un libro de Excel.');
    const rels = (await leer('xl/_rels/workbook.xml.rels')) || '';
    const mapa = {};
    rels.replace(/<Relationship\b([^>]*)\/?>/g, (m, a) => { mapa[atr(a, 'Id')] = atr(a, 'Target'); return m; });
    const hojas = [];
    wb.replace(/<sheet\b([^>]*)\/?>/g, (m, a) => {
      const t = mapa[atr(a, 'r:id')];
      if (t) hojas.push({ nombre: atr(a, 'name'), ruta: 'xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, '') });
      return m;
    });
    return { zip, ss, hojas, leer };
  }

  /** Devuelve { fila: { COL: valor } } de una hoja. */
  async function filas(libro, nombre) {
    const h = libro.hojas.find((x) => x.nombre === nombre);
    if (!h) return null;
    const xml = await libro.leer(h.ruta);
    if (!xml) return null;
    const out = {};
    const rre = /<row r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm;
    while ((rm = rre.exec(xml))) {
      const r = +rm[1], d = {};
      const cre = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm;
      while ((cm = cre.exec(rm[2] || ''))) {
        const inner = cm[3] || '', t = atr(cm[2], 't');
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        let v = vm ? desesc(vm[1]) : null;
        if (t === 's' && v != null) v = libro.ss[+v] ?? '';
        else if (t === 'inlineStr') { const im = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(inner); v = im ? desesc(im[1]) : null; }
        d[cm[1]] = v;
      }
      out[r] = d;
    }
    return out;
  }

  const aNum = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[\s,]/g, '')); return Number.isFinite(n) ? n : null; };

  /** Promedios de venta desde PROM_VD (columnas CODIGO 1 / DIA / PROM D). */
  async function leerPromedios(libro) {
    const f = await filas(libro, 'PROM_VD');
    if (!f) throw new Error('El libro no tiene la pestaña PROM_VD.');
    const porCodigo = {};
    Object.keys(f).forEach((r) => {
      const d = f[r], cod = d.AN, dia = d.AO, prom = aNum(d.AL);
      if (!cod || !dia || dia === 'DIA' || prom == null) return;
      (porCodigo[String(cod)] = porCodigo[String(cod)] || {})[String(dia).toUpperCase()] = prom;
    });
    const out = {}; let n = 0;
    D.PRODUCTOS.forEach((p) => {
      const fila = porCodigo[String(p.codigo)];
      if (!fila) return;
      out[p.clave] = D.DIAS.map((dia) => Math.round(fila[dia] || 0));
      n++;
    });
    if (!n) throw new Error('No encontré promedios para ninguna de las claves.');
    return { prom: out, n };
  }

  /** Rendimiento en bolsas por quintal, desde la pestaña RENDIMIENTO. */
  async function leerRendimientos(libro) {
    const f = await filas(libro, 'RENDIMIENTO');
    if (!f) return { rend: {}, n: 0 };
    const porClave = {};
    Object.keys(f).forEach((r) => {
      if (+r < 3) return;
      const d = f[r], cl = d.A, v = aNum(d.F);
      if (cl && v && !(cl in porClave)) porClave[cl] = v;
    });
    const out = {}; let n = 0;
    D.PRODUCTOS.forEach((p) => { if (porClave[p.clave]) { out[p.clave] = porClave[p.clave]; n++; } });
    return { rend: out, n };
  }

  /** Inventario en bolsas: primero Toma_Inv; si no, el archivo del módulo de foto. */
  async function leerInventario(libro) {
    const out = {}; let n = 0;
    const toma = await filas(libro, 'TOMA_INVENTARIO');
    if (toma) {
      const porClave = {};
      Object.keys(toma).forEach((r) => {
        const d = toma[r];
        if (!d.A || d.A === 'CODIGO') return;
        const v = aNum(d.D) ?? aNum(d.C);
        if (v != null) porClave[String(d.A).trim().toUpperCase()] = v;
      });
      D.PRODUCTOS.forEach((p) => {
        const v = porClave[p.clave.toUpperCase()] ?? (p.alias ? porClave[p.alias.toUpperCase()] : undefined);
        if (v != null) { out[p.clave] = v; n++; }
      });
      if (n) return { inv: out, n, origen: 'TOMA_INVENTARIO' };
    }
    // archivo de inventario del día (PAN BLANCO / PASTEL Y MASAS DULCES)
    const porClave = {};
    for (const h of libro.hojas) {
      const f = await filas(libro, h.nombre);
      if (!f) continue;
      Object.keys(f).forEach((r) => {
        const d = f[r];
        const cl = d.A && String(d.A).trim().toUpperCase();
        if (!cl || cl === 'CLAVE' || cl.startsWith('TOTAL') || cl.startsWith('INVENTARIO')) return;
        const v = aNum(d.B);
        if (v != null && !(cl in porClave)) porClave[cl] = v;
      });
    }
    D.PRODUCTOS.forEach((p) => {
      const v = porClave[p.clave.toUpperCase()] ?? (p.alias ? porClave[p.alias.toUpperCase()] : undefined);
      if (v != null) { out[p.clave] = v; n++; }
    });
    return { inv: out, n, origen: 'hoja de inventario' };
  }

  // ================= escritura =================
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5496"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const serie = (iso) => {   // fecha → número de serie de Excel
    const [a, m, d] = iso.split('-').map(Number);
    return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  };

  /** hojas: [{nombre, cols:[...], filas:[[v,...]]}] — número, fecha ISO o texto. */
  async function escribirLibro(hojas, nombreArchivo) {
    const zip = new JSZip();
    const ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      ...hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
      '</Types>'].join('');
    zip.file('[Content_Types].xml', ct);
    zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    const xl = zip.folder('xl');
    xl.file('workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets></workbook>');
    xl.file('styles.xml', ESTILOS);
    xl.folder('_rels').file('workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);

    const ws = xl.folder('worksheets');
    hojas.forEach((h, i) => {
      const nCol = h.cols.length;
      const filasXml = [];
      filasXml.push('<row r="1">' + h.cols.map((c, j) =>
        `<c r="${letras(j + 1)}1" s="1" t="inlineStr"><is><t>${esc(c)}</t></is></c>`).join('') + '</row>');
      h.filas.forEach((f, k) => {
        const r = k + 2;
        const celdas = f.map((v, j) => {
          const ref = letras(j + 1) + r;
          if (v === null || v === undefined || v === '') return `<c r="${ref}" s="2"/>`;
          if (typeof v === 'number') return `<c r="${ref}" s="${Number.isInteger(v) ? 5 : 3}"><v>${v}</v></c>`;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${ref}" s="4"><v>${serie(v)}</v></c>`;
          return `<c r="${ref}" s="2" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
        }).join('');
        filasXml.push(`<row r="${r}">${celdas}</row>`);
      });
      ws.file(`sheet${i + 1}.xml`, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + `<dimension ref="A1:${letras(nCol)}${h.filas.length + 1}"/>`
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        + '<sheetFormatPr defaultRowHeight="15"/>'
        + `<cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="${Math.max(2, nCol)}" width="11" customWidth="1"/></cols>`
        + `<sheetData>${filasXml.join('')}</sheetData>`
        + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>');
    });

    const blob = await zip.generateAsync({
      type: 'blob', compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return { blob, nombre: nombreArchivo };
  }

  /** Arma las tres hojas del historial con el mismo orden de columnas del libro. */
  function hojasHistorial(dias) {
    const fechas = Object.keys(dias).sort();
    const claves = D.PRODUCTOS.map((p) => p.clave);
    const nom = (c) => { const p = D.prodPorClave[c]; return p && p.alias ? p.alias : c; };

    const prod = { nombre: 'Hx Prod', cols: ['FECHA', 'DIA', ...claves.map(nom), 'TOTAL'], filas: [] };
    const turno = { nombre: 'Hx Prod_x_Turno', cols: ['FECHA', 'DIA', ...D.TURNOS.map((t) => t.nombre), 'TOTAL'], filas: [] };
    const inv = { nombre: 'Hx Inv', cols: ['FECHA', 'DIA', ...claves.map(nom)], filas: [] };
    const det = { nombre: 'Detalle', cols: ['FECHA', 'DIA', 'CLAVE', 'INVENTARIO', 'PROD HOY QQ', 'SUGERIDO QQ', 'DECIDIDO QQ', ...D.TURNOS.map((t) => t.nombre), 'TEORICO PM HOY', 'TEORICO PM MAÑANA', 'COBERTURA DIAS', 'ALERTA'], filas: [] };

    fechas.forEach((f) => {
      const r = dias[f], dia = D.nombreDia(f);
      const porClave = r.calc || {};
      let tp = 0;
      prod.filas.push([f, dia, ...claves.map((c) => {
        const v = Object.values(r.turnos[c] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        tp += v; return v || 0;
      }), Math.round(tp * 100) / 100]);
      let tt = 0;
      turno.filas.push([f, dia, ...D.TURNOS.map((t) => {
        const v = claves.reduce((a, c) => a + (Number((r.turnos[c] || {})[t.id]) || 0), 0);
        tt += v; return Math.round(v * 100) / 100;
      }), Math.round(tt * 100) / 100]);
      inv.filas.push([f, dia, ...claves.map((c) => (r.inv[c] == null ? '' : Number(r.inv[c])))]);
      claves.forEach((c) => {
        const k = porClave[c] || {};
        const asg = r.turnos[c] || {};
        const dec = Object.values(asg).reduce((a, b) => a + (Number(b) || 0), 0);
        if (!dec && r.inv[c] == null && !k.sugeridoQQ) return;
        det.filas.push([f, dia, c,
          r.inv[c] == null ? '' : Number(r.inv[c]),
          r.prodHoy[c] == null ? '' : Number(r.prodHoy[c]),
          k.sugeridoQQ ?? '', Math.round(dec * 100) / 100,
          ...D.TURNOS.map((t) => Number(asg[t.id]) || 0),
          k.teoricoHoy != null ? Math.round(k.teoricoHoy) : '',
          k.teoricoManana != null ? Math.round(k.teoricoManana) : '',
          k.cobertura != null ? Math.round(k.cobertura * 10) / 10 : '',
          k.alerta || '']);
      });
    });
    return [prod, turno, inv, det];
  }

  raiz.Excel = { abrir, filas, leerPromedios, leerRendimientos, leerInventario, escribirLibro, hojasHistorial };
})(typeof globalThis !== 'undefined' ? globalThis : this);
