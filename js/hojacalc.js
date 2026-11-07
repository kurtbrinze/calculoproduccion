/**
 * La cuenta de la hoja de bolsa, sola y sin dependencias.
 *
 * Vive aparte para que el app del teléfono use EXACTAMENTE la misma, archivo
 * por archivo. Dos apps que calculan lo mismo por su cuenta se separan, y el
 * día que se separen una va a mandar a imprimir de menos sin que nadie se
 * entere hasta que falte bolsa.
 *
 *   A IMPRIMIR = techo_a_diez( producción × (1 + margen) − OH )
 *
 * El margen va sobre lo producido y no sobre el neto, porque hay que cubrir la
 * tanda entera con su colchón y de eso ya está impreso el OH. El OH sale del
 * día completo: primero contra la tanda de la tarde y lo que no quepa ahí,
 * contra la de la mañana siguiente.
 */
(function () {
  'use strict';

  /* El empaque se pide de diez en diez, y siempre hacia arriba: es una
     cantidad en la que quedarse corto cuesta y sobrarle no. */
  const MULT = 10;
  const alDiez = (x) => (x > 0 ? Math.ceil(x / MULT) * MULT : 0);

  /**
   * Una fila normal. `rend` en bolsas por quintal, `margen` en por ciento.
   * Devuelve las dos tandas y el total.
   */
  function fila({ rend = 0, qqAM = 0, qqPM = 0, margen = 0, oh = 0 }) {
    const prodAM = Math.round((Number(rend) || 0) * (Number(qqAM) || 0));
    const prodPM = Math.round((Number(rend) || 0) * (Number(qqPM) || 0));
    /* A bolsas enteras antes del techo: 5.100 × 1,1 da 5.610,000000000001 en
       coma flotante, y con el techo esa basura se volvía una decena de más. */
    const conMargen = (x) => Math.round(x * (1 + (Number(margen) || 0) / 100));
    const necAM = conMargen(prodAM);
    const necPM = conMargen(prodPM);
    const n = Number(oh) || 0;
    const sobra = Math.max(0, n - necAM);
    const empAM = alDiez(necAM - n);
    const empPM = alDiez(necPM - sobra);
    return { prodAM, prodPM, empAM, empPM, total: empAM + empPM };
  }

  /**
   * La fila de MU1. Las unidades se producen en Zona 18 y no las calcula esta
   * cuenta: se escriben. De ahí salen bolsas de seis, menos las de doce, que
   * llevan el doble de unidades cada una.
   */
  function mu1({ unidades = 0, porBolsa = 6, oh = 0, deDoce = 0 }) {
    const uni = Number(porBolsa) || 6;
    const u = Number(unidades) || 0;
    const bolsas = Math.ceil(Math.round(1.01 * Math.floor(u / uni)) / MULT) * MULT;
    return { total: Math.max(0, bolsas - (Number(oh) || 0) - (Number(deDoce) || 0) * 2) };
  }

  /* La versión de ESTA cuenta, no la del app. Viaja en el retrato y el
     teléfono la compara con la suya: como el archivo es el mismo en las dos,
     sólo puede diferir si alguien cambió una y no copió la otra, que es
     justo lo que hay que cachar. Se sube cuando cambia la fórmula. */
  window.HojaCalc = { fila, mu1, alDiez, MULT, VERSION: 'C1' };
}());
