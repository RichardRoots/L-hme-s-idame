<!doctype html>
<html lang="et">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0f5e62">
  <title>BussRadar Tallinn</title>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="assets/icon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://unpkg.com">
  <link rel="preconnect" href="https://tile.openstreetmap.org">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="index.php" aria-label="BussRadar Tallinn avaleht">
        <span class="brand-mark"><i data-lucide="bus-front"></i></span>
        <span>
          <strong>BussRadar</strong>
          <small>Tallinn</small>
        </span>
      </a>

      <div class="topbar-actions">
        <span class="status-pill" id="connectionStatus">Andmed ootavad</span>
        <button class="icon-button" id="themeToggle" type="button" title="Tume režiim" aria-label="Tume režiim">
          <i data-lucide="moon"></i>
        </button>
        <a class="install-button account-button" id="accountLink" href="login.php" title="Logi sisse" aria-label="Logi sisse">
          <i data-lucide="log-in"></i>
          <span id="authButtonText">Logi sisse</span>
        </a>
        <button class="icon-button" id="locateButton" type="button" title="Minu asukoht" aria-label="Minu asukoht">
          <i data-lucide="crosshair"></i>
        </button>
        <button class="icon-button" id="refreshButton" type="button" title="Värskenda" aria-label="Värskenda">
          <i data-lucide="refresh-cw"></i>
        </button>
        <button class="install-button" id="installButton" type="button" hidden>
          <i data-lucide="download"></i>
          <span>Paigalda</span>
        </button>
      </div>
    </header>

    <main class="workspace">
      <aside class="side-panel" aria-label="Juhtpaneel">
        <section class="panel-block">
          <div class="block-heading">
            <h1>Valitud bussid</h1>
            <span id="vehicleCount">0 kaardil</span>
          </div>

          <form class="line-form" id="lineForm">
            <label class="field-label" for="lineInput">Liin</label>
            <div class="inline-field">
              <input id="lineInput" name="line" type="text" autocomplete="off" inputmode="text" placeholder="nt 18">
              <button class="tool-button" type="submit">
                <i data-lucide="plus"></i>
                <span>Lisa</span>
              </button>
            </div>
          </form>

          <div class="line-control-list" id="selectedLines" aria-label="Valitud liinid"></div>

          <div class="metric-grid">
            <div>
              <span>Uuendus</span>
              <strong id="lastUpdated">-</strong>
            </div>
            <div>
              <span>Järgmine</span>
              <strong id="nextRefresh">10 s</strong>
            </div>
          </div>
        </section>

        <section class="panel-block">
          <div class="block-heading">
            <h2>Peatuse tablo</h2>
            <span id="selectedStopName">Laikmaa</span>
          </div>

          <form class="stop-form" id="stopSearchForm">
            <label class="field-label" for="stopSearch">Peatus</label>
            <div class="inline-field">
              <input id="stopSearch" name="stop" type="search" autocomplete="off" placeholder="Viru, Balti jaam">
              <button class="icon-button contained" type="submit" title="Otsi peatust" aria-label="Otsi peatust">
                <i data-lucide="search"></i>
              </button>
            </div>
          </form>

          <div class="stop-results" id="stopResults"></div>
          <div class="departure-list" id="departures"></div>
        </section>

        <section class="panel-block">
          <div class="block-heading">
            <h2>Lemmikpeatused</h2>
            <span id="favoriteStopCount">0 valitud</span>
          </div>

          <form class="favorite-stop-form" id="favoriteStopForm">
            <label class="field-label" for="favoriteStopSearch">Peatus</label>
            <div class="inline-field">
              <input id="favoriteStopSearch" name="favoriteStop" type="search" autocomplete="off" placeholder="nt Laikmaa">
              <button class="icon-button contained" type="submit" title="Lisa lemmikpeatus" aria-label="Lisa lemmikpeatus">
                <i data-lucide="star"></i>
              </button>
            </div>
          </form>

          <div class="stop-results" id="favoriteStopResults"></div>
          <div class="favorite-stop-list" id="favoriteStopList"></div>
        </section>

        <section class="panel-block compact-block">
          <div class="block-heading">
            <h2>Ilm</h2>
            <span id="weatherUpdated">-</span>
          </div>
          <div class="weather-line">
            <strong id="weatherTemp">-</strong>
            <span id="weatherText">Laen ilma</span>
          </div>
          <div class="weather-detail" id="walkingAdvice">-</div>
        </section>

        <section class="panel-block compact-block">
          <div class="block-heading">
            <h2>Õpilaste voog</h2>
            <button class="icon-button small" id="toggleSchools" type="button" title="Koolide kiht" aria-label="Koolide kiht">
              <i data-lucide="graduation-cap"></i>
            </button>
          </div>
          <div class="crowd-list" id="schoolCrowds"></div>
        </section>

        <section class="panel-block compact-block">
          <div class="block-heading">
            <h2>Hilinemised</h2>
            <span id="delaySummary">-</span>
          </div>
          <div class="delay-list" id="delayList"></div>
        </section>
      </aside>

      <section class="map-area" aria-label="Tallinna bussikaart">
        <div id="map"></div>
        <div class="map-legend">
          <span><i class="legend-line route route-forward"></i>1. suund</span>
          <span><i class="legend-line route route-reverse"></i>2. suund</span>
          <span><i class="legend-dot stop"></i>Peatus</span>
          <span><i class="legend-dot favorite"></i>Lemmik</span>
          <span><i class="legend-dot bus"></i>Buss</span>
          <span><i class="legend-dot crowd"></i>Õpilased</span>
          <span><i class="legend-dot delay"></i>Hilinemise risk</span>
        </div>
      </section>
    </main>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <script src="assets/js/app.js" defer></script>
</body>
</html>
