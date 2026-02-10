// Главная страница: профессиональное СМИ о рынке авто и пригоне
// Формат: Guardian / Bloomberg / The Verge — журнал, не сервис и не лендинг

module.exports = function getHomePage() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ПОТАЧКАМ — новости и аналитика рынка авто, пригон из-за рубежа</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #ffffff;
      --bg-alt: #f8f9fa;
      --text: #1a1a1a;
      --text-muted: #6b7280;
      --link: #1a1a1a;
      --link-hover: #374151;
      --border: #e5e7eb;
      --rule: #e5e7eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 17px;
      line-height: 1.6;
      color: var(--text);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--link); text-decoration: none; }
    a:hover { color: var(--link-hover); text-decoration: underline; }

    /* Header — строгий, как у медиа */
    .site-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .site-header-inner {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 24px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .site-logo {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.04em;
      color: var(--text);
    }
    .site-logo:hover { text-decoration: none; color: var(--text); }
    .site-nav {
      display: none;
    }
    .site-search {
      display: none;
    }
    @media (min-width: 768px) {
      .site-nav {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .site-nav a {
        padding: 8px 12px;
        font-size: 14px;
        font-weight: 500;
        color: var(--text-muted);
      }
      .site-nav a:hover { color: var(--text); text-decoration: none; }
      .site-search {
        display: block;
        width: 200px;
        padding: 8px 12px;
        font-size: 14px;
        font-family: inherit;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg);
      }
      .site-search::placeholder { color: var(--text-muted); }
    }

    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 16px;
    }

    /* Hero — главный материал + топ новости */
    .hero {
      padding: 32px 0 40px;
      border-bottom: 1px solid var(--rule);
    }
    .hero-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
    }
    .hero-main {
      display: block;
      border: none;
      padding: 0;
      transition: opacity 0.2s;
    }
    .hero-main:hover { opacity: 0.9; text-decoration: none; color: inherit; }
    .hero-main-image {
      position: relative;
      aspect-ratio: 16/9;
      background: var(--bg-alt);
      overflow: hidden;
      margin-bottom: 16px;
    }
    .hero-main-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero-main-badge {
      position: absolute;
      bottom: 16px;
      left: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: rgba(255,255,255,0.95);
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #1a1a1a;
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
    }
    .hero-main-badge-flag {
      width: 28px;
      height: 20px;
      border-radius: 2px;
      background: linear-gradient(to bottom, #fff 0, #fff 33.33%, #0039a6 33.33%, #0039a6 66.66%, #d52b1e 66.66%, #d52b1e 100%);
      flex-shrink: 0;
    }
    .hero-main-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px; }
    .hero-main-title { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.2; margin: 0 0 12px; color: var(--text); }
    .hero-main-lead { font-size: 17px; color: var(--text-muted); line-height: 1.5; margin: 0 0 12px; }
    .hero-main-meta { font-size: 13px; color: var(--text-muted); }
    .hero-side {
      display: flex;
      flex-direction: column;
      gap: 0;
      border-top: 1px solid var(--rule);
      padding-top: 24px;
    }
    .hero-side-item {
      display: block;
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .hero-side-item:last-child { border-bottom: none; }
    .hero-side-item:hover { background: var(--bg-alt); text-decoration: none; color: inherit; }
    .hero-side-item-inner { display: flex; gap: 12px; align-items: flex-start; }
    .hero-side-thumb {
      flex-shrink: 0;
      width: 80px;
      height: 56px;
      background: var(--bg-alt);
      overflow: hidden;
      border-radius: 4px;
    }
    .hero-side-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero-side-title { font-size: 16px; font-weight: 600; line-height: 1.35; margin: 0 0 4px; color: var(--text); }
    .hero-side-item:hover .hero-side-title { text-decoration: underline; }
    .hero-side-meta { font-size: 13px; color: var(--text-muted); }
    @media (min-width: 1024px) {
      .hero-grid { grid-template-columns: 1.2fr 1fr; gap: 40px; }
      .hero-side { border-top: none; padding-top: 0; border-left: 1px solid var(--rule); padding-left: 40px; }
      .hero-main-title { font-size: 36px; }
    }

    /* Лента новостей */
    .news-section { padding: 40px 0; border-bottom: 1px solid var(--rule); }
    .news-list { display: flex; flex-direction: column; gap: 0; }
    .news-list-item {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      padding: 20px 0;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .news-list-item:hover { background: var(--bg-alt); text-decoration: none; color: inherit; }
    .news-list-item:last-child { border-bottom: none; }
    .news-list-thumb {
      width: 100%;
      aspect-ratio: 16/9;
      max-width: 320px;
      background: var(--bg-alt);
      overflow: hidden;
      border-radius: 6px;
    }
    .news-list-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .news-list-title { font-size: 18px; font-weight: 600; line-height: 1.35; margin: 0 0 8px; color: var(--text); }
    @media (min-width: 640px) {
      .news-list-item { grid-template-columns: 200px 1fr; }
      .news-list-thumb { max-width: none; aspect-ratio: 4/3; }
    }
    .news-list-item:hover .news-list-title { text-decoration: underline; }
    .news-list-lead { font-size: 15px; color: var(--text-muted); line-height: 1.5; margin: 0 0 8px; }
    .news-list-meta { font-size: 13px; color: var(--text-muted); }

    /* Аналитика */
    .analytics-section { padding: 40px 0; background: var(--bg-alt); border-bottom: 1px solid var(--rule); }
    .analytics-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
    .analytics-card {
      display: block;
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 24px;
      transition: box-shadow 0.2s;
    }
    .analytics-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); text-decoration: none; color: inherit; }
    .analytics-card-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 12px; }
    .analytics-card-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.3; margin: 0 0 12px; color: var(--text); }
    .analytics-card-lead { font-size: 15px; color: var(--text-muted); line-height: 1.5; margin: 0 0 16px; }
    .analytics-card-image {
      width: 100%;
      aspect-ratio: 16/9;
      background: var(--bg-alt);
      overflow: hidden;
      border-radius: 6px;
      margin-top: 12px;
    }
    .analytics-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .analytics-card-chart {
      height: 120px;
      background: linear-gradient(180deg, var(--border) 0%, var(--bg-alt) 100%);
      border-radius: 6px;
      margin-top: 16px;
    }
    @media (min-width: 768px) { .analytics-grid { grid-template-columns: repeat(2, 1fr); } }

    /* Рынок — RBC/Bloomberg стиль */
    .market-section { padding: 40px 0; border-bottom: 1px solid var(--rule); }
    .market-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .market-card {
      background: var(--bg-alt);
      border: 1px solid var(--border);
      padding: 20px;
      border-radius: 6px;
    }
    .market-card-label { font-size: 12px; font-weight: 500; color: var(--text-muted); margin-bottom: 8px; }
    .market-card-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
    .market-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 24px; }
    .market-table th, .market-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
    .market-table th { font-weight: 600; color: var(--text-muted); }
    @media (min-width: 768px) { .market-grid { grid-template-columns: repeat(4, 1fr); } }

    /* Страны */
    .countries-section { padding: 40px 0; background: var(--bg-alt); border-bottom: 1px solid var(--rule); }
    .countries-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .country-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .country-card-image {
      width: 100%;
      aspect-ratio: 16/9;
      background: var(--bg-alt);
      overflow: hidden;
    }
    .country-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .country-card-body { padding: 24px; }
    .country-card-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; color: var(--text); }
    .country-card-desc { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin: 0 0 16px; }
    .country-card-news { font-size: 13px; margin: 0; }
    .country-card-news a { color: var(--text); }
    .country-card-news a:hover { text-decoration: underline; }
    @media (min-width: 768px) { .countries-grid { grid-template-columns: repeat(4, 1fr); } }

    /* Гайды и разборы */
    .guides-section { padding: 40px 0; border-bottom: 1px solid var(--rule); }
    .guides-list { display: flex; flex-direction: column; gap: 0; }
    .guides-list-item {
      display: block;
      padding: 20px 0;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .guides-list-item:hover { background: var(--bg-alt); text-decoration: none; color: inherit; }
    .guides-list-item:last-child { border-bottom: none; }
    .guides-list-title { font-size: 18px; font-weight: 600; line-height: 1.35; margin: 0; color: var(--text); }
    .guides-list-item:hover .guides-list-title { text-decoration: underline; }

    /* Footer */
    .site-footer {
      padding: 48px 0 32px;
      margin-top: 48px;
      border-top: 1px solid var(--rule);
      background: var(--bg-alt);
    }
    .site-footer-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .site-footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 40px; }
    .site-footer-col-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 16px; }
    .site-footer-col a, .site-footer-col span { display: block; font-size: 14px; color: var(--text-muted); margin-bottom: 8px; }
    .site-footer-col a:hover { color: var(--text); }
    .site-footer-legal { font-size: 13px; color: var(--text-muted); padding-top: 24px; border-top: 1px solid var(--border); }
    @media (min-width: 768px) { .site-footer-grid { grid-template-columns: repeat(4, 1fr); } }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a href="/" class="site-logo">ПОТАЧКАМ</a>
      <nav class="site-nav" aria-label="Основное">
        <a href="/#news">Новости</a>
        <a href="/#analytics">Аналитика</a>
        <a href="/#market">Рынок</a>
        <a href="/#import">Пригон</a>
        <a href="/#countries">Страны</a>
        <a href="/#guides">Гайды</a>
      </nav>
      <input type="search" class="site-search" placeholder="Поиск по сайту" aria-label="Поиск" />
    </div>
  </header>

  <main>
    <div class="container">
      <!-- Hero: главный материал + топ новости -->
      <section class="hero">
        <div class="hero-grid">
          <a href="#" class="hero-main">
            <div class="hero-main-image">
              <img src="https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&q=80" alt="Импорт авто в Россию" width="1200" height="675" loading="eager" />
              <div class="hero-main-badge" aria-hidden="true">
                <span class="hero-main-badge-flag" title="Россия"></span>
                <span>Импорт в РФ</span>
              </div>
            </div>
            <span class="hero-main-label">Главное</span>
            <h1 class="hero-main-title">Импорт автомобилей в Россию: итоги месяца</h1>
            <p class="hero-main-lead">Объёмы ввоза из Кореи выросли на 18%, из Японии — снизились. Таможня обновила ставки на ряд категорий. Краткий разбор ключевых цифр и трендов.</p>
            <span class="hero-main-meta">16 января 2025</span>
          </a>
          <div class="hero-side">
            <a href="#" class="hero-side-item">
              <div class="hero-side-item-inner">
                <div class="hero-side-thumb"><img src="https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=160&q=80" alt="" width="80" height="56" loading="lazy" /></div>
                <div>
                  <h2 class="hero-side-title">Цены на авто из Кореи выросли на 12%</h2>
                  <span class="hero-side-meta">16 января</span>
                </div>
              </div>
            </a>
            <a href="#" class="hero-side-item">
              <div class="hero-side-item-inner">
                <div class="hero-side-thumb"><img src="https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=160&q=80" alt="" width="80" height="56" loading="lazy" /></div>
                <div>
                  <h2 class="hero-side-title">Новые ограничения на ввоз: что изменилось</h2>
                  <span class="hero-side-meta">15 января</span>
                </div>
              </div>
            </a>
            <a href="#" class="hero-side-item">
              <div class="hero-side-item-inner">
                <div class="hero-side-thumb"><img src="https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=160&q=80" alt="" width="80" height="56" loading="lazy" /></div>
                <div>
                  <h2 class="hero-side-title">Таможня упростила оформление электромобилей</h2>
                  <span class="hero-side-meta">15 января</span>
                </div>
              </div>
            </a>
            <a href="#" class="hero-side-item">
              <div class="hero-side-item-inner">
                <div class="hero-side-thumb"><img src="https://images.unsplash.com/photo-1502877338535-766e1452684a?w=160&q=80" alt="" width="80" height="56" loading="lazy" /></div>
                <div>
                  <h2 class="hero-side-title">Курс и логистика: как изменилась экономика привоза за квартал</h2>
                  <span class="hero-side-meta">14 января</span>
                </div>
              </div>
            </a>
          </div>
        </div>
      </section>

      <!-- Лента новостей -->
      <section class="news-section" id="news">
        <h2 class="section-label">Лента новостей</h2>
        <div class="news-list">
          <a href="#" class="news-list-item">
            <div class="news-list-thumb"><img src="https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=400&q=80" alt="" width="200" height="150" loading="lazy" /></div>
            <div>
              <h3 class="news-list-title">Японские аукционы: обновлённый рейтинг моделей по спросу у российских пригонщиков</h3>
              <p class="news-list-lead">Топ-15 моделей по количеству покупок в декабре. Лидеры — кроссоверы и седаны среднего класса.</p>
              <span class="news-list-meta">16 января 2025</span>
            </div>
          </a>
          <a href="#" class="news-list-item">
            <div class="news-list-thumb"><img src="https://images.unsplash.com/photo-1502877338535-766e1452684a?w=400&q=80" alt="" width="200" height="150" loading="lazy" /></div>
            <div>
              <h3 class="news-list-title">Германия vs Корея: сравнение средних цен на кроссоверы в начале 2025 года</h3>
              <p class="news-list-lead">Разбор цен на популярные модели в двух ключевых странах импорта с учётом таможни и доставки.</p>
              <span class="news-list-meta">15 января 2025</span>
            </div>
          </a>
          <a href="#" class="news-list-item">
            <div class="news-list-thumb"><img src="https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=400&q=80" alt="Авто в доставке" width="200" height="150" loading="lazy" /></div>
            <div>
              <h3 class="news-list-title">Логистика из Кореи: сроки доставки выросли на две недели</h3>
              <p class="news-list-lead">Перевозчики сообщают о задержках из-за загруженности портов. Как это влияет на себестоимость.</p>
              <span class="news-list-meta">14 января 2025</span>
            </div>
          </a>
          <a href="#" class="news-list-item">
            <div class="news-list-thumb"><img src="https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80" alt="" width="200" height="150" loading="lazy" /></div>
            <div>
              <h3 class="news-list-title">Евро-5 и евро-6: какие машины можно ввозить без переоборудования</h3>
              <p class="news-list-lead">Актуальные требования к экологическому классу при растаможке в 2025 году.</p>
              <span class="news-list-meta">13 января 2025</span>
            </div>
          </a>
        </div>
      </section>

      <!-- Аналитика -->
      <section class="analytics-section" id="analytics">
        <h2 class="section-label">Аналитика</h2>
        <div class="analytics-grid">
          <a href="#" class="analytics-card">
            <span class="analytics-card-label">Разбор</span>
            <h3 class="analytics-card-title">Почему пригон из Японии снова стал выгодным</h3>
            <p class="analytics-card-lead">Курс, ставки таможни и спрос на правый руль: разбираем факторы, которые изменили экономику привоза из Японии во второй половине 2024 года.</p>
            <div class="analytics-card-image"><img src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80" alt="" width="600" height="338" loading="lazy" /></div>
            <div class="analytics-card-chart" aria-hidden="true"></div>
          </a>
          <a href="#" class="analytics-card">
            <span class="analytics-card-label">Прогноз</span>
            <h3 class="analytics-card-title">Как меняется рынок поддержанных авто в 2025 году</h3>
            <p class="analytics-card-lead">Тренды по странам, категориям и ценовым сегментам. Что ждать от таможни и логистики в первом квартале.</p>
            <div class="analytics-card-image"><img src="https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600&q=80" alt="" width="600" height="338" loading="lazy" /></div>
            <div class="analytics-card-chart" aria-hidden="true"></div>
          </a>
        </div>
      </section>

      <!-- Рынок авто -->
      <section class="market-section" id="market">
        <h2 class="section-label">Рынок авто</h2>
        <div class="market-grid">
          <div class="market-card">
            <div class="market-card-label">Средняя цена ввоза</div>
            <div class="market-card-value">1,42 млн ₽</div>
          </div>
          <div class="market-card">
            <div class="market-card-label">Динамика за месяц</div>
            <div class="market-card-value">+3,2%</div>
          </div>
          <div class="market-card">
            <div class="market-card-label">Популярные марки</div>
            <div class="market-card-value">Toyota, Kia, BMW</div>
          </div>
          <div class="market-card">
            <div class="market-card-label">Разница РФ / ЕС / Азия</div>
            <div class="market-card-value">до 28%</div>
          </div>
        </div>
        <table class="market-table" aria-label="Сравнение цен по странам">
          <thead>
            <tr><th>Страна</th><th>Средняя цена</th><th>Изменение</th></tr>
          </thead>
          <tbody>
            <tr><td>Корея</td><td>1,38 млн ₽</td><td>+4,1%</td></tr>
            <tr><td>Япония</td><td>1,52 млн ₽</td><td>+2,0%</td></tr>
            <tr><td>Германия</td><td>1,65 млн ₽</td><td>+1,8%</td></tr>
            <tr><td>США</td><td>1,48 млн ₽</td><td>−0,5%</td></tr>
          </tbody>
        </table>
      </section>

      <!-- Страны -->
      <section class="countries-section" id="countries">
        <h2 class="section-label">Страны</h2>
        <div class="countries-grid">
          <div class="country-card">
            <div class="country-card-image"><img src="/public/germany.png" alt="Германия" width="400" height="225" loading="lazy" /></div>
            <div class="country-card-body">
              <h3 class="country-card-title">Германия</h3>
              <p class="country-card-desc">Крупнейший рынок подержанных авто в Европе. Прозрачная история, широкий выбор премиума и массового сегмента.</p>
              <p class="country-card-news"><a href="#">Последние материалы по Германии →</a></p>
            </div>
          </div>
          <div class="country-card">
            <div class="country-card-image"><img src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80" alt="Япония" width="400" height="225" loading="lazy" /></div>
            <div class="country-card-body">
              <h3 class="country-card-title">Япония</h3>
              <p class="country-card-desc">Аукционы, правый руль, жёсткие стандарты состояния. Высокий спрос на кроссоверы и седаны.</p>
              <p class="country-card-news"><a href="#">Последние материалы по Японии →</a></p>
            </div>
          </div>
          <div class="country-card">
            <div class="country-card-image"><img src="https://images.unsplash.com/photo-1538485399081-7191377e8241?w=600&q=80" alt="Корея" width="400" height="225" loading="lazy" /></div>
            <div class="country-card-body">
              <h3 class="country-card-title">Корея</h3>
              <p class="country-card-desc">Растущий объём привоза. Kia, Hyundai, Genesis. Выгодная логистика и таможенные условия.</p>
              <p class="country-card-news"><a href="#">Последние материалы по Корее →</a></p>
            </div>
          </div>
          <div class="country-card">
            <div class="country-card-image"><img src="https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=600&q=80" alt="США" width="400" height="225" loading="lazy" /></div>
            <div class="country-card-body">
              <h3 class="country-card-title">США</h3>
              <p class="country-card-desc">Огромный выбор, аукционы и дилеры. Левый руль. Специфика американского рынка и документов.</p>
              <p class="country-card-news"><a href="#">Последние материалы по США →</a></p>
            </div>
          </div>
        </div>
      </section>

      <!-- Гайды и разборы -->
      <section class="guides-section" id="guides">
        <h2 class="section-label">Разборы и гайды</h2>
        <div class="guides-list">
          <a href="#" class="guides-list-item">
            <h3 class="guides-list-title">Как читать японские аукционы</h3>
          </a>
          <a href="#" class="guides-list-item">
            <h3 class="guides-list-title">Типовые ошибки при пригоне авто</h3>
          </a>
          <a href="#" class="guides-list-item">
            <h3 class="guides-list-title">На чём теряют деньги начинающие пригонщики</h3>
          </a>
          <a href="#" class="guides-list-item">
            <h3 class="guides-list-title">Полный гид по растаможке в 2025 году</h3>
          </a>
        </div>
      </section>
    </div>

    <footer class="site-footer" id="about">
      <div class="site-footer-inner">
        <div class="site-footer-grid">
          <div class="site-footer-col">
            <div class="site-footer-col-title">О редакции</div>
            <a href="#">Как мы работаем</a>
            <a href="#">Редакция</a>
          </div>
          <div class="site-footer-col">
            <div class="site-footer-col-title">Источники информации</div>
            <a href="#">Методология</a>
            <a href="#">Данные рынка</a>
          </div>
          <div class="site-footer-col">
            <div class="site-footer-col-title">Контакты</div>
            <span>Для редакции и партнёрства</span>
          </div>
          <div class="site-footer-col">
            <div class="site-footer-col-title">Правовая информация</div>
            <a href="#">Политика конфиденциальности</a>
            <a href="#">Условия использования</a>
          </div>
        </div>
        <p class="site-footer-legal">
          ПОТАЧКАМ — отраслевое СМИ о рынке автомобилей и пригоне из-за рубежа. Новости, аналитика, разборы. Не являемся сервисом продаж и не оказываем посреднических услуг.
        </p>
      </div>
    </footer>
  </main>
</body>
</html>`;
};
