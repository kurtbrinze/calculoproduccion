# Producción de panadería

App web para decidir la producción del día: toma el inventario, calcula cuánto hace falta de
cada clave y reparte esos quintales entre los turnos respetando sus topes. Guarda cada día
como historial para comparar temporadas.

Todo se procesa en el dispositivo. Lo único que sale es la foto del inventario, y sólo hacia
el lector que tú conectes (ver [LECTOR.md](LECTOR.md)).

## Las ocho pestañas

**Producción** es el tablero. Arriba, los totales y cómo va cada turno contra su tope. Abajo,
una tabla por **área de producción** —Sándwich, Redondo y Magdalenas de Zona 18, Dulce y
Especiales de Zona 2 CZ, y Producción Planta Z2— con sólo los turnos de esa área. Cada columna
dice de qué día habla. De cada clave se ve:

| Columna | Qué es |
|---|---|
| Stock + prod | Cierre del día anterior más lo que se produjo ese día |
| Teórico PM hoy | Lo anterior menos la venta de hoy |
| Sugerido qq | Lo que el cálculo propone producir |
| Turnos | Los quintales por turno, editables a mano |
| Decidido qq | Lo que se decidió **en esa área** |
| = Bolsas | Esos quintales por el rendimiento: lo que de verdad se empaca |
| Teórico PM mañana | Cómo queda mañana después de producir y vender |
| Cobertura | Días de venta que quedan cubiertos |
| Alerta | OK, FALTANTE, EXCESO, TOPE VIDA ÚTIL o MENOS DE UN LOTE |

Cada área cierra con una fila de **TOTAL**: el sugerido del área, lo que lleva cada turno con
su tope debajo, el decidido con la capacidad del área, y las bolsas.

Al tocar una clave se abre la explicación de dónde salió su sugerido, paso a paso.
El sugerido total también aparece partido por planta.

Una clave que se hace en dos plantas —10HR3, S26, S32, 10HD7— sale en las dos tarjetas, y cada
una muestra lo suyo; debajo del número va el total de la clave para no perderlo de vista.

### Leer producción Z2

El botón **Leer producción Z2** toma la foto de la hoja que mandan a diario y copia el bloque de
columnas de las personas —los quintales que hizo cada una de cada clave—. Ignora el inventario
de la izquierda: ese sigue entrando por **Leer INV PM**. La tabla se revisa contra la foto antes
de pasarla, con las celdas dudosas marcadas, y Enter baja por la columna de la misma persona,
que es como se teclea una hoja así. Al pasarla **pisa** lo que hubiera en esos turnos: la hoja
dice lo que de verdad se produjo.

**Esa hoja llega al día siguiente**, así que trae la producción de ayer. Lo leído se guarda en
el día que dice la hoja, sin preguntar, y el día de trabajo no se mueve. De ahí sale el
`PROD AYER` de hoy: lo que Zona 2 hizo ayer se suma al conteo de ayer para saber con qué se
amanece. Si la foto no deja leer la fecha, queda en ayer y se puede cambiar arriba.

### Resumen del día

El botón **Resumen del día** arma lo que hay que repartir, para la planta o la combinación que
se elija. El selector abre en **Zona 18 + Zona 2 CZ**, que es la que se usa a diario; después
van cada planta por separado y «Todas juntas». Una combinación junta los turnos de sus plantas
en una sola hoja, suma sus quintales y deja **sólo las claves que se hacen en esas plantas** —se
arma para trabajarla, y las de la planta que quedó fuera sólo estorban—. Una planta suelta sigue
saliendo con el catálogo entero. Las combinaciones se agregan en `GRUPOS`, arriba de
`js/resumen.js`.

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

**Impresión bolsa** arma las bolsas a imprimir con su lote y vencimiento, a partir del reparto
del día. Tiene su propia sección [más abajo](#impresión-bolsa).

**Cálculos** son las conversiones sueltas de parrillas y perchas, para decidir en el momento.
Tiene su propia sección [más abajo](#cálculos-secundarios).

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

1. `js/ui.js` → `const VERSION = 'V.2026.32';`
2. `sw.js` → `const CACHE = 'panprod-V.2026.32';`

## Plantas, claves y productos nuevos

Hay **tres plantas**:

| Planta | Turnos |
|---|---|
| Zona 18 | Magdalenas, Redondo AM, Sándwich AM, Panaderos PM, Redondo PM |
| Zona 2 CZ | Byron, Julio (se turnan la mañana y la tarde cada semana) |
| Zona 2 | Lucas, Gilo, Armando, Rodrigo, Victor, Máquina |

En Parámetros cada producto dice en qué plantas se puede hacer, y el reparto sólo usa turnos de
esas plantas.

La lista de turnos de un producto es el **orden que sigue el reparto automático**. Para anotar a
mano —o para que entre lo que viene de la foto— basta con que el producto se haga en la planta
de ese turno. Por eso 10HR3 se anota en Zona 2 sin que el reparto automático se le vaya para
allá al llenarse Redondo.

Los topes de los seis turnos de Zona 2 vienen en 20 qq y el de la Máquina en 40: son un punto de
partida tomado de la hoja, conviene ajustarlos. Las claves nuevas de Zona 2 entran sin promedios
de venta, así que su sugerido es cero hasta que se carguen — la foto diaria sí las llena.

### Byron y Julio rotan de turno

Los dos se cambian la mañana por la tarde **cada domingo**. En Parámetros, junto a los topes,
se pone una **semana de referencia** —cualquier día de esa semana, se guarda en su domingo— y
quién estuvo esa semana en la mañana. De ahí sale cualquier otra semana, hacia atrás y hacia
adelante.

El turno que le toca sale escrito junto al nombre en el tablero y en la columna de producción.
Importa en dos lugares más: un feriado que apaga sólo la mañana apaga al que de verdad esté en
la mañana, y la fila **Producción PM** de los cálculos secundarios sabe de cuál de los dos
sacar los quintales de CZ3.

### Cada planta tiene su calendario

En Parámetros, el calendario de producción trae una columna por planta. De fábrica, Zona 18
descansa sábado y domingo, y **las dos de Zona 2 trabajan el domingo**. Cualquiera se cambia
marcando o desmarcando.

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

### Tope y reparto por producto

Cada producto puede llevar un **máximo de QQ al día** —los moldes y las vueltas que se les
alcanza a dar— que corta el sugerido por mucho que haga falta. Se junta con el tope del turno:
manda el que sea menor.

El **reparto** dice cómo se parte entre sus turnos:

- **Por orden** (lo de siempre): llena el primer turno de su lista y pasa al siguiente.
- **Por porcentaje**: a cada turno su parte, redondeando hacia arriba al múltiplo del producto
  y sin pasarse del cupo del turno; lo que sobre por el redondeo va al último.

El **10HR3** viene así de fábrica: tope de 54 QQ al día, 40 % en Redondo AM y 60 % en Redondo
PM. Con 54 QQ eso da 22 y 32. Los porcentajes se cambian en **Editar**.

**Colchón** y **vida útil** vacíos heredan los de la familia; con un número puesto, ese
producto manda sobre su familia.

En la tabla de productos, **Editar** cambia la clave y arrastra promedios e historial — es lo
que hace falta cuando IN16 pase a ser LS19B — y **Agregar producto** da de alta uno nuevo con
su rendimiento, unidad, múltiplo y plantas. Los topes de producción salen de los turnos que se
le marquen.

## Impresión bolsa

La pestaña **Impresión bolsa** dice cuántas bolsas hay que mandar a imprimir. Toma la producción
sola, del reparto, y la fecha que manda siempre es la del **día a producir**; el día anterior
sale de ella.

| Columna | De dónde sale |
|---|---|
| P PROD | La planta de esa fila: `18`, `2 CZ`, `2` o la unión `2 + 18` |
| CLAVE | La clave, con su alias si tiene |
| RENDIM | Bolsas por quintal, del catálogo |
| QQ AM / QQ PM del día anterior | Lo que las fuentes elegidas traen de ese día, partido por momento |
| QQ AM / QQ PM del día a producir | Lo mismo, del día a producir |
| PROD AM | Quintales de la cubeta **AM** × rendimiento |
| PROD PM | Quintales de la cubeta **PM** × rendimiento |
| OH | Lo que ya hay impreso |
| EMPAQUE AM | `PROD AM − OH`, redondeado a diez |
| EMPAQUE PM | `PROD PM`, redondeado a diez |
| A IMPRIMIR | `EMPAQUE AM + EMPAQUE PM` |

**De dónde salen los quintales se parametriza.** En Parámetros → Impresión de bolsa, cada clave
lista sus turnos y cada turno lleva **dos** ajustes: qué hace lo que produjo el **día a
producir** («hoy») y qué hace lo del **día anterior** («ant»). Cada uno va a la cubeta `AM`, a la
`PM`, o a `—` si no entra. Hacen falta los dos porque un mismo turno puede contar de un lado un
día y del otro al siguiente: en la hoja de Kurt, RED AM del día anterior va a PROD AM y RED AM
del día a producir va a PROD PM.

Sin tocar nada, cada turno **de los que la clave tiene marcados en Productos** cuenta en su
propio momento y sólo el día a producir. Los demás turnos quedan en `—`. Si ese día hay
producción en un turno apagado, la pestaña lo avisa con la clave, el turno y los quintales, para
que no se pierda sin que nadie se entere.

**Las cuatro columnas de quintales son lo que de verdad entra en la cuenta**: muestran las
fuentes elegidas y nada más, partidas por día y por momento del turno. Lo que se ve es lo que se
suma.

**Una clave que sale de dos plantas lleva tres filas.** Una por planta, sólo para ver de dónde
viene cada parte, y abajo la que las une —el `2 + 18` de la hoja—, que es donde se escribe el
**OH** y donde sale **A IMPRIMIR**, porque la bolsa es una sola. Las filas de detalle no entran
en el total. Una clave de una sola planta lleva una fila y ahí va todo. `12WY1 + K` funciona
igual, pero une dos claves distintas que comparten bolsa.

**Lo único que se escribe a mano** son el OH, las claves que se cuentan a mano —`5HD2`, `15PL1`,
`8PL1`, `10S11T`, `12S11T`, `10WY1 M`, `10WY1 G`— y las unidades de MU1, arriba de la tabla. De
esas unidades salen las bolsas de `6MU1`, menos lo ya impreso y menos el doble de lo que se
escriba en `12MU1`, que llevan el doble de unidades cada una.

**Qué filas salen y en qué orden** se elige en la misma sección de Parámetros. Cada ficha es una
fila de la hoja y lleva su casilla, así que una clave con fila en una planta donde no se produce
nada se saca sin tocar sus otras filas. Para moverla, se agarra del asa y se arrastra. Lo que no
esté en el orden guardado va después, así que una clave nueva aparece al final en vez de
perderse. «Orden de siempre» devuelve el de las áreas de producción.

**Los sábados la hoja lleva el domingo encima.** La bolsa del domingo de Zona 2 se manda a
imprimir el sábado, cuando esa producción todavía no existe en ningún lado. Lo único con qué
estimarla son los domingos anteriores, que el app sí guarda porque la foto de Zona 2 entra a
diario. Así que cuando el día a producir cae en sábado se le **suma** a lo que ya trae la hoja el
promedio de los últimos domingos capturados, turno por turno, y cada turno entra por la cubeta
que tenga puesta. Un domingo sin nada capturado no cuenta como cero: se salta y se busca el
anterior. La pestaña dice cuántos quintales sumó y de qué domingos salieron. Se apaga, se cambia
la planta o el número de domingos en Parámetros → Impresión de bolsa.

**Esta hoja no se sincroniza.** Se guarda aparte de los días, en el equipo donde se imprime.
Sí entra en el respaldo.

## Cálculos secundarios

La pestaña **Cálculos** trae las tablas sueltas de la pestaña `INV_PM` del libro. Son
conversiones que se hacen una vez, se apuntan a mano en otro reporte y no vuelven a usarse.

**No tocan nada**: ni el inventario, ni la producción, ni el historial, y **no se sincronizan**.
Se guardan sólo en el equipo donde se escriben, para que una recarga a media captura no borre
el trabajo; **Limpiar todo** los deja en cero.

| Tabla | Qué convierte |
|---|---|
| Especiales y dulces | S19M, S16, SR16, S25M, 5HD2 y 5HD2 Emp PM: parrillas × lo que lleva cada una, más sueltos. Suma aparte las dos presentaciones de 5HD2 |
| S16 total | S16 y SR16 sumados. Las dos marcas se escriben arriba y acá se ven y se suman, a 12 por parrilla |
| PL1 (0034) | Las cinco presentaciones llevadas a equivalente de 15PL1 |
| Magdalenas (0414) | MG4D a 5 por parrilla y MGND a 8 |
| BELCA | Lo preparado contra el pedido, y qué falta bajar de bodega |
| CZ3 / CZ5 (0134) | Perchas de CZ3, cuánto queda tras CZ5 y cuánto mandar a empacar |

**BELCA usa dos parrillas distintas y es a propósito.** Lo que ya está preparado se cuenta en
parrillas del cliente —el 10HM5 le lleva 9 bolsas—, y lo que falta se convierte a parrillas de
bodega —8 bolsas—, que son las que hay que bajar al día siguiente para terminar el pedido. En
el 10PM3 las dos coinciden en 6.

**En CZ3 / CZ5**, las perchas de CZ3 y las de CZ5 se escriben en perchas y la parrilla sale
de `perchas × 12`. La fila de **Producción PM** va en quintales y se llena sola con lo que ese día
produjo de CZ3 el turno que esté en la tarde —Byron o Julio, según la semana—; se puede
escribir encima.

Quedaron fuera del libro las tablas que sólo servían para completar el conteo —«CZ3 FREDY»,
«Massella Granda» y las filas de `Esp_Dulce` que salían de `Toma_Inv`—, porque eso ahora lo
hace la lectura de la foto del INV PM.

## Feriados

En panadería el feriado no se toma como un día libre: se **descansa el día anterior** y se
**produce el día del feriado**. En Parámetros, al agregar un feriado con su fecha, la app arma
una tabla con los días alrededor —dos antes y uno después— ya puesta así, y de ahí se cambia
celda por celda con un toque. Cada toque pasa por SI, Descanso, Normal y X.

Las filas van por planta y partidas en AM y PM, porque es ahí donde la mañana y la tarde se
separan: se descansa la tarde anterior y se produce la mañana del feriado. Eso manda sobre el
calendario de la semana y mueve el horizonte, el reparto y los avisos, igual que si la planta
descansara.

Las filas de **empaque** —EMP HM, EMP HR, EMP SAND— no entran al cálculo: la app planifica
producción, no empaque. Están para que la tabla sirva como mensaje. El botón **Compartir
imagen** la manda por WhatsApp con el mismo estilo del resumen del día.

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

**Qué se sincroniza se elige por equipo.** En la misma tarjeta hay cuatro casillas: *El día*
(Producción, Inventario y el historial), *Pedidos*, *Promedios* y *Parámetros*. La elección vive
en el navegador de cada equipo y **no viaja con la sincronización** —si viajara, los dos equipos
acabarían con la misma configuración y no habría nada que controlar—, así que la tablet puede
quedarse sin los pedidos mientras la laptop los lleva.

Una parte apagada no se manda ni se trae: lo que hay en ese equipo se queda ahí y lo que hay en
el servidor queda como estaba, sin que el equipo apagado se lo pise al otro. Tampoco deja huella
de comparación, así que al volver a encenderla la mezcla la trata como primer encuentro: si los
dos lados dicen lo mismo no pregunta nada, si traen cosas distintas las junta, y sólo pregunta
cuando el mismo dato cambió en los dos lados.

**Enter y Tab se mueven por la cuadrícula.** En cualquier tabla del app, Enter y las flechas
bajan y suben por la misma columna —al final de una columna siguen en la de al lado, como una
hoja de cálculo— y Tab recorre la tabla de izquierda a derecha y luego la fila de abajo, dando
la vuelta al llegar al final. Así el Tab no se escapa al primer botón de la página. Escape
suelta el foco, que es la salida cuando se quiere ir a los botones.

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
| `js/lectorz2.js` | Lectura de la foto de producción de Zona 2 |
| `js/sync.js` | Mezcla y sincronización entre equipos |
| `js/resumen.js` | Imágenes y PDF del resumen del día |
| `js/bolsa.js` | Impresión de bolsa: la tabla y su PDF |
| `js/secundarios.js` | Cálculos secundarios de inventario |
| `js/ui.js` | Pantallas |
| `api/extract.js` | El lector de inventario, para desplegar en Vercel |
| `api/leer.js` | El lector que acepta instrucciones, para las dos hojas |
| `api/estado.js` | La sincronización, guardada en Vercel Blob |
| `LECTOR.md` | Cómo conectar el lector de fotos |
| `SINCRONIZAR.md` | Cómo encender la sincronización |
