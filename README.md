# Producción de panadería

App web para decidir la producción del día: toma el inventario, calcula cuánto hace falta de
cada clave y reparte esos quintales entre los turnos respetando sus topes. Guarda cada día
como historial para comparar temporadas.

Todo se procesa en el dispositivo. Lo único que sale es la foto del inventario, y sólo hacia
el lector que tú conectes (ver [LECTOR.md](LECTOR.md)).

## Las cinco pestañas

**Producción** es el tablero. Arriba, los totales y cómo va cada turno contra su tope. Abajo,
una tabla por familia con sólo los turnos que esa familia usa. De cada clave se ve:

| Columna | Qué es |
|---|---|
| Inv + prod | Inventario de cierre más lo que ya se produjo ese día |
| Teórico PM hoy | Lo anterior menos la venta de hoy |
| Sugerido qq | Lo que el cálculo propone producir |
| Turnos | Los quintales por turno, editables a mano |
| Teórico PM mañana | Cómo queda mañana después de producir y vender |
| Cobertura | Días de venta que quedan cubiertos |
| Alerta | OK, FALTANTE, EXCESO, TOPE VIDA ÚTIL o MENOS DE UN LOTE |

Al tocar una clave se abre la explicación de dónde salió su sugerido, paso a paso.

**Inventario** captura el conteo en bolsas y la producción del día en quintales. Se puede leer
de la foto de la hoja, importar del Excel o traer del día anterior.

**Historial** guarda cada día cerrado y lo exporta a Excel con las hojas `Hx Prod`,
`Hx Prod_x_Turno`, `Hx Inv` y un `Detalle` con el sugerido contra lo decidido.

**Promedios** es la venta de un día normal por clave, igual que la pestaña PROM_VD del libro.
Se puede escribir a mano o traer del libro de cálculo.

**Ajustes** tiene todo lo parametrizable: horizonte, topes y mínimos por turno, vida útil y
colchón por familia, calendario, múltiplos y rendimientos por clave, y el lector de fotos.

## Cómo se calcula el sugerido

```
disponible       = inventario + producción del día
teórico PM hoy   = disponible − venta de hoy
demanda          = venta de los días hasta la próxima corrida
stock seguridad  = venta promedio diaria × colchón
necesidad        = demanda + stock seguridad − teórico PM hoy
tope vida útil   = venta promedio diaria × (vida útil − mínimo al despachar) − teórico PM hoy
sugerido         = max(0, min(necesidad, tope vida útil)) ÷ rendimiento, redondeado al múltiplo
```

Y con la decisión puesta:

```
teórico PM mañana = teórico PM hoy + producción decidida − venta de mañana
cobertura         = (teórico PM hoy + producción decidida) ÷ venta promedio diaria
```

El teórico PM está verificado contra la hoja de papel del 14/oct/2026: las 19 claves cuadran.

## El reparto por turno

Cada clave sabe qué turnos la pueden hacer. El reparto recorre los turnos y, cuando lo que
piden no cabe, lo divide en proporción a lo que pide cada clave, en múltiplos enteros, para que
ninguna se quede en cero sólo porque otra llegó antes. Lo que no cabe se avisa en pantalla.

Un turno con **mínimo** se completa aunque el sugerido sea cero: así Panaderos PM sigue
corriendo con sus 12 qq de 10HD7, como en la operación real.

## Calibrar el sugerido

Los valores de fábrica salen del comportamiento observado, pero **el sugerido necesita
calibrarse con tus propios días**. Las primeras semanas conviene comparar en el Detalle del
historial la columna de sugerido contra la de decidido: si siempre le agregas a una clave,
súbele el colchón en Ajustes; si siempre le quitas, bájaselo.

## Publicar

GitHub Pages: subir todo y poner Source = *Deploy from a branch*, rama `main`, carpeta raíz.

Vercel: importar el repositorio y agregar la variable `ANTHROPIC_API_KEY`. Así la app queda con
el lector de fotos incluido y no hay nada que configurar.

## Instalar

El botón **Instalar app** de arriba a la derecha. En Android y en laptop queda con ícono propio
y funciona sin señal, salvo la lectura de fotos.

## Versión

Al publicar un cambio hay que subirla en dos lugares que deben coincidir:

1. `js/ui.js` → `const VERSION = 'V.2';`
2. `sw.js` → `const CACHE = 'panprod-V.2';`

## Respaldos

Los datos viven en el navegador de cada equipo, así que **no se sincronizan solos** entre la
laptop y la tablet. El botón **Descargar respaldo** del historial guarda todo en un `.json`
que se puede restaurar en otro equipo. Conviene bajar uno cada cierto tiempo.

## Archivos

| Archivo | Para qué |
|---|---|
| `js/datos.js` | Productos, turnos, familias, promedios y guardado |
| `js/calculo.js` | Motor del sugerido y del reparto por turno |
| `js/excel.js` | Leer el libro de cálculo y escribir el historial |
| `js/foto.js` | Lectura de la foto del inventario |
| `js/ui.js` | Pantallas |
| `api/extract.js` | El lector, para desplegar en Vercel |
| `LECTOR.md` | Cómo conectar el lector de fotos |
