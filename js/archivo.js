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
  function abrirBD() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function enBD(modo, fn) {
    try {
      const db = await abrirBD();
      return await new Promise((res, rej) => {
        const t = db.transaction(ALMACEN, modo);
        const pedido = fn(t.objectStore(ALMACEN));
        /* Se devuelve lo que trajo la petición; si no hay registro, undefined.
           Confundir «no hay nada» con «sí hay» hacía creer que había carpeta. */
        t.oncomplete = () => res(pedido ? pedido.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    } catch (_) { return undefined; }
  }
  const leerCarpeta = () => enBD('readonly', (o) => o.get(LLAVE));
  const grabarCarpeta = (h) => enBD('readwrite', (o) => o.put(h, LLAVE));
  const borrarCarpeta = () => enBD('readwrite', (o) => o.delete(LLAVE));

  /** Chrome pide confirmar el permiso una vez por sesión. */
  async function permiso(h, pedir) {
    if (!h) return false;
    /* Algunas carpetas no exponen API de permisos; si no la hay, se usa. */
    if (typeof h.queryPermission !== 'function') return true;
    const op = { mode: 'readwrite' };
    try {
      if ((await h.queryPermission(op)) === 'granted') return true;
      if (!pedir) return false;
      return (await h.requestPermission(op)) === 'granted';
    } catch (_) { return false; }
  }

  /** La carpeta elegida, si todavía sirve. */
  async function carpeta() {
    const h = await leerCarpeta();
    if (!h || typeof h.getFileHandle !== 'function') return null;
    return { handle: h, nombre: h.name, listo: await permiso(h, false) };
  }

  /** Abre el selector de carpeta. Devuelve el nombre, o null si se canceló. */
  async function elegirCarpeta() {
    if (!haySoporte()) return null;
    try {
      const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'panprod' });
      if (!(await permiso(h, true))) return null;
      await grabarCarpeta(h);
      return h.name;
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
  }

  const olvidarCarpeta = () => borrarCarpeta();

  function descargaNormal(blob, nombre) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = u; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 15000);
    return { modo: 'descarga', donde: 'Descargas' };
  }

  /**
   * Guarda el archivo donde corresponda.
   * `comoGuardarComo` fuerza el diálogo aunque haya carpeta elegida.
   * Debe llamarse desde un clic: Chrome no da permisos fuera de un gesto.
   */
  async function guardar(blob, nombre, { guardarComo = false, tipo } = {}) {
    if (!guardarComo) {
      const c = await carpeta();
      const h = c && c.handle;
      if (h && await permiso(h, true)) {
        try {
          const f = await h.getFileHandle(nombre, { create: true });
          const w = await f.createWritable();
          await w.write(blob); await w.close();
          return { modo: 'carpeta', donde: h.name };
        } catch (err) {
          /* La carpeta pudo haberse movido o borrado: se sigue de largo. */
          if (err && err.name === 'AbortError') return { modo: 'cancelado' };
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
    return descargaNormal(blob, nombre);
  }

  const TIPO_PDF = { description: 'PDF', accept: { 'application/pdf': ['.pdf'] } };
  const TIPO_PNG = { description: 'Imagen', accept: { 'image/png': ['.png'] } };

  window.Archivo = {
    guardar, carpeta, elegirCarpeta, olvidarCarpeta, descargaNormal,
    haySoporte, hayDialogo, TIPO_PDF, TIPO_PNG,
  };
})();
