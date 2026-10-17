# Producción de panadería

App web para decidir la producción del día: toma el inventario, calcula cuánto hace falta de
cada clave y reparte esos quintales entre los turnos respetando sus topes. Guarda cada día
como historial para comparar temporadas.

Todo se procesa en el dispositivo. Lo único que sale es la foto del inventario, y sólo hacia
el lector que tú conectes (ver [LECTOR.md](LECTOR.md)).

## Las seis pestañas

**Producción** es el tablero. Arriba, los totales y cómo va cada turno contra su tope. Abajo,
una tabla por familia con sólo los turnos que esa familia usa. De cada clave se ve:

| Columna | Qué es |
|---|---|
| Stock + prod | Cierre del día anterior más lo que se produjo ese día |
| Teórico PM hoy | Lo anterior menos la venta de hoy |
| Sugerido qq | Lo que el cálculo propone producir |
| Turnos | Los quintales por turno, editables a mano |
| Teórico PM mañana | Cómo queda mañana después de producir y vender |
| Cobertura | Días de venta que quedan cubiertos |
| Alerta | OK, FALTANTE, EXCESO, TOPE VIDA ÚTIL o MENOS DE UN LOTE |

Al tocar una clave se abre la explicación de dónde salió su sugerido, paso a paso.
El sugerido total también aparece partido entre **Zona 18** y **Zona 2**.

### Resumen del día

El botón **Resumen del día** arma lo que hay que repartir, para la planta que se elija:

- **Imagen clave y qq** — sólo las dos columnas, para mandar por WhatsApp.
- **Imagen completa** — además el desglose por turno, con las celdas en gris donde
  esa clave no se puede hacer en ese turno.
- **Descargar PDF** / **Imprimir** — la hoja de trabajo de siempre, ya llena, en media carta
  horizontal: rendimiento, stock de ayer, producción de ayer, consumo de hoy, teórico PM,
  INV PM, consumo de mañana y los quintales por turno de las dos plantas. El archivo sale como
  `Produccion Z18 2026_10_17.pdf`.

En celular y tablet las imágenes salen por el menú de compartir del sistema, así que van directo
a WhatsApp; en la laptop se guardan.

**Dónde se guardan.** Por defecto van a la carpeta de Descargas. En Chrome o Edge de computadora
se puede elegir una carpeta fija, desde el mismo cuadro del resumen o desde **Parámetros → Dónde
se guardan los archivos**: la carpeta queda recordada y de ahí en adelante todo lo que el app
entrega cae directo ahí, sin pasar por Descargas. Eso cubre el PDF, las imágenes, el Excel del
historial, el Excel del inventario leído de la foto y el respaldo. Al reabrir el navegador, Chrome
pide confirmar el permiso una vez. En Android no se puede elegir carpeta: ahí siempre es Descargas
o el menú de compartir. Nada de esto se guarda ni se sincroniza: se arma en el
momento con el día que está en pantalla.

**Inventario** es la captura del día. Para producir el miércoles, parte del martes:

| Columna | Qué es |
|---|---|
| STOCK AYER | El INV PM del día anterior. Trae la fecha en el encabezado |
| PROD AYER (qq) | Los quintales que se produjeron ese día, tomados del historial |
| BOLSAS | PROD AYER × rendimiento |
| CONSUMO HOY | La venta promedio del día que se está calculando |
| TEÓRICO PM | (STOCK AYER + BOLSAS) − CONSUMO HOY |
| INV PM | El conteo de cierre de hoy, el de la foto |
| DIFERENCIA | TEÓRICO PM − INV PM. Positivo quiere decir que se vendió más que el promedio |

STOCK AYER y PROD AYER se llenan solos y salen en gris; al escribir encima, ese valor manda.

Los tres botones:

- **Leer INV PM** abre el lector de la foto, el mismo del app de Inventario: muestra las dos
  tablas completas para cotejarlas, descarga el Excel con el nombre de la fecha y escribe la
  columna INV PM.
- **Importar Excel INV PM** es la contingencia: lee ese mismo Excel y llena INV PM.
- **Cargar STOCK AYER** copia el INV PM del día anterior a la columna STOCK AYER.

### Productos diferenciados

Algunas claves son varias presentaciones del mismo producto. Debajo de la tabla, el bloque
**Productos diferenciados** muestra de qué partes salió cada una y con qué factor. De fábrica:

```
S11   = S11 + S11T×21
15PL1 = 15PL1 + PL1U÷15 + 15PL1U + 8PL1×8÷15 + PL1T×64÷15
10HR3 = 10HR3 + 5HD2÷2
CZ3   = CZ3×60 + CZ5×55
```

Cada total se aproxima al entero de abajo. Se agregan y se cambian en Parámetros.

### El caso del 10CZ4

El 10CZ4 se produce de mañana, así que el conteo de cierre de ese mismo día ya lo trae adentro.
Por eso viene marcado **Prod. ya en el conteo** en Parámetros: sus BOLSAS se muestran tachadas
y no se vuelven a sumar en el TEÓRICO PM. Cualquier otra clave que se comporte igual se marca
en esa misma casilla.

**Pedidos** son los compromisos fuera del promedio de venta: día de entrega, cliente, clave y
bolsas. Se agregan con una fila de campos donde la fecha y el cliente se quedan puestos, porque
un pedido casi siempre trae varias claves.

Cada pedido suma sus bolsas al **consumo del día de entrega**, así que baja el teórico PM de ese
día igual que una venta. Para la producción no entra apenas se ingresa: entra en el sugerido
**el último día en que todavía da tiempo**, según los días de anticipación. Con anticipación de
1 día, un pedido del viernes entra al cálculo del jueves, no antes, para no gastarle vida útil.

Los días de anticipación se ponen en Parámetros: uno general y, si alguna familia necesita otro,
el suyo en la tabla de vida útil.

Un pedido pasa por cuatro estados: **Pendiente**, **Se produce hoy** cuando llegó su último día,
**Vencido** si pasó la fecha y nadie lo cerró —avisa pero ya no mueve el cálculo— y **Entregado**.

Las alertas salen en tres lados: en Producción, un aviso con las bolsas que entran hoy y un
distintivo **PEDIDO** en cada clave afectada; **PEDIDO EN RIESGO** cuando lo decidido no alcanza
a cubrirlo; y en Inventario, el consumo del día de entrega sale marcado con `*`.

Dos cosas que conviene saber: el app **no aparta producto**, sólo se asegura de que el total
esté, así que la venta normal puede comerse lo que se hizo para un pedido; y la anticipación
mínima real es de un día, porque lo que se produce hoy está disponible desde mañana.

**Historial** guarda cada día cerrado, con cuatro vistas —por turno, por planta, por clave e
inventario INV PM— y las exporta a Excel, cada tabla por separado o todas en un libro:
`Hx Prod`, `Hx Prod_x_Planta`, `Hx Prod_x_Turno`, `Hx Prod_Clave_Planta`, `Hx Inv` y un
`Detalle` con el sugerido contra lo decidido. **Subir historial de Excel** trae datos viejos
desde `Hx Prod`, `Hx Prod_x_Turno` y `Hx Inv` sin pisar lo que ya esté guardado.

**Promedios** es la venta de un día normal por clave, igual que la pestaña PROM_VD del libro.
Se puede escribir a mano o traer del libro de cálculo.

**Parámetros** tiene todo lo parametrizable: horizonte, **días de venta a cubrir**, topes y
mínimos por turno, vida útil y colchón por familia, calendario, múltiplos y rendimientos por
clave, y el lector de fotos.

### Días de venta a cubrir

Con el modo **Según la tabla de días**, cada día de cálculo marca exactamente qué días de venta
tiene que aguantar lo que se produce. La tabla es de 7×7: las filas son el día en que se calcula
y las columnas los días de venta que entran en la demanda.

Cada familia puede llevar su propia tabla. Mientras no se marque **Tabla propia de esta familia**,
la familia sigue la tabla general. Así, el viernes puede cubrir viernes, sábado, lunes y martes
para todo, y el domingo de Dulces y especial cubrir sólo lunes y martes.

**Generar desde el calendario** llena la tabla con los días que salen del calendario de producción,
como punto de partida para ajustarla a mano.

El recuadro de la diagonal es el mismo día del cálculo. Marcarlo suma la venta de hoy, que el
teórico PM ya había restado, así que en la práctica funciona como un día extra de colchón.

## Cómo se calcula el sugerido

```
disponible       = stock de ayer + producción de ayer × rendimiento
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
súbele el colchón en Parámetros; si siempre le quitas, bájaselo.

## Publicar

GitHub Pages: subir todo y poner Source = *Deploy from a branch*, rama `main`, carpeta raíz.

Vercel: importar el repositorio y agregar la variable `ANTHROPIC_API_KEY`. Así la app queda con
el lector de fotos incluido y no hay nada que configurar.

## Instalar

El botón **Instalar app** de arriba a la derecha. En Android y en laptop queda con ícono propio
y funciona sin señal, salvo la lectura de fotos.

## Versión

Al publicar un cambio hay que subirla en dos lugares que deben coincidir:

1. `js/ui.js` → `const VERSION = 'V.2026.11';`
2. `sw.js` → `const CACHE = 'panprod-V.2026.11';`

## Plantas, claves y productos nuevos

Cada turno pertenece a una planta: Magdalenas, Redondo AM, Sándwich AM, Panaderos PM y Redondo
PM son de **Zona 18**; Byron, Julio y **Máquina Z2**, de **Zona 2**. En Parámetros cada producto
dice en qué plantas se puede hacer, y el reparto sólo usa turnos de esas plantas.

**Máquina Z2** hace el 5HM4 y el 10HD7. El 10HD7 se puede hacer ahí o en Panaderos PM, así que
cuenta como clave de las dos plantas y la planta se define según dónde caiga el reparto. Su tope
viene en 40 qq, que es el que se le vio a la máquina en la hoja del 14/oct — conviene revisarlo.

### Cada planta tiene su calendario

En Parámetros, el calendario de producción trae una columna por planta. De fábrica, Zona 18
descansa sábado y domingo, y **Zona 2 trabaja el domingo**: así Byron, Julio y Máquina Z2 pueden
producir ese día. Cualquiera de las dos se cambia marcando o desmarcando.

Eso cambia tres cosas:

- **El horizonte.** Un viernes, Zona 18 tiene que cubrir hasta el martes (4 días) mientras que
  Zona 2 sólo hasta el lunes (3), porque vuelve a producir el domingo. El rótulo de arriba y el
  de cada familia nombran la planta cuando los tramos no coinciden.
- **El reparto.** Los turnos de una planta que descansa no reciben quintales, y su tarjeta sale
  apagada con «no trabaja hoy».
- **El aviso.** Las claves que ese día no se pueden producir salen en un aviso aparte, no
  mezcladas con las que no cupieron por tope.

Si una clave está marcada para una planta donde ninguno de sus turnos trabaja, la app lo avisa
en el tablero y la marca en Parámetros en vez de dejarla sin producir: se sigue repartiendo en
sus turnos de siempre, pero el sugerido por planta no cuadra con lo decidido hasta que se
corrija.

En la tabla de productos, **Editar** cambia la clave y arrastra promedios e historial — es lo
que hace falta cuando IN16 pase a ser LS19B — y **Agregar producto** da de alta uno nuevo con
su rendimiento, unidad, múltiplo y plantas. Los topes de producción salen de los turnos que se
le marquen.

## Mis valores por defecto

Al final de Parámetros hay tres botones:

- **Sobrescribir con lo que hay ahora** guarda toda la configuración de esa pantalla como tu
  punto de partida: horizonte, días a cubrir, turnos y plantas, vida útil, calendario, productos
  y diferenciados.
- **Volver a mis valores** regresa a esa configuración guardada. Sirve para probar cambios sin
  miedo a perder la calibración.
- **Volver a los de fábrica** deja la configuración con la que viene la app. No borra lo que
  guardaste como tuyo.

Los promedios y el historial no se tocan con ninguno de los tres.

## Sincronizar entre equipos

Con la app publicada en Vercel y un almacén Blob conectado, la laptop y la tablet trabajan
sobre los mismos datos. Se enciende en **Parámetros → Sincronizar entre equipos**, con la misma
clave en los dos. Los pasos completos están en [SINCRONIZAR.md](SINCRONIZAR.md).

No copia el archivo entero: compara por partes, hasta la clave del producto, y se queda con la
que cambió. Por eso el INV PM que capturaste en la tablet y el reparto que hiciste en la laptop
el mismo día conviven sin pisarse. Cuando los dos equipos cambiaron lo mismo, gana aquel donde
tocaste Sincronizar y la app lo avisa.

Sincroniza al abrir, al guardar el día y con el botón. No más seguido: el plan gratis de Vercel
da 2,000 guardados al mes y la tarjeta lleva la cuenta.

## Respaldos

Aunque la sincronización esté encendida, conviene bajar un respaldo de vez en cuando. El botón
**Descargar respaldo** del historial guarda todo en un `.json` que se puede restaurar en otro
equipo. La sincronización mantiene a los dos iguales, así que un borrado por error se propaga.

## Archivos

| Archivo | Para qué |
|---|---|
| `js/datos.js` | Productos, turnos, familias, promedios y guardado |
| `js/calculo.js` | Motor del sugerido y del reparto por turno |
| `js/excel.js` | Leer el libro de cálculo y escribir el historial |
| `js/lector.js` | Lectura de la foto del inventario |
| `js/sync.js` | Mezcla y sincronización entre equipos |
| `js/resumen.js` | Imágenes y PDF del resumen del día |
| `js/ui.js` | Pantallas |
| `api/extract.js` | El lector, para desplegar en Vercel |
| `api/estado.js` | La sincronización, guardada en Vercel Blob |
| `LECTOR.md` | Cómo conectar el lector de fotos |
| `SINCRONIZAR.md` | Cómo encender la sincronización |
