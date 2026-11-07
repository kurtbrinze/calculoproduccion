/**
 * El retrato del día: lo que viaja de la laptop al teléfono por el código QR.
 *
 * Es el contrato entre las dos apps, así que este archivo es el MISMO en las
 * dos. Si cambia acá, hay que copiarlo al app del teléfono; el número de
 * formato de la primera línea y la versión del app sirven para que, cuando eso
 * no pase, el teléfono lo diga en vez de calcular distinto en silencio.
 *
 * Lleva la hoja ya resuelta —fuentes, promedio de domingos, equivalencias,
 * márgenes por clave— y deja para el teléfono sólo lo que se escribe a mano:
 * el OH, los quintales de la mañana de Zona 2, las claves manuales y el MU1.
 *
 * Formato de texto plano, pensado para que comprima bien: un encabezado de
 * líneas sueltas, una línea en blanco, y una fila por línea con los campos
 * separados por tabulación. Comprimido con deflate y en base64 cabe de sobra
 * en un QR que una cámara lee de una pantalla.
 */
(function () {
  'use strict';

  const FORMATO = 'PB1';
  const SEP = '\t';

  /* Los turnos de la mañana de Zona 2 no los decide el reparto: se escriben a
     mano la mañana del día, que es justo lo que se hace en el teléfono. */
  const MANO_Z2 = ['LUCAS', 'GILO', 'MAQ_Z2'];

  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? String(Math.round(x * 100) / 100) : '0';
  };

  /**
   * Arma el retrato del día tal como lo ve la laptop.
   * Necesita `window.Datos` y `window.Bolsa`, así que sólo corre allá.
   */
  function armar(fecha, version) {
    const D = window.Datos, B = window.Bolsa;
    const P = D.estado.params;
    const b = (D.estado.bolsa || {})[fecha] || {};
    const fs = B.enTotal(B.calcular(fecha));

    /* Qué fila es la madre de cada fila de detalle, para que escribir en una
       planta vuelva a sumar en el total de la clave. */
    const madre = {};
    fs.forEach((f) => {
      if (f.tipo !== 'union' || !f.claves) return;
      fs.forEach((g) => { if (g.clave && f.claves.includes(g.clave) && g.id !== f.id) madre[g.id] = f.id; });
    });

    const cab = [
      FORMATO,
      fecha,
      version || '',
      (window.HojaCalc || {}).VERSION || '',
      n(Number(b.mu1) || 0),
      B.fechaProd(fecha) !== fecha ? '1' : '0',
    ];

    const filas = fs.map((f) => {
      /* Una fila se escribe a mano en el teléfono si es de Zona 2 y alguno de
         sus turnos de la mañana la puede hacer: ésos son los quintales que
         todavía no existen cuando sale el retrato. */
      const suyos = ((P.prod[f.clave] || {}).turnos) || [];
      const mano = (f.plantas || []).length === 1 && f.plantas[0] === 'Z2'
        && MANO_Z2.some((t) => suyos.includes(t));
      return [
        f.id,
        f.nombre,
        f.pprod || '',
        f.tipo || '',
        f.final ? '1' : '0',
        f.cuenta ? '1' : '0',
        madre[f.id] || '',
        n(f.rend || 0),
        n(f.qqAM || 0),
        n(f.qqPM || 0),
        /* Las dos celdas del dia anterior, que la hoja muestra aparte de
           las cubetas: con la configuracion de siempre van en cero. */
        n((f.qq && f.qq[1] && f.qq[1].AM) || 0),
        n((f.qq && f.qq[1] && f.qq[1].PM) || 0),
        n(f.margen || 0),
        n(f.oh || 0),
        mano ? '1' : '0',
        /* Lo que cada tipo necesita aparte: las unidades por bolsa del MU1 y
           la cantidad fija del día para las manuales. */
        f.tipo === 'mu1' ? n(f.unidades || 6) : (f.tipo === 'manual' ? n(f.total || 0) : ''),
      ].join(SEP);
    });

    return `${cab.join('\n')}\n\n${filas.join('\n')}`;
  }

  /** Lee el retrato. Devuelve `null` si el texto no es uno. */
  function leer(texto) {
    const t = String(texto || '').replace(/\r/g, '');
    const corte = t.indexOf('\n\n');
    if (corte < 0) return null;
    const cab = t.slice(0, corte).split('\n');
    if (cab[0] !== FORMATO) return null;
    const filas = t.slice(corte + 2).split('\n').filter(Boolean).map((ln) => {
      const c = ln.split(SEP);
      return {
        id: c[0], nombre: c[1], pprod: c[2], tipo: c[3],
        final: c[4] === '1', cuenta: c[5] === '1', madre: c[6] || '',
        rend: Number(c[7]) || 0,
        qqAM: Number(c[8]) || 0, qqPM: Number(c[9]) || 0,
        q1AM: Number(c[10]) || 0, q1PM: Number(c[11]) || 0,
        margen: Number(c[12]) || 0, oh: Number(c[13]) || 0,
        mano: c[14] === '1',
        extra: c[15] === '' || c[15] === undefined ? null : Number(c[15]),
      };
    });
    return { formato: cab[0], fecha: cab[1], version: cab[2],
      calc: cab[3] || '',
      mu1: Number(cab[4]) || 0, estimado: cab[5] === '1', filas };
  }

  // ---------- el empaque para el QR ----------
  /* deflate y base64. El navegador trae los dos, así que no hace falta cargar
     nada: `CompressionStream` está en Chrome y en Safari desde hace años. */
  async function empacar(texto) {
    const cs = new Blob([texto]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let s = '';
    buf.forEach((x) => { s += String.fromCharCode(x); });
    return btoa(s);
  }

  async function desempacar(b64) {
    const bin = atob(String(b64).trim());
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(ds).text();
  }

  window.Retrato = { armar, leer, empacar, desempacar, FORMATO, MANO_Z2 };
}());
