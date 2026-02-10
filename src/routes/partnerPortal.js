// src/routes/partnerPortal.js
// Кабинет партнёра: логин и управление своими клиентами и критериями поиска

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { db } = require('../storage/db');
const Partner = require('../models/Partner');
const Client = require('../models/Client');
const SearchCriteria = require('../models/SearchCriteria');
const CriterionFoundCar = require('../models/CriterionFoundCar');
const Car = require('../models/Car');

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, pair) => {
    const [k, v] = pair.split('=');
    if (!k) return acc;
    acc[k.trim()] = decodeURIComponent((v || '').trim());
    return acc;
  }, {});
}

function setPartnerCookie(res, partnerId) {
  res.cookie('partnerId', String(partnerId), {
    httpOnly: true,
    sameSite: 'lax',
  });
}

function clearPartnerCookie(res) {
  res.clearCookie('partnerId');
}

function requirePartnerAuth(req, res, next) {
  const cookies = parseCookies(req);
  const idRaw = cookies.partnerId;
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    return res.redirect('/partner/login');
  }
  const partner = Partner.findById(id);
  if (!partner) {
    clearPartnerCookie(res);
    return res.redirect('/partner/login');
  }
  req.partner = partner;
  next();
}

// --- Client Workspace: хелперы для Master–Detail layout ---

/** Построить одну карточку подборки (используется и в профиле клиента, и на странице «Все подборки») */
function buildSelectionCardHtml(partner, sc, client, opts = {}) {
  const { showClientName = false } = opts;
  const selectionUrlBase = '/p/' + encodeURIComponent(partner.slug) + '/selection/';
  const realId = sc.public_id || sc.id;
  const nameRaw = sc.name || 'Подборка ' + realId;
  const name = String(nameRaw).replace(/</g, '&lt;');
  const nameTitle = String(nameRaw).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const searchUrlSafe = (sc.search_url || '').replace(/"/g, '&quot;');
  const country = sc.country || '—';
  const sourceSite = sc.source_site ? '@' + String(sc.source_site).replace(/</g, '&lt;') : '';
  const selectionUrl = selectionUrlBase + realId;
  const deleted = !!sc.deleted_at;
  const foundCount = CriterionFoundCar.findByCriterion(sc.id).length;
  const clientNameRaw = client && client.name ? client.name : '—';
  const clientName = String(clientNameRaw).replace(/</g, '&lt;');
  const clientLine = showClientName ? `<span class="selection-card-client">Клиент: ${clientName}</span>` : '';
  const deletedPill = deleted ? '<span class="pill pill-deleted">Удалена</span>' : '';
  const actionsHtml = deleted
    ? '<span class="selection-card-btn selection-card-btn-found selection-card-btn-disabled">Подборка удалена</span>'
    : `<a href="/partner/admin/clients/${sc.client_id}/found-cars?selection=${sc.id}" class="selection-card-btn selection-card-btn-found">Найденные авто (${foundCount})</a>
       <a href="/partner/admin/clients/${sc.client_id}/search-criteria/${sc.id}/edit" class="selection-card-icon-btn selection-card-icon-btn-edit" title="Редактировать" aria-label="Редактировать">&#9998;</a>
       <form class="criteria-action-form" method="post" action="/partner/admin/clients/${sc.client_id}/search-criteria/${sc.id}/delete" style="display:inline;">
         <button type="submit" class="selection-card-icon-btn selection-card-icon-btn-delete" title="Удалить" aria-label="Удалить">&#128465;</button>
       </form>`;
  return `
        <div class="selection-card${deleted ? ' selection-card--deleted' : ''}">
          <div class="selection-card-main">
            <div class="selection-card-header">
              <span class="selection-card-id">ID ${realId}</span>
              <a href="${selectionUrl}" class="selection-card-site-link" target="_blank" rel="noopener noreferrer">На сайте ↗</a>
            </div>
            <div class="selection-card-meta">
              <strong class="selection-card-name" title="${nameTitle}">${name}</strong>
              ${clientLine}
            </div>
            <div class="selection-card-tags">
              ${
                sc.search_url
                  ? `<a href="${searchUrlSafe}" class="selection-card-btn selection-card-btn-url selection-card-btn-url-inline" target="_blank" rel="noopener noreferrer">Источник</a>`
                  : '<span class="selection-card-btn selection-card-btn-url selection-card-btn-url-inline selection-card-btn-disabled">Источник</span>'
              }
              <span class="selection-card-country pill pill-${(country || '').toLowerCase()}">${country}</span>
              ${sourceSite ? `<span class="selection-card-source">${sourceSite}</span>` : ''}
              ${deletedPill}
            </div>
          </div>
          <div class="selection-card-actions">
            ${actionsHtml}
          </div>
        </div>`;
}

/** Собрать HTML активных подборок в виде карточек (стиль как у «Найденные авто»): ID, критерии, кнопки */
function buildClientSelectionsCardsHtml(partner, client) {
  const activeCriteria = SearchCriteria.findByClientActive(client.id);
  const activeCriteriaOrdered = [...activeCriteria].reverse();
  if (activeCriteriaOrdered.length === 0) {
    return '<p class="empty">Подборок пока нет. Добавьте подборку выше.</p>';
  }
  return `
    <div class="selection-cards-list">
      ${activeCriteriaOrdered.map((sc) => buildSelectionCardHtml(partner, sc, client, { showClientName: false })).join('')}
    </div>`;
}

/** Собрать HTML активных и удалённых критериев для одного клиента (удалённые — старый список) */
function buildClientCriteriaHtml(partner, client) {
  const activeCriteria = SearchCriteria.findByClientActive(client.id);
  const deletedCriteria = SearchCriteria.findByClientDeleted(client.id);
  const activeHtml = buildClientSelectionsCardsHtml(partner, client);
  const deletedHtml =
    deletedCriteria.length === 0
      ? '<p class="empty">Удалённых подборок нет.</p>'
      : `<ul class="criteria-list criteria-list--deleted">
          ${deletedCriteria
            .map((sc) => {
              const selectionUrl = '/p/' + encodeURIComponent(partner.slug) + '/selection/' + (sc.public_id || sc.id);
              return `
                <li class="criteria-item criteria-item--deleted">
                  <div class="criteria-main">
                    <span class="criteria-num">ID ${(sc.public_id || sc.id)}</span>
                    <div class="criteria-text">
                      <div class="criteria-title-row">
                        <span class="criteria-item-name">${(sc.name || '—').replace(/</g, '&lt;')}</span>
                        <span class="pill pill-country pill-${(sc.country || '').toLowerCase()}">${sc.country}</span>
                      </div>
                      <a class="criteria-search-link" href="${(sc.search_url || '').replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${(sc.search_url || '').replace(/</g, '&lt;')}</a>
                      ${sc.source_site ? `<span class="source">@${(sc.source_site || '').replace(/</g, '&lt;')}</span>` : ''}
                    </div>
                  </div>
                  <div class="criteria-actions">
                    <a class="criteria-selection-link" href="${selectionUrl}" target="_blank" rel="noopener noreferrer">Страница подборки</a>
                    <form class="criteria-action-form" method="post" action="/partner/admin/clients/${client.id}/search-criteria/${sc.id}/restore">
                      <button type="submit" class="criteria-restore-btn">Вернуть</button>
                    </form>
                    <form class="criteria-action-form" method="post" action="/partner/admin/clients/${client.id}/search-criteria/${sc.id}/destroy">
                      <button type="submit" class="criteria-destroy-btn" onclick="return confirm('Удалить критерий навсегда?');">Удалить навсегда</button>
                    </form>
                  </div>
                </li>
              `;
            })
            .join('')}
        </ul>`;
  const activeCount = activeCriteria.length;
  const deletedCount = deletedCriteria.length;
  let foundCarsTotal = 0;
  activeCriteria.forEach((sc) => {
    foundCarsTotal += CriterionFoundCar.findByCriterion(sc.id).length;
  });
  return { activeHtml, deletedHtml, activeCount, deletedCount, foundCarsTotal };
}

/** Общие стили шапки кабинета */
const adminHeaderStyles = `
  .admin-header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid #e5e7eb;
    width: 100%;
    max-width: 100vw;
    min-width: 0;
  }
  .admin-header-inner {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    box-sizing: border-box;
  }
  .admin-header-inner .title { min-width: 0; }
  .admin-header-inner .title h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: #111827; }
  .admin-header-inner .title p { margin: 2px 0 0; font-size: 12px; color: #6b7280; }
  .admin-header-actions { display: flex; align-items: center; flex-shrink: 0; }
  .logout-form { margin: 0; }
  .logout-form button {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #374151;
    font-size: 13px;
    cursor: pointer;
  }
  .logout-form button:hover { background: #f9fafb; color: #111827; }
  @media (max-width: 1023px) {
    .admin-header-inner { min-height: 52px; padding: 10px 16px; }
    .admin-header-inner .title h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  @media (max-width: 479px) {
    .admin-header-inner { padding: 8px 12px; }
  }
  @media (min-width: 768px) {
    .admin-header-inner { flex-direction: row; justify-content: space-between; align-items: center; padding: 14px 24px; min-height: 0; }
    .admin-header-inner .title h1 { font-size: 20px; white-space: normal; }
  }
`;

/** Шапка кабинета (название пригонщика + Выйти) */
function adminHeaderHtml(partner) {
  return `
    <header class="admin-header" role="banner">
      <div class="admin-header-inner">
        <div class="title">
          <h1>${(partner.name || '').replace(/</g, '&lt;')}</h1>
          <p>Кабинет пригонщика • slug: ${(partner.slug || '').replace(/</g, '&lt;')}</p>
        </div>
        <div class="admin-header-actions">
          <form class="logout-form" method="post" action="/partner/logout">
            <button type="submit">Выйти</button>
          </form>
        </div>
      </div>
    </header>`;
}

/** Глобальная навигация кабинета: счётчики для бейджей */
function getCabinetNavCounts(partner) {
  const clients = Client.findByPartnerId(partner.id);
  const allCriteria = SearchCriteria.findByPartnerId(partner.id);
  const activeCriteria = allCriteria.filter((c) => !c.deleted_at);
  let foundCarsTotal = 0;
  activeCriteria.forEach((sc) => {
    foundCarsTotal += CriterionFoundCar.findByCriterion(sc.id).length;
  });
  return {
    clientsCount: clients.length,
    selectionsCount: allCriteria.length,
    carsCount: foundCarsTotal,
  };
}

/** Layout кабинета: шапка + левая глобальная навигация + правая рабочая зона. activeSection: 'clients' | 'selections' | 'cars' */
function buildCabinetLayout(partner, activeSection, contentHtml, opts = {}) {
  const { pageTitle = 'Кабинет пригонщика', extraStyles = '', extraScripts = '' } = opts;
  const counts = getCabinetNavCounts(partner);
  const navClientsClass = activeSection === 'clients' ? ' cabinet-nav-item--active' : '';
  const navSelectionsClass = activeSection === 'selections' ? ' cabinet-nav-item--active' : '';
  const navCarsClass = activeSection === 'cars' ? ' cabinet-nav-item--active' : '';
  const cabinetNavHtml = `
    <aside class="cabinet-nav" role="navigation" aria-label="Разделы кабинета">
      <nav class="cabinet-nav-list">
        <a href="/partner/admin" class="cabinet-nav-item${navClientsClass}">
          <span class="cabinet-nav-label">Клиенты</span>
          <span class="cabinet-nav-badge">${counts.clientsCount}</span>
        </a>
        <a href="/partner/admin/selections" class="cabinet-nav-item${navSelectionsClass}">
          <span class="cabinet-nav-label">Все подборки</span>
          <span class="cabinet-nav-badge">${counts.selectionsCount}</span>
        </a>
        <a href="/partner/admin/cars" class="cabinet-nav-item${navCarsClass}">
          <span class="cabinet-nav-label">Все авто</span>
          <span class="cabinet-nav-badge">${counts.carsCount}</span>
        </a>
      </nav>
    </aside>
    <div class="cabinet-main">
      ${contentHtml}
    </div>`;
  const cabinetStyles = `
    .cabinet-wrap { display: flex; flex-direction: column; min-height: 100vh; background: #f1f5f9; overflow-x: hidden; width: 100%; max-width: 100vw; min-width: 0; }
    .cabinet-body { display: flex; flex: 1; width: 100%; min-width: 0; max-width: 100%; }
    .cabinet-nav {
      width: 220px;
      min-width: 180px;
      flex-shrink: 0;
      background: #fff;
      border-right: 1px solid #e2e8f0;
      padding: 16px 12px;
      display: none;
    }
    .cabinet-nav-list { display: flex; flex-direction: column; gap: 2px; }
    .cabinet-nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-radius: 10px;
      color: #475569;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .cabinet-nav-item:hover { background: #f1f5f9; color: #0f172a; }
    .cabinet-nav-item--active { background: #eef2ff; color: #4f46e5; font-weight: 600; }
    .cabinet-nav-item--active:hover { background: #e0e7ff; color: #4f46e5; }
    .cabinet-nav-badge {
      font-size: 12px;
      font-weight: 500;
      min-width: 24px;
      text-align: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #64748b;
    }
    .cabinet-nav-item--active .cabinet-nav-badge { background: #c7d2fe; color: #4f46e5; }
    .cabinet-main { flex: 1; min-width: 0; overflow-x: hidden; width: 100%; max-width: 100%; }
    /* Мобильная навигация: по умолчанию видна на узких экранах и при увеличении масштаба */
    .cabinet-mobile-nav {
      display: flex;
      position: sticky;
      top: 57px;
      z-index: 25;
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      padding: 10px 16px;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .cabinet-mobile-nav a {
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      text-decoration: none;
      color: #475569;
      background: #f1f5f9;
      font-weight: 500;
      white-space: nowrap;
    }
    .cabinet-mobile-nav a:hover { background: #e2e8f0; }
    .cabinet-mobile-nav a.active { background: #eef2ff; color: #4f46e5; font-weight: 600; }
    /* Десктоп: левый сайдбар виден только при достаточной ширине */
    @media (min-width: 1024px) {
      .cabinet-nav { display: block; }
      .cabinet-mobile-nav { display: none !important; }
    }
    /* Узкий экран и увеличенный масштаб: сайдбар скрыт, контент на всю ширину */
    @media (max-width: 1023px) {
      .cabinet-nav { display: none; }
      .cabinet-body { overflow-x: hidden; width: 100%; }
    }
    @media (max-width: 767px) {
      .cabinet-mobile-nav { padding: 8px 12px; gap: 6px; }
      .cabinet-mobile-nav a { padding: 6px 12px; font-size: 12px; }
    }
  `;
  const mobileNavHtml = `
    <div class="cabinet-mobile-nav" aria-label="Разделы кабинета">
      <a href="/partner/admin" class="${activeSection === 'clients' ? 'active' : ''}">Клиенты (${counts.clientsCount})</a>
      <a href="/partner/admin/selections" class="${activeSection === 'selections' ? 'active' : ''}">Подборки (${counts.selectionsCount})</a>
      <a href="/partner/admin/cars" class="${activeSection === 'cars' ? 'active' : ''}">Авто (${counts.carsCount})</a>
    </div>`;
  return `
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${(pageTitle || 'Кабинет').replace(/</g, '&lt;')}</title>
        <style>
          * { box-sizing: border-box; }
          html { width: 100%; overflow-x: hidden; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; color: #0f172a; width: 100%; max-width: 100vw; min-width: 0; overflow-x: hidden; }
          ${adminHeaderStyles}
          ${cabinetStyles}
          ${extraStyles}
        </style>
      </head>
      <body class="cabinet-wrap">
        ${adminHeaderHtml(partner)}
        ${mobileNavHtml}
        <div class="cabinet-body">
          ${cabinetNavHtml}
        </div>
        ${extraScripts}
      </body>
    </html>`;
}

/** Профиль клиента в правой рабочей зоне: хлебные крошки, заголовок, компактные табы, контент. Без второго сайдбара. */
function buildClientProfileContent(partner, client, activeTab, contentHtml, counts) {
  const base = '/partner/admin/clients/' + client.id;
  const clientName = (client.name || 'Клиент').replace(/</g, '&lt;');
  const tabSelectionsClass = (activeTab === 'criteria' || activeTab === 'deleted') ? ' client-profile-tab--active' : '';
  const tabCarsClass = activeTab === 'cars' ? ' client-profile-tab--active' : '';
  const tabFinancesClass = activeTab === 'finances' ? ' client-profile-tab--active' : '';
  return `
  <div class="client-profile">
    <header class="client-profile-header">
      <nav class="client-profile-breadcrumb" aria-label="Навигация">
        <a href="/partner/admin">Клиенты</a>
        <span class="client-profile-breadcrumb-sep">/</span>
        <span class="client-profile-breadcrumb-current">${clientName}</span>
      </nav>
      <div class="client-profile-meta">
        <a href="/partner/admin" class="client-profile-back">← К списку клиентов</a>
        <h1 class="client-profile-name">${clientName}</h1>
        <p class="client-profile-id">ID: ${client.publicId || client.id}${client.notes ? ' · ' + String(client.notes).replace(/</g, '&lt;') : ''}</p>
        <a href="/p/${encodeURIComponent(partner.slug)}/c/${client.publicId || client.id}" class="client-profile-public" target="_blank" rel="noopener noreferrer">Публичная страница</a>
      </div>
    </header>
    <nav class="client-profile-tabs" aria-label="Разделы клиента">
      <a href="${base}" class="client-profile-tab${tabSelectionsClass}">Подборки клиента<span class="client-profile-tab-badge">${counts.activeCount}</span></a>
      <a href="${base}/found-cars" class="client-profile-tab${tabCarsClass}">Найденные авто<span class="client-profile-tab-badge">${counts.foundCarsTotal}</span></a>
      <a href="${base}/finances" class="client-profile-tab${tabFinancesClass}">Финансы</a>
    </nav>
    <div class="client-profile-content" role="main">
      ${contentHtml}
    </div>
  </div>`;
}

/** Стили профиля клиента в правой рабочей зоне (хедер, табы, контент) */
const clientProfileStyles = `
  .client-profile { box-sizing: border-box; width: 100%; max-width: 100%; padding: 24px 20px 32px; min-width: 0; }
  .client-profile-header { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; min-width: 0; }
  .client-profile-breadcrumb { font-size: 13px; color: #6b7280; margin-bottom: 12px; word-break: break-word; overflow-wrap: break-word; }
  .client-profile-breadcrumb a { color: #4f46e5; text-decoration: none; }
  .client-profile-breadcrumb a:hover { text-decoration: underline; }
  .client-profile-breadcrumb-sep { margin: 0 6px; color: #9ca3af; }
  .client-profile-breadcrumb-current { color: #111827; font-weight: 500; }
  .client-profile-meta { min-width: 0; }
  .client-profile-back { display: inline-block; font-size: 13px; color: #4f46e5; text-decoration: none; margin-bottom: 8px; }
  .client-profile-back:hover { text-decoration: underline; }
  .client-profile-name { margin: 0 0 4px; font-size: 22px; font-weight: 600; color: #111827; letter-spacing: -0.02em; word-break: break-word; overflow-wrap: break-word; }
  .client-profile-id { margin: 0 0 10px; font-size: 13px; color: #6b7280; word-break: break-word; }
  .client-profile-public { font-size: 13px; color: #2563eb; text-decoration: none; }
  .client-profile-public:hover { text-decoration: underline; }
  .client-profile-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; min-width: 0; }
  .client-profile-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    background: #f3f4f6;
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .client-profile-tab:hover { background: #e5e7eb; color: #111827; }
  .client-profile-tab--active { background: #eef2ff; color: #4f46e5; font-weight: 600; }
  .client-profile-tab--active:hover { background: #e0e7ff; color: #4f46e5; }
  .client-profile-tab-badge {
    font-size: 12px;
    font-weight: 500;
    min-width: 20px;
    text-align: center;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(0,0,0,0.08);
    color: inherit;
  }
  .client-profile-tab--active .client-profile-tab-badge { background: #c7d2fe; color: #4f46e5; }
  .client-profile-content { min-width: 0; width: 100%; box-sizing: border-box; }
  .client-profile-content .card { max-width: none; width: 100%; box-sizing: border-box; }
  @media (max-width: 1023px) {
    .client-profile { padding: 20px 12px 24px; }
    .client-profile-tabs { margin-bottom: 16px; position: sticky; top: 106px; z-index: 20; background: #f1f5f9; padding: 10px 0 12px; margin-left: -12px; margin-right: -12px; padding-left: 12px; padding-right: 12px; }
    .client-profile-name { font-size: 18px; }
  }
  @media (max-width: 767px) {
    .client-profile { padding: 16px 10px 20px; }
    .client-profile-name { font-size: 17px; }
    .client-profile-tab { padding: 6px 12px; font-size: 13px; }
    .client-profile-tabs { margin-left: -10px; margin-right: -10px; padding-left: 10px; padding-right: 10px; }
  }
  @media (max-width: 479px) {
    .client-profile { padding: 14px 8px 16px; }
    .client-profile-tabs { margin-left: -8px; margin-right: -8px; padding-left: 8px; padding-right: 8px; }
    .client-profile-tab { padding: 6px 10px; font-size: 12px; }
    .client-profile-tab-badge { min-width: 18px; padding: 2px 4px; font-size: 11px; }
  }
`;

/** Layout профиля клиента: одна левая панель кабинета + правая зона с профилем (табы + контент). */
function buildClientProfileLayout(partner, client, activeTab, contentHtml, opts = {}) {
  const { pageTitle = '', extraStyles = '', extraScripts = '' } = opts;
  const counts = buildClientCriteriaHtml(partner, client);
  const profileHtml = buildClientProfileContent(partner, client, activeTab, contentHtml, counts);
  return buildCabinetLayout(partner, 'clients', profileHtml, {
    pageTitle: (pageTitle || '') + (client.name ? ' — ' + client.name : ''),
    extraStyles: clientProfileStyles + extraStyles,
    extraScripts,
  });
}

// Страница логина партнёра
router.get('/partner/login', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.partnerId) {
    return res.redirect('/partner/admin');
  }

  const error = req.query.error;

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Вход в кабинет пригонщика</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            margin: 0;
            min-height: 100vh;
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
              radial-gradient(circle at top left, rgba(79,70,229,0.08), transparent 55%),
              radial-gradient(circle at bottom right, rgba(14,165,233,0.08), transparent 55%),
              #f3f4f6;
          }
          .card {
            background: #ffffff;
            padding: 28px 22px;
            border-radius: 18px;
            box-shadow:
              0 18px 40px rgba(15,23,42,0.15),
              0 0 0 1px rgba(148,163,184,0.18);
            width: 100%;
            max-width: 380px;
          }
          h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.03em; color: #0f172a; }
          p { margin: 0 0 18px; color: #6b7280; font-size: 14px; }
          label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 14px; }
          input[type="text"], input[type="password"] {
            padding: 11px 12px;
            border-radius: 10px;
            border: 1px solid #d1d5db;
            background: #f9fafb;
            font: inherit;
            font-size: 15px;
            transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
          }
          input[type="text"]:focus,
          input[type="password"]:focus {
            outline: none;
            border-color: #4f46e5;
            box-shadow: 0 0 0 1px rgba(79,70,229,0.4);
            background: #ffffff;
          }
          button {
            width: 100%;
            margin-top: 10px;
            padding: 13px 16px;
            border-radius: 999px;
            border: none;
            background: linear-gradient(90deg, #4f46e5, #0ea5e9);
            color: white;
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            min-height: 48px;
            box-shadow: 0 10px 25px rgba(15,23,42,0.18);
            transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
          }
          button:hover { filter: brightness(1.04); transform: translateY(-1px); box-shadow: 0 14px 30px rgba(15,23,42,0.22); }
          button:active { transform: translateY(0); box-shadow: 0 8px 18px rgba(15,23,42,0.18); }
          .error {
            background: #fef2f2;
            color: #b91c1c;
            padding: 10px 12px;
            border-radius: 10px;
            font-size: 13px;
            margin-bottom: 12px;
            border: 1px solid #fecaca;
          }
          @media (min-width: 768px) {
            .card { padding: 32px 28px; }
            h1 { font-size: 24px; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Вход в кабинет пригонщика</h1>
          <p>Войдите по логину и паролю, которые вы получили от платформы.</p>
          ${error ? `<div class="error">${error}</div>` : ''}
          <form method="post" action="/partner/login">
            <label>
              Логин
              <input type="text" name="login" autocomplete="username" required />
            </label>
            <label>
              Пароль
              <input type="password" name="password" autocomplete="current-password" required />
            </label>
            <button type="submit">Войти</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

router.post('/partner/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    return res.redirect('/partner/login?error=' + encodeURIComponent('Введите логин и пароль'));
  }

  const row = db
    .prepare(
      `
      SELECT pc.partner_id, pc.password_hash
      FROM partner_credentials pc
      WHERE pc.login = ?
    `
    )
    .get(login);

  if (!row) {
    return res.redirect('/partner/login?error=' + encodeURIComponent('Неверный логин или пароль'));
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return res.redirect('/partner/login?error=' + encodeURIComponent('Неверный логин или пароль'));
  }

  setPartnerCookie(res, row.partner_id);
  return res.redirect('/partner/admin');
});

router.post('/partner/logout', (req, res) => {
  clearPartnerCookie(res);
  res.redirect('/partner/login');
});

/** Стили страницы «Клиенты» (список + добавление через модалку + поиск) */
const adminClientsPageStyles = `
  .cabinet-page-main { max-width: 1240px; margin: 20px auto 32px; padding: 0 20px; }
  .page-section-title { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
  .page-section-subtitle { margin: 0; font-size: 13px; color: #6b7280; }
  .card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #e5e7eb; margin-bottom: 18px; }

  .create-client { padding: 12px 16px; }
  .create-client-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .create-client-header-main {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .create-client-header-main .page-section-title { margin-right: 4px; }
  .create-client-header-main .page-section-subtitle { margin: 0; font-size: 12px; color: #9ca3af; }
  .client-add-open-btn {
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(90deg, #10b981, #22c55e);
    color: #ffffff;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .client-add-open-btn:hover { filter: brightness(1.03); }

  .client-search {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .client-search input {
    flex: 1 1 200px;
    min-width: 0;
    padding: 9px 11px;
    border-radius: 10px;
    border: 1px solid #d1d5db;
    font: inherit;
    font-size: 14px;
    height: 40px;
    box-sizing: border-box;
  }
  .client-search button {
    padding: 9px 14px;
    border-radius: 10px;
    border: none;
    background: #e5e7eb;
    color: #374151;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .client-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .client-list-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    background: #fff;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .client-list-link:hover { border-color: #c7d2fe; box-shadow: 0 4px 12px rgba(79,70,229,0.08); }
  .client-list-name { font-weight: 600; font-size: 16px; color: #111827; flex: 1; min-width: 0; }
  .client-list-meta { font-size: 13px; color: #6b7280; }
  .client-list-arrow { font-size: 18px; color: #9ca3af; flex-shrink: 0; }
  .client-list-empty { color: #6b7280; font-size: 14px; padding: 24px 0; margin: 0; }

  .pagination {
    margin: 16px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: flex-end;
    font-size: 12px;
    color: #6b7280;
  }
  .pagination-info { margin-right: 8px; }
  .pagination a,
  .pagination .page-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    padding: 4px 8px;
    border-radius: 999px;
    text-decoration: none;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #4b5563;
  }
  .pagination a:hover { background: #f3f4f6; }
  .pagination .page-btn-current {
    background: #4f46e5;
    color: #fff;
    border-color: #4f46e5;
    font-weight: 600;
  }

  /* Модалка добавления клиента */
  .client-add-modal-backdrop[hidden] { display: none !important; }
  .client-add-modal-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15,23,42,0.45);
    z-index: 70;
    overflow-y: auto;
  }
  .client-add-modal {
    background: #ffffff;
    border-radius: 16px;
    padding: 20px 20px 18px;
    max-width: 420px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow:
      0 18px 40px rgba(15,23,42,0.18),
      0 0 0 1px rgba(148,163,184,0.18);
  }
  .client-add-modal h3 {
    margin: 0 0 8px;
    font-size: 18px;
    letter-spacing: -0.02em;
  }
  .client-add-modal-desc {
    margin: 0 0 12px;
    font-size: 13px;
    color: #6b7280;
  }
  .client-add-form-modal {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  .client-add-form-modal input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #d1d5db;
    font: inherit;
    font-size: 15px;
    background: #f9fafb;
  }
  .client-add-modal-actions {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .client-add-cancel-btn {
    padding: 9px 14px;
    border-radius: 999px;
    border: none;
    background: #e5e7eb;
    color: #374151;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .client-add-cancel-btn:hover { background: #d1d5db; }
  .client-add-submit-btn {
    padding: 9px 16px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(90deg, #10b981, #22c55e);
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }
  .client-add-submit-btn:hover { filter: brightness(1.03); }

  @media (min-width: 768px) {
    .client-add-form-modal input { font-size: 14px; }
  }
  @media (max-width: 599px) {
    .cabinet-page-main { padding: 0 12px 24px; }
    .create-client { padding: 10px 12px; }
    .create-client-header { flex-wrap: wrap; }
    .create-client-header-main { flex: 1 1 auto; min-width: 0; }
    .client-filter .card { padding: 12px; }
    .client-list-link { padding: 12px 14px; flex-wrap: wrap; gap: 8px; }
    .client-list-name { overflow: hidden; text-overflow: ellipsis; }
    .pagination { justify-content: flex-start; }
  }
  @media (max-width: 480px) {
    .client-search { flex-direction: column; }
    .client-search input { min-width: 0; width: 100%; flex: 0 0 auto; height: 40px; min-height: 40px; }
    .client-add-modal-backdrop { padding: 12px; align-items: flex-start; padding-top: 24px; }
    .client-add-modal { padding: 16px; max-height: 85vh; }
  }
`;

// Кабинет партнёра — раздел «Клиенты» (список клиентов, выбор клиента открывает его workspace)
router.get('/partner/admin', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const allClients = Client.findByPartnerId(partner.id);
  const rawQuery = (req.query.q || '').trim();
  const q = rawQuery.toLowerCase();

  let filteredClients = allClients;
  if (q) {
    filteredClients = allClients.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const idStr = String(c.publicId || c.id || '');
      return name.includes(q) || idStr.includes(q);
    });
  }

  const pageSize = 10;
  const pageRaw = parseInt(req.query.page, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const total = filteredClients.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;
  const clients = filteredClients.slice(offset, offset + pageSize);

  const clientListHtml =
    clients.length === 0
      ? '<p class="client-list-empty">У вас пока нет клиентов. Добавьте первого выше.</p>'
      : `<ul class="client-list">
          ${clients
            .map(
              (c) => `
            <li class="client-list-item">
              <a href="/partner/admin/clients/${c.id}" class="client-list-link">
                <span class="client-list-name">${(c.name || '').replace(/</g, '&lt;')}</span>
                <span class="client-list-meta">ID: ${c.publicId || c.id}${c.notes ? ' · ' + String(c.notes).replace(/</g, '&lt;') : ''}</span>
                <span class="client-list-arrow">→</span>
              </a>
            </li>`
            )
            .join('')}
        </ul>`;

  const paginationHtml =
    pages > 1
      ? `<div class="pagination">
          <span class="pagination-info">Страница ${safePage} из ${pages}</span>
          ${Array.from({ length: pages })
            .map((_, i) => {
              const p = i + 1;
              const qs = [];
              if (rawQuery) qs.push('q=' + encodeURIComponent(rawQuery));
              if (p !== 1) qs.push('page=' + p);
              const href = '/partner/admin' + (qs.length ? '?' + qs.join('&') : '');
              if (p === safePage) return '<span class="page-btn page-btn-current">' + p + '</span>';
              return '<a class="page-btn" href="' + href + '">' + p + '</a>';
            })
            .join('')}
        </div>`
      : '';

  const contentHtml = `
    <main class="cabinet-page-main">
      <section class="card create-client">
        <div class="create-client-header">
          <div class="create-client-header-main">
            <h2 class="page-section-title">Клиенты</h2>
          </div>
          <button type="button" class="client-add-open-btn">Добавить клиента</button>
        </div>
      </section>
      <section class="card client-filter">
        <form method="get" action="/partner/admin" class="client-search">
          <input type="text" name="q" placeholder="Поиск по имени или ID клиента" value="${(rawQuery || '').replace(/"/g, '&quot;')}" />
        </form>
      </section>

      <div class="client-add-modal-backdrop" id="clientAddModal" hidden>
        <div class="client-add-modal" role="dialog" aria-modal="true" aria-labelledby="clientAddTitle">
          <h3 id="clientAddTitle">Новый клиент</h3>
          <p class="client-add-modal-desc">Укажите имя клиента и примечание (только для вас).</p>
          <form method="post" action="/partner/admin/clients" class="client-add-form-modal">
            <input type="text" name="name" placeholder="Имя клиента" required />
            <input type="text" name="notes" placeholder="Примечание по клиенту (для себя)" />
            <div class="client-add-modal-actions">
              <button type="button" class="client-add-cancel-btn">Отмена</button>
              <button type="submit" class="client-add-submit-btn">Создать клиента</button>
            </div>
          </form>
        </div>
      </div>

      <div id="client-list-container">${clientListHtml}${paginationHtml}</div>
    </main>`;

  const isPartial = req.get('X-Requested-With') === 'XMLHttpRequest';
  if (isPartial) {
    return res.type('html').send(clientListHtml + paginationHtml);
  }

  const addClientModalScript = `
    <script>
      (function() {
        var openBtn = document.querySelector('.client-add-open-btn');
        var backdrop = document.getElementById('clientAddModal');
        if (openBtn && backdrop) {
          var cancelBtn = backdrop.querySelector('.client-add-cancel-btn');
          function openModal() { backdrop.removeAttribute('hidden'); }
          function closeModal() { backdrop.setAttribute('hidden', 'hidden'); }
          openBtn.addEventListener('click', openModal);
          if (cancelBtn) cancelBtn.addEventListener('click', function(e) { e.preventDefault(); closeModal(); });
          backdrop.addEventListener('click', function(e) { if (e.target === backdrop) closeModal(); });
          document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !backdrop.hasAttribute('hidden')) closeModal(); });
        }
        var filterForm = document.querySelector('.client-filter form[action="/partner/admin"]');
        var filterInput = filterForm && filterForm.querySelector('input[name="q"]');
        var listContainer = document.getElementById('client-list-container');
        if (filterForm && filterInput && listContainer) {
          var debounceMs = 350;
          var debounceTimer;
          function updateList() {
            var q = filterInput.value.trim();
            var url = '/partner/admin?page=1' + (q ? '&q=' + encodeURIComponent(q) : '');
            fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
              .then(function(r) { return r.text(); })
              .then(function(html) { listContainer.innerHTML = html; });
          }
          filterForm.addEventListener('submit', function(e) { e.preventDefault(); updateList(); });
          filterInput.addEventListener('input', function() {
            clearTimeout(debounceTimer);
            if (filterInput.value.trim() === '') {
              updateList();
              return;
            }
            debounceTimer = setTimeout(updateList, debounceMs);
          });
        }
      })();
    </script>
  `;

  res.send(
    buildCabinetLayout(partner, 'clients', contentHtml, {
      pageTitle: 'Клиенты',
      extraStyles: adminClientsPageStyles,
      extraScripts: addClientModalScript,
    })
  );
});

// Раздел «Подборки (все)» — глобальный список подборок по всем клиентам
router.get('/partner/admin/selections', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const allCriteria = SearchCriteria.findByPartnerId(partner.id);
  const clientsById = {};
  Client.findByPartnerId(partner.id).forEach((c) => {
    clientsById[c.id] = c;
  });
  const rawQuery = (req.query.q || '').trim().toLowerCase();
  let criteria = allCriteria;
  if (rawQuery) {
    criteria = criteria.filter((sc) => {
      const client = clientsById[sc.client_id];
      const name = (sc.name || '').toLowerCase();
      const clientName = (client && client.name || '').toLowerCase();
      const idStr = String(sc.public_id || sc.id || '');
      return name.includes(rawQuery) || clientName.includes(rawQuery) || idStr.includes(rawQuery);
    });
  }
  const listHtml =
    criteria.length === 0
      ? '<p class="empty">Подборок пока нет. Добавьте критерии в разделе «Клиенты».</p>'
      : `<div class="selection-cards-list">
          ${criteria
            .map((sc) => {
              const client = clientsById[sc.client_id];
              return buildSelectionCardHtml(partner, sc, client, { showClientName: false });
            })
            .join('')}
        </div>`;
  const contentHtml = `
    <main class="cabinet-page-main">
      <section class="card">
        <h2 class="content-title">Подборки (все)</h2>
        <p class="page-section-subtitle">Все подборки по всем клиентам. Фильтрация и повторное использование — в разработке.</p>
        <form method="get" action="/partner/admin/selections" class="client-search" style="margin-bottom:16px;">
          <input type="text" name="q" placeholder="Поиск по названию, клиенту или ID" value="${(req.query.q || '').replace(/"/g, '&quot;')}" />
          <button type="submit">Найти</button>
        </form>
        ${listHtml}
      </section>
    </main>`;
  const selectionsPageStyles = `
    /* Карточки подборок — такие же, как в профиле клиента */
    .selection-cards-list { display: flex; flex-direction: column; gap: 10px; list-style: none; padding: 0; margin: 0; }
    .selection-card { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
    .selection-card:hover { border-color: #c7d2fe; box-shadow: 0 4px 12px rgba(79,70,229,0.08); }
    .selection-card-main { flex: 1; min-width: 0; }
    .selection-card-header { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; margin-bottom: 4px; min-width: 0; }
    .selection-card-name {
      font-size: 15px;
      color: #111827;
      margin: 0;
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .selection-card-id { font-size: 12px; color: #6b7280; font-weight: 500; }
    .selection-card-meta { display: block; margin-bottom: 8px; font-size: 13px; color: #6b7280; }
    .selection-card-source { font-size: 12px; color: #9ca3af; }
    .selection-card-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
    .selection-card-site-link { margin-left: 8px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; text-decoration: none; background: #eef2ff; color: #4f46e5; white-space: nowrap; }
    .selection-card-site-link:hover { background: #e0e7ff; }
    .selection-card-found { margin: 0; font-size: 12px; color: #9ca3af; }
    .selection-card-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex-shrink: 0; margin-top: 4px; }
    .selection-card-btn { display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 500; text-decoration: none; border: none; cursor: pointer; font-family: inherit; white-space: nowrap; }
    .selection-card-btn-found { background: #ecfdf5; color: #047857; }
    .selection-card-btn-found:hover { background: #d1fae5; }
    .selection-card-btn-url { background: #f3f4f6; color: #374151; }
    .selection-card-btn-url:hover { background: #e5e7eb; }
    .selection-card-btn-url-inline { padding: 4px 10px; font-size: 12px; }
    .selection-card-btn-public { background: #eef2ff; color: #4f46e5; }
    .selection-card-btn-public:hover { background: #e0e7ff; }
    .selection-card-btn-disabled { opacity: 0.6; cursor: default; }
    .selection-card-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; border: none; cursor: pointer; font-size: 16px; background: #e5e7eb; color: #6b7280; }
    .selection-card-icon-btn-edit:hover { background: #d1d5db; }
    .selection-card-icon-btn-delete { background: #fef2f2; color: #b91c1c; }
    .selection-card-icon-btn-delete:hover { background: #fee2e2; }
    @media (max-width: 767px) {
      .selection-card { flex-direction: column; align-items: stretch; }
      .selection-card-header { flex-wrap: wrap; align-items: flex-start; }
      .selection-card-actions { margin-top: 8px; }
      .selection-card-btn-found { width: 100%; justify-content: center; }
    }
    /* Доп. элементы для страницы «Все подборки» */
    .selection-card-client { display: block; margin-top: 2px; font-size: 13px; color: #6b7280; }
    .selection-card--deleted { opacity: 0.85; border-style: dashed; }
    .pill-deleted { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #fef2f2; color: #b91c1c; }
  `;
  res.send(
    buildCabinetLayout(partner, 'selections', contentHtml, {
      pageTitle: 'Подборки (все)',
      extraStyles: adminClientsPageStyles + clientProfileStyles + selectionsPageStyles,
    })
  );
});

// Раздел «Все авто» — тот же интерфейс, что и «Найденные авто» клиента: вкладки, фильтры, таблица/карточки, пагинация
router.get('/partner/admin/cars', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const foundCars = CriterionFoundCar.findByPartnerId(partner.id);
  const basePlatformUrl = '/p/' + encodeURIComponent(partner.slug) + '/cars/';
  const selectionUrlBase = '/p/' + encodeURIComponent(partner.slug) + '/selection/';

  const criteriaList = SearchCriteria.findByPartnerId(partner.id);
  const criteriaById = {};
  criteriaList.forEach((sc) => {
    criteriaById[sc.id] = sc;
  });

  const allRows = [];
  foundCars.forEach((fc) => {
    const sc = criteriaById[fc.search_criteria_id];
    const criterionName = (fc.criterion_name || 'Подборка ' + (sc && (sc.public_id || sc.id))).replace(/</g, '&lt;');
    const country = (sc && (sc.country || '').toLowerCase()) || '';
    const car = fc.car_id ? Car.findById(fc.car_id) : null;
    const title = car ? (car.title || 'Без названия') : (fc.source_url ? 'Ссылка на источник' : '—');
    const desc = car && car.description ? String(car.description).replace(/\s+/g, ' ').trim().slice(0, 80) + (car.description.length > 80 ? '…' : '') : '';
    const firstImg = car ? getFirstImageUrl(car.images_json) : null;
    const onPlatform = !!fc.car_id;
    allRows.push({
      fc,
      criterion: { name: criterionName, publicId: sc ? sc.public_id || sc.id : '', id: fc.search_criteria_id, country },
      clientName: (fc.client_name || '—').replace(/</g, '&lt;'),
      title: title.replace(/</g, '&lt;'),
      desc: desc.replace(/</g, '&lt;'),
      firstImg,
      onPlatform,
      carPublicId: car && car.public_id != null ? car.public_id : null,
      imagesJson: car && car.images_json ? car.images_json : null,
    });
  });
  allRows.sort((a, b) => b.fc.id - a.fc.id);

  const selectionNamesByCar = new Map();
  allRows.forEach((r) => {
    const key = r.fc.car_id != null ? 'car:' + r.fc.car_id : 'url:' + (r.fc.source_url || 'fc-' + r.fc.id);
    if (!selectionNamesByCar.has(key)) selectionNamesByCar.set(key, new Set());
    selectionNamesByCar.get(key).add(r.criterion.name);
  });
  allRows.forEach((r) => {
    const key = r.fc.car_id != null ? 'car:' + r.fc.car_id : 'url:' + (r.fc.source_url || 'fc-' + r.fc.id);
    r.allSelectionNames = Array.from(selectionNamesByCar.get(key) || []);
  });

  if (allRows.length === 0) {
    const contentHtml = `
      <main class="cabinet-page-main">
        <section class="card">
          <h2 class="content-title">Все авто</h2>
          <p class="empty">Найденных авто пока нет. Добавьте подборки и ссылки на авто в разделе «Клиенты».</p>
        </section>
      </main>`;
    return res.send(
      buildCabinetLayout(partner, 'cars', contentHtml, {
        pageTitle: 'Все авто',
        extraStyles: adminClientsPageStyles + workspaceContentStyles,
      })
    );
  }

  const q = req.query;
  const filterTab = ['published', 'moderation', 'deleted'].includes(q.tab) ? q.tab : 'published';
  const filterCountry = (q.country || '').trim().toLowerCase();
  const filterSelection = q.selection ? Number(q.selection) : null;
  const filterClient = q.client ? Number(q.client) : null;
  const filterSource = (q.source || '').trim().toLowerCase();
  const filterSearch = (q.search || '').trim().toLowerCase();

  let filtered = allRows.filter((r) => (r.fc.status || 'published') === filterTab);
  if (filterCountry) filtered = filtered.filter((r) => r.criterion.country === filterCountry);
  if (Number.isInteger(filterSelection) && filterSelection > 0) filtered = filtered.filter((r) => r.criterion.id === filterSelection);
  if (Number.isInteger(filterClient) && filterClient > 0) filtered = filtered.filter((r) => r.fc.client_id === filterClient);
  if (filterSource) filtered = filtered.filter((r) => (r.fc.source_url || '').toLowerCase().includes(filterSource));
  if (filterSearch) {
    filtered = filtered.filter(
      (r) =>
        r.title.toLowerCase().includes(filterSearch) ||
        (r.desc && r.desc.toLowerCase().includes(filterSearch)) ||
        String(r.fc.id).includes(filterSearch) ||
        (r.carPublicId != null && String(r.carPublicId).includes(filterSearch)) ||
        (r.clientName && r.clientName.toLowerCase().includes(filterSearch))
    );
  }

  const tabCounts = { published: 0, moderation: 0, deleted: 0 };
  allRows.forEach((r) => {
    const s = r.fc.status || 'published';
    if (tabCounts[s] !== undefined) tabCounts[s]++;
  });

  const total = filtered.length;
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 20, 5), 100);
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const pageRows = filtered.slice(offset, offset + limit);

  const buildQuery = (overrides) => {
    const o = { ...q, ...overrides };
    if (o.page === 1) delete o.page;
    return Object.entries(o)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
      .join('&');
  };
  const selectionOptions = criteriaList.map((sc) => ({
    id: sc.id,
    name: (sc.name || 'Подборка ' + (sc.public_id || sc.id)).replace(/</g, '&lt;'),
    country: (sc.country || '').toLowerCase(),
  }));
  const countries = [...new Set(selectionOptions.map((s) => s.country).filter(Boolean))].sort();
  const clientOptions = Client.findByPartnerId(partner.id).map((c) => ({
    id: c.id,
    name: (c.name || '—').replace(/</g, '&lt;'),
  }));

  const tabsHtml = `
    <nav class="fc-tabs" aria-label="Вкладки статусов">
      <a href="?${buildQuery({ tab: 'published', page: 1 })}" class="fc-tab ${filterTab === 'published' ? 'fc-tab-active' : ''}" data-tab="published">Опубликованные<span class="fc-tab-badge">${tabCounts.published}</span></a>
      <a href="?${buildQuery({ tab: 'moderation', page: 1 })}" class="fc-tab ${filterTab === 'moderation' ? 'fc-tab-active' : ''}" data-tab="moderation">На модерации<span class="fc-tab-badge">${tabCounts.moderation}</span></a>
      <a href="?${buildQuery({ tab: 'deleted', page: 1 })}" class="fc-tab ${filterTab === 'deleted' ? 'fc-tab-active' : ''}" data-tab="deleted">Удалённые<span class="fc-tab-badge">${tabCounts.deleted}</span></a>
    </nav>`;

  const filtersHtml = `
    <form id="fc-filters-cars" method="get" action="/partner/admin/cars" class="fc-filters">
      <input type="hidden" name="tab" value="${filterTab.replace(/"/g, '&quot;')}" />
      <input type="hidden" name="page" value="1" />
      <div class="fc-filter-field fc-filter-field-search-wide">
        <input
          type="text"
          name="search"
          class="fc-filter-search"
          placeholder="Поиск по марке, модели, ID или клиенту"
          aria-label="Поиск по марке, модели, ID или клиенту"
          value="${(q.search || '').replace(/"/g, '&quot;')}"
        />
      </div>
      <div class="fc-filters-row">
        <div class="fc-filter-field">
          <label>Страна</label>
          <select name="country">
            <option value="">Все</option>
            ${countries.map((c) => `<option value="${c}" ${filterCountry === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="fc-filter-field">
          <label>Подборка</label>
          <select name="selection">
            <option value="">Все</option>
            ${selectionOptions.map((s) => `<option value="${s.id}" ${filterSelection === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="fc-filter-field">
          <label>Клиент</label>
          <select name="client">
            <option value="">Все</option>
            ${clientOptions.map((c) => `<option value="${c.id}" ${filterClient === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="fc-filter-field">
          <label>Источник</label>
          <input type="text" name="source" placeholder="URL или сайт" value="${(q.source || '').replace(/"/g, '&quot;')}" />
        </div>
        <button type="button" class="fc-filter-reset" title="Сбросить фильтры">Сбросить</button>
      </div>
    </form>`;

  const deleteUrl = (r) => `/partner/admin/clients/${r.fc.client_id}/search-criteria/${r.criterion.id}/found-cars/${r.fc.id}/delete`;
  const destroyUrl = (r) => `/partner/admin/clients/${r.fc.client_id}/search-criteria/${r.criterion.id}/found-cars/${r.fc.id}/destroy`;
  const platformPageUrl = (r) => (r.carPublicId ? basePlatformUrl + r.carPublicId : '');
  const isDeletedTab = filterTab === 'deleted';

  const tableRowsHtml = pageRows
    .map((r) => {
      const sourceUrlSafe = (r.fc.source_url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const thumbHtml = r.firstImg
        ? `<img src="${r.firstImg.replace(/"/g, '&quot;')}" alt="" class="fc-thumb" data-fc-photo="${r.firstImg.replace(/"/g, '&quot;')}" data-fc-images="${(r.imagesJson || '').replace(/"/g, '&quot;')}" loading="lazy" />`
        : `<span class="fc-thumb-placeholder" data-fc-photo="" data-fc-images="">Нет фото</span>`;
      const statusBadge = r.onPlatform ? '<span class="fc-badge fc-badge-platform">На платформе</span>' : '<span class="fc-badge fc-badge-not">Не добавлено</span>';
      const photoCell = r.onPlatform
        ? `<a href="${platformPageUrl(r)}" class="fc-cell-link" target="_blank" rel="noopener noreferrer">${thumbHtml}</a>`
        : thumbHtml;
      const titleBlock = r.onPlatform
        ? `<a href="${platformPageUrl(r)}" class="fc-auto-title-link" target="_blank" rel="noopener noreferrer">${r.title}</a> ${statusBadge}`
        : `${r.title} ${statusBadge}`;
      const sourceCell = r.fc.source_url
        ? `<a href="${sourceUrlSafe}" class="fc-link-arrow" target="_blank" rel="noopener noreferrer" title="Источник">↗</a>`
        : '<span class="fc-link-arrow disabled">—</span>';
      const publicCell = r.onPlatform
        ? `<a href="${platformPageUrl(r)}" class="fc-link-arrow" target="_blank" rel="noopener noreferrer" title="На сайте">↗</a>`
        : '<span class="fc-link-arrow disabled">—</span>';
      const actionsCell = isDeletedTab
        ? `<form method="post" action="${destroyUrl(r)}" class="fc-action-form" data-fc-confirm-type="destroy"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-destroy" title="Удалить навсегда" aria-label="Удалить навсегда">&#128465;</button></form>`
        : `<a href="/partner/admin/clients/${r.fc.client_id}/search-criteria/${r.criterion.id}/cars" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-edit" title="К подборке" aria-label="К подборке">&#9998;</a><form method="post" action="${deleteUrl(r)}" class="fc-action-form" data-fc-confirm-type="soft"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-delete" title="Удалить (вкладка Удалённые)" aria-label="Удалить">&#128465;</button></form>`;
      const selectionTitle = (r.allSelectionNames || [r.criterion.name]).concat(r.clientName ? ['Клиент: ' + r.clientName] : []).map((n) => String(n || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')).join('\n');
      return `
        <tr>
          <td class="fc-col-photo">${photoCell}</td>
          <td class="fc-col-auto">
            <p class="fc-auto-title">${titleBlock}</p>
            ${r.desc ? `<p class="fc-auto-desc">${r.desc}</p>` : ''}
            <p class="fc-auto-id">ID: ${r.onPlatform && r.carPublicId != null ? r.carPublicId : r.fc.id}</p>
          </td>
          <td class="fc-col-selection"><span class="fc-badge fc-badge-country pill-${r.criterion.country || 'default'}" title="${selectionTitle}">${r.criterion.name}</span></td>
          <td class="fc-col-source">${sourceCell}</td>
          <td class="fc-col-public">${publicCell}</td>
          <td class="fc-col-actions">${actionsCell}</td>
        </tr>`;
    })
    .join('');

  const tableHtml =
    pageRows.length === 0
      ? '<p class="empty fc-empty-desktop">Нет авто по выбранным фильтрам.</p>'
      : `
      <div class="fc-table-wrap">
        <table class="fc-table">
          <thead>
            <tr>
              <th class="fc-col-photo">Фото</th>
              <th class="fc-col-auto">Авто</th>
              <th class="fc-col-selection">Подборка</th>
              <th class="fc-col-source">Источник</th>
              <th class="fc-col-public">На сайте</th>
              <th class="fc-col-actions">Действия</th>
            </tr>
          </thead>
          <tbody>${tableRowsHtml}</tbody>
        </table>
      </div>`;

  const mobileCardsHtml = pageRows
    .map((r) => {
      const sourceUrlSafe = (r.fc.source_url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const thumbHtml = r.firstImg
        ? `<img src="${r.firstImg.replace(/"/g, '&quot;')}" alt="" width="80" height="80" style="border-radius:10px;object-fit:cover;" data-fc-photo="${r.firstImg.replace(/"/g, '&quot;')}" loading="lazy" />`
        : '<span class="fc-thumb-placeholder" style="width:80px;height:80px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ca3af;background:#e5e7eb;border-radius:10px;">Нет фото</span>';
      const thumbWrap = r.onPlatform ? `<a href="${platformPageUrl(r)}" class="fc-cell-link" target="_blank" rel="noopener noreferrer">${thumbHtml}</a>` : thumbHtml;
      const titleContent = r.onPlatform ? `<a href="${platformPageUrl(r)}" class="fc-auto-title-link" target="_blank" rel="noopener noreferrer">${r.title}</a>` : r.title;
      const sourceLink = r.fc.source_url ? `<a href="${sourceUrlSafe}" class="fc-link-arrow fc-mobile-link-btn" target="_blank" rel="noopener noreferrer">Источник</a>` : '<span class="fc-link-arrow fc-mobile-link-btn fc-mobile-link-btn-disabled">Источник</span>';
      const publicLink = r.onPlatform ? `<a href="${platformPageUrl(r)}" class="fc-link-arrow fc-mobile-link-btn" target="_blank" rel="noopener noreferrer">На сайте</a>` : '<span class="fc-link-arrow fc-mobile-link-btn fc-mobile-link-btn-disabled">На сайте</span>';
      const mobileActions = isDeletedTab
        ? `<form method="post" action="${destroyUrl(r)}" class="fc-action-form" data-fc-confirm-type="destroy"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-destroy" title="Удалить навсегда" aria-label="Удалить навсегда">&#128465;</button></form>`
        : `<a href="/partner/admin/clients/${r.fc.client_id}/search-criteria/${r.criterion.id}/cars" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-edit" title="К подборке" aria-label="К подборке">&#9998;</a><form method="post" action="${deleteUrl(r)}" class="fc-action-form" data-fc-confirm-type="soft"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-delete" title="Удалить">&#128465;</button></form>`;
      const metaText = r.clientName !== '—' ? `Клиент: ${r.clientName} · Подборка: ${r.criterion.name}` : `Подборка: ${r.criterion.name}`;
      return `
        <div class="fc-mobile-card">
          <div class="fc-mobile-card-top">
            <div class="fc-mobile-card-thumb">${thumbWrap}</div>
            <div class="fc-mobile-card-body">
              <p class="fc-mobile-card-title">${titleContent}</p>
              <p class="fc-mobile-card-meta" title="${metaText} · ID ${r.onPlatform && r.carPublicId != null ? r.carPublicId : r.fc.id}">
                ${metaText} · <span class="fc-mobile-card-meta-id">ID ${r.onPlatform && r.carPublicId != null ? r.carPublicId : r.fc.id}</span>
              </p>
              <div class="fc-mobile-card-links">
                ${sourceLink}
                ${publicLink}
              </div>
            </div>
          </div>
          <div class="fc-mobile-card-actions">${mobileActions}</div>
        </div>`;
    })
    .join('');

  const paginationHtml =
    totalPages <= 1
      ? ''
      : `
    <div class="fc-pagination">
      <span>Авто: ${offset + 1}–${Math.min(offset + limit, total)} из ${total}</span>
      ${safePage > 1 ? `<a href="?${buildQuery({ page: safePage - 1 })}">←</a>` : ''}
      ${Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === totalPages || (p >= safePage - 2 && p <= safePage + 2))
        .map((p, idx, arr) => {
          if (idx > 0 && arr[idx - 1] !== p - 1) return ['…', p];
          return [p];
        })
        .flat()
        .map((p) => (p === '…' ? '<span>…</span>' : p === safePage ? `<span class="fc-page-current">${p}</span>` : `<a href="?${buildQuery({ page: p })}">${p}</a>`))
        .join('')}
      ${safePage < totalPages ? `<a href="?${buildQuery({ page: safePage + 1 })}">→</a>` : ''}
    </div>`;

  const listContentHtml = tableHtml + `<div class="fc-mobile-cards">${pageRows.length === 0 ? '<p class="empty fc-empty-mobile">Нет авто по выбранным фильтрам.</p>' : mobileCardsHtml}</div>` + paginationHtml;
  const listStaticHtml = tabsHtml + filtersHtml;

  const isPartial = req.get('X-Requested-With') === 'XMLHttpRequest';
  if (isPartial) {
    return res.type('html').send(listContentHtml);
  }

  const photoModalHtml = `
    <div class="fc-photo-modal-backdrop" id="fcPhotoModal" hidden>
      <button type="button" class="fc-photo-modal-close" id="fcPhotoModalClose" aria-label="Закрыть">×</button>
      <img src="" alt="Фото" class="fc-photo-modal" id="fcPhotoModalImg" />
    </div>`;
  const deleteModalHtml = `
    <div class="fc-delete-modal-backdrop" id="fcDeleteModal" hidden>
      <div class="fc-delete-modal" role="dialog" aria-labelledby="fcDeleteModalTitle" aria-modal="true">
        <h3 class="fc-delete-modal-title" id="fcDeleteModalTitle">Удалить?</h3>
        <p class="fc-delete-modal-text" id="fcDeleteModalText"></p>
        <div class="fc-delete-modal-actions">
          <button type="button" class="fc-delete-modal-btn fc-delete-modal-cancel" id="fcDeleteModalCancel">Отмена</button>
          <button type="button" class="fc-delete-modal-btn fc-delete-modal-confirm" id="fcDeleteModalConfirm">Удалить</button>
        </div>
      </div>
    </div>`;

  const extraScripts = `
    <script>
      (function() {
        var modal = document.getElementById('fcPhotoModal');
        var modalImg = document.getElementById('fcPhotoModalImg');
        var modalClose = document.getElementById('fcPhotoModalClose');
        function openPhoto(src) {
          if (src && modal && modalImg) { modalImg.src = src; modal.removeAttribute('hidden'); }
        }
        function closeModal() {
          if (modal) modal.setAttribute('hidden', 'hidden');
        }
        if (modalClose) modalClose.addEventListener('click', closeModal);
        if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

        var container = document.getElementById('fc-list-container');
        if (!container) return;
        function applyFilter() {
          var form = container.querySelector('form.fc-filters');
          if (!form) return;
          var data = new FormData(form);
          data.set('page', '1');
          var params = new URLSearchParams(data);
          var qs = params.toString();
          var url = window.location.pathname + (qs ? '?' + qs : '');
          fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(r) { return r.text(); }).then(function(html) {
            var el = document.getElementById('fc-list-content');
            if (el) el.innerHTML = html;
            if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
          });
        }
        container.addEventListener('click', function(e) {
          var tabLink = e.target.closest('a.fc-tab');
          if (tabLink && tabLink.getAttribute('data-tab')) {
            e.preventDefault();
            var form = container.querySelector('form.fc-filters');
            if (form) {
              var data = new FormData(form);
              data.set('tab', tabLink.getAttribute('data-tab'));
              data.set('page', '1');
              var params = new URLSearchParams(data);
              var url = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
              fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(r) { return r.text(); }).then(function(html) {
                var el = document.getElementById('fc-list-content');
                if (el) el.innerHTML = html;
                if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
                var tabInput = form.querySelector('input[name="tab"]');
                if (tabInput) tabInput.value = tabLink.getAttribute('data-tab');
                container.querySelectorAll('a.fc-tab').forEach(function(a) {
                  if (a.getAttribute('data-tab') === tabLink.getAttribute('data-tab')) a.classList.add('fc-tab-active');
                  else a.classList.remove('fc-tab-active');
                });
              });
            }
            return;
          }
          var thumb = e.target.closest('.fc-thumb[data-fc-photo], .fc-mobile-card img[data-fc-photo]');
          if (thumb) {
            var src = thumb.getAttribute('data-fc-photo');
            if (src && !thumb.closest('a')) { e.preventDefault(); openPhoto(src); }
          }
          if (e.target.closest('.fc-filter-reset')) {
            e.preventDefault();
            var form = container.querySelector('form.fc-filters');
            if (form) {
              form.querySelectorAll('select').forEach(function(s) { s.value = ''; });
              form.querySelectorAll('input[type="text"]').forEach(function(i) { i.value = ''; });
              applyFilter();
            }
            return;
          }
          var a = e.target.closest('a[href^="?"]');
          if (a && a.closest('.fc-pagination')) {
            e.preventDefault();
            var url = window.location.pathname + a.getAttribute('href');
            fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(r) { return r.text(); }).then(function(html) {
              var el = document.getElementById('fc-list-content');
              if (el) el.innerHTML = html;
              if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
            });
          }
        });
        container.addEventListener('change', function(e) {
          if (e.target.matches('select, input') && container.contains(e.target) && e.target.closest('form.fc-filters')) applyFilter();
        });
        container.addEventListener('input', function(e) {
          if (container.contains(e.target) && e.target.closest('form.fc-filters') && (e.target.name === 'search' || e.target.name === 'source')) {
            clearTimeout(window._fcDebounce);
            window._fcDebounce = setTimeout(applyFilter, 350);
          }
        });
        container.addEventListener('submit', function(e) {
          if (e.target.classList && e.target.classList.contains('fc-filters')) { e.preventDefault(); applyFilter(); }
        });

        var deleteModal = document.getElementById('fcDeleteModal');
        var deleteModalText = document.getElementById('fcDeleteModalText');
        var deleteModalCancel = document.getElementById('fcDeleteModalCancel');
        var deleteModalConfirm = document.getElementById('fcDeleteModalConfirm');
        var fcFormToSubmit = null;
        if (deleteModal) {
          function openDeleteModal(type) {
            fcFormToSubmit = null;
            var btn = type && type.target ? type.target.closest('button') : null;
            var form = btn ? btn.closest('form.fc-action-form') : null;
            if (!form) return;
            fcFormToSubmit = form;
            if (deleteModalText) deleteModalText.textContent = form.getAttribute('data-fc-confirm-type') === 'destroy'
              ? 'Удалить запись навсегда? Восстановить будет нельзя.'
              : 'Удалить авто из подборки? Оно перейдёт во вкладку «Удалённые».';
            if (deleteModalConfirm) deleteModalConfirm.textContent = form.getAttribute('data-fc-confirm-type') === 'destroy' ? 'Удалить навсегда' : 'Удалить';
            deleteModal.removeAttribute('hidden');
          }
          function closeDeleteModal() {
            deleteModal.setAttribute('hidden', 'hidden');
            fcFormToSubmit = null;
          }
          if (deleteModalCancel) deleteModalCancel.addEventListener('click', closeDeleteModal);
          deleteModal.addEventListener('click', function(e) { if (e.target === deleteModal) closeDeleteModal(); });
          document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && deleteModal && !deleteModal.hasAttribute('hidden')) closeDeleteModal(); });
          if (deleteModalConfirm) deleteModalConfirm.addEventListener('click', function() {
            if (fcFormToSubmit) fcFormToSubmit.submit();
            closeDeleteModal();
          });
          container.addEventListener('click', function(e) {
            if (e.target.closest('.fc-actions-btn-delete') || e.target.closest('.fc-actions-btn-destroy')) {
              e.preventDefault();
              openDeleteModal(e);
            }
          });
        }
      })();
    </script>`;

  const contentHtml = `
    <main class="cabinet-page-main">
      <section class="card">
        <h2 class="content-title">Все авто</h2>
        <div id="fc-list-container">
          <div id="fc-list-static">${listStaticHtml}</div>
          <div id="fc-list-content">${listContentHtml}</div>
        </div>
        ${photoModalHtml}
        ${deleteModalHtml}
      </section>
    </main>`;

  res.send(
    buildCabinetLayout(partner, 'cars', contentHtml, {
      pageTitle: 'Все авто',
      extraStyles: adminClientsPageStyles + workspaceContentStyles,
      extraScripts,
    })
  );
});

// Создание клиента партнёром
router.post('/partner/admin/clients', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const { name, notes } = req.body || {};
  if (!name || String(name).trim().length === 0) {
    return res.redirect('/partner/admin');
  }
  const client = Client.create({
    partnerId: partner.id,
    name: String(name).trim(),
    notes: notes != null ? String(notes).trim() : null,
  });
  res.redirect('/partner/admin?newClient=' + client.id);
});

// --- Client Workspace: маршруты Master–Detail ---

/** Стили контента workspace (критерии, формы, списки) */
const workspaceContentStyles = `
  .card { box-sizing: border-box; width: 100%; max-width: 100%; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #e5e7eb; margin-bottom: 20px; min-width: 0; }
  .content-title { margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #111827; word-break: break-word; }
  .card > .content-title:first-child { border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 16px; }
  .criteria-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .criteria-item { font-size: 13px; padding: 12px 14px; border-radius: 12px; border: 1px solid #e5e7eb; background: #f9fafb; display: flex; flex-direction: column; gap: 8px; }
  .criteria-main { display: flex; gap: 8px; align-items: flex-start; }
  .criteria-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .criteria-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .criteria-num { font-weight: 600; color: #6b7280; min-width: 30px; }
  .criteria-item-name { font-weight: 600; color: #111827; }
  .criteria-search-link { color: #2563eb; font-size: 12px; text-decoration: none; word-break: break-all; }
  .criteria-search-link:hover { text-decoration: underline; }
  .criteria-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .criteria-action-form { margin: 0; }
  .criteria-selection-link, .criteria-found-link, .criteria-edit { font-size: 12px; text-decoration: none; padding: 6px 12px; border-radius: 8px; display: inline-flex; }
  .criteria-selection-link { color: #374151; background: #e5e7eb; }
  .criteria-selection-link:hover { background: #d1d5db; }
  .criteria-found-link { color: #047857; background: #ecfdf5; }
  .criteria-found-link:hover { background: #d1fae5; }
  .criteria-edit { color: #4f46e5; background: #eef2ff; }
  .criteria-edit:hover { background: #e0e7ff; }
  .criteria-delete-btn, .criteria-restore-btn, .criteria-destroy-btn { font-size: 12px; padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer; font-weight: 500; }
  .criteria-delete-btn { background: #fef2f2; color: #b91c1c; }
  .criteria-delete-btn:hover { background: #fee2e2; }
  .criteria-restore-btn { background: #f0fdf4; color: #15803d; }
  .criteria-restore-btn:hover { background: #dcfce7; }
  .criteria-destroy-btn { background: #f3f4f6; color: #6b7280; }
  .criteria-destroy-btn:hover { background: #e5e7eb; color: #374151; }
  .pill { display: inline-flex; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .pill-korea { background: #e0f2fe; color: #0369a1; }
  .pill-china { background: #fee2e2; color: #b91c1c; }
  .pill-europe { background: #ecfdf5; color: #15803d; }
  .source { font-size: 11px; color: #6b7280; }
  /* Вкладки подборок клиента — стиль как у вкладок найденных авто (.fc-tabs) */
  .criteria-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  .criteria-tab { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #6b7280; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; transition: background 0.15s, color 0.15s, border-color 0.15s; }
  .criteria-tab:hover { background: #f3f4f6; color: #374151; }
  .criteria-tab-active { background: #4f46e5; color: #fff; border-color: #4f46e5; font-weight: 600; }
  .criteria-tab-active:hover { background: #4338ca; color: #fff; border-color: #4338ca; }
  .criteria-tab-badge { font-size: 12px; opacity: 0.9; }
  .criteria-tab-active .criteria-tab-badge { opacity: 0.85; }
  /* Делаем панель подборок достаточно высокой, как в блоке «Найденные авто» */
  .criteria-tab-panel { margin-top: 4px; min-height: 55vh; }
  .inline-form { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .inline-form select, .inline-form input { padding: 10px 12px; border-radius: 10px; border: 1px solid #d1d5db; font: inherit; font-size: 15px; background: #f9fafb; }
  .inline-form-submit { padding: 12px 16px; border-radius: 10px; border: none; background: #4f46e5; color: white; font-weight: 600; cursor: pointer; }
  .inline-form-submit:hover:not(:disabled) { background: #4338ca; }
  .inline-form-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .empty { font-size: 13px; color: #9ca3af; margin: 0; }
  .criteria-list--deleted .criteria-item { background: #fafafa; border-style: dashed; }
  .criteria-item--deleted .criteria-item-name, .criteria-item--deleted .source { color: #9ca3af; }
  .section-head { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  .section-head h3 { margin: 0; font-size: 20px; font-weight: 600; color: #111827; }
  .criteria-add-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; flex-wrap: wrap; min-width: 0; }
  .criteria-add-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #374151; flex: 1 1 auto; min-width: 0; }
  .criteria-add-open-btn {
    padding: 9px 18px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(90deg, #4f46e5, #6366f1);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(79,70,229,0.28);
  }
  .criteria-add-open-btn:hover { filter: brightness(1.05); }
  .criteria-add-modal-backdrop[hidden] { display: none !important; }
  .criteria-add-modal-backdrop { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,0.45); z-index: 70; overflow-y: auto; }
  .criteria-add-modal { background: #fff; border-radius: 16px; padding: 20px; max-width: 440px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 18px 40px rgba(15,23,42,0.18), 0 0 0 1px rgba(148,163,184,0.18); }
  .criteria-add-modal h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  .criteria-add-modal .inline-form { margin-top: 8px; margin-bottom: 0; }
  .criteria-add-modal-actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }
  .criteria-add-cancel-btn { padding: 8px 14px; border-radius: 8px; border: none; background: #e5e7eb; color: #374151; font-size: 13px; font-weight: 500; cursor: pointer; }
  .criteria-add-cancel-btn:hover { background: #d1d5db; }
  .found-cars-criteria-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .found-cars-criteria-link { display: block; padding: 14px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; text-decoration: none; color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
  .found-cars-criteria-link:hover { border-color: #c7d2fe; box-shadow: 0 4px 12px rgba(79,70,229,0.08); }
  .found-cars-criteria-link strong { font-size: 15px; color: #111827; }
  .found-cars-criteria-link span { font-size: 13px; color: #6b7280; margin-left: 8px; }
  .selection-cards-list { display: flex; flex-direction: column; gap: 10px; list-style: none; padding: 0; margin: 0; }
  .selection-card { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
  .selection-card:hover { border-color: #c7d2fe; box-shadow: 0 4px 12px rgba(79,70,229,0.08); }
  .selection-card-main { flex: 1; min-width: 0; }
  .selection-card-header { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; margin-bottom: 4px; min-width: 0; }
  .selection-card-name {
    font-size: 15px;
    color: #111827;
    margin: 0;
    flex: 1 1 auto;
    min-width: 0;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .selection-card-id { font-size: 12px; color: #6b7280; font-weight: 500; }
  .selection-card-meta { display: block; margin-bottom: 8px; font-size: 13px; color: #6b7280; }
  .selection-card-source { font-size: 12px; color: #9ca3af; }
  .selection-card-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
  .selection-card-site-link { margin-left: 8px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; text-decoration: none; background: #eef2ff; color: #4f46e5; white-space: nowrap; }
  .selection-card-site-link:hover { background: #e0e7ff; }
  .selection-card-found { margin: 0; font-size: 12px; color: #9ca3af; }
  .selection-card-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex-shrink: 0; margin-top: 4px; }
  .selection-card-btn { display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 500; text-decoration: none; border: none; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .selection-card-btn-found { background: #ecfdf5; color: #047857; }
  .selection-card-btn-found:hover { background: #d1fae5; }
  .selection-card-btn-url { background: #f3f4f6; color: #374151; }
  .selection-card-btn-url:hover { background: #e5e7eb; }
  .selection-card-btn-url-inline { padding: 4px 10px; font-size: 12px; }
  .selection-card-btn-public { background: #eef2ff; color: #4f46e5; }
  .selection-card-btn-public:hover { background: #e0e7ff; }
  .selection-card-btn-disabled { opacity: 0.6; cursor: default; }
  .selection-card-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; border: none; cursor: pointer; font-size: 16px; background: #e5e7eb; color: #6b7280; }
  .selection-card-icon-btn-edit:hover { background: #d1d5db; }
  .selection-card-icon-btn-delete { background: #fef2f2; color: #b91c1c; }
  .selection-card-icon-btn-delete:hover { background: #fee2e2; }
  @media (max-width: 767px) {
    .selection-card { flex-direction: column; align-items: stretch; }
    .selection-card-header { flex-wrap: wrap; align-items: flex-start; }
    .selection-card-actions { margin-top: 8px; }
    .selection-card-btn-found { width: 100%; justify-content: center; }
  }
  .found-car-card { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
  .found-car-card:hover { border-color: #c7d2fe; box-shadow: 0 4px 12px rgba(79,70,229,0.08); }
  .found-car-card-main { flex: 1; min-width: 0; }
  .found-car-card-source { font-size: 14px; margin-bottom: 4px; }
  .found-car-card-source a { color: #2563eb; text-decoration: none; word-break: break-all; }
  .found-car-card-source a:hover { text-decoration: underline; }
  .found-car-card-meta { font-size: 12px; color: #6b7280; }
  .found-car-card-id { font-size: 12px; color: #9ca3af; }
  .found-car-card-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex-shrink: 0; }
  .found-car-card-btn { display: inline-flex; padding: 6px 12px; border-radius: 8px; font-size: 13px; text-decoration: none; color: #374151; background: #e5e7eb; font-weight: 500; }
  .found-car-card-btn:hover { background: #d1d5db; }
  .found-car-card-btn-primary { background: #eef2ff; color: #4f46e5; }
  .found-car-card-btn-primary:hover { background: #e0e7ff; }
  .found-car-not-on-platform { font-size: 13px; color: #9ca3af; font-style: italic; }
  .found-car-cards-list { display: flex; flex-direction: column; gap: 10px; }
  /* --- Список найденных авто: таблица + фильтры + карточки (мобильные) --- */
  .fc-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 16px; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
  .fc-filter-field { display: flex; flex-direction: column; gap: 4px; }
  .fc-filters label { font-size: 13px; color: #6b7280; margin: 0; }
  /* Специальная раскладка фильтров для страницы «Все авто»: поиск — отдельной строкой на всю ширину */
  #fc-filters-cars { flex-direction: column; align-items: stretch; }
  #fc-filters-cars .fc-filter-field-search-wide { flex-direction: row; align-items: center; }
  #fc-filters-cars .fc-filter-field-search-wide label { margin: 0 8px 0 0; white-space: nowrap; }
  #fc-filters-cars .fc-filter-field-search-wide input { flex: 1 1 auto; min-width: 0; }
  #fc-filters-cars .fc-filters-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  @media (max-width: 599px) {
    #fc-filters-cars .fc-filters-row { flex-direction: column; align-items: stretch; }
  }
  .fc-filters select, .fc-filters input[type="text"] { padding: 8px 10px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 13px; min-width: 150px; }
  .fc-filters .fc-filter-search { min-width: 220px; }
  .fc-filters button[type="submit"] { padding: 8px 14px; border-radius: 8px; border: none; background: #4f46e5; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; }
  .fc-filters button[type="submit"]:hover { background: #4338ca; }
  .fc-filter-reset { padding: 8px 14px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #6b7280; font-size: 13px; cursor: pointer; }
  .fc-filter-reset:hover { background: #f3f4f6; color: #374151; }
  .fc-tabs { display: flex; gap: 4px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; }
  .fc-tab { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 14px; font-weight: 500; color: #6b7280; background: #f9fafb; border: 1px solid #e5e7eb; transition: background 0.15s, color 0.15s; }
  .fc-tab:hover { background: #f3f4f6; color: #374151; }
  .fc-tab-active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
  .fc-tab-active:hover { background: #4338ca; color: #fff; border-color: #4338ca; }
  .fc-tab-badge { font-size: 12px; opacity: 0.9; }
  .fc-tab-active .fc-tab-badge { opacity: 0.85; }
  .fc-action-form { display: inline; }
  .fc-actions-btn-icon { width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; margin-left: 4px; }
  .fc-actions-btn-destroy { background: #7f1d1d; color: #fff; }
  .fc-actions-btn-destroy:hover { background: #991b1b; }
  .fc-link-arrow { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; font-size: 18px; color: #2563eb; text-decoration: none; border-radius: 8px; }
  .fc-link-arrow:hover { background: #eff6ff; color: #1d4ed8; }
  .fc-link-arrow.disabled { color: #9ca3af; cursor: default; pointer-events: none; }
  .fc-pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }
  .fc-pagination a, .fc-pagination span { padding: 6px 12px; border-radius: 8px; text-decoration: none; color: #374151; background: #f3f4f6; border: 1px solid #e5e7eb; }
  .fc-pagination a:hover { background: #e5e7eb; }
  .fc-pagination .fc-page-current { background: #4f46e5; color: #fff; border-color: #4f46e5; font-weight: 600; }
  .fc-empty-desktop { display: block; }
  .fc-empty-mobile { display: none; }
  #fc-list-content { min-height: 55vh; box-sizing: border-box; min-width: 0; }
  #fc-list-container { min-width: 0; width: 100%; overflow-x: hidden; }
  #fc-list-static { min-width: 0; }
  /* Таблица: всегда 100% ширины, без горизонтального скролла. Ширины колонок — не меньше текста заголовка. */
  .fc-table-wrap { margin: 0 0 16px; width: 100%; min-width: 0; overflow: hidden; }
  .fc-table { width: 100%; border-collapse: collapse; font-size: 14px; table-layout: fixed; }
  .fc-table th, .fc-table td { padding: 12px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; vertical-align: middle; box-sizing: border-box; }
  .fc-table th { background: #f9fafb; font-weight: 600; color: #374151; white-space: nowrap; }
  .fc-table tbody tr { transition: background 0.15s; }
  .fc-table tbody tr:hover { background: #f8fafc; }
  .fc-table .fc-col-photo { width: 80px; min-width: 80px; padding-right: 18px; }
  .fc-table .fc-col-auto { padding-left: 16px; }
  .fc-table .fc-col-selection { width: 110px; min-width: 110px; overflow: hidden; }
  .fc-table .fc-col-selection .fc-badge-country { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle; cursor: help; }
  .fc-table .fc-col-source { width: 88px; min-width: 88px; text-align: center; }
  .fc-table .fc-col-public { width: 92px; min-width: 92px; text-align: center; }
  .fc-table .fc-col-actions { width: 96px; min-width: 96px; text-align: right; white-space: nowrap; }
  .fc-table .fc-col-auto { overflow: hidden; min-width: 0; }
  .fc-thumb { width: 80px; height: 80px; min-width: 80px; min-height: 80px; flex-shrink: 0; border-radius: 10px; object-fit: cover; background: #f3f4f6; cursor: pointer; display: block; border: 1px solid #e5e7eb; box-sizing: border-box; }
  .fc-thumb:hover { border-color: #4f46e5; box-shadow: 0 2px 8px rgba(79,70,229,0.2); }
  .fc-thumb-placeholder { width: 80px; height: 80px; min-width: 80px; min-height: 80px; flex-shrink: 0; border-radius: 10px; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #9ca3af; cursor: pointer; border: 1px solid #d1d5db; box-sizing: border-box; }
  .fc-thumb-placeholder:hover { background: #d1d5db; }
  .fc-col-auto .fc-auto-title { font-weight: 600; color: #111827; margin: 0 0 8px; line-height: 1.3; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .fc-col-auto .fc-auto-title a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline; max-width: 100%; }
  .fc-auto-title { font-weight: 600; color: #111827; margin: 0 0 8px; line-height: 1.3; }
  .fc-auto-title-link { color: #111827; text-decoration: none; }
  .fc-auto-title-link:hover { color: #4f46e5; text-decoration: underline; }
  .fc-cell-link { display: block; text-decoration: none; }
  .fc-cell-link:hover .fc-thumb { border-color: #4f46e5; box-shadow: 0 2px 8px rgba(79,70,229,0.25); }
  .fc-auto-desc { font-size: 12px; color: #6b7280; margin: 0; padding: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; min-width: 0; display: block; line-height: 1.4; }
  .fc-col-auto .fc-auto-id { font-size: 12px; color: #9ca3af; margin: 4px 0 0; padding: 0; line-height: 1.3; }
  .fc-badge { display: inline-flex; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .fc-badge-country { margin-top: 2px; }
  .fc-badge-platform { background: #d1fae5; color: #065f46; margin-left: 6px; }
  .fc-badge-not { background: #e5e7eb; color: #6b7280; margin-left: 6px; }
  .fc-link-arrow { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0; font-size: 18px; color: #2563eb; text-decoration: none; border-radius: 8px; box-sizing: border-box; }
  .fc-link-arrow:hover { background: #eff6ff; color: #1d4ed8; }
  .fc-link-arrow.disabled { color: #9ca3af; cursor: default; pointer-events: none; }
  .fc-actions-btn { display: inline-flex; align-items: center; justify-content: center; padding: 6px; border-radius: 8px; font-size: 12px; font-weight: 500; border: none; cursor: pointer; margin-left: 4px; text-decoration: none; font-family: inherit; flex-shrink: 0; box-sizing: border-box; }
  .fc-actions-btn-icon { width: 36px; height: 36px; padding: 0; min-width: 36px; min-height: 36px; }
  .fc-actions-btn-edit { background: #e5e7eb; color: #6b7280; }
  .fc-actions-btn-edit:hover { background: #d1d5db; }
  .fc-actions-btn-delete { background: #fef2f2; color: #b91c1c; }
  .fc-actions-btn-delete:hover { background: #fee2e2; }
  .fc-photo-modal-backdrop[hidden] { display: none !important; }
  .fc-photo-modal-backdrop { position: fixed; inset: 0; z-index: 80; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; padding: 20px; }
  .fc-photo-modal { max-width: 90vw; max-height: 90vh; border-radius: 12px; box-shadow: 0 24px 48px rgba(0,0,0,0.25); object-fit: contain; background: #fff; }
  .fc-photo-modal-close { position: fixed; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255,255,255,0.9); cursor: pointer; font-size: 20px; line-height: 1; color: #374151; z-index: 81; }
  .fc-photo-modal-close:hover { background: #fff; }
  .fc-delete-modal-backdrop[hidden] { display: none !important; }
  .fc-delete-modal-backdrop { position: fixed; inset: 0; z-index: 90; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; }
  .fc-delete-modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 24px 48px rgba(0,0,0,0.2); }
  .fc-delete-modal-title { margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #111827; }
  .fc-delete-modal-text { margin: 0 0 20px; font-size: 14px; color: #6b7280; line-height: 1.5; }
  .fc-delete-modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
  .fc-delete-modal-btn { padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; font-family: inherit; }
  .fc-delete-modal-cancel { background: #f3f4f6; color: #374151; }
  .fc-delete-modal-cancel:hover { background: #e5e7eb; }
  .fc-delete-modal-confirm { background: #b91c1c; color: #fff; }
  .fc-delete-modal-confirm:hover { background: #991b1b; }
  .pill-default { background: #e5e7eb; color: #6b7280; }
  .fc-mobile-cards { display: none; }
  /* Ниже 1024px: карточки вместо таблицы — аккуратная карточка с иерархией и отступами */
  @media (max-width: 1023px) {
    .fc-table-wrap { display: none; }
    .fc-mobile-cards { display: flex; flex-direction: column; gap: 14px; width: 100%; min-width: 0; }
    .fc-empty-desktop { display: none; }
    .fc-empty-mobile { display: block; }
    .fc-mobile-card {
      padding: 0;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .fc-mobile-card-top {
      display: flex;
      flex-direction: row;
      gap: 16px;
      align-items: flex-start;
      min-width: 0;
      flex: 1;
      padding: 14px 16px;
    }
    .fc-mobile-card-thumb {
      flex-shrink: 0;
      width: 88px;
      height: 88px;
      min-width: 88px;
      min-height: 88px;
      border-radius: 12px;
      overflow: hidden;
      background: #f3f4f6;
    }
    .fc-mobile-card-thumb img {
      width: 88px;
      height: 88px;
      min-width: 88px;
      min-height: 88px;
      object-fit: cover;
      display: block;
    }
    .fc-mobile-card-thumb .fc-thumb-placeholder {
      width: 88px;
      height: 88px;
      min-width: 88px;
      min-height: 88px;
      border-radius: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #9ca3af;
    }
    .fc-mobile-card-body { min-width: 0; flex: 1; overflow: hidden; padding: 2px 0; }
    .fc-mobile-card-title {
      font-weight: 600;
      font-size: 16px;
      color: #111827;
      margin: 0 0 8px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fc-mobile-card-title a {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
      color: inherit;
      text-decoration: none;
    }
    .fc-mobile-card-title a:hover { color: #4f46e5; }
    .fc-mobile-card-meta {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 12px;
      line-height: 1.4;
      /* Разрешаем перенос строки, чтобы ID не обрезался, а уходил на новую строку при нехватке ширины */
      white-space: normal;
    }
    .fc-mobile-card-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    /* ID переносим целиком (слово + цифры), чтобы не рвать строку посередине числа */
    .fc-mobile-card-meta-id {
      display: inline-block;
    }
    .fc-mobile-card-links .fc-mobile-link-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      color: #4f46e5;
      box-sizing: border-box;
      /* Переопределяем квадратные размеры .fc-link-arrow под текстовые кнопки */
      width: auto;
      height: auto;
      min-width: 0;
      min-height: 36px;
      max-width: 100%;
      white-space: normal;
      text-align: center;
    }
    .fc-mobile-card-links .fc-mobile-link-btn:hover { background: #eef2ff; border-color: #c7d2fe; }
    .fc-mobile-card-links .fc-mobile-link-btn-disabled {
      color: #9ca3af;
      background: #f3f4f6;
      border-color: #e5e7eb;
      cursor: default;
      pointer-events: none;
    }
    .fc-mobile-card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      flex-shrink: 0;
      padding: 12px 16px;
      border-top: 1px solid #f3f4f6;
      background: #fafbfc;
    }
    .fc-mobile-card-actions .fc-actions-btn-icon {
      width: 40px;
      height: 40px;
      min-width: 40px;
      min-height: 40px;
      border-radius: 10px;
    }
  }
  @media (min-width: 1024px) {
    .fc-mobile-cards { display: none; }
  }
  /* Очень узкий экран: карточка вертикально — фото сверху, блок инфо, полоска действий */
  @media (max-width: 479px) {
    .fc-mobile-card { border-radius: 12px; }
    .fc-mobile-card-top { flex-direction: column; gap: 0; padding: 0; }
    .fc-mobile-card-thumb {
      width: 100%;
      height: auto;
      min-width: 0;
      min-height: 0;
      aspect-ratio: 16/10;
      max-height: 160px;
      border-radius: 0;
    }
    .fc-mobile-card-thumb img {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      object-fit: cover;
    }
    .fc-mobile-card-thumb .fc-thumb-placeholder {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      aspect-ratio: 16/10;
    }
    .fc-mobile-card-body { padding: 14px 16px 12px; }
    .fc-mobile-card-title { font-size: 15px; margin-bottom: 6px; }
    .fc-mobile-card-meta { font-size: 12px; margin-bottom: 12px; }
    .fc-mobile-card-links { margin-bottom: 0; }
    .fc-mobile-card-actions { padding: 10px 16px; border-top: 1px solid #e5e7eb; }
  }
  /* Супер-узкий экран: ID переносим на следующую строку в карточке */
  @media (max-width: 359px) {
    .fc-mobile-card-meta {
      white-space: normal;
    }
    .fc-mobile-card-meta-id {
      display: block;
      margin-top: 2px;
    }
  }
  @media (max-width: 767px) {
    .fc-filters .fc-filter-search, .fc-filters .fc-filter-id { min-width: 0; width: 100%; max-width: 100%; box-sizing: border-box; }
    .fc-filters select { min-width: 0; box-sizing: border-box; }
  }
  @media (max-width: 599px) {
    .fc-filters { flex-direction: column; align-items: stretch; }
    .fc-filters select, .fc-filters input { min-width: 0; width: 100%; box-sizing: border-box; }
  }
  @media (max-width: 599px) {
    .workspace-content .card { padding: 16px; }
    .criteria-add-header { padding: 10px 12px; }
    .criteria-add-modal-backdrop { padding: 12px; align-items: flex-start; padding-top: 24px; }
    .criteria-add-modal { padding: 16px; max-height: 85vh; }
    .criteria-item { padding: 10px 12px; }
    .criteria-actions { flex-wrap: wrap; gap: 6px; }
    .criteria-item-name, .criteria-search-link { word-break: break-word; overflow-wrap: break-word; }
  }
  @media (max-width: 767px) {
    .card { padding: 18px; box-sizing: border-box; }
    .content-title, .section-head h3 { font-size: 18px; }
  }
  @media (max-width: 479px) {
    .card { padding: 14px; border-radius: 12px; }
    .content-title, .section-head h3 { font-size: 17px; margin-bottom: 14px; }
  }
`;

// Workspace: вкладка «Активные критерии»
router.get('/partner/admin/clients/:clientId', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) return res.redirect('/partner/admin');
  const client = Client.findById(clientId);
  if (!client || client.partnerId !== partner.id) return res.redirect('/partner/admin');
  const { activeHtml, deletedHtml, activeCount, deletedCount } = buildClientCriteriaHtml(partner, client);
  const contentHtml = `
    <div class="criteria-add-modal-backdrop" id="criteriaAddModal" hidden>
      <div class="criteria-add-modal" role="dialog" aria-modal="true" aria-labelledby="criteriaAddTitle">
        <h3 id="criteriaAddTitle">Новая подборка</h3>
        <form class="inline-form criteria-add-form-modal" method="post" action="/partner/admin/clients/${client.id}/search-criteria">
          <input type="text" name="criterionName" placeholder="Название подборки (для этого критерия)" />
          <select name="country" required>
            <option value="">Страна</option>
            <option value="Korea">Korea</option>
            <option value="China">China</option>
            <option value="Europe">Europe</option>
          </select>
          <input type="text" name="sourceSite" placeholder="Площадка (опционально)" />
          <input type="text" name="searchUrl" placeholder="Ссылка на поиск" required />
          <div class="criteria-add-modal-actions">
            <button type="button" class="criteria-add-cancel-btn">Отмена</button>
            <button type="submit" class="inline-form-submit" disabled>Добавить критерий</button>
          </div>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="section-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">Подборки клиента</h3>
        <button type="button" class="criteria-add-open-btn">Добавить подборку</button>
      </div>
      <div class="criteria-tabs" role="tablist">
        <button type="button" class="criteria-tab criteria-tab-active" data-criteria-tab="active">
          <span>Активные подборки</span>
          <span class="criteria-tab-badge">${activeCount}</span>
        </button>
        <button type="button" class="criteria-tab" data-criteria-tab="deleted">
          <span>Удалённые подборки</span>
          <span class="criteria-tab-badge">${deletedCount}</span>
        </button>
      </div>
      <div class="criteria-tab-panel" data-criteria-panel="active">
        ${activeHtml}
      </div>
      <div class="criteria-tab-panel" data-criteria-panel="deleted" hidden>
        ${deletedHtml}
      </div>
    </div>`;
  const extraScripts = `
    <script>
      (function() {
        var openBtn = document.querySelector('.criteria-add-open-btn');
        var backdrop = document.getElementById('criteriaAddModal');
        if (openBtn && backdrop) {
          var cancelBtn = backdrop.querySelector('.criteria-add-cancel-btn');
          function openModal() { backdrop.removeAttribute('hidden'); }
          function closeModal() { backdrop.setAttribute('hidden', 'hidden'); }
          openBtn.addEventListener('click', openModal);
          if (cancelBtn) cancelBtn.addEventListener('click', function(e) { e.preventDefault(); closeModal(); });
          backdrop.addEventListener('click', function(e) { if (e.target === backdrop) closeModal(); });
          document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !backdrop.hasAttribute('hidden')) closeModal(); });
        }
        var form = document.querySelector('.criteria-add-form-modal');
        if (form) {
          var country = form.querySelector('select[name="country"]');
          var url = form.querySelector('input[name="searchUrl"]');
          var btn = form.querySelector('.inline-form-submit');
          if (country && url && btn) {
            function update() { btn.disabled = !(country.value && url.value.trim()); }
            country.addEventListener('change', update);
            url.addEventListener('input', update);
            update();
          }
        }

        // Табы «Активные / Удалённые подборки» в профиле клиента
        var criteriaTabs = document.querySelectorAll('.criteria-tab');
        var criteriaPanels = document.querySelectorAll('.criteria-tab-panel');
        if (criteriaTabs.length && criteriaPanels.length) {
          criteriaTabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
              var target = tab.getAttribute('data-criteria-tab');
              // переключаем активный таб
              criteriaTabs.forEach(function(t) { t.classList.toggle('criteria-tab-active', t === tab); });
              // показываем нужную панель
              criteriaPanels.forEach(function(panel) {
                var panelKey = panel.getAttribute('data-criteria-panel');
                if (panelKey === target) {
                  panel.removeAttribute('hidden');
                } else {
                  panel.setAttribute('hidden', 'hidden');
                }
              });
            });
          });
        }
      })();
    </script>`;
  res.send(
    buildClientProfileLayout(partner, client, 'criteria', contentHtml, {
      pageTitle: 'Подборки клиента',
      extraStyles: workspaceContentStyles,
      extraScripts,
    })
  );
});

/** Первое фото из images_json машины или null */
function getFirstImageUrl(imagesJson) {
  if (!imagesJson) return null;
  try {
    const arr = JSON.parse(imagesJson);
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  } catch (e) {
    return null;
  }
}

// Профиль клиента: вкладка «Найденные авто» — таблица с фильтрами, пагинацией, фото и карточками на мобильных
router.get('/partner/admin/clients/:clientId/found-cars', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) return res.redirect('/partner/admin');
  const client = Client.findById(clientId);
  if (!client || client.partnerId !== partner.id) return res.redirect('/partner/admin');
  const activeCriteria = SearchCriteria.findByClientActive(client.id);
  const basePlatformUrl = '/p/' + encodeURIComponent(partner.slug) + '/cars/';
  const selectionUrlBase = '/p/' + encodeURIComponent(partner.slug) + '/selection/';

  const allRows = [];
  activeCriteria.forEach((sc) => {
    const foundCars = CriterionFoundCar.findByCriterion(sc.id);
    const selectionName = (sc.name || 'Подборка ' + (sc.public_id || sc.id)).replace(/</g, '&lt;');
    const country = (sc.country || '').toLowerCase();
    foundCars.forEach((fc) => {
      const car = fc.car_id ? Car.findById(fc.car_id) : null;
      const title = car ? (car.title || 'Без названия') : (fc.source_url ? 'Ссылка на источник' : '—');
      const desc = car && car.description ? String(car.description).replace(/\s+/g, ' ').trim().slice(0, 80) + (car.description.length > 80 ? '…' : '') : '';
      const firstImg = car ? getFirstImageUrl(car.images_json) : null;
      const onPlatform = !!fc.car_id;
      allRows.push({
        fc,
        criterion: { name: selectionName, publicId: sc.public_id || sc.id, id: sc.id, country },
        title: title.replace(/</g, '&lt;'),
        desc: desc.replace(/</g, '&lt;'),
        firstImg,
        onPlatform,
        carPublicId: car && car.public_id != null ? car.public_id : null,
        imagesJson: car && car.images_json ? car.images_json : null,
      });
    });
  });
  allRows.sort((a, b) => b.fc.id - a.fc.id);

  const selectionNamesByCar = new Map();
  allRows.forEach((r) => {
    const key = r.fc.car_id != null ? 'car:' + r.fc.car_id : 'url:' + (r.fc.source_url || 'fc-' + r.fc.id);
    if (!selectionNamesByCar.has(key)) selectionNamesByCar.set(key, new Set());
    selectionNamesByCar.get(key).add(r.criterion.name);
  });
  allRows.forEach((r) => {
    const key = r.fc.car_id != null ? 'car:' + r.fc.car_id : 'url:' + (r.fc.source_url || 'fc-' + r.fc.id);
    r.allSelectionNames = Array.from(selectionNamesByCar.get(key) || []);
  });

  if (allRows.length === 0) {
    const emptyHtml = `
      <div class="card">
        <h2 class="content-title">Найденные авто</h2>
        <p class="empty">Найденных авто пока нет. Добавьте подборки и ссылки на авто во вкладке «Подборки клиента».</p>
      </div>`;
    return res.send(
      buildClientProfileLayout(partner, client, 'cars', emptyHtml, {
        pageTitle: 'Найденные авто',
        extraStyles: workspaceContentStyles,
      })
    );
  }

  const q = req.query;
  const filterTab = ['published', 'moderation', 'deleted'].includes(q.tab) ? q.tab : 'published';
  const filterCountry = (q.country || '').trim().toLowerCase();
  const filterSelection = q.selection ? Number(q.selection) : null;
  const filterSearch = (q.search || '').trim().toLowerCase();
  // Статус управляется вкладками (Опубликованные / На модерации / Удалённые),
  // отдельный фильтр по статусу и точный фильтр по ID больше не используются.

  let filtered = allRows.filter((r) => (r.fc.status || 'published') === filterTab);
  if (filterCountry) filtered = filtered.filter((r) => r.criterion.country === filterCountry);
  if (Number.isInteger(filterSelection) && filterSelection > 0) filtered = filtered.filter((r) => r.criterion.id === filterSelection);
  if (filterSearch) {
    filtered = filtered.filter(
      (r) =>
        r.title.toLowerCase().includes(filterSearch) ||
        (r.desc && r.desc.toLowerCase().includes(filterSearch)) ||
        String(r.fc.id).includes(filterSearch) ||
        (r.carPublicId != null && String(r.carPublicId).includes(filterSearch))
    );
  }

  const tabCounts = { published: 0, moderation: 0, deleted: 0 };
  allRows.forEach((r) => {
    const s = r.fc.status || 'published';
    if (tabCounts[s] !== undefined) tabCounts[s]++;
  });

  const total = filtered.length;
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 20, 5), 100);
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const pageRows = filtered.slice(offset, offset + limit);

  const buildQuery = (overrides) => {
    const o = { ...q, ...overrides };
    if (o.page === 1) delete o.page;
    return Object.entries(o)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
      .join('&');
  };
  const queryPrefix = buildQuery({}) ? '?' + buildQuery({}) : '';
  const selectionOptions = activeCriteria.map((sc) => ({ id: sc.id, name: (sc.name || 'Подборка ' + (sc.public_id || sc.id)).replace(/</g, '&lt;'), country: (sc.country || '').toLowerCase() }));
  const countries = [...new Set(selectionOptions.map((s) => s.country).filter(Boolean))].sort();

  const tabsHtml = `
    <nav class="fc-tabs" aria-label="Вкладки статусов">
      <a href="?${buildQuery({ tab: 'published', page: 1 })}" class="fc-tab ${filterTab === 'published' ? 'fc-tab-active' : ''}" data-tab="published">Опубликованные<span class="fc-tab-badge">${tabCounts.published}</span></a>
      <a href="?${buildQuery({ tab: 'moderation', page: 1 })}" class="fc-tab ${filterTab === 'moderation' ? 'fc-tab-active' : ''}" data-tab="moderation">На модерации<span class="fc-tab-badge">${tabCounts.moderation}</span></a>
      <a href="?${buildQuery({ tab: 'deleted', page: 1 })}" class="fc-tab ${filterTab === 'deleted' ? 'fc-tab-active' : ''}" data-tab="deleted">Удалённые<span class="fc-tab-badge">${tabCounts.deleted}</span></a>
    </nav>`;

  const filtersHtml = `
    <form id="fc-filters-form" method="get" action="/partner/admin/clients/${client.id}/found-cars" class="fc-filters">
      <input type="hidden" name="tab" value="${filterTab.replace(/"/g, '&quot;')}" />
      <input type="hidden" name="page" value="1" />
      <div class="fc-filter-field">
        <label>Поиск</label>
        <input type="text" name="search" class="fc-filter-search" placeholder="Марка, модель, ID…" value="${(q.search || '').replace(/"/g, '&quot;')}" />
      </div>
      <div class="fc-filter-field">
        <label>Страна</label>
        <select name="country">
          <option value="">Все</option>
          ${countries.map((c) => `<option value="${c}" ${filterCountry === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="fc-filter-field">
        <label>Подборка</label>
        <select name="selection">
          <option value="">Все</option>
          ${selectionOptions.map((s) => `<option value="${s.id}" ${filterSelection === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
      </div>
      <button type="button" class="fc-filter-reset" title="Показать все найденные авто">Сбросить</button>
    </form>`;

  const deleteUrl = (r) => `/partner/admin/clients/${client.id}/search-criteria/${r.criterion.id}/found-cars/${r.fc.id}/delete`;
  const destroyUrl = (r) => `/partner/admin/clients/${client.id}/search-criteria/${r.criterion.id}/found-cars/${r.fc.id}/destroy`;
  const selectionUrl = (r) => selectionUrlBase + r.criterion.publicId;
  const platformPageUrl = (r) => (r.carPublicId ? basePlatformUrl + r.carPublicId : '');
  const isDeletedTab = filterTab === 'deleted';

  const tableRowsHtml = pageRows
    .map((r) => {
      const sourceUrlSafe = (r.fc.source_url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const thumbHtml = r.firstImg
        ? `<img src="${r.firstImg.replace(/"/g, '&quot;')}" alt="" class="fc-thumb" data-fc-photo="${r.firstImg.replace(/"/g, '&quot;')}" data-fc-images="${(r.imagesJson || '').replace(/"/g, '&quot;')}" loading="lazy" />`
        : `<span class="fc-thumb-placeholder" data-fc-photo="" data-fc-images="">Нет фото</span>`;
      const statusBadge = r.onPlatform ? '<span class="fc-badge fc-badge-platform">На платформе</span>' : '<span class="fc-badge fc-badge-not">Не добавлено</span>';
      const photoCell = r.onPlatform
        ? `<a href="${platformPageUrl(r)}" class="fc-cell-link" target="_blank" rel="noopener noreferrer">${thumbHtml}</a>`
        : thumbHtml;
      const titleBlock = r.onPlatform
        ? `<a href="${platformPageUrl(r)}" class="fc-auto-title-link" target="_blank" rel="noopener noreferrer">${r.title}</a> ${statusBadge}`
        : `${r.title} ${statusBadge}`;
      const sourceCell = r.fc.source_url
        ? `<a href="${sourceUrlSafe}" class="fc-link-arrow" target="_blank" rel="noopener noreferrer" title="Источник">↗</a>`
        : '<span class="fc-link-arrow disabled">—</span>';
      const publicCell = r.onPlatform
        ? `<a href="${platformPageUrl(r)}" class="fc-link-arrow" target="_blank" rel="noopener noreferrer" title="На сайте">↗</a>`
        : '<span class="fc-link-arrow disabled">—</span>';
      const actionsCell = isDeletedTab
        ? `<form method="post" action="${destroyUrl(r)}" class="fc-action-form" data-fc-confirm-type="destroy"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-destroy" title="Удалить навсегда" aria-label="Удалить навсегда">&#128465;</button></form>`
        : `<a href="#" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-edit" onclick="return false;" title="Редактирование (заглушка)" aria-label="Редактировать">&#9998;</a><form method="post" action="${deleteUrl(r)}" class="fc-action-form" data-fc-confirm-type="soft"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-delete" title="Удалить (вкладка Удалённые)" aria-label="Удалить">&#128465;</button></form>`;
      return `
        <tr>
          <td class="fc-col-photo">${photoCell}</td>
          <td class="fc-col-auto">
            <p class="fc-auto-title">${titleBlock}</p>
            ${r.desc ? `<p class="fc-auto-desc">${r.desc}</p>` : ''}
            <p class="fc-auto-id">ID: ${r.onPlatform && r.carPublicId != null ? r.carPublicId : r.fc.id}</p>
          </td>
          <td class="fc-col-selection"><span class="fc-badge fc-badge-country pill-${r.criterion.country || 'default'}" title="${(r.allSelectionNames || [r.criterion.name]).map((n) => String(n || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')).join('\n')}">${r.criterion.name}</span></td>
          <td class="fc-col-source">${sourceCell}</td>
          <td class="fc-col-public">${publicCell}</td>
          <td class="fc-col-actions">${actionsCell}</td>
        </tr>`;
    })
    .join('');

  const tableHtml =
    pageRows.length === 0
      ? '<p class="empty fc-empty-desktop">Нет авто по выбранным фильтрам.</p>'
      : `
      <div class="fc-table-wrap">
        <table class="fc-table">
          <thead>
            <tr>
              <th class="fc-col-photo">Фото</th>
              <th class="fc-col-auto">Авто</th>
              <th class="fc-col-selection">Подборка</th>
              <th class="fc-col-source">Источник</th>
              <th class="fc-col-public">На сайте</th>
              <th class="fc-col-actions">Действия</th>
            </tr>
          </thead>
          <tbody>${tableRowsHtml}</tbody>
        </table>
      </div>`;

  const mobileCardsHtml = pageRows
    .map((r) => {
      const sourceUrlSafe = (r.fc.source_url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const thumbHtml = r.firstImg
        ? `<img src="${r.firstImg.replace(/"/g, '&quot;')}" alt="" width="80" height="80" style="border-radius:10px;object-fit:cover;" data-fc-photo="${r.firstImg.replace(/"/g, '&quot;')}" loading="lazy" />`
        : '<span class="fc-thumb-placeholder" style="width:80px;height:80px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ca3af;background:#e5e7eb;border-radius:10px;">Нет фото</span>';
      const thumbWrap = r.onPlatform ? `<a href="${platformPageUrl(r)}" class="fc-cell-link" target="_blank" rel="noopener noreferrer">${thumbHtml}</a>` : thumbHtml;
      const titleContent = r.onPlatform ? `<a href="${platformPageUrl(r)}" class="fc-auto-title-link" target="_blank" rel="noopener noreferrer">${r.title}</a>` : r.title;
      const sourceLink = r.fc.source_url ? `<a href="${sourceUrlSafe}" class="fc-link-arrow fc-mobile-link-btn" target="_blank" rel="noopener noreferrer">Источник</a>` : '<span class="fc-link-arrow fc-mobile-link-btn fc-mobile-link-btn-disabled">Источник</span>';
      const publicLink = r.onPlatform ? `<a href="${platformPageUrl(r)}" class="fc-link-arrow fc-mobile-link-btn" target="_blank" rel="noopener noreferrer">На сайте</a>` : '<span class="fc-link-arrow fc-mobile-link-btn fc-mobile-link-btn-disabled">На сайте</span>';
      const mobileActions = isDeletedTab
        ? `<form method="post" action="${destroyUrl(r)}" class="fc-action-form" data-fc-confirm-type="destroy"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-destroy" title="Удалить навсегда" aria-label="Удалить навсегда">&#128465;</button></form>`
        : `<a href="#" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-edit" onclick="return false;" title="Редактирование (заглушка)" aria-label="Редактировать">&#9998;</a><form method="post" action="${deleteUrl(r)}" class="fc-action-form" data-fc-confirm-type="soft"><button type="button" class="fc-actions-btn fc-actions-btn-icon fc-actions-btn-delete" title="Удалить">&#128465;</button></form>`;
      return `
        <div class="fc-mobile-card">
          <div class="fc-mobile-card-top">
            <div class="fc-mobile-card-thumb">${thumbWrap}</div>
            <div class="fc-mobile-card-body">
              <p class="fc-mobile-card-title">${titleContent}</p>
              <p class="fc-mobile-card-meta" title="Подборки: ${(r.allSelectionNames || [r.criterion.name]).map((n) => String(n || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')).join(', ')} · ID ${r.onPlatform && r.carPublicId != null ? r.carPublicId : r.fc.id}">
                Подборка: ${r.criterion.name} · <span class="fc-mobile-card-meta-id">ID ${r.onPlatform && r.carPublicId != null ? r.carPublicId : r.fc.id}</span>
              </p>
              <div class="fc-mobile-card-links">
                ${sourceLink}
                ${publicLink}
              </div>
            </div>
          </div>
          <div class="fc-mobile-card-actions">${mobileActions}</div>
        </div>`;
    })
    .join('');

  const paginationHtml =
    totalPages <= 1
      ? ''
      : `
    <div class="fc-pagination">
      <span>Авто: ${offset + 1}–${Math.min(offset + limit, total)} из ${total}</span>
      ${safePage > 1 ? `<a href="?${buildQuery({ page: safePage - 1 })}">←</a>` : ''}
      ${Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === totalPages || (p >= safePage - 2 && p <= safePage + 2))
        .map((p, idx, arr) => {
          if (idx > 0 && arr[idx - 1] !== p - 1) return ['…', p];
          return [p];
        })
        .flat()
        .map((p) => (p === '…' ? '<span>…</span>' : p === safePage ? `<span class="fc-page-current">${p}</span>` : `<a href="?${buildQuery({ page: p })}">${p}</a>`))
        .join('')}
      ${safePage < totalPages ? `<a href="?${buildQuery({ page: safePage + 1 })}">→</a>` : ''}
    </div>`;

  const mobileCardsWrap = `<div class="fc-mobile-cards">${pageRows.length === 0 ? '<p class="empty fc-empty-mobile">Нет авто по выбранным фильтрам.</p>' : mobileCardsHtml}</div>`;
  const listContentHtml = tableHtml + mobileCardsWrap + paginationHtml;
  const listStaticHtml = tabsHtml + filtersHtml;

  const isPartial = req.get('X-Requested-With') === 'XMLHttpRequest';
  if (isPartial) {
    return res.type('html').send(listContentHtml);
  }

  const photoModalHtml = `
    <div class="fc-photo-modal-backdrop" id="fcPhotoModal" hidden>
      <button type="button" class="fc-photo-modal-close" id="fcPhotoModalClose" aria-label="Закрыть">×</button>
      <img src="" alt="Фото" class="fc-photo-modal" id="fcPhotoModalImg" />
    </div>`;
  const deleteModalHtml = `
    <div class="fc-delete-modal-backdrop" id="fcDeleteModal" hidden>
      <div class="fc-delete-modal" role="dialog" aria-labelledby="fcDeleteModalTitle" aria-modal="true">
        <h3 class="fc-delete-modal-title" id="fcDeleteModalTitle">Удалить?</h3>
        <p class="fc-delete-modal-text" id="fcDeleteModalText"></p>
        <div class="fc-delete-modal-actions">
          <button type="button" class="fc-delete-modal-btn fc-delete-modal-cancel" id="fcDeleteModalCancel">Отмена</button>
          <button type="button" class="fc-delete-modal-btn fc-delete-modal-confirm" id="fcDeleteModalConfirm">Удалить</button>
        </div>
      </div>
    </div>`;

  const extraScripts = `
    <script>
      (function() {
        var modal = document.getElementById('fcPhotoModal');
        var modalImg = document.getElementById('fcPhotoModalImg');
        var modalClose = document.getElementById('fcPhotoModalClose');
        function openPhoto(src) {
          if (src && modal && modalImg) { modalImg.src = src; modal.removeAttribute('hidden'); }
        }
        function closeModal() {
          if (modal) modal.setAttribute('hidden', 'hidden');
        }
        if (modalClose) modalClose.addEventListener('click', closeModal);
        if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

        var container = document.getElementById('fc-list-container');
        if (!container) return;
        container.addEventListener('click', function(e) {
          var tabLink = e.target.closest('a.fc-tab');
          if (tabLink && tabLink.getAttribute('data-tab')) {
            e.preventDefault();
            var form = container.querySelector('form.fc-filters');
            if (form) {
              var data = new FormData(form);
              data.set('tab', tabLink.getAttribute('data-tab'));
              data.set('page', '1');
              var params = new URLSearchParams(data);
              var qs = params.toString();
              var url = window.location.pathname + (qs ? '?' + qs : '');
              var tab = tabLink.getAttribute('data-tab');
              fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(r) { return r.text(); }).then(function(html) {
                var el = document.getElementById('fc-list-content');
                if (el) el.innerHTML = html;
                if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
                var tabInput = form.querySelector('input[name="tab"]');
                if (tabInput) tabInput.value = tab;
                container.querySelectorAll('a.fc-tab').forEach(function(a) {
                  if (a.getAttribute('data-tab') === tab) a.classList.add('fc-tab-active');
                  else a.classList.remove('fc-tab-active');
                });
              });
            }
            return;
          }
          var thumb = e.target.closest('.fc-thumb[data-fc-photo], .fc-mobile-card img[data-fc-photo]');
          if (thumb) {
            var src = thumb.getAttribute('data-fc-photo');
            if (src && !thumb.closest('a')) { e.preventDefault(); openPhoto(src); }
          }
          if (e.target.closest('.fc-filter-reset')) {
            e.preventDefault();
            var form = container.querySelector('form.fc-filters');
            if (form) {
              form.querySelectorAll('select').forEach(function(s) { s.value = ''; });
              form.querySelectorAll('input[type="text"]').forEach(function(i) { i.value = ''; });
              applyFilter();
            }
            return;
          }
          var a = e.target.closest('a[href^="?"]');
          if (a && a.closest('.fc-pagination')) {
            e.preventDefault();
            var url = window.location.pathname + a.getAttribute('href');
            fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(r) { return r.text(); }).then(function(html) {
              var el = document.getElementById('fc-list-content');
              if (el) el.innerHTML = html;
              if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
            });
          }
        });

        var debounceTimer;
        function applyFilter() {
          var form = container.querySelector('form.fc-filters');
          if (!form) return;
          var data = new FormData(form);
          data.set('page', '1');
          var params = new URLSearchParams(data);
          var qs = params.toString();
          var url = window.location.pathname + (qs ? '?' + qs : '');
          fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(r) { return r.text(); }).then(function(html) {
            var el = document.getElementById('fc-list-content');
            if (el) el.innerHTML = html;
            if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
          });
        }
        container.addEventListener('change', function(e) {
          if (e.target.matches('select, input') && container.contains(e.target) && e.target.closest('form.fc-filters')) applyFilter();
        });
        container.addEventListener('input', function(e) {
          if (container.contains(e.target) && e.target.closest('form.fc-filters') && (e.target.name === 'search' || e.target.name === 'id')) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(applyFilter, 350);
          }
        });
        container.addEventListener('submit', function(e) {
          if (e.target.classList && e.target.classList.contains('fc-filters')) { e.preventDefault(); applyFilter(); }
        });

        var deleteModal = document.getElementById('fcDeleteModal');
        var deleteModalText = document.getElementById('fcDeleteModalText');
        var deleteModalCancel = document.getElementById('fcDeleteModalCancel');
        var deleteModalConfirm = document.getElementById('fcDeleteModalConfirm');
        var fcFormToSubmit = null;
        if (deleteModal) {
          function openDeleteModal(type) {
            fcFormToSubmit = null;
            var btn = type && type.target ? type.target.closest('button') : null;
            var form = btn ? btn.closest('form.fc-action-form') : null;
            if (!form) return;
            fcFormToSubmit = form;
            if (deleteModalText) deleteModalText.textContent = form.getAttribute('data-fc-confirm-type') === 'destroy'
              ? 'Удалить запись навсегда? Восстановить будет нельзя.'
              : 'Удалить авто из подборки? Оно перейдёт во вкладку «Удалённые».';
            if (deleteModalConfirm) deleteModalConfirm.textContent = form.getAttribute('data-fc-confirm-type') === 'destroy' ? 'Удалить навсегда' : 'Удалить';
            deleteModal.removeAttribute('hidden');
          }
          function closeDeleteModal() {
            deleteModal.setAttribute('hidden', 'hidden');
            fcFormToSubmit = null;
          }
          if (deleteModalCancel) deleteModalCancel.addEventListener('click', closeDeleteModal);
          deleteModal.addEventListener('click', function(e) { if (e.target === deleteModal) closeDeleteModal(); });
          document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && deleteModal && !deleteModal.hasAttribute('hidden')) closeDeleteModal(); });
          if (deleteModalConfirm) deleteModalConfirm.addEventListener('click', function() {
            if (fcFormToSubmit) { fcFormToSubmit.submit(); }
            closeDeleteModal();
          });
          container.addEventListener('click', function(e) {
            if (e.target.closest('.fc-actions-btn-delete') || e.target.closest('.fc-actions-btn-destroy')) {
              e.preventDefault();
              openDeleteModal(e);
            }
          });
        }
      })();
    </script>`;

  const contentHtml = `
    <div class="card">
      <h2 class="content-title">Найденные авто</h2>
      <div id="fc-list-container">
        <div id="fc-list-static">${listStaticHtml}</div>
        <div id="fc-list-content">${listContentHtml}</div>
      </div>
      ${photoModalHtml}
      ${deleteModalHtml}
    </div>`;

  res.send(
    buildClientProfileLayout(partner, client, 'cars', contentHtml, {
      pageTitle: 'Найденные авто',
      extraStyles: workspaceContentStyles,
      extraScripts,
    })
  );
});

// Профиль клиента: вкладка «Удалённые критерии»
router.get('/partner/admin/clients/:clientId/deleted', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) return res.redirect('/partner/admin');
  const client = Client.findById(clientId);
  if (!client || client.partnerId !== partner.id) return res.redirect('/partner/admin');
  const { deletedHtml } = buildClientCriteriaHtml(partner, client);
  const contentHtml = `
    <div class="card">
      <h2 class="content-title">Удалённые критерии</h2>
      ${deletedHtml}
    </div>`;
  res.send(
    buildClientProfileLayout(partner, client, 'deleted', contentHtml, {
      pageTitle: 'Удалённые критерии',
      extraStyles: workspaceContentStyles,
    })
  );
});

// Профиль клиента: вкладка «Финансы / расчёты» (заглушка для растаможки, утиль, ВНЖ, варианты пригона)
router.get('/partner/admin/clients/:clientId/finances', requirePartnerAuth, (req, res) => {
  const partner = req.partner;
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) return res.redirect('/partner/admin');
  const client = Client.findById(clientId);
  if (!client || client.partnerId !== partner.id) return res.redirect('/partner/admin');
  const contentHtml = `
    <div class="card">
      <h2 class="content-title">Финансы и расчёты</h2>
      <p class="page-section-subtitle" style="margin:0 0 16px;">Растаможка, утилизационный сбор, ВНЖ, варианты пригона — блок в разработке.</p>
      <p class="empty">Здесь будут расчёты по авто клиента и варианты пригона. Финансовые блоки отображаются на уровне карточки авто внутри клиента.</p>
    </div>`;
  res.send(
    buildClientProfileLayout(partner, client, 'finances', contentHtml, {
      pageTitle: 'Финансы',
      extraStyles: workspaceContentStyles,
    })
  );
});

// Список найденных авто по критерию
router.get(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId/cars',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId || criterion.deleted_at) {
      return res.redirect('/partner/admin');
    }
    const foundCars = CriterionFoundCar.findByCriterion(criteriaId);
    const basePlatformUrl = '/p/' + encodeURIComponent(partner.slug) + '/cars/';
    const rows = foundCars
      .map(
        (fc) => {
          const car = fc.car_id ? Car.findById(fc.car_id) : null;
          const carPublicId = car && car.public_id != null ? car.public_id : fc.car_id;
          const platformLink = fc.car_id
            ? `<a href="${basePlatformUrl}${carPublicId}" target="_blank" rel="noopener noreferrer">Страница на платформе</a>`
            : '<span class="not-added">Ещё не добавлена на платформу</span>';
          const sourceUrlSafe = (fc.source_url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
          const sourceDisplay = (fc.source_url || '').replace(/</g, '&lt;');
          return `
            <tr>
              <td>${fc.id}</td>
              <td><a href="${sourceUrlSafe}" target="_blank" rel="noopener noreferrer">${sourceDisplay}</a></td>
              <td>${platformLink}</td>
              <td>
                <form method="post" action="/partner/admin/clients/${clientId}/search-criteria/${criteriaId}/found-cars/${fc.id}/delete" style="display:inline;">
                  <button type="submit" class="found-car-delete-btn" onclick="return confirm('Удалить из подборки? Машина на платформе будет удалена.');">Удалить</button>
                </form>
              </td>
            </tr>`;
        }
      )
      .join('');
    const tableHtml =
      foundCars.length === 0
        ? '<p class="empty">Найденных авто пока нет. Добавьте ссылку на страницу источника.</p>'
        : `
          <div class="table-wrap">
            <table class="found-cars-table">
              <thead>
                <tr><th>ID</th><th>Страница источника</th><th>На платформе</th><th></th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
    const carsTableStyles = `
      .table-wrap { overflow-x: auto; margin: 16px 0; }
      .found-cars-table { width: 100%; border-collapse: collapse; }
      .found-cars-table th, .found-cars-table td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; font-size: 14px; }
      .found-cars-table th { background: #f9fafb; font-weight: 600; }
      .found-cars-table a { color: #2563eb; text-decoration: none; }
      .found-cars-table a:hover { text-decoration: underline; }
      .not-added { color: #9ca3af; font-style: italic; }
      .found-car-delete-btn { padding: 6px 12px; border-radius: 8px; border: none; background: #fef2f2; color: #b91c1c; font-size: 13px; cursor: pointer; }
      .found-car-delete-btn:hover { background: #fee2e2; }
      @media (max-width: 640px) {
        .found-cars-table, .found-cars-table thead, .found-cars-table tbody, .found-cars-table th, .found-cars-table td, .found-cars-table tr { display: block; }
        .found-cars-table thead { display: none; }
        .found-cars-table tr { margin-bottom: 12px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; padding: 10px 12px; }
        .found-cars-table td { border: none; padding: 4px 0; font-size: 13px; }
        .found-cars-table td:nth-child(1)::before { content: 'ID'; font-weight: 600; color: #6b7280; margin-right: 6px; }
        .found-cars-table td:nth-child(2)::before { content: 'Источник: '; font-weight: 500; color: #6b7280; display: block; margin-bottom: 2px; }
        .found-cars-table td:nth-child(3)::before { content: 'На платформе: '; font-weight: 500; color: #6b7280; display: block; margin-bottom: 2px; }
        .found-cars-table td:nth-child(4) { padding-top: 8px; }
      }
    `;
    const contentHtml = `
      <div class="card">
        <a href="/partner/admin/clients/${clientId}/found-cars" class="workspace-back" style="display:inline-block;margin-bottom:16px;">← К найденным авто</a>
        <h2 class="content-title">Список найденных авто</h2>
        <p class="subtitle" style="color:#6b7280;font-size:14px;margin:0 0 20px;">Критерий: ${(criterion.name || '—').replace(/</g, '&lt;')}</p>
        ${tableHtml}
      </div>`;
    res.send(
      buildClientProfileLayout(partner, client, 'cars', contentHtml, {
        pageTitle: 'Список найденных авто',
        extraStyles: workspaceContentStyles + carsTableStyles,
      })
    );
  }
);

// POST: мягкое удаление — перевести найденное авто во вкладку «Удалённые»
router.post(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId/found-cars/:foundCarId/delete',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    const foundCarId = Number(req.params.foundCarId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0 || !Number.isInteger(foundCarId) || foundCarId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId || criterion.deleted_at) {
      return res.redirect('/partner/admin');
    }
    const foundCar = CriterionFoundCar.findById(foundCarId);
    if (!foundCar || foundCar.search_criteria_id !== criteriaId) {
      return res.redirect('/partner/admin');
    }
    CriterionFoundCar.softDelete(foundCarId);
    res.redirect('/partner/admin/clients/' + clientId + '/found-cars?tab=deleted');
  }
);

// POST: удалить найденное авто навсегда (только из вкладки «Удалённые»)
router.post(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId/found-cars/:foundCarId/destroy',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    const foundCarId = Number(req.params.foundCarId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0 || !Number.isInteger(foundCarId) || foundCarId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId || criterion.deleted_at) {
      return res.redirect('/partner/admin');
    }
    const foundCar = CriterionFoundCar.findById(foundCarId);
    if (!foundCar || foundCar.search_criteria_id !== criteriaId) {
      return res.redirect('/partner/admin');
    }
    if ((foundCar.status || 'published') !== CriterionFoundCar.STATUS_DELETED) {
      return res.redirect('/partner/admin/clients/' + clientId + '/found-cars?tab=deleted');
    }
    CriterionFoundCar.permanentDelete(foundCarId);
    res.redirect('/partner/admin/clients/' + clientId + '/found-cars?tab=deleted');
  }
);

// Страница редактирования критерия поиска (в workspace)
router.get(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId/edit',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId || criterion.deleted_at) {
      return res.redirect('/partner/admin');
    }
    const countries = ['Korea', 'China', 'Europe'];
    const countryOptions = countries
      .map((c) => `<option value="${c}"${criterion.country === c ? ' selected' : ''}>${c}</option>`)
      .join('');
    const editFormStyles = `
      .edit-form label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: #374151; }
      .edit-form input, .edit-form select { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #d1d5db; font: inherit; font-size: 16px; margin-bottom: 16px; }
      .edit-form-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
      .edit-form-actions button { padding: 12px 20px; border-radius: 10px; border: none; font-weight: 600; cursor: pointer; font-size: 14px; }
      .btn-primary { background: #4f46e5; color: white; }
      .btn-primary:hover { background: #4338ca; }
      .btn-secondary { background: #e5e7eb; color: #374151; text-decoration: none; display: inline-flex; align-items: center; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; }
      .btn-secondary:hover { background: #d1d5db; }
    `;
    const contentHtml = `
      <div class="card">
        <a href="/partner/admin/clients/${clientId}" class="workspace-back" style="display:inline-block;margin-bottom:16px;">← К активным критериям</a>
        <h2 class="content-title">Редактировать критерий поиска</h2>
        <form method="post" action="/partner/admin/clients/${clientId}/search-criteria/${criteriaId}" class="edit-form">
          <label for="criterionName">Название подборки (для этого критерия)</label>
          <input type="text" id="criterionName" name="criterionName" placeholder="Название подборки" value="${(criterion.name || '').replace(/"/g, '&quot;')}" />
          <label for="country">Страна</label>
          <select id="country" name="country" required>${countryOptions}</select>
          <label for="sourceSite">Площадка (опционально)</label>
          <input type="text" id="sourceSite" name="sourceSite" placeholder="Площадка" value="${(criterion.source_site || '').replace(/"/g, '&quot;')}" />
          <label for="searchUrl">Ссылка на поиск</label>
          <input type="text" id="searchUrl" name="searchUrl" placeholder="https://..." required value="${(criterion.search_url || '').replace(/"/g, '&quot;')}" />
          <div class="edit-form-actions">
            <button type="submit" class="btn-primary">Сохранить</button>
            <a href="/partner/admin/clients/${clientId}" class="btn-secondary">Отмена</a>
          </div>
        </form>
      </div>`;
    res.send(
      buildClientProfileLayout(partner, client, 'criteria', contentHtml, {
        pageTitle: 'Редактировать критерий',
        extraStyles: workspaceContentStyles + editFormStyles,
      })
    );
  }
);

// Обновление критерия поиска
router.post(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId || criterion.deleted_at) {
      return res.redirect('/partner/admin');
    }
    const { country, sourceSite, searchUrl, criterionName } = req.body || {};
    const allowed = ['Korea', 'China', 'Europe'];
    if (!country || !allowed.includes(country) || !searchUrl) {
      return res.redirect('/partner/admin/clients/' + clientId + '/search-criteria/' + criteriaId + '/edit');
    }
    SearchCriteria.update(criteriaId, {
      name: criterionName,
      country,
      sourceSite: sourceSite || null,
      searchUrl: searchUrl.trim(),
    });
    res.redirect('/partner/admin/clients/' + clientId);
  }
);

// Добавление критерия поиска партнёром
router.post(
  '/partner/admin/clients/:clientId/search-criteria',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.redirect('/partner/admin');
    }

    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }

    const { country, sourceSite, searchUrl, criterionName } = req.body || {};
    const allowed = ['Korea', 'China', 'Europe'];
    if (!country || !allowed.includes(country) || !searchUrl) {
      return res.redirect('/partner/admin');
    }

    SearchCriteria.create({
      clientId,
      name: criterionName,
      country,
      sourceSite: sourceSite || null,
      searchUrl: searchUrl.trim(),
    });

    res.redirect('/partner/admin/clients/' + clientId);
  }
);

// Мягкое удаление критерия (в «Удалённые»)
router.post(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId/delete',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId) {
      return res.redirect('/partner/admin');
    }
    if (criterion.deleted_at) {
      return res.redirect('/partner/admin');
    }
    SearchCriteria.softDelete(criteriaId);
    res.redirect('/partner/admin/clients/' + clientId);
  }
);

// Восстановление критерия из удалённых
router.post(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId/restore',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId) {
      return res.redirect('/partner/admin');
    }
    SearchCriteria.restore(criteriaId);
    res.redirect('/partner/admin/clients/' + clientId + '/deleted');
  }
);

// Безвозвратное удаление критерия
router.post(
  '/partner/admin/clients/:clientId/search-criteria/:criteriaId/destroy',
  requirePartnerAuth,
  (req, res) => {
    const partner = req.partner;
    const clientId = Number(req.params.clientId);
    const criteriaId = Number(req.params.criteriaId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(criteriaId) || criteriaId <= 0) {
      return res.redirect('/partner/admin');
    }
    const client = Client.findById(clientId);
    if (!client || client.partnerId !== partner.id) {
      return res.redirect('/partner/admin');
    }
    const criterion = SearchCriteria.findById(criteriaId);
    if (!criterion || criterion.client_id !== clientId) {
      return res.redirect('/partner/admin');
    }
    SearchCriteria.permanentDelete(criteriaId);
    res.redirect('/partner/admin/clients/' + clientId + '/deleted');
  }
);

module.exports = router;

