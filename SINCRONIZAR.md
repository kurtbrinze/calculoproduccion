# Sincronizar la laptop con la tablet

Los datos de la app viven en el navegador de cada equipo. Para que los dos
trabajen sobre lo mismo hace falta un lugar en internet donde dejarlos, y eso
es lo que arma este módulo: un solo archivo guardado en **Vercel Blob**, dentro
de tu propia cuenta.

Son tres pasos y ninguno necesita terminal.

## 1. Crear el almacén

1. Entra a [vercel.com](https://vercel.com) y abre el proyecto de la app.
2. En la barra de la izquierda, **Storage** → **Create Storage** → **Blob**.
3. **Continue**, y en el acceso elige **Private**. Es tu inventario: no tiene
   por qué poder abrirlo cualquiera con el enlace.
4. Ponle el nombre que quieras, por ejemplo `produccion`, y crea el almacén.
5. Deja marcados **Production** y **Preview**.

Al terminar, Vercel conecta el almacén al proyecto y le agrega solo las
variables que la app necesita para entrar. No hay que copiar nada.

## 2. Poner la clave

La dirección de la app es pública, así que el módulo pide una clave. Sin ella
no trabaja.

1. En el proyecto, **Settings** → **Environment Variables**.
2. Agrega una variable:
   - Nombre: `SYNC_CLAVE`
   - Valor: la clave que quieras, larga y que no sea una palabra. Por ejemplo
     `panaderia-z18-2026-xK9`.
   - Marca **Production** y **Preview**.
3. Guarda y vuelve a desplegar el proyecto (**Deployments** → en el último,
   el menú de los tres puntos → **Redeploy**). Las variables sólo entran en un
   despliegue nuevo.

## 3. Encenderla en los dos equipos

En la laptop y en la tablet, por separado:

1. Abre la app → pestaña **Parámetros** → tarjeta **Sincronizar entre equipos**.
2. Escribe **la misma clave** que pusiste en `SYNC_CLAVE`.
3. Marca **Sincronización encendida**.

La primera vez, el equipo que entra se trae todo lo que el otro ya tenía. Si
además hay algo que está distinto en los dos y nunca se había comparado —por
ejemplo los parámetros, porque cada equipo arrancó con los de fábrica y vos
calibraste uno solo— la app pregunta **una vez** con cuál quedarse, y hasta
que contestes no sube nada, para no pisarle lo suyo al otro equipo. De ahí en
adelante ya sabe comparar sola.

## Cómo decide qué conservar

No copia el archivo entero: compara por partes y se queda con la versión que
cambió. Cada equipo recuerda cómo estaba todo la última vez que sincronizó, y
con eso sabe quién tocó qué:

| Situación | Qué pasa |
|---|---|
| Sólo cambió en este equipo | Se manda |
| Sólo cambió en el otro | Se trae |
| Cambió en los dos | Gana el de este equipo y la app te lo dice |
| Se borró un día en uno | Se borra en los dos |

La comparación baja hasta la clave del producto, no hasta el día. Por eso el
caso de todos los días funciona: si capturaste el INV PM del miércoles en la
tablet mientras repartías la producción de ese mismo miércoles en la laptop,
al sincronizar quedan las dos cosas.

Cuando sí hay un choque de verdad — la misma clave del mismo día cambiada en
los dos equipos — gana el equipo donde tocaste **Sincronizar** y sale un aviso
diciendo en qué. Si lo bueno era lo del otro, se corrige ahí y se sincroniza
de nuevo.

## Cuándo sincroniza

- Al abrir la app.
- Al tocar **Guardar el día**.
- Cuando tocas **Sincronizar**, abajo o en Parámetros.

No sincroniza con cada tecla, y entre subidas automáticas deja pasar un minuto.
Eso es a propósito: el plan gratis de Vercel da **2,000 guardados al mes** y, si
se pasa, bloquea el almacén 30 días. La tarjeta de Parámetros lleva la cuenta y
avisa al llegar a 1,500. Con el uso normal de dos equipos no se acerca.

## Si algo sale mal

**«Clave de sincronización incorrecta»** — la clave de la app y la de
`SYNC_CLAVE` no son iguales, o cambiaste la variable y no has vuelto a
desplegar.

**«Falta conectar un almacén Blob»** — el paso 1 quedó a medias, o el almacén
se conectó a otro proyecto.

**«Este despliegue no trae el módulo»** — estás abriendo la versión de GitHub
Pages, que no tiene servidor. La sincronización sólo funciona en la dirección
de Vercel.

**Quedó revuelto** — en Parámetros, **Empezar de cero** borra lo que este
equipo recuerda de la comparación, sin tocar los datos. La próxima vez vuelve a
preguntar con cuál quedarse.

**«No cupo la memoria de la comparación»** — el historial creció tanto que ya
no cabe en el navegador de ese equipo. Exporta el historial a Excel y borra los
días más viejos desde el Historial.

El respaldo `.json` del Historial sigue ahí y conviene bajarlo de vez en
cuando: la sincronización mantiene a los dos equipos iguales, pero si borras
algo por error, lo borra en los dos.
