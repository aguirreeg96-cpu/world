# Mundial Stats — Análisis Estadístico de Fútbol

Herramienta de análisis estadístico para partidos de fútbol internacional.
Combina modelos matemáticos para estimar probabilidades de resultado.

> ⚠ **Aviso:** Este proyecto es exclusivamente educativo y estadístico.
> No predice resultados reales ni debe usarse como base para apuestas
> o decisiones financieras de ningún tipo.

---

## Qué hace

- Compara dos selecciones nacionales y genera probabilidades de resultado
- Modela goles esperados con Poisson + corrección Dixon-Coles (ρ = −0.13)
- Incorpora ratings ELO con modelo de empate gaussiano calibrado
- Ajusta por forma reciente (últimos 8 partidos, decaimiento exponencial)
- Mezcla ELO y Poisson con pesos calibrados por grid search (Brier Score)
- Muestra intervalos de confianza ±1σ sobre λ estimados
- Comparador opcional de cuotas decimales vs probabilidades del modelo

## Stack

- Vanilla JS con ES Modules (sin frameworks, sin npm, sin bundler)
- HTML5 + CSS3 (custom properties, CSS Grid)
- Funciona desde cualquier servidor HTTP estático

## Correr localmente

Requiere un servidor HTTP (los ES Modules no funcionan con `file://`).

```bash
# Python (incluido en macOS y Linux)
python3 -m http.server 8080

# Node.js (si está instalado)
npx serve .

# VS Code: instalar extensión "Live Server" y hacer clic en "Go Live"
```

Abrir en el navegador: `http://localhost:8080`

## Estructura del proyecto

```
world/
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── main.js                   ← entry point
    ├── data/
    │   ├── teams.js              ← dataset de 20 selecciones (demo)
    │   ├── matches_mock.js       ← 20 partidos históricos (demo)
    │   ├── provider.js           ← interfaz única de datos
    │   └── adapters/
    │       ├── mockAdapter.js    ← usa teams.js + matches_mock.js
    │       └── apiAdapter.js     ← stub para API real (sin claves)
    ├── models/
    │   ├── elo.js                ← ratings ELO + modelo de empate
    │   ├── poisson.js            ← Poisson + Dixon-Coles
    │   ├── form.js               ← índice de forma reciente
    │   ├── aggregator.js         ← blend ELO + Poisson con pesos
    │   ├── calibrator.js         ← backtesting + grid search
    │   └── odds.js               ← comparador de cuotas (educativo)
    └── ui/
        └── dashboard.js          ← todo el DOM rendering
```

## Deploy en Netlify

### Opción A — Desde la UI de Netlify (recomendada)

1. Hacer push de este repositorio a GitHub/GitLab/Bitbucket.
2. Ir a [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project".
3. Conectar el repositorio.
4. Netlify detecta automáticamente `netlify.toml`:
   - **Build command:** (vacío — no hay build)
   - **Publish directory:** `.`
5. Hacer clic en "Deploy site".

### Opción B — Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --dir . --prod
```

### Opción C — Drag & drop

1. Comprimir la carpeta del proyecto (sin `.git/`).
2. Arrastrar el ZIP a [app.netlify.com/drop](https://app.netlify.com/drop).

---

## Modelos matemáticos

| Modelo | Descripción |
|--------|-------------|
| ELO | `P(A gana) = 1 / (1 + 10^(-ΔR/400))`, escala 400 |
| Empate ELO | `P_draw = 0.285 × exp(-2 × (ΔR/400)²)` |
| Poisson | `P(A=i, B=j) = Poisson(λ_A, i) × Poisson(λ_B, j)` |
| Dixon-Coles | Corrección τ para marcadores bajos, ρ = −0.13 |
| Forma | Decaimiento exponencial α = 0.85, factor ∈ [0.85, 1.15] |
| Blend | `P_final = w_ELO × P_ELO + w_Poisson × P_Poisson` |
| Calibración | Grid search: ELO ∈ [0.2, 0.7] paso 0.05, minimiza Brier Score |

## Siguiente paso para datos reales

La app está preparada para conectar una API de fútbol sin modificar los modelos.
Ver los comentarios en `js/data/adapters/apiAdapter.js` para la arquitectura
de backend proxy recomendada (variables de entorno, nunca claves en el frontend).

---

*Estadísticas de demostración. Los datos de equipos son ilustrativos.*
*Este análisis no constituye asesoramiento deportivo ni financiero.*
