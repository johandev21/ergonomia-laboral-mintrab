# Ergonomía Laboral y Pausas Activas — Ministerio del Trabajo y Previsión Social

Aplicación web de evaluación ergonómica y pausas activas guiadas basada en **Deep Learning en el navegador** con **TensorFlow.js (MoveNet)**, construida con **Vite+**, **React 19**, **TypeScript** y **`@ui-sdk/react`**, sin servidor backend.

## Ejecución local

Requisitos: Node.js 24+, `pnpm` y opcionalmente `vp` (CLI global de Vite+).

```bash
vp install
vp dev
```

Sin CLI global `vp`:

```bash
pnpm install
pnpm exec vp dev
```

## Validación y compilación

```bash
vp check   # Formateo (Oxfmt), linting (Oxlint) y tipos (TypeScript)
vp test    # Pruebas unitarias biométricas + interfaz accesible y agent-ready (Vitest)
vp build   # Empaquetado de producción en dist/
vp preview # Vista previa local de dist/
```

## Despliegue en la nube e Integración Continua (CI/CD)

El flujo `.github/workflows/deploy.yml` ejecuta automáticamente `vp check`, `vp test` y `pnpm run build` en cada _push_ o _pull request_, y publica la carpeta `dist/` en **GitHub Pages** (HTTPS, requerido por `getUserMedia` para cámara web) cuando los cambios se integran en `main`.
