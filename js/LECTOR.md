# Cómo conectar el lector de fotos

Leer números manuscritos necesita una llave de la API de Anthropic. **No hay forma de
evitarla**: es tu cuenta y solo tú puedes crearla. Lo que sí se puede elegir es dónde guardarla.

Hay dos caminos. El primero no requiere instalar ni desplegar nada.

---

## Camino A — Llave en el dispositivo (2 minutos, sin terminal)

Es el más simple. La app llama a la API directamente desde el navegador.

1. Entra a <https://console.anthropic.com> → **API Keys** → **Create Key**. Cópiala; solo se
   muestra una vez.
2. En la misma pantalla, ponle un **límite de gasto** a la llave. Así, si alguna vez se filtra,
   el daño queda acotado.
3. Abre la app → pestaña **Foto → Excel** → **Ajustes del lector** → marca **Llave en este
   dispositivo** y pega la llave.

Listo. Se guarda en ese navegador; hay que hacerlo una vez por tablet o computadora.

**Lo que hay que saber:** la llave queda guardada en el navegador de ese equipo. Quien tenga el
equipo desbloqueado y sepa buscarla, puede sacarla y gastar tu saldo. Para una tablet de trabajo
que no prestas, con límite de gasto puesto, es un riesgo razonable. Si la tablet se pierde,
entra a la consola y revoca la llave: deja de servir al instante.

El botón **Borrar llave** la quita de ese dispositivo cuando quieras.

---

## Camino B — Servidor propio en Vercel (5 minutos, sin terminal)

Aquí la llave vive en un servidor tuyo y nunca toca la tablet. Todo se hace con clics en el
navegador; no hace falta instalar nada ni abrir una consola.

1. Sube este repositorio a GitHub (si aún no está).
2. Entra a <https://vercel.com> y crea la cuenta con **Continue with GitHub**.
3. **Add New… → Project** → busca el repositorio → **Import**.
4. Antes de dar Deploy, abre **Environment Variables** y agrega:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | tu llave de console.anthropic.com |

5. **Deploy**. Al terminar te da una dirección, algo como
   `https://inventario-pana.vercel.app`.

Abre esa dirección: es la misma app, pero ahora **trae el lector incluido**. No hay que
configurar nada: la app detecta el lector sola y lo deja listo. Instala la app desde esa
dirección en la tablet y usa esa de aquí en adelante.

El plan gratuito de Vercel alcanza de sobra para una lectura al día.

### Si prefieres seguir usando la dirección de GitHub Pages

Se puede: la app en Pages y el lector en Vercel. En ese caso agrega también esta variable en
Vercel, para que el lector acepte llamadas desde Pages:

| Name | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://kurtbrinze.github.io` |

Y en la app, en Ajustes, marca **Servidor propio** y pega
`https://TU-PROYECTO.vercel.app/api/extract`.

---

## Camino C — Cloudflare Workers

Sigue disponible en [WORKER.md](WORKER.md), pero requiere usar la terminal. Si el camino A o B
te sirven, ignóralo.

---

## Cambiar el modelo

En Ajustes hay un campo **Modelo**. Viene en `claude-opus-5`, que es el más preciso con letra
manuscrita. `claude-sonnet-5-5` cuesta menos. Si lo cambias, compara unos días contra la hoja de
papel antes de dejarlo fijo.

En Vercel, el modelo se cambia con la variable `MODEL`.

---

## Si algo falla

| Lo que ves | Qué pasó |
|---|---|
| `La API respondió 401` | La llave está mal copiada o fue revocada. |
| `La API respondió 429` | Sin saldo, o demasiadas peticiones seguidas. |
| `No se pudo contactar a la API desde el navegador` | Sin señal, o la red de la tablet bloquea el sitio. Prueba el camino B. |
| `El lector no devolvió datos legibles` | Foto borrosa o cortada. Repite con la hoja completa, plana y bien iluminada. |
| `Falta la variable ANTHROPIC_API_KEY` | En Vercel, falta agregarla en Environment Variables y volver a desplegar. |

---

## Lo que cuesta

Cada lectura manda una foto reducida a 2000 px de lado. Con `claude-opus-5` ronda los centavos
de dólar por toma de inventario. El gasto se ve en console.anthropic.com → Usage.
