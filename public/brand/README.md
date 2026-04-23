# Brand assets Codexy

Carpeta para los logos oficiales. Todo lo de acá va al bundle final (ruta pública `/brand/...`).

## Archivos esperados

| Archivo | Uso | Formato |
|---|---|---|
| `codexy-x.svg` | Isologo (solo la X) para avatares, favicons, badges | SVG, 200x200, fill=currentColor |
| `codexy-x-white.svg` *(opcional)* | Variante blanca para fondos oscuros | SVG |
| `codexy-full.svg` *(opcional)* | Logo horizontal X + CODEXY | SVG, fondo transparente |
| `codexy-full-white.svg` *(opcional)* | Variante blanca horizontal | SVG |
| `codexy-x.png` *(opcional)* | Para previews de WhatsApp / redes | PNG 512x512 transparente |

## Cómo reemplazar con tus assets oficiales

Arrastrá los archivos reales encima de los que tenemos (aproximaciones hechas a mano). El componente `Logo` usa `fill="currentColor"` — si tu SVG tiene colores hardcodeados, **editá el SVG** para cambiar `fill="#000"` por `fill="currentColor"` así hereda el color del contexto (dark, light, branded, etc.).

## Sobre el favicon

El favicon general (`src/app/favicon.ico`) viene del scaffold de Next. Si querés reemplazarlo por el X Codexy, convertí `codexy-x.svg` a `.ico` (32x32, 48x48, 64x64) y pisá el archivo. Recomiendo https://realfavicongenerator.net.
