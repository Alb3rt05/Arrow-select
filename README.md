<div align="center">

# 🎯 ArrowSelect

**Registra le tue volate di tiro con l'arco e scopri quale freccia raggruppa più stretta.**

App web statica, **installabile** e **offline-first** (PWA). Zero backend, zero build step.

</div>

---

## ✨ Cosa fa

Nel tiro con l'arco non tutte le frecce volano uguali: micro-differenze di peso, spine e punte cambiano il raggruppamento. ArrowSelect ti aiuta a **selezionare le frecce migliori** in modo oggettivo:

1. Crei una **sessione** (numero di frecce, tipo di bersaglio, codici delle frecce).
2. Per ogni **volata** selezioni la freccia e tocchi il punto d'impatto sul bersaglio.
3. La **classifica** ordina le frecce per **rosata σ** — la deviazione media dal centro del gruppo. Meno σ = raggruppamento più costante.

Ogni freccia ha il suo mini-bersaglio zoomato con il cerchio σ tratteggiato e il centro del gruppo.

## 🧩 Funzionalità

- 🎯 Bersaglio interattivo (touch + mouse) con rendering **retina-crisp**
- 🏆 Classifica frecce per σ, con freccia consigliata evidenziata
- 📊 Statistiche: punteggio medio, tiri, centri **X**, ampiezza rosata
- 🌗 Tema **chiaro/scuro** con memoria della preferenza
- 📱 **PWA**: installabile e funzionante **offline** (perfetta al campo senza rete)
- 💾 Salvataggio locale (`localStorage`) + **export JSON**
- ⚙️ Bersagli **122 / 80 / 40 cm**
- 🔔 Toast e modali eleganti (niente `alert()` di sistema)

## 🚀 Deploy su Netlify

### Metodo 1 — da GitHub (consigliato)

1. Crea il repo e fai push (vedi sotto).
2. Su [Netlify](https://app.netlify.com) → **Add new site → Import an existing project** → scegli il repo.
3. Build command: *(vuoto)* · Publish directory: `.`
4. **Deploy**. Il file [`netlify.toml`](./netlify.toml) è già configurato.

### Metodo 2 — drag & drop

Trascina l'intera cartella su [app.netlify.com/drop](https://app.netlify.com/drop).

### Metodo 3 — Netlify CLI

```bash
npm i -g netlify-cli
netlify deploy --prod
```

## 🖥️ Sviluppo locale

Serve un web server (il service worker e i moduli non funzionano da `file://`):

```bash
npm run dev          # avvia su http://localhost:5173
# oppure
python3 -m http.server 5173
```

## 📁 Struttura

```
arrowselect/
├── index.html              # markup + icone SVG inline
├── css/styles.css          # design system (temi, componenti)
├── js/app.js               # logica app, canvas, statistiche
├── icons/                  # favicon SVG + icone PWA (PNG)
├── manifest.webmanifest    # metadati PWA
├── sw.js                   # service worker (offline)
├── netlify.toml            # config deploy + header
└── package.json
```

## 📐 Come si calcola la rosata σ

Per ogni freccia con ≥ 2 tiri:

1. Si calcola il **centroide** (media di tutti i punti d'impatto).
2. σ = **distanza media** di ogni tiro dal centroide (in coordinate normalizzate).
3. Si converte in **cm** usando il raggio fisico del bersaglio (122→61 cm, 80→40 cm, 40→20 cm).

A parità di σ, vince la freccia con punteggio medio più alto.

## 📄 Licenza

MIT — vedi [LICENSE](./LICENSE).
