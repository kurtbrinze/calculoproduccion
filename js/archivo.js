/* Dónde se guardan los archivos que genera el app.

   Una página web no puede escribir sola en una carpeta del disco; sí puede, en
   Chrome y Edge de escritorio, si vos elegís la carpeta una vez. El permiso
   queda guardado y de ahí en adelante el archivo cae directo ahí.

   Tres niveles, de mejor a peor, y siempre hay salida:
     1. Carpeta elegida — se escribe directo, sin diálogo.
     2. Guardar como    — el diálogo del sistema; Chrome recuerda la última carpeta.
     3. Descarga normal — a la carpeta de Descargas del navegador.

   En Android no existen ni el 1 ni el 2: ahí siempre es descarga o compartir. */
(function () {
  'use strict';

  const BD = 'panprod_fs', ALMACEN = 'handles', LLAVE = 'carpeta';
  const haySoporte = () => typeof window.showDirectoryPicker === 'function';
  const hayDialogo = () => typeof window.showSaveFilePicker === 'function';

  /* El permiso de una carpeta es un objeto vivo, no un texto: no cabe en
     localStorage, así que va a IndexedDB. */
  /* Nada de lo que toca la carpeta puede quedarse esperando para siempre: si
     la base o el permiso no contestan, la tarjeta de Parámetros quedaba en
     blanco y los botones de PDF no hacían nada, sin aviso. */
  const TRABADO = Symbol('trabado');
  const conTiempo = (p, ms = 3000) => Promise.race([
    p, new Promise((res) => setTimeout(() => res(TRABADO), ms))]);

  function abrirBD() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('base bloqueada'));
    });
  }
  async function enBD(modo, fn) {
    let db;
    try {
      db = await abrirBD();
      return await new Promise((res, rej) => {
        const t = db.transaction(ALMACEN, modo);
        const pedido = fn(t.objectStore(ALMACEN));
        /* Se devuelve lo que trajo la petición; si no hay registro, undefined.
           Confundir «no hay nada» con «sí hay» hacía creer que había carpeta. */
        t.oncomplete = () => res(pedido ? pedido.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    } catch (err) {
      console.warn('Archivo: no se pudo usar la base de la carpeta', err);
      return undefined;
    } finally {
      /* Cada llamada abre su conexión; dejarlas abiertas bloquea el borrado. */
      try { if (db) db.close(); } catch (_) { /* nada */ }
    }
  }
  const leerCarpeta = () => conTiempo(enBD('readonly', (o) => o.get(LLAVE)));
  const grabarCarpeta = (h) => enBD('readwrite', (o) => o.put(h, LLAVE));
  const borrarCarpeta = () => enBD('readwrite', (o) => o.delete(LLAVE));

  /** Chrome pide confirmar el permiso una vez por sesión. */
  async function permiso(h, pedir) {
    if (!h) return false;
    /* Algunas carpetas no exponen API de permisos; si no la hay, se usa. */
    if (typeof h.queryPermission !== 'function') return true;
    const op = { mode: 'readwrite' };
    try {
      const q = await conTiempo(h.queryPermission(op));
      if (q === TRABADO) { console.warn('Archivo: el permiso de la carpeta no contestó'); return false; }
      if (q === 'granted') return true;
      if (!pedir) return false;
      return (await h.requestPermission(op)) === 'granted';
    } catch (_) { return false; }
  }

  /** La carpeta elegida, si todavía sirve. */
  async function carpeta() {
    const h = await leerCarpeta();
    if (h === TRABADO) return { trabada: true, nombre: '', listo: false };
    if (!h || typeof h.getFileHandle !== 'function') return null;
    return { handle: h, nombre: h.name, listo: await permiso(h, false) };
  }

  /** Abre el selector de carpeta. Devuelve el nombre, o null si se canceló. */
  async function elegirCarpeta() {
    if (!haySoporte()) return null;
    try {
      const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'panprod' });
      if (!(await permiso(h, true))) return null;
      if ((await conTiempo(grabarCarpeta(h))) === TRABADO) {
        /* La base no contesta: se tira y se vuelve a grabar en limpio. */
        await olvidarCarpeta();
        if ((await conTiempo(grabarCarpeta(h))) === TRABADO) {
          throw new Error('el navegador no deja guardar la carpeta; cerrá Chrome por completo y volvé a abrir el app');
        }
      }
      return h.name;
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
  }

  /* Si la base no contesta ni para borrar, se tira entera: sólo guarda esto. */
  async function olvidarCarpeta() {
    const r = await conTiempo(borrarCarpeta());
    if (r !== TRABADO) return;
    await conTiempo(new Promise((res) => {
      const d = indexedDB.deleteDatabase(BD);
      d.onsuccess = d.onerror = d.onblocked = () => res();
    }));
  }

  function descargaNormal(blob, nombre) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = u; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 15000);
    return { modo: 'descarga', donde: 'Descargas' };
  }

  /* Cada tipo de reporte cae en su propia subcarpeta dentro de la carpeta
     elegida, para que no quede todo en un solo listado. El orden importa: los
     nombres más largos van antes que los cortos que los contienen
     (Hx_Prod_x_Planta antes que Hx_Prod, Orden Impresion Bolsa antes que
     Impresion Bolsa). Lo que no calce con nada queda en la carpeta elegida. */
  const SUBCARPETAS = [
    [/^Hx_Prod_Clave_Planta_/i, 'Hx Prod Clave Planta'],
    [/^Hx_Prod_x_Planta_/i,     'Hx Prod x Planta'],
    [/^Hx_Prod_x_Turno_/i,      'Hx Prod x Turno'],
    [/^Hx_Prod_/i,              'Hx Prod'],
    [/^Hx_Inv_/i,               'Hx Inv'],
    [/^Detalle_/i,              'Detalle'],
    [/^Historial_Produccion_/i, 'Historial Produccion'],
    [/^Pedidos_/i,              'Pedidos'],
    [/^Orden Impresion Bolsa /i, 'Orden Impresion Bolsa'],
    [/^Impresion Bolsa /i,      'Impresion Bolsa'],
    [/^Produccion /i,           'Produccion PDF'],
    [/^Respaldo_Produccion_/i,  'Respaldos'],
  ];
  const subcarpetaDe = (nombre) => {
    const r = SUBCARPETAS.find(([re]) => re.test(nombre));
    return r ? r[1] : null;
  };

  /**
   * Guarda el archivo donde corresponda.
   * `comoGuardarComo` fuerza el diálogo aunque haya carpeta elegida.
   * Debe llamarse desde un clic: Chrome no da permisos fuera de un gesto.
   */
  async function guardar(blob, nombre, { guardarComo = false, tipo } = {}) {
    /* Si la carpeta elegida no se deja escribir, el archivo igual sale por
       Descargas, pero hay que decir por qué: antes caía ahí callado y
       parecía que el botón no había hecho nada. */
    let fallo = null;
    if (!guardarComo) {
      const c = await carpeta();
      const h = c && c.handle;
      if (c && c.trabada) {
        fallo = 'no pude leer la carpeta elegida; en Parámetros → Dónde se guardan, quitala y elegila de nuevo';
      } else if (h && !(await permiso(h, true))) {
        fallo = `Chrome no dio permiso para escribir en ${h.name}`;
      } else if (h) {
        try {
          const sub = subcarpetaDe(nombre);
          /* La subcarpeta se crea sola la primera vez. */
          const dir = sub ? await h.getDirectoryHandle(sub, { create: true }) : h;
          const f = await dir.getFileHandle(nombre, { create: true });
          const w = await f.createWritable();
          await w.write(blob); await w.close();
          return { modo: 'carpeta', donde: sub ? `${h.name}\\${sub}` : h.name };
        } catch (err) {
          if (err && err.name === 'AbortError') return { modo: 'cancelado' };
          /* Windows no deja reemplazar un archivo abierto en otro programa
             (el visor de PDF, Excel) ni uno que OneDrive esté subiendo; la
             carpeta también pudo haberse movido o borrado. */
          fallo = (err && (err.name === 'NoModificationAllowedError'
            || err.name === 'InvalidStateError' || err.name === 'NotReadableError'))
            ? `${nombre} está abierto en otro programa o OneDrive lo está usando; cerralo y volvé a intentar`
            : (err && err.name === 'NotFoundError'
              ? `ya no encontré la carpeta ${h.name}; elegila de nuevo en Parámetros`
              : `no se pudo escribir en ${h.name} (${(err && err.message) || err})`);
        }
      }
    }
    /* El diálogo de «guardar como» sólo sale si se pide a propósito: abrirlo
       en cada descarga sería un clic de más todos los días. */
    if (guardarComo && hayDialogo()) {
      try {
        const f = await window.showSaveFilePicker({
          suggestedName: nombre,
          types: tipo ? [tipo] : undefined,
        });
        const w = await f.createWritable();
        await w.write(blob); await w.close();
        return { modo: 'elegido', donde: f.name };
      } catch (err) {
        if (err && err.name === 'AbortError') return { modo: 'cancelado' };
      }
    }
    const r = descargaNormal(blob, nombre);
    if (fallo) r.fallo = fallo;
    return r;
  }

  const TIPO_PDF = { description: 'PDF', accept: { 'application/pdf': ['.pdf'] } };
  const TIPO_PNG = { description: 'Imagen', accept: { 'image/png': ['.png'] } };

  window.Archivo = {
    guardar, carpeta, elegirCarpeta, olvidarCarpeta, descargaNormal,
    haySoporte, hayDialogo, subcarpetaDe, TIPO_PDF, TIPO_PNG,
  };
})();
