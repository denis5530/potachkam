// src/routes/public.js
// Публичные страницы для партнёров и их клиентов

const express = require('express');
const router = express.Router();

const Partner = require('../models/Partner');
const Client = require('../models/Client');
const Car = require('../models/Car');
const SearchCriteria = require('../models/SearchCriteria');
const CriterionFoundCar = require('../models/CriterionFoundCar');

function toPositiveInt(raw) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

/** Парсит публичный ID (большое число для URL); допускает 12-значные */
function parsePublicId(raw) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 100000000000) {
    return null;
  }
  return num;
}

/** Плашка перегонщика: лого (или первая буква имени) + название */
function partnerBadgeHtml(partner) {
  const name = (partner.name || '').trim() || 'Перегонщик';
  const escapedName = name.replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const firstLetter = name.charAt(0).toUpperCase() || '?';
  if (partner.logo_url) {
    const logoHtml = partnerLogoHtml(partner, 'partner-badge-logo', true);
    return (
      '<div class="partner-badge">' +
      logoHtml +
      '<span class="partner-badge-name">' + escapedName + '</span>' +
      '</div>'
    );
  }
  return (
    '<div class="partner-badge">' +
    '<span class="partner-badge-letter" aria-hidden="true">' + firstLetter.replace(/</g, '&lt;') + '</span>' +
    '<span class="partner-badge-name">' + escapedName + '</span>' +
    '</div>'
  );
}

/** Возвращает HTML логотипа: при наличии logo_crop_json — div с background (круг/кадр), иначе img с object-position */
function partnerLogoHtml(partner, className, contain) {
  const logoSrc = '/uploads/' + (partner.logo_url.startsWith('partners/') ? partner.logo_url : 'partners/' + partner.logo_url);
  let crop = null;
  if (partner.logo_crop_json) {
    try {
      const parsed = JSON.parse(partner.logo_crop_json);
      if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.zoom === 'number') {
        crop = { x: Math.max(0, Math.min(100, parsed.x)), y: Math.max(0, Math.min(100, parsed.y)), zoom: Math.max(0.3, Math.min(5, parsed.zoom)) };
      }
    } catch (e) {}
  }
  if (crop) {
    const size = (100 * crop.zoom).toFixed(1);
    const posX = (100 - crop.x).toFixed(1);
    const posY = (100 - crop.y).toFixed(1);
    return '<div class="' + className + ' partner-logo-crop" style="background-image:url(\'' + logoSrc.replace(/'/g, '\\\'') + '\');background-size:' + size + '%;background-position:' + posX + '% ' + posY + '%;background-repeat:no-repeat;"></div>';
  }
  const logoPos = (partner.logo_position && String(partner.logo_position).trim()) || 'center center';
  const fit = contain ? 'contain' : 'cover';
  return '<img class="' + className + '" src="' + logoSrc + '" alt="" style="object-fit:' + fit + ';object-position:' + logoPos.replace(/</g, '') + ';" />';
}

/** Блок «Подборка от перегонщика» для страницы клиента: круглое лого, название, ссылка на /p/:slug */
function clientPagePartnerBlockHtml(partner, slug) {
  const name = (partner.name || '').trim() || 'Перегонщик';
  const escapedName = name.replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const firstLetter = name.charAt(0).toUpperCase() || '?';
  const profileHref = '/p/' + encodeURIComponent(slug);
  let avatar = '';
  if (partner.logo_url) {
    avatar = partnerLogoHtml(partner, 'client-partner-avatar-img', false);
  } else {
    avatar = '<span class="client-partner-avatar-letter" aria-hidden="true">' + firstLetter.replace(/</g, '&lt;') + '</span>';
  }
  return (
    '<a class="client-partner-block" href="' + profileHref + '">' +
    '<span class="client-partner-avatar">' + avatar + '</span>' +
    '<span class="client-partner-meta">' +
    '<span class="client-partner-label">Подборка по критериям от</span>' +
    '<span class="client-partner-name">' + escapedName + '</span>' +
    '</span>' +
    '<span class="client-partner-arrow" aria-hidden="true">&rarr;</span>' +
    '</a>'
  );
}

/** Плашка профиля со ссылкой на /p/:slug (лого + название, круглые) — для блока «Связаться» */
function partnerProfileLinkHtml(partner, slug) {
  const name = (partner.name || '').trim() || 'Перегонщик';
  const escapedName = name.replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const firstLetter = name.charAt(0).toUpperCase() || '?';
  const profileHref = '/p/' + encodeURIComponent(slug);
  let inner = '';
  if (partner.logo_url) {
    inner = partnerLogoHtml(partner, 'partner-profile-plaque-logo', false) + '<span class="partner-profile-plaque-name">' + escapedName + '</span>';
  } else {
    inner = '<span class="partner-profile-plaque-letter" aria-hidden="true">' + firstLetter.replace(/</g, '&lt;') + '</span><span class="partner-profile-plaque-name">' + escapedName + '</span>';
  }
  return '<a class="partner-profile-plaque" href="' + profileHref + '">' + inner + '<span class="partner-profile-plaque-arrow" aria-hidden="true">&rarr;</span></a>';
}

const DEFAULT_TAGLINE = 'Подбор и пригон авто из Кореи, Китая, Европы';

/** Стиль обложки для ПК с учётом cover_crop_json (x, y, zoom) */
function partnerCoverStyle(partner) {
  if (!partner.cover_url) return '';
  const url = '/uploads/' + (partner.cover_url.startsWith('partners/') ? partner.cover_url : 'partners/' + partner.cover_url);
  let crop = null;
  if (partner.cover_crop_json) {
    try {
      const parsed = JSON.parse(partner.cover_crop_json);
      if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.zoom === 'number') {
        crop = { x: Math.max(0, Math.min(100, parsed.x)), y: Math.max(0, Math.min(100, parsed.y)), zoom: Math.max(0.3, Math.min(5, parsed.zoom)) };
      }
    } catch (e) {}
  }
  if (crop) {
    const size = (100 * crop.zoom).toFixed(1);
    const px = (100 - crop.x).toFixed(1);
    const py = (100 - crop.y).toFixed(1);
    return ' style="background-image: url(\'' + url.replace(/'/g, '\\\'') + '\'); background-size: ' + size + '%; background-position: ' + px + '% ' + py + '%; background-repeat: no-repeat;"';
  }
  return ' style="background-image: url(\'' + url.replace(/'/g, '\\\'') + '\'); background-repeat: no-repeat;"';
}

/** Стиль обложки для мобильной версии: cover_mobile_url + cover_mobile_crop_json или fallback на ПК-обложку */
function partnerCoverMobileStyle(partner) {
  const coverUrl = partner.cover_mobile_url || partner.cover_url;
  if (!coverUrl) return '';
  const url = '/uploads/' + (coverUrl.startsWith('partners/') ? coverUrl : 'partners/' + coverUrl);
  const cropJson = partner.cover_mobile_crop_json || partner.cover_crop_json;
  let crop = null;
  if (cropJson) {
    try {
      const parsed = JSON.parse(cropJson);
      if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.zoom === 'number') {
        crop = { x: Math.max(0, Math.min(100, parsed.x)), y: Math.max(0, Math.min(100, parsed.y)), zoom: Math.max(0.3, Math.min(5, parsed.zoom)) };
      }
    } catch (e) {}
  }
  if (crop) {
    const size = (100 * crop.zoom).toFixed(1);
    const px = (100 - crop.x).toFixed(1);
    const py = (100 - crop.y).toFixed(1);
    return ' style="background-image: url(\'' + url.replace(/'/g, '\\\'') + '\'); background-size: ' + size + '%; background-position: ' + px + '% ' + py + '%; background-repeat: no-repeat;"';
  }
  return ' style="background-image: url(\'' + url.replace(/'/g, '\\\'') + '\'); background-repeat: no-repeat;"';
}

/** Верхняя карточка перегонщика (под хедером): лого, имя, краткий текст, ссылка на профиль. Без обложки. */
function partnerTopCardHtml(partner, slug) {
  const profileHref = '/p/' + encodeURIComponent(slug);
  const badge = partnerBadgeHtml(partner);
  const tagline = (partner.tagline && String(partner.tagline).trim()) || DEFAULT_TAGLINE;
  return (
    '<div class="partner-top-card">' +
    '<a class="partner-top-card-inner" href="' + profileHref + '">' +
    '<span class="partner-top-card-badge">' + badge + '</span>' +
    '<span class="partner-top-card-tagline">' + tagline.replace(/</g, '&lt;') + '</span>' +
    '<span class="partner-top-card-link">Профиль &rarr;</span>' +
    '</a>' +
    '</div>'
  );
}

const partnerBadgeStyles = `
  .partner-badge {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    min-height: 48px;
  }
  .partner-badge-logo {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .partner-badge-logo.partner-logo-crop {
    display: block;
    box-sizing: border-box;
  }
  .partner-badge-letter {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #4f46e5;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .partner-badge-name {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
  }
  @media (max-width: 743px) {
    .partner-badge { padding: 8px 12px; gap: 10px; min-height: 44px; }
    .partner-badge-logo, .partner-badge-letter { width: 32px; height: 32px; font-size: 16px; }
    .partner-badge-name { font-size: 15px; }
  }
  .contacts-partner { margin-bottom: 12px; }
  .contacts-partner .partner-badge { padding: 8px 0; background: transparent; border: none; }
  .contacts-partner .partner-badge-logo,
  .contacts-partner .partner-badge-letter { border-radius: 50%; }

  .partner-profile-plaque {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    text-decoration: none;
    color: inherit;
    border-radius: 12px;
    transition: background 0.15s ease;
  }
  .partner-profile-plaque:hover { background: #f8fafc; text-decoration: none; color: inherit; }
  .partner-profile-plaque-arrow {
    margin-left: auto;
    font-size: 18px;
    color: #4f46e5;
    font-weight: 600;
    line-height: 1;
  }
  .partner-profile-plaque-logo,
  .partner-profile-plaque-letter {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: contain;
    flex-shrink: 0;
  }
  .partner-profile-plaque-letter {
    background: #4f46e5;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 600;
  }
  .partner-profile-plaque-name { font-size: 16px; font-weight: 600; color: #111827; }

  .partner-top-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 10px 14px;
    margin-bottom: 16px;
    max-width: 100%;
    position: relative;
  }
  .partner-top-card::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: linear-gradient(to bottom, rgba(248,250,252,0.85) 0%, rgba(248,250,252,0.95) 100%);
    pointer-events: none;
  }
  .partner-top-card .partner-top-card-inner { position: relative; z-index: 1; }
  .partner-top-card-inner {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;
    text-decoration: none;
    color: inherit;
    flex-wrap: wrap;
    min-height: 52px;
    box-sizing: border-box;
  }
  .partner-top-card-inner:hover { text-decoration: none; color: inherit; }
  .partner-top-card-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    align-self: center;
  }
  .partner-top-card-badge .partner-badge {
    background: transparent;
    border: none;
    padding: 0;
    min-height: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .partner-top-card-badge .partner-badge-logo,
  .partner-top-card-badge .partner-badge-letter {
    width: 32px;
    height: 32px;
    font-size: 16px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    vertical-align: middle;
  }
  .partner-top-card-badge .partner-badge-logo {
    object-fit: cover;
    display: block;
  }
  .partner-top-card-badge .partner-badge-logo.partner-logo-crop {
    width: 32px;
    height: 32px;
  }
  .partner-top-card-badge .partner-badge-letter {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .partner-top-card-badge .partner-badge-name {
    font-size: 15px;
    font-weight: 600;
    line-height: 32px;
    padding: 0;
    margin: 0;
  }
  .partner-top-card-tagline {
    font-size: 13px;
    color: #64748b;
    margin: 0;
    line-height: 1.3;
    flex: 1;
    min-width: 120px;
    text-align: center;
  }
  .partner-top-card-link {
    font-size: 13px;
    font-weight: 500;
    color: #4f46e5;
    flex-shrink: 0;
  }
  .partner-top-card-inner:hover .partner-top-card-link { text-decoration: underline; }
  @media (max-width: 743px) {
    .partner-top-card { padding: 8px 12px; }
    .partner-top-card-inner { gap: 10px; }
    .partner-top-card-tagline { font-size: 12px; }
    .partner-top-card-link { font-size: 12px; }
  }
`;

// Единый хедер как на главной (СМИ: логотип, меню, поиск)
const platformHeaderHtml = `
  <header class="site-header" role="banner">
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
`;

const platformHeaderStyles = `
  .site-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
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
    color: #1a1a1a;
    text-decoration: none;
  }
  .site-logo:hover { text-decoration: none; color: #1a1a1a; }
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
      color: #6b7280;
      text-decoration: none;
    }
    .site-nav a:hover { color: #1a1a1a; text-decoration: none; }
    .site-search {
      display: block;
      width: 200px;
      padding: 8px 12px;
      font-size: 14px;
      font-family: inherit;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #ffffff;
    }
    .site-search::placeholder { color: #6b7280; }
  }
`;

// Главная страница: медиа + платформа про пригон авто (Airbnb/Stripe/Notion уровень)
const getHomePage = require('../views/homePage');

router.get('/', (req, res) => {
  res.send(getHomePage());
});

// Публичная страница партнёра: /p/:slug — Link-in-bio + Подборки машин + Свеже найденные
router.get('/p/:slug', (req, res) => {
  const { slug } = req.params;

  const partner = Partner.findBySlug(slug);
  if (!partner) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ru">
        <head>
          <meta charset="UTF-8" />
          <title>Партнёр не найден</title>
        </head>
        <body>
          <h1>Партнёр не найден</h1>
          <p>Похоже, ссылка некорректна или партнёр ещё не создан.</p>
        </body>
      </html>
    `);
  }

  const clients = Client.findByPartnerId(partner.id);

  // Контакты для hero
  let contacts = null;
  if (partner.contacts_json) {
    try {
      const parsed = JSON.parse(partner.contacts_json);
      if (parsed && typeof parsed === 'object') contacts = parsed;
    } catch (e) {
      contacts = null;
    }
  }

  const partnerName = (partner.name || '').trim() || 'Перегонщик';
  const firstLetter = partnerName.charAt(0).toUpperCase() || '?';
  let avatarHtml = '';
  if (partner.logo_url) {
    avatarHtml = partnerLogoHtml(partner, 'partner-profile-avatar-img', false);
  } else {
    avatarHtml = '<span class="partner-profile-avatar-letter" aria-hidden="true">' + firstLetter.replace(/</g, '&lt;') + '</span>';
  }

  const linkItems = []; // Сайт, Ютуб, ВК, Телеграм-канал — только если есть
  let phoneBtnHtml = '';
  let messengerBtnsHtml = '';
  if (contacts) {
    const phone = contacts.phone;
    const telegram = contacts.telegram;
    const whatsapp = contacts.whatsapp;
    const viber = contacts.viber;
    const website = contacts.website;
    const youtube = contacts.youtube;
    const vk = contacts.vk;
    const telegram_channel = contacts.telegram_channel;

    const phoneHref = phone ? 'tel:' + phone.replace(/[^0-9+]/g, '') : null;
    let tgHref = null;
    if (telegram) {
      tgHref = (telegram.startsWith('http') ? telegram : (telegram.startsWith('@') ? 'https://t.me/' + telegram.slice(1) : 'https://t.me/' + telegram));
    }
    let waHref = null;
    if (whatsapp) {
      const digits = whatsapp.replace(/[^0-9]/g, '');
      if (digits) waHref = 'https://wa.me/' + digits;
    }
    let viberHref = null;
    if (viber) {
      if (viber.startsWith('http')) viberHref = viber;
      else {
        const digits = viber.replace(/[^0-9]/g, '');
        if (digits) viberHref = 'https://viber.click/' + digits;
      }
    }

    phoneBtnHtml = (phone && phoneHref)
      ? '<a class="partner-profile-btn partner-profile-btn-phone" href="' + phoneHref + '" title="Позвонить">' +
        '<span class="partner-profile-btn-phone-text">' + (phone.replace(/</g, '&lt;')) + '</span>' +
        '<span class="partner-profile-btn-phone-icon" aria-hidden="true"><img src="/public/icons/phone-call.png" alt="" width="24" height="24" /></span></a>'
      : '';
    const messengerItems = [];
    if (tgHref) messengerItems.push({ href: tgHref, label: 'Telegram', class: 'tg', icon: '/public/icons/telegram.png' });
    if (waHref) messengerItems.push({ href: waHref, label: 'WhatsApp', class: 'wa', icon: '/public/icons/whatsapp.png' });
    if (viberHref) messengerItems.push({ href: viberHref, label: 'Viber', class: 'viber', icon: '/public/icons/viber.png' });
    messengerBtnsHtml = messengerItems.map((m) =>
      '<a class="partner-profile-msg partner-profile-msg--' + m.class + '" href="' + m.href + '" target="_blank" rel="noopener noreferrer" title="' + m.label.replace(/"/g, '&quot;') + '"><span class="partner-profile-msg-icon" aria-hidden="true"><img src="' + m.icon + '" alt="" width="24" height="24" /></span></a>'
    ).join('');

    const ensureUrl = (val) => {
      if (!val || typeof val !== 'string') return null;
      const s = val.trim();
      if (!s) return null;
      return (s.startsWith('http://') || s.startsWith('https://')) ? s : ('https://' + s);
    };
    const channelHref = (val) => {
      if (!val || typeof val !== 'string') return null;
      const s = val.trim();
      if (!s) return null;
      if (s.startsWith('http')) return s;
      if (s.startsWith('@')) return 'https://t.me/' + s.slice(1);
      return 'https://t.me/' + s;
    };
    if (website && website.trim()) linkItems.push({ label: 'Сайт компании', shortLabel: 'Сайт', href: ensureUrl(website), icon: 'site' });
    if (youtube && youtube.trim()) linkItems.push({ label: 'Ютуб', shortLabel: 'Ютуб', href: ensureUrl(youtube), icon: 'youtube' });
    if (vk && vk.trim()) linkItems.push({ label: 'ВК', shortLabel: 'ВК', href: ensureUrl(vk), icon: 'vk' });
    if (telegram_channel && telegram_channel.trim()) linkItems.push({ label: 'Телеграм-канал', shortLabel: 'Канал', href: channelHref(telegram_channel), icon: 'channel' });
  }
  const linkCardsHtml = linkItems.map((item) => {
    const cls = 'partner-profile-link-card partner-profile-link-card--' + (item.icon || '');
    const displayLabel = (item.shortLabel || item.label).replace(/</g, '&lt;');
    return '<a class="' + cls + '" href="' + item.href + '" target="_blank" rel="noopener noreferrer" title="' + (item.label || '').replace(/"/g, '&quot;') + '">' +
      '<span class="partner-profile-link-card-icon" aria-hidden="true"></span>' +
      '<span class="partner-profile-link-card-label">' + displayLabel + '</span>' +
      '<span class="partner-profile-link-card-arrow" aria-hidden="true">→</span></a>';
  });
  const heroButtonsHtml = (phoneBtnHtml || messengerBtnsHtml)
    ? '<div class="partner-profile-cta" aria-label="Связаться">' +
      (phoneBtnHtml ? '<div class="partner-profile-cta-phone">' + phoneBtnHtml + '</div>' : '') +
      (messengerBtnsHtml ? '<div class="partner-profile-cta-messengers">' + messengerBtnsHtml + '</div>' : '') +
      '</div>'
    : '';
  const heroLinksSectionHtml = linkCardsHtml.length > 0
    ? '<div class="partner-profile-links-section"><h2 class="partner-profile-links-title">Все ссылки</h2><div class="partner-profile-links-list">' + linkCardsHtml.join('') + '</div></div>'
    : '';
  const heroTagline = (partner.tagline && String(partner.tagline).trim()) || DEFAULT_TAGLINE;
  const heroHeaderInnerHtml =
    '<div class="partner-profile-avatar-wrap"><div class="partner-profile-avatar">' + avatarHtml + '</div></div>' +
    '<div class="partner-profile-info">' +
    '<h1 class="partner-profile-name">' + partnerName.replace(/</g, '&lt;') + '</h1>' +
    '<span class="partner-profile-slug">@' + slug.replace(/</g, '&lt;') + '</span>' +
    '<p class="partner-profile-tagline">' + heroTagline.replace(/</g, '&lt;') + '</p>' +
    (heroButtonsHtml ? '<div class="partner-profile-cta-wrap partner-profile-cta-wrap--desktop">' + heroButtonsHtml + '</div>' : '') +
    '</div>' +
    (heroButtonsHtml ? '<div class="partner-profile-cta-wrap partner-profile-cta-wrap--mobile">' + heroButtonsHtml + '</div>' : '');
  const heroHeaderHtml =
    '<div class="partner-profile-header">' +
    heroHeaderInnerHtml +
    '</div>';
  const heroTopHtml = (heroButtonsHtml || linkCardsHtml.length > 0)
    ? '<div class="partner-profile-top">' +
      heroHeaderHtml +
      heroLinksSectionHtml +
      '</div>'
    : heroHeaderHtml;

  const coverStyleDesktop = partner.cover_url ? partnerCoverStyle(partner) : '';
  const coverStyleMobile = (partner.cover_mobile_url || partner.cover_url) ? partnerCoverMobileStyle(partner) : '';
  const hasDesktopCover = !!partner.cover_url;
  const hasMobileCover = !!(partner.cover_mobile_url || partner.cover_url);
  const coverDesktopHtml = '<div class="partner-cover-plaque-inner partner-cover-plaque-desktop' + (hasDesktopCover ? ' partner-cover-plaque-inner--has-image' : '') + '"' + (coverStyleDesktop || '') + ' aria-label="Обложка (ПК)"></div>';
  const coverMobileHtml = '<div class="partner-cover-plaque-inner partner-cover-plaque-mobile' + (hasMobileCover ? ' partner-cover-plaque-inner--has-image' : '') + '"' + (coverStyleMobile || '') + ' aria-label="Обложка (мобильная)"></div>';

  // Карточки подборок: только критерии, в которых уже есть найденные авто
  const selectionCards = [];
  for (const client of clients) {
    const criteria = SearchCriteria.findByClient(client.id);
    for (const crit of criteria) {
      const carsInSelection = Car.findByCriterionId(crit.id);
      if (carsInSelection.length === 0) continue;
      let firstImage = null;
      if (carsInSelection[0].images_json) {
        try {
          const imgs = JSON.parse(carsInSelection[0].images_json);
          if (Array.isArray(imgs) && imgs.length > 0) firstImage = imgs[0];
        } catch (e) {}
      }
      const name = (crit.name || 'Подборка').replace(/</g, '&lt;');
      const selectionUrl = '/p/' + encodeURIComponent(slug) + '/selection/' + crit.public_id;
      const imageBlock = firstImage
        ? '<div class="selection-card-image"><img src="' + firstImage + '" alt="" loading="lazy" /></div>'
        : '<div class="selection-card-image selection-card-image--empty">Нет фото</div>';
      selectionCards.push(
        '<a class="selection-card" href="' + selectionUrl + '">' +
        imageBlock +
        '<div class="selection-card-body">' +
        '<h3 class="selection-card-title">' + name + '</h3>' +
        '<span class="selection-card-count">' + (carsInSelection.length === 1 ? '1 авто' : carsInSelection.length + ' авто') + '</span>' +
        '</div></a>'
      );
    }
  }
  const SELECTION_PREVIEW_LIMIT = 8;
  const selectionPreview = selectionCards.slice(0, SELECTION_PREVIEW_LIMIT);
  const hasMoreSelections = selectionCards.length > SELECTION_PREVIEW_LIMIT;
  const allSelectionsLink = hasMoreSelections
    ? '<a class="partner-section-link" href="/p/' + encodeURIComponent(slug) + '/selections">Смотреть все подборки (' + selectionCards.length + ')</a>'
    : '';
  const selectionSectionHtml = selectionCards.length > 0
    ? '<section class="partner-section partner-selections" aria-label="Подборки машин">' +
      '<div class="partner-section-head">' +
      '<h2 class="partner-section-title">Подборки машин</h2>' +
      (hasMoreSelections ? allSelectionsLink : '') +
      '</div>' +
      '<div class="selection-grid">' + selectionPreview.join('') + '</div>' +
      (hasMoreSelections ? '<div class="partner-section-footer"><a class="partner-section-link partner-section-link--block" href="/p/' + encodeURIComponent(slug) + '/selections">Смотреть все подборки</a></div>' : '') +
      '</section>'
    : '';

  // Все машины перегонщика по новизне
  const allCars = clients.flatMap((c) => Car.findByClient(c.id));
  allCars.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  let freshCarsHtml = '';
  if (allCars.length > 0) {
    const cards = allCars.map((car) => {
      let mainImage = null;
      if (car.images_json) {
        try {
          const imgs = JSON.parse(car.images_json);
          if (Array.isArray(imgs) && imgs.length > 0) mainImage = imgs[0];
        } catch (e) {}
      }
      const priceText = (typeof car.price === 'number' && car.price > 0) ? (car.price.toLocaleString ? car.price.toLocaleString('ru-RU') : car.price) + ' ₽' : 'Цена по запросу';
      const descShort = car.description ? (car.description.length > 120 ? car.description.slice(0, 120) + '…' : car.description) : '';
      const detailUrl = '/p/' + encodeURIComponent(slug) + '/cars/' + (car.public_id || car.id);
      const imgBlock = mainImage
        ? '<div class="car-card-image"><img src="' + mainImage + '" alt="' + (car.title || '').replace(/"/g, '&quot;') + '" loading="lazy" /></div>'
        : '<div class="car-card-image car-card-image--empty">Фото скоро появится</div>';
      return (
        '<a class="car-card" href="' + detailUrl + '">' + imgBlock +
        '<div class="car-card-body">' +
        '<h3 class="car-card-title">' + (car.title || '').replace(/</g, '&lt;') + '</h3>' +
        '<span class="car-card-price">' + priceText + '</span>' +
        (descShort ? '<p class="car-card-description">' + descShort.replace(/</g, '&lt;') + '</p>' : '') +
        '</div></a>'
      );
    });
    freshCarsHtml = '<section class="partner-section partner-fresh" aria-label="Свеже найденные машины">' +
      '<h2 class="partner-section-title">Свеже найденные машины</h2>' +
      '<div class="car-grid">' + cards.join('') + '</div>' +
      '</section>';
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${partnerName}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: 'Manrope', system-ui, -apple-system, sans-serif; margin: 0; background: #f1f5f9; color: #1e293b; }
          ${platformHeaderStyles}
          a { color: inherit; text-decoration: none; }
          a:hover { text-decoration: none; }

          .partner-page { max-width: 1120px; margin: 0 auto; padding: 24px 20px 48px; }
          .partner-hero-wrap { width: 100%; }
          .partner-cover-plaque {
            width: 100%;
            border-radius: 16px 16px 0 0;
            overflow: hidden;
            box-shadow: 0 4px 24px rgba(15,23,42,0.08), 0 1px 3px rgba(0,0,0,0.06);
            margin-bottom: 0;
            background: linear-gradient(145deg, #334155 0%, #475569 100%);
            position: relative;
            aspect-ratio: 2.5 / 1;
            border: 1px solid rgba(255,255,255,0.08);
            border-bottom: none;
          }
          @media (max-width: 767px) {
            .partner-cover-plaque { aspect-ratio: 1.7 / 1; border-radius: 12px 12px 0 0; }
          }
          .partner-cover-plaque-inner {
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
          }
          .partner-cover-plaque-desktop,
          .partner-cover-plaque-mobile {
            position: absolute;
            inset: 0;
          }
          .partner-cover-plaque-desktop { display: block; }
          .partner-cover-plaque-mobile { display: none; }
          @media (max-width: 767px) {
            .partner-cover-plaque-desktop { display: none; }
            .partner-cover-plaque-mobile { display: block; }
          }
          .partner-profile-card {
            background: #fff;
            border-radius: 0 0 16px 16px;
            box-shadow: 0 8px 40px rgba(15,23,42,0.08), 0 2px 8px rgba(0,0,0,0.04);
            margin-top: 0;
            margin-bottom: 32px;
            padding: 24px 20px 32px;
            position: relative;
            border: 1px solid rgba(0,0,0,0.04);
            border-top: none;
          }
          .partner-profile-header {
            display: grid;
            grid-template-columns: 72px 1fr;
            grid-template-rows: auto auto;
            gap: 16px 16px;
            margin-bottom: 24px;
            align-items: start;
          }
          .partner-profile-avatar-wrap {
            position: relative;
            left: auto;
            top: auto;
            transform: none;
            width: 72px;
            height: 72px;
            grid-column: 1;
            grid-row: 1;
          }
          .partner-profile-cta-wrap--desktop { display: none; }
          .partner-profile-cta-wrap--mobile {
            grid-column: 1 / -1;
            grid-row: 2;
            margin-top: 0;
          }
          .partner-profile-cta-wrap { margin-top: 0; }
          .partner-profile-avatar {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            overflow: hidden;
            background: #f1f5f9;
            border: 4px solid #fff;
            box-shadow: 0 8px 24px rgba(15,23,42,0.15);
          }
          .partner-profile-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .partner-profile-avatar-img.partner-logo-crop { width: 100%; height: 100%; }
          .partner-profile-avatar-letter {
            width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            font-size: 28px; font-weight: 700; color: #fff; background: linear-gradient(145deg, #475569 0%, #64748b 100%);
          }
          .partner-profile-top { margin-bottom: 0; }
          .partner-profile-info {
            grid-column: 2;
            grid-row: 1;
            min-width: 0;
            text-align: left;
            margin-bottom: 0;
          }
          .partner-profile-name {
            font-size: 20px;
            font-weight: 700;
            margin: 0 0 2px;
            letter-spacing: -0.03em;
            color: #0f172a;
            line-height: 1.25;
          }
          .partner-profile-slug {
            display: block;
            font-size: 13px;
            color: #94a3b8;
            margin: 0 0 4px;
            line-height: 1.4;
          }
          .partner-profile-tagline {
            font-size: 13px;
            color: #64748b;
            margin: 0 0 4px;
            line-height: 1.45;
            font-weight: 500;
          }
          .partner-profile-cta {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 10px;
            flex-wrap: nowrap;
          }
          .partner-profile-cta-phone { flex: 1; min-width: 0; }
          .partner-profile-cta-messengers {
            display: flex;
            flex-wrap: nowrap;
            justify-content: flex-end;
            gap: 8px;
            flex-shrink: 0;
          }
          .partner-profile-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            font-family: inherit;
            text-decoration: none;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            border: none;
            cursor: pointer;
            width: 100%;
            min-width: 0;
          }
          .partner-profile-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
          .partner-profile-btn-phone { background: #16a34a; color: #fff; }
          .partner-profile-btn-phone:hover { color: #fff; background: #15803d; }
          .partner-profile-btn-phone-icon { display: none; }
          .partner-profile-msg {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            overflow: hidden;
            text-decoration: none;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            flex-shrink: 0;
          }
          .partner-profile-msg:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
          .partner-profile-msg-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 0;
            width: 100%;
            height: 100%;
          }
          .partner-profile-msg-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .partner-profile-msg--tg { background: #229ED9; }
          .partner-profile-msg--tg:hover { color: #fff; }
          .partner-profile-msg--wa { background: #25D366; }
          .partner-profile-msg--wa:hover { color: #fff; }
          .partner-profile-msg--viber { background: #7360f2; }
          .partner-profile-msg--viber:hover { color: #fff; }
          @media (max-width: 420px) {
            .partner-profile-btn-phone {
              width: 44px;
              height: 44px;
              min-width: 44px;
              padding: 0;
              border-radius: 50%;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .partner-profile-btn-phone-text { display: none; }
            .partner-profile-btn-phone-icon {
              display: flex;
              align-items: center;
              justify-content: center;
              line-height: 0;
              width: 100%;
              height: 100%;
            }
            .partner-profile-btn-phone-icon img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            .partner-profile-cta-phone { flex: 0 0 auto; min-width: 0; }
          }
          .partner-profile-links-section { text-align: left; }
          .partner-profile-links-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #94a3b8;
            margin: 0 0 12px;
          }
          .partner-profile-links-list {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .partner-profile-link-card {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 16px 18px;
            border-radius: 12px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            font-size: 15px;
            font-weight: 600;
            color: #334155;
            text-decoration: none;
            transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          }
          .partner-profile-link-card:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 16px rgba(15,23,42,0.08);
            border-color: #cbd5e1;
            color: #0f172a;
          }
          .partner-profile-link-card-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 18px;
            font-weight: 600;
          }
          .partner-profile-link-card-label { flex: 1; text-align: left; }
          .partner-profile-link-card-arrow { color: #94a3b8; font-size: 18px; }
          .partner-profile-link-card--site .partner-profile-link-card-icon { background: #e0f2fe; color: #0284c7; }
          .partner-profile-link-card--youtube .partner-profile-link-card-icon { background: #fef2f2; color: #dc2626; }
          .partner-profile-link-card--vk .partner-profile-link-card-icon { background: #e0e7ff; color: #4f46e5; }
          .partner-profile-link-card--channel .partner-profile-link-card-icon { background: #dbeafe; color: #2563eb; }
          .partner-profile-link-card--site .partner-profile-link-card-icon::before { content: "🌐"; }
          .partner-profile-link-card--youtube .partner-profile-link-card-icon::before { content: "▶"; }
          .partner-profile-link-card--vk .partner-profile-link-card-icon::before { content: "VK"; font-size: 12px; }
          .partner-profile-link-card--channel .partner-profile-link-card-icon::before { content: "✈"; }

          .partner-section { margin-bottom: 32px; padding: 0 4px; }
          .partner-section-head {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 16px;
          }
          .partner-section-title { font-size: 20px; font-weight: 600; margin: 0; letter-spacing: -0.02em; color: #222; }
          .partner-section-link {
            font-size: 14px; font-weight: 500; color: #222;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
          .partner-section-link:hover { color: #333; }
          .partner-section-footer { margin-top: 16px; text-align: center; }
          .partner-section-link--block { display: inline-block; }
          .selection-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .selection-card {
            display: block;
            background: #fff;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid #ebebeb;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .selection-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
          .selection-card-image {
            aspect-ratio: 16 / 10;
            background: #e5e7eb;
            overflow: hidden;
          }
          .selection-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .selection-card-image--empty { display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }
          .selection-card-body { padding: 16px; }
          .selection-card-title { margin: 0 0 4px; font-size: 17px; font-weight: 600; color: #222; }
          .selection-card-count { font-size: 14px; color: #717171; }

          .car-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
          .partner-section-title { padding: 0; }
          .car-card {
            display: flex; flex-direction: column;
            background: #fff; border-radius: 16px; overflow: hidden;
            border: 1px solid #ebebeb; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .car-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
          .car-card-image { aspect-ratio: 16/10; background: #e5e7eb; overflow: hidden; }
          .car-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .car-card-image--empty { display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }
          .car-card-body { padding: 16px; }
          .car-card-title { margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #222; }
          .car-card-price { font-size: 15px; font-weight: 600; color: #222; }
          .car-card-description { margin: 8px 0 0; font-size: 13px; color: #717171; line-height: 1.4; }

          @media (min-width: 600px) {
            .selection-grid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
            .car-grid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
          }
          @media (min-width: 480px) {
            .partner-profile-links-list { grid-template-columns: repeat(2, 1fr); }
          }
          @media (min-width: 768px) {
            .partner-page { padding: 32px 32px 64px; }
            .partner-cover-plaque { border-radius: 20px 20px 0 0; }
            .partner-profile-card { padding: 28px 32px 36px; border-radius: 0 0 20px 20px; }
            .partner-profile-header { grid-template-columns: 96px 1fr; gap: 20px; margin-bottom: 28px; }
            .partner-profile-avatar-wrap { width: 96px; height: 96px; }
            .partner-profile-avatar-letter { font-size: 36px; }
            .partner-profile-name { font-size: 26px; }
            .partner-profile-slug { font-size: 14px; }
            .partner-profile-tagline { font-size: 15px; }
            .partner-profile-cta { flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 14px; }
            .partner-profile-cta-phone { width: auto; flex: 1; min-width: 0; }
            .partner-profile-btn { width: 100%; min-width: 0; }
            .partner-profile-cta-messengers { flex-shrink: 0; justify-content: flex-end; }
            .partner-section-title { font-size: 22px; margin-bottom: 20px; }
          }
          @media (min-width: 1024px) {
            .partner-page { padding: 40px 40px 80px; }
            .partner-cover-plaque { border-radius: 24px 24px 0 0; margin-bottom: 0; }
            .partner-profile-card { padding: 32px 40px 40px; border-radius: 0 0 24px 24px; margin-bottom: 40px; }
            .partner-profile-top {
              display: flex;
              flex-direction: row;
              align-items: stretch;
              gap: 40px;
              margin-bottom: 0;
            }
            .partner-profile-header {
              display: grid;
              grid-template-columns: 120px 1fr;
              grid-template-rows: auto;
              gap: 24px;
              flex: 1 1 auto;
              min-width: 380px;
              margin-bottom: 0;
              align-items: stretch;
            }
            .partner-profile-avatar-wrap {
              position: relative;
              left: auto;
              top: auto;
              transform: none;
              width: 120px;
              height: 120px;
              grid-column: 1;
              grid-row: 1;
            }
            .partner-profile-info { grid-column: 2; grid-row: 1; display: flex; flex-direction: column; flex: 1; min-width: 0; text-align: left; }
            .partner-profile-cta-wrap--desktop { display: block; margin-top: auto; }
            .partner-profile-cta-wrap--mobile { display: none; }
            .partner-profile-cta-wrap { margin-top: 0; }
            .partner-profile-name { font-size: 28px; margin-bottom: 4px; }
            .partner-profile-slug { font-size: 15px; margin-bottom: 6px; }
            .partner-profile-tagline { font-size: 16px; margin-bottom: 6px; }
            .partner-profile-cta {
              flex-direction: row;
              align-items: center;
              gap: 8px;
              flex-wrap: nowrap;
            }
            .partner-profile-cta-phone { flex: 0 0 auto; min-width: 0; }
            .partner-profile-btn { width: auto; padding: 10px 14px; font-size: 14px; }
            .partner-profile-cta-messengers { flex-shrink: 0; justify-content: flex-start; gap: 8px; }
            .partner-profile-msg { width: 40px; height: 40px; }
            .partner-profile-links-section {
              flex: 0 1 auto;
              min-width: 280px;
              max-width: 50%;
              margin-left: 0;
              margin-top: 0;
              align-self: flex-start;
            }
            .partner-profile-links-title { margin-bottom: 10px; }
            .partner-profile-links-list {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              grid-auto-rows: minmax(48px, auto);
              align-items: stretch;
              gap: 10px;
            }
            .partner-profile-link-card {
              min-width: 0;
              width: 100%;
              min-height: 48px;
              padding: 10px 14px;
              font-size: 13px;
              display: flex;
              align-items: center;
              box-sizing: border-box;
            }
            .partner-profile-link-card-icon { width: 32px; height: 32px; font-size: 12px; flex-shrink: 0; }
            .selection-grid { grid-template-columns: repeat(3, 1fr); gap: 24px; }
            .car-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
            .partner-section-title { font-size: 24px; margin-bottom: 24px; }
          }
          @media (min-width: 1280px) {
            .selection-grid { grid-template-columns: repeat(4, 1fr); }
          }
        </style>
      </head>
      <body>
        ${platformHeaderHtml}
        <div class="partner-page">
          <div class="partner-hero-wrap">
            <div class="partner-cover-plaque">
              ${coverDesktopHtml}
              ${coverMobileHtml}
            </div>
            <div class="partner-profile-card">
            ${heroTopHtml}
            </div>
          </div>
          ${selectionSectionHtml}
          ${freshCarsHtml}
        </div>
      </body>
    </html>
  `);
});

// Все подборки перегонщика: /p/:slug/selections — карточки с lazy loading
router.get('/p/:slug/selections', (req, res) => {
  const { slug } = req.params;

  const partner = Partner.findBySlug(slug);
  if (!partner) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ru">
        <head><meta charset="UTF-8" /><title>Партнёр не найден</title></head>
        <body><h1>Партнёр не найден</h1></body>
      </html>
    `);
  }

  const clients = Client.findByPartnerId(partner.id);
  const selectionCards = [];
  for (const client of clients) {
    const criteria = SearchCriteria.findByClient(client.id);
    for (const crit of criteria) {
      const carsInSelection = Car.findByCriterionId(crit.id);
      if (carsInSelection.length === 0) continue;
      let firstImage = null;
      if (carsInSelection[0].images_json) {
        try {
          const imgs = JSON.parse(carsInSelection[0].images_json);
          if (Array.isArray(imgs) && imgs.length > 0) firstImage = imgs[0];
        } catch (e) {}
      }
      const name = (crit.name || 'Подборка').replace(/</g, '&lt;');
      const selectionUrl = '/p/' + encodeURIComponent(slug) + '/selection/' + crit.public_id;
      const imageBlock = firstImage
        ? '<div class="selection-card-image"><img src="' + firstImage + '" alt="" loading="lazy" decoding="async" /></div>'
        : '<div class="selection-card-image selection-card-image--empty">Нет фото</div>';
      selectionCards.push(
        '<a class="selection-card" href="' + selectionUrl + '">' +
        imageBlock +
        '<div class="selection-card-body">' +
        '<h3 class="selection-card-title">' + name + '</h3>' +
        '<span class="selection-card-count">' + (carsInSelection.length === 1 ? '1 авто' : carsInSelection.length + ' авто') + '</span>' +
        '</div></a>'
      );
    }
  }

  const partnerName = (partner.name || '').trim() || 'Перегонщик';

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Все подборки — ${partnerName.replace(/</g, '&lt;')}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #f7f7f7; color: #222; }
          ${platformHeaderStyles}
          a { color: inherit; text-decoration: none; }
          a:hover { text-decoration: none; }
          .selections-page { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }
          .selections-back { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: #222; margin-bottom: 24px; text-decoration: underline; text-underline-offset: 2px; }
          .selections-back:hover { color: #333; }
          .selections-title { font-size: 24px; font-weight: 600; margin: 0 0 24px; letter-spacing: -0.02em; }
          .selection-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
          .selection-card { display: block; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #ebebeb; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: transform 0.2s, box-shadow 0.2s; }
          .selection-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
          .selection-card-image { aspect-ratio: 16/10; background: #e5e7eb; overflow: hidden; }
          .selection-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .selection-card-image--empty { display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }
          .selection-card-body { padding: 16px; }
          .selection-card-title { margin: 0 0 4px; font-size: 17px; font-weight: 600; color: #222; }
          .selection-card-count { font-size: 14px; color: #717171; }
          @media (min-width: 600px) { .selection-grid { grid-template-columns: repeat(2, 1fr); gap: 20px; } }
          @media (min-width: 1024px) { .selection-grid { grid-template-columns: repeat(3, 1fr); gap: 24px; } }
          @media (min-width: 1280px) { .selection-grid { grid-template-columns: repeat(4, 1fr); } }
        </style>
      </head>
      <body>
        ${platformHeaderHtml}
        <div class="selections-page">
          <a class="selections-back" href="/p/${encodeURIComponent(slug)}">&larr; Профиль перегонщика</a>
          <h1 class="selections-title">Все подборки машин</h1>
          <div class="selection-grid">${selectionCards.join('')}</div>
        </div>
      </body>
    </html>
  `);
});

// Публичная страница клиента партнёра: /p/:slug/c/:clientId
router.get('/p/:slug/c/:clientId', (req, res) => {
  const { slug, clientId: rawClientId } = req.params;

  const partner = Partner.findBySlug(slug);
  if (!partner) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ru">
        <head>
          <meta charset="UTF-8" />
          <title>Партнёр не найден</title>
        </head>
        <body>
          <h1>Партнёр не найден</h1>
          <p>Проверьте ссылку /p/${slug}.</p>
        </body>
      </html>
    `);
  }

  const clientPublicId = parsePublicId(rawClientId);
  if (!clientPublicId) {
    return res.status(400).send('<h1>Некорректный идентификатор клиента</h1>');
  }

  const client = Client.findByPublicId(clientPublicId);
  if (!client || client.partnerId !== partner.id) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ru">
        <head>
          <meta charset="UTF-8" />
          <title>Клиент не найден</title>
        </head>
        <body>
          <h1>Клиент не найден</h1>
          <p>Либо такого клиента нет, либо он не относится к пригонщику ${partner.name}.</p>
        </body>
      </html>
    `);
  }

  const cars = Car.findByClient(client.id);
  const criteria = SearchCriteria.findByClient(client.id);
  const criteriaOrdered = [...criteria].reverse();
  const listTitle =
    (criteriaOrdered.length > 0 && criteriaOrdered[0].name) ? criteriaOrdered[0].name
    : (client.selectionName || 'Подходящие автомобили');

  const totalCarsText = cars.length === 0
    ? 'Подобрано машин: 0'
    : cars.length === 1
      ? 'Подобрана 1 машина'
      : `Подобрано машин: ${cars.length}`;

  const partnerBlockHtml = clientPagePartnerBlockHtml(partner, slug);

  let criteriaListHtml = '';
  if (criteriaOrdered.length > 0) {
    const items = criteriaOrdered.map((c, idx) => {
      const foundCount = CriterionFoundCar.findByCriterion(c.id).length;
      const status = foundCount === 0 ? 'Пока не нашли авто' : `Найдено авто: ${foundCount}`;
      const name = (c.name || 'Подборка ' + (idx + 1)).replace(/</g, '&lt;');
      return `<li class="criteria-list-item"><span class="criteria-list-name">${name}</span><span class="criteria-list-status">${status}</span></li>`;
    });
    criteriaListHtml = '<ul class="client-criteria-list">' + items.join('') + '</ul>';
  }

  const criteriaBlockHtml =
    '<section class="client-criteria-card" aria-label="Подборки по критериям">' +
    '<div class="client-criteria-header">' +
    '<h2 class="client-criteria-title">Подборки по критериям</h2>' +
    '<span class="client-criteria-total">' + totalCarsText.replace(/</g, '&lt;') + '</span>' +
    '</div>' +
    '<div class="client-criteria-partner">' + partnerBlockHtml + '</div>' +
    (criteriaListHtml ? '<div class="client-criteria-list-wrap">' + criteriaListHtml + '</div>' : '') +
    '</section>';

  let carsHtml;
  if (cars.length === 0) {
    carsHtml =
      '<div class="empty-state">У этого клиента пока нет подходящих машин. Как только пригонщик добавит варианты, они появятся здесь.</div>';
  } else {
    const cards = cars
      .map((car) => {
        let mainImage = null;
        if (car.images_json) {
          try {
            const images = JSON.parse(car.images_json);
            if (Array.isArray(images) && images.length > 0) {
              mainImage = images[0];
            }
          } catch (e) {
            // игнорируем битый JSON
          }
        }

        const priceText =
          typeof car.price === 'number' && car.price > 0
            ? (car.price.toLocaleString
                ? car.price.toLocaleString('ru-RU')
                : car.price) + ' ₽'
            : 'Цена по запросу';

        const descriptionShort = car.description
          ? car.description.length > 140
            ? car.description.slice(0, 140) + '…'
            : car.description
          : 'Описание не указано.';

        const detailUrl =
          '/p/' +
          encodeURIComponent(slug) +
          '/cars/' +
          (car.public_id || car.id);

        const imageBlock = mainImage
          ? '<div class="car-card-image"><img src="' +
            mainImage +
            '" alt="' +
            (car.title || '') +
            '" loading="lazy" /></div>'
          : '<div class="car-card-image car-card-image--empty">Фото скоро появится</div>';

        return (
          '<a class="car-card" href="' +
          detailUrl +
          '">' +
          imageBlock +
          '<div class="car-card-body">' +
          '<div class="car-card-title-row">' +
          '<h3 class="car-card-title">' +
          (car.title || '') +
          '</h3>' +
          '<span class="car-card-price">' +
          priceText +
          '</span>' +
          '</div>' +
          '<p class="car-card-description">' +
          descriptionShort +
          '</p>' +
          '</div>' +
          '</a>'
        );
      })
      .join('');

    carsHtml = '<div class="car-grid">' + cards + '</div>';
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Подбор автомобилей</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #ffffff; }
          ${platformHeaderStyles}
          a { color: inherit; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .page.client-page { max-width: 1120px; margin: 0 auto; padding: 24px 20px 40px; }
          h2, .list-title { margin-top: 32px; margin-bottom: 16px; font-size: 22px; font-weight: 600; color: #222; letter-spacing: -0.02em; }
          .client-criteria-card {
            background: #fff;
            border-radius: 16px;
            border: 1px solid #ebebeb;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          }
          .client-criteria-header {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #ebebeb;
          }
          .client-criteria-title { margin: 0; font-size: 18px; font-weight: 600; color: #222; }
          .client-criteria-total {
            font-size: 14px;
            font-weight: 500;
            color: #717171;
            background: #f7f7f7;
            padding: 6px 12px;
            border-radius: 20px;
          }
          .client-criteria-partner { margin-bottom: 20px; }
          .client-criteria-partner:last-child { margin-bottom: 0; }
          .client-partner-block {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
            background: #f7f7f7;
            border-radius: 12px;
            text-decoration: none;
            color: inherit;
            transition: background 0.2s ease, box-shadow 0.2s ease;
          }
          .client-partner-block:hover {
            background: #efefef;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            text-decoration: none;
            color: inherit;
          }
          .client-partner-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            overflow: hidden;
            flex-shrink: 0;
            background: #e0e0e0;
          }
          .client-partner-avatar-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .client-partner-avatar-img.partner-logo-crop { width: 100%; height: 100%; }
          .client-partner-avatar-letter {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: 600;
            color: #fff;
            background: #222;
          }
          .client-partner-meta {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .client-partner-label {
            font-size: 12px;
            color: #717171;
            font-weight: 400;
          }
          .client-partner-name {
            font-size: 16px;
            font-weight: 600;
            color: #222;
          }
          .client-partner-arrow {
            font-size: 18px;
            color: #222;
            font-weight: 400;
            flex-shrink: 0;
          }
          .client-criteria-list-wrap { margin-top: 16px; }
          .client-criteria-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
          .criteria-list-item {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 10px 12px;
            background: #fafafa;
            border-radius: 10px;
            font-size: 14px;
          }
          .criteria-list-name { font-weight: 500; color: #222; }
          .criteria-list-status { color: #717171; font-size: 13px; }
          .criteria-list-status:empty { display: none; }
          .car-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
            margin-top: 12px;
          }
          .car-card {
            display: flex;
            flex-direction: column;
            border-radius: 16px;
            overflow: hidden;
            background: #fff;
            box-shadow: 0 12px 28px rgba(15,23,42,0.08);
            color: inherit;
            text-decoration: none;
            transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
          }
          .car-card:hover, .car-card:focus-within {
            transform: translateY(-2px);
            box-shadow: 0 16px 36px rgba(15,23,42,0.12);
          }
          .car-card-image {
            width: 100%;
            aspect-ratio: 16 / 10;
            background: #e5e7eb;
            position: relative;
            overflow: hidden;
          }
          .car-card-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .car-card-image--empty {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #9ca3af;
            font-size: 13px;
            background-image: linear-gradient(135deg, #e5e7eb, #f3f4f6);
          }
          .car-card-body {
            padding: 12px 14px 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .car-card-title-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: flex-start;
          }
          .car-card-title {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: #111827;
          }
          .car-card-price {
            white-space: nowrap;
            font-weight: 600;
            color: #111827;
            font-size: 14px;
          }
          .car-card-description {
            margin: 0;
            font-size: 13px;
            color: #6b7280;
            line-height: 1.4;
          }
          .empty-state {
            margin-top: 16px;
            padding: 16px;
            border-radius: 14px;
            background: #e5e7eb;
            font-size: 14px;
            color: #4b5563;
          }
          @media (min-width: 480px) {
            .car-grid { grid-template-columns: repeat(2, 1fr); gap: 18px; }
          }
          @media (min-width: 768px) {
            .page.client-page { padding: 32px 40px 48px; }
            .client-criteria-card { padding: 28px 32px; border-radius: 20px; }
            .client-criteria-title { font-size: 20px; }
            .client-partner-block { padding: 16px 20px; gap: 16px; }
            .client-partner-avatar { width: 52px; height: 52px; }
            .client-partner-avatar-letter { font-size: 22px; }
            .client-partner-name { font-size: 17px; }
            .list-title { margin-top: 40px; margin-bottom: 20px; font-size: 24px; }
            .car-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; margin-top: 20px; }
            .car-card { border-radius: 18px; box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
            .car-card:hover, .car-card:focus-within { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0,0,0,0.12); }
          }
        </style>
      </head>
      <body>
        ${platformHeaderHtml}
        <div class="page client-page">
          ${criteriaBlockHtml}
          <h2 class="list-title">${listTitle.replace(/</g, '&lt;')}</h2>
          ${carsHtml}
        </div>
      </body>
    </html>
  `);
});

// Страница подборки по критерию: только авто этой подборки — /p/:slug/selection/:criteriaId (без id клиента в URL)
router.get('/p/:slug/selection/:criteriaId', (req, res) => {
  const { slug, criteriaId: rawCriteriaId } = req.params;

  const partner = Partner.findBySlug(slug);
  if (!partner) return res.status(404).send('<h1>Партнёр не найден</h1>');

  const criteriaPublicId = parsePublicId(rawCriteriaId);
  if (!criteriaPublicId) return res.status(400).send('<h1>Некорректные параметры</h1>');

  const criterion = SearchCriteria.findByPublicId(criteriaPublicId);
  if (!criterion) return res.status(404).send('<h1>Подборка не найдена</h1>');

  const client = Client.findById(criterion.client_id);
  if (!client || client.partnerId !== partner.id) return res.status(404).send('<h1>Подборка не найдена</h1>');

  const cars = Car.findByCriterionId(criterion.id);
  const listTitle = (criterion.name || 'Подборка').replace(/</g, '&lt;');

  let carsHtml;
  if (cars.length === 0) {
    carsHtml = '<div class="empty-state">В этой подборке пока нет машин.</div>';
  } else {
    const cards = cars.map((car) => {
      let mainImage = null;
      if (car.images_json) {
        try {
          const imgs = JSON.parse(car.images_json);
          if (Array.isArray(imgs) && imgs.length > 0) mainImage = imgs[0];
        } catch (e) {}
      }
      const priceText = (typeof car.price === 'number' && car.price > 0) ? (car.price.toLocaleString ? car.price.toLocaleString('ru-RU') : car.price) + ' ₽' : 'Цена по запросу';
      const descShort = car.description ? (car.description.length > 140 ? car.description.slice(0, 140) + '…' : car.description) : 'Описание не указано.';
      const detailUrl = '/p/' + encodeURIComponent(slug) + '/cars/' + (car.public_id || car.id);
      const imgBlock = mainImage
        ? '<div class="car-card-image"><img src="' + mainImage + '" alt="' + (car.title || '').replace(/"/g, '&quot;') + '" loading="lazy" /></div>'
        : '<div class="car-card-image car-card-image--empty">Фото скоро появится</div>';
      return (
        '<a class="car-card" href="' + detailUrl + '">' + imgBlock +
        '<div class="car-card-body">' +
        '<div class="car-card-title-row"><h3 class="car-card-title">' + (car.title || '').replace(/</g, '&lt;') + '</h3><span class="car-card-price">' + priceText + '</span></div>' +
        '<p class="car-card-description">' + descShort.replace(/</g, '&lt;') + '</p>' +
        '</div></a>'
      );
    });
    carsHtml = '<div class="car-grid">' + cards.join('') + '</div>';
  }

  const criteriaBlockHtml =
    '<section class="client-criteria-card" aria-label="Подборка">' +
    '<div class="client-criteria-header">' +
    '<h2 class="client-criteria-title">' + listTitle + '</h2>' +
    '<span class="client-criteria-total">' + (cars.length === 0 ? 'Нет авто' : cars.length === 1 ? '1 авто' : cars.length + ' авто') + '</span>' +
    '</div>' +
    '<div class="client-criteria-partner">' + clientPagePartnerBlockHtml(partner, slug) + '</div>' +
    '</section>';

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${listTitle}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #fff; }
          ${platformHeaderStyles}
          a { color: inherit; text-decoration: none; }
          .page.client-page { max-width: 1120px; margin: 0 auto; padding: 24px 20px 40px; }
          h2, .list-title { margin-top: 32px; margin-bottom: 16px; font-size: 22px; font-weight: 600; color: #222; }
          .client-criteria-card { position: sticky; top: 56px; z-index: 50; background: #fff; border-radius: 16px; border: 1px solid #ebebeb; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .client-criteria-header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #ebebeb; }
          .client-criteria-title { margin: 0; font-size: 18px; font-weight: 600; color: #222; }
          .client-criteria-total { font-size: 14px; font-weight: 500; color: #717171; background: #f7f7f7; padding: 6px 12px; border-radius: 20px; }
          .client-criteria-partner { margin-bottom: 0; }
          .client-partner-block { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: #f7f7f7; border-radius: 12px; text-decoration: none; color: inherit; }
          .client-partner-block:hover { background: #efefef; text-decoration: none; color: inherit; }
          .client-partner-avatar { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #e0e0e0; }
          .client-partner-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .client-partner-avatar-letter { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600; color: #fff; background: #222; }
          .client-partner-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
          .client-partner-label { font-size: 12px; color: #717171; }
          .client-partner-name { font-size: 16px; font-weight: 600; color: #222; }
          .client-partner-arrow { font-size: 18px; color: #222; flex-shrink: 0; }
          .car-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; }
          .car-card { display: flex; flex-direction: column; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #ebebeb; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: transform 0.2s, box-shadow 0.2s; }
          .car-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
          .car-card-image { aspect-ratio: 16/10; background: #e5e7eb; overflow: hidden; }
          .car-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .car-card-image--empty { display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }
          .car-card-body { padding: 12px 14px 14px; }
          .car-card-title-row { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
          .car-card-title { margin: 0; font-size: 15px; font-weight: 600; color: #111827; }
          .car-card-price { white-space: nowrap; font-weight: 600; font-size: 14px; color: #111827; }
          .car-card-description { margin: 0; font-size: 13px; color: #6b7280; line-height: 1.4; }
          .empty-state { padding: 24px; text-align: center; color: #6b7280; background: #f3f4f6; border-radius: 14px; }
          @media (min-width: 480px) { .car-grid { grid-template-columns: repeat(2, 1fr); gap: 18px; } }
          @media (min-width: 768px) { .car-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; } }
        </style>
      </head>
      <body>
        ${platformHeaderHtml}
        <div class="page client-page">
          ${criteriaBlockHtml}
          ${carsHtml}
        </div>
      </body>
    </html>
  `);
});

// Детальная страница машины: /p/:slug/cars/:carId
router.get('/p/:slug/cars/:carId', (req, res) => {
  const { slug, carId: rawCarId } = req.params;

  const partner = Partner.findBySlug(slug);
  if (!partner) {
    return res.status(404).send('<h1>Партнёр не найден</h1>');
  }

  const carPublicId = parsePublicId(rawCarId);
  if (!carPublicId) {
    return res.status(400).send('<h1>Некорректные идентификаторы</h1>');
  }

  const car = Car.findByPublicId(carPublicId);
  if (!car) {
    return res.status(404).send('<h1>Машина не найдена</h1>');
  }

  const client = Client.findById(car.client_id);
  if (!client || client.partnerId !== partner.id) {
    return res.status(404).send('<h1>Клиент не найден</h1>');
  }

  // Разбираем список изображений
  let images = [];
  if (car.images_json) {
    try {
      const parsed = JSON.parse(car.images_json);
      if (Array.isArray(parsed)) {
        images = parsed;
      }
    } catch (e) {
      images = [];
    }
  }

  const priceText =
    typeof car.price === 'number' && car.price > 0
      ? `${
          car.price.toLocaleString
            ? car.price.toLocaleString('ru-RU')
            : car.price
        } ₽`
      : 'Цена по запросу';

  // Контакты пригонщика: телефон (обязательный), опционально Telegram и WhatsApp
  let contactsHtml = '';
  if (partner.contacts_json) {
    try {
      const parsed = JSON.parse(partner.contacts_json);
      if (parsed && typeof parsed === 'object') {
        const phone = parsed.phone;
        const telegram = parsed.telegram;
        const whatsapp = parsed.whatsapp;
        const viber = parsed.viber;

        const phoneHref = phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : null;

        let tgHref = null;
        if (telegram) {
          if (telegram.startsWith('http://') || telegram.startsWith('https://')) {
            tgHref = telegram;
          } else if (telegram.startsWith('@')) {
            tgHref = `https://t.me/${telegram.slice(1)}`;
          } else {
            tgHref = `https://t.me/${telegram}`;
          }
        }

        let waHref = null;
        if (whatsapp) {
          if (whatsapp.startsWith('http://') || whatsapp.startsWith('https://')) {
            waHref = whatsapp;
          } else {
            const digits = whatsapp.replace(/[^0-9]/g, '');
            if (digits) {
              waHref = `https://wa.me/${digits}`;
            }
          }
        }

        let viberHref = null;
        if (viber) {
          if (viber.startsWith('http://') || viber.startsWith('https://')) {
            viberHref = viber;
          } else {
            const digits = viber.replace(/[^0-9]/g, '');
            if (digits) {
              viberHref = `https://viber.click/${digits}`;
            }
          }
        }

        const phoneBtn = (phone && phoneHref)
          ? `<div class="contacts-phone-wrap"><a class="btn btn-phone contacts-phone-btn" href="${phoneHref}" title="Позвонить"><span class="contacts-phone-btn-text">${phone.replace(/</g, '&lt;')}</span><span class="contacts-phone-btn-icon" aria-hidden="true"><img src="/public/icons/phone-call.png" alt="" width="24" height="24" /></span></a></div>`
          : '';
        const messengerBtns = [];
        if (tgHref) messengerBtns.push(`<a class="btn btn-msg btn-tg" href="${tgHref}" target="_blank" rel="noopener noreferrer" title="Telegram"><img src="/public/icons/telegram.png" alt="" class="btn-msg-icon" width="24" height="24" /></a>`);
        if (waHref) messengerBtns.push(`<a class="btn btn-msg btn-wa" href="${waHref}" target="_blank" rel="noopener noreferrer" title="WhatsApp"><img src="/public/icons/whatsapp.png" alt="" class="btn-msg-icon" width="24" height="24" /></a>`);
        if (viberHref) messengerBtns.push(`<a class="btn btn-msg btn-viber" href="${viberHref}" target="_blank" rel="noopener noreferrer" title="Viber"><img src="/public/icons/viber.png" alt="" class="btn-msg-icon" width="24" height="24" /></a>`);

        if (phoneBtn || messengerBtns.length > 0) {
          const messengersBlock = messengerBtns.length > 0
            ? `<div class="contacts-messengers">${messengerBtns.join('')}</div>`
            : '';
          contactsHtml = `
            <section class="contacts" aria-label="Контакты пригонщика">
              <div class="contacts-row">
                ${phoneBtn}
                ${messengersBlock}
              </div>
            </section>
          `;
        }
      }
    } catch (e) {
      // игнорируем битый JSON
    }
  }

  const gallery =
    images.length === 0
      ? '<div class="gallery-empty">Фото пока нет.</div>'
      : `
        <div class="gallery">
          ${images
            .map(
              (src) => `
            <figure class="gallery-item">
              <img src="${src}" alt="${car.title}" loading="lazy" />
            </figure>
          `
            )
            .join('')}
        </div>
      `;

  const descriptionBlock = car.description
    ? `<p>${car.description}</p>`
    : '<p>Описание не указано.</p>';

  const articleTitles = [
    'Как выбрать авто из Кореи: чек-лист перед покупкой',
    'Растаможка авто в 2025: пошаговая инструкция',
    'На что смотреть при осмотре пригнанного авто',
    'Страховка на пригнанный автомобиль: что учесть',
    'Экологический класс: что важно знать при ввозе',
  ];
  const articlesHtml =
    '<section class="articles-banner">' +
    '<h2 class="articles-banner-title">Полезные статьи</h2>' +
    '<ul class="articles-banner-list">' +
    articleTitles
      .map(
        (title) =>
          '<li class="article-banner-item"><span class="article-banner-item-text">' +
          title.replace(/</g, '&lt;') +
          '</span></li>'
      )
      .join('') +
    '</ul></section>';

  // Другие машины этого клиента (без текущей), по новизне
  const allClientCars = Car.findByClient(client.id);
  const otherCars = allClientCars.filter((c) => c.id !== car.id).slice(0, 8);

  let otherCarsHtml = '';
  if (otherCars.length > 0) {
    const baseUrl =
      '/p/' + encodeURIComponent(slug) + '/cars/';
    const cards = otherCars.map((c) => {
      let imgs = [];
      if (c.images_json) {
        try {
          const arr = JSON.parse(c.images_json);
          if (Array.isArray(arr)) imgs = arr;
        } catch (e) {}
      }
      const mainImage = imgs[0] || null;
      const priceText =
        typeof c.price === 'number' && c.price > 0
          ? (c.price.toLocaleString ? c.price.toLocaleString('ru-RU') : c.price) + ' ₽'
          : 'Цена по запросу';
      const descShort = c.description
        ? (c.description.length > 100 ? c.description.slice(0, 100) + '…' : c.description)
        : '';
      const detailUrl = baseUrl + (c.public_id || c.id);
      const imageBlock = mainImage
        ? '<div class="other-cars-card-image"><img src="' + mainImage + '" alt="' + (c.title || '').replace(/"/g, '&quot;') + '" loading="lazy" /></div>'
        : '<div class="other-cars-card-image other-cars-card-image--empty">Нет фото</div>';
      return (
        '<a class="other-cars-card" href="' +
        detailUrl +
        '">' +
        imageBlock +
        '<div class="other-cars-card-body">' +
        '<h3 class="other-cars-card-title">' +
        (c.title || '').replace(/</g, '&lt;') +
        '</h3>' +
        '<span class="other-cars-card-price">' +
        priceText +
        '</span>' +
        (descShort ? '<p class="other-cars-card-desc">' + descShort.replace(/</g, '&lt;') + '</p>' : '') +
        '</div></a>'
      );
    });
    otherCarsHtml =
      '<section class="other-cars-section" aria-label="Другие автомобили в подборке">' +
      '<h2 class="other-cars-title">Ещё в подборке</h2>' +
      '<div class="other-cars-row">' +
      cards.join('') +
      '</div></section>';
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${car.title}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background:#ffffff; color:#0f172a; }
          ${platformHeaderStyles}
          a { color: inherit; text-decoration: none; }
          a:hover { text-decoration: underline; }

          .page { max-width: 1200px; margin: 0 auto; padding: 24px 16px 24px; }

          header { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
          .back-to-list {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
            color: #4f46e5;
            text-decoration: none;
            padding: 8px 0;
            min-height: 44px;
            align-self: flex-start;
            -webkit-tap-highlight-color: transparent;
          }
          .back-to-list:hover { color: #3730a3; text-decoration: underline; }
          .back-to-list:focus { outline: 2px solid #4f46e5; outline-offset: 2px; }
          h1 { font-size: 20px; margin: 0; line-height: 1.3; }
          .meta { font-size: 13px; color:#6b7280; }
          ${partnerBadgeStyles}
          .page .partner-badge { margin-bottom: 12px; }

          .layout {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .gallery-shell {
            background: #f3f4f6;
            border-radius: 16px;
            padding: 10px 10px 8px;
            box-shadow: 0 8px 24px rgba(15,23,42,0.1);
          }

          .gallery-main {
            width: 100%;
            border-radius: 14px;
            overflow: hidden;
            background:#e5e7eb;
            position: relative;
          }
          .gallery-main img {
            width: 100%;
            height: auto;
            max-height: 280px;
            object-fit: cover;
            display: block;
          }

          .nav-arrow {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 40px;
            height: 40px;
            min-width: 40px;
            min-height: 40px;
            border-radius: 999px;
            border: none;
            background: rgba(15,23,42,0.55);
            color: #f9fafb;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
          .nav-arrow.left { left: 8px; }
          .nav-arrow.right { right: 8px; }
          .nav-arrow span { font-size: 18px; line-height: 1; }

          .thumbs {
            margin-top: 8px;
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 4px;
            -webkit-overflow-scrolling: touch;
          }
          .thumb {
            flex: 0 0 80px;
            height: 60px;
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(148,163,184,0.55);
            cursor: pointer;
            opacity: 0.85;
            transition: opacity 0.12s ease-out, transform 0.12s ease-out, border-color 0.12s;
          }
          .thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .thumb:hover, .thumb:focus {
            opacity: 1;
            transform: translateY(-1px);
            border-color: #0f172a;
          }

          .gallery-empty {
            padding: 24px 16px;
            border-radius: 14px;
            background: #e5e7eb;
            text-align: center;
            color: #6b7280;
          }

          .card {
            background: #ffffff;
            border-radius: 16px;
            padding: 14px 16px;
            box-shadow: 0 8px 24px rgba(15,23,42,0.06);
            border: 1px solid #e5e7eb;
          }

          aside.card.aside-contact {
            position: sticky;
            top: 104px;
            align-self: flex-start;
            z-index: 10;
          }

          .aside-profile-plaque {
            margin-bottom: 16px;
            padding: 12px 14px;
            background: #f8fafc;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
          }
          .aside-profile-plaque .partner-profile-plaque {
            padding: 0;
          }
          .aside-profile-plaque .partner-profile-plaque:hover {
            background: transparent;
          }
          .price-card {
            margin-bottom: 16px;
            padding: 14px 16px;
            border-radius: 14px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }
          .price-card-header {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .price-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6b7280;
          }
          .price-value {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
          }
          .price-subnote {
            font-size: 13px;
            color: #6b7280;
            margin: 4px 0 0;
          }
          .price-explainer {
            margin-top: 10px;
            font-size: 13px;
            color: #4b5563;
          }
          .price-range {
            margin-top: 12px;
            padding: 10px 12px;
            border-radius: 12px;
            background: #edf2ff;
          }
          .price-range-label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #4338ca;
            margin-bottom: 4px;
          }
          .price-range-pill {
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 600;
            color: #1d4ed8;
            background: #e0ecff;
          }
          .price-range-note {
            margin-top: 6px;
            font-size: 12px;
            color: #6b7280;
          }
          .price-toggle {
            margin-top: 12px;
            width: 100%;
            padding: 10px 14px;
            border-radius: 999px;
            border: 1px solid #e5e7eb;
            background: #ffffff;
            font-size: 14px;
            font-weight: 500;
            color: #111827;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
          }
          .price-toggle:hover {
            background: #f9fafb;
            box-shadow: 0 4px 10px rgba(15,23,42,0.08);
            transform: translateY(-1px);
          }
          .price-options {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
          }
          .price-options-title {
            margin: 0 0 10px;
            font-size: 15px;
            font-weight: 600;
            color: #111827;
          }
          .price-options-grid {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 14px;
          }
          .price-option {
            padding: 10px 12px;
            border-radius: 12px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
          }
          .price-option-title {
            margin: 0 0 6px;
            font-size: 14px;
            font-weight: 600;
            color: #111827;
          }
          .price-option-list {
            list-style: none;
            padding: 0;
            margin: 0 0 6px;
            font-size: 13px;
            color: #4b5563;
          }
          .price-option-list li + li { margin-top: 2px; }
          .price-option-note {
            font-size: 12px;
            color: #6b7280;
            margin: 0;
          }
          .price-contact {
            margin-top: 6px;
            padding-top: 10px;
            border-top: 1px dashed #e5e7eb;
          }
          .price-contact-title {
            margin: 0 0 6px;
            font-size: 14px;
            font-weight: 600;
            color: #111827;
          }
          .price-contact-text {
            margin: 0 0 10px;
            font-size: 13px;
            color: #4b5563;
          }
          .price-contact-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 6px;
          }
          .price-contact-btn {
            flex: 1 1 auto;
            min-width: 120px;
            padding: 9px 12px;
            border-radius: 999px;
            border: 1px solid #e5e7eb;
            background: #f9fafb;
            font-size: 13px;
            font-weight: 500;
            color: #111827;
            cursor: pointer;
          }
          .price-contact-btn-primary {
            background: #1d4ed8;
            border-color: #1d4ed8;
            color: #ffffff;
          }
          .price-contact-btn-primary:hover { background: #1e40af; border-color: #1e40af; }
          .price-contact-btn-secondary:hover { background: #f3f4f6; }
          .price-microcopy {
            margin: 0;
            font-size: 12px;
            color: #6b7280;
          }
          .section-title { font-size: 15px; margin: 0 0 8px; color: #111827; }
          .description { font-size: 14px; color: #111827; line-height: 1.6; white-space: pre-wrap; }

          .contacts { margin-top: 8px; container-type: inline-size; container-name: contacts; }
          .contacts-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
          .contacts-phone-wrap { flex: 1 1 0; min-width: 0; }
          .contacts-phone-wrap .contacts-phone-btn { width: 100%; box-sizing: border-box; }
          .contacts-messengers { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; flex-shrink: 0; }
          @container contacts (max-width: 380px) {
            .contacts-phone-wrap { flex: 0 0 auto; }
            .contacts-phone-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              width: 44px;
              height: 44px;
              min-width: 44px;
              min-height: 44px;
              padding: 0;
              border-radius: 50%;
              overflow: hidden;
              box-sizing: border-box;
            }
            .contacts-phone-btn-text { display: none; }
            .contacts-phone-btn-icon {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              height: 100%;
              position: absolute;
              inset: 0;
            }
            .contacts-phone-btn-icon img {
              width: 100%;
              height: 100%;
              min-width: 100%;
              min-height: 100%;
              object-fit: cover;
              object-position: center;
              filter: brightness(0) invert(1);
            }
          }
          .buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 16px;
            min-height: 44px;
            border-radius: 999px;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            color: white;
            border: none;
            -webkit-tap-highlight-color: transparent;
          }
          .contacts-phone-btn-icon { display: none; }
          .contacts-phone-btn { background: #10b981; }
          .btn-msg {
            position: relative;
            display: block;
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            padding: 0;
            border-radius: 50%;
            overflow: hidden;
            box-sizing: border-box;
          }
          .btn-msg-icon {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            display: block;
          }
          .btn-tg { background: #0ea5e9; }
          .btn-wa { background: #22c55e; }
          .btn-viber { background: #7360f2; }
          @media (max-width: 420px) {
            .contacts-phone-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              width: 44px;
              height: 44px;
              min-width: 44px;
              min-height: 44px;
              padding: 0;
              border-radius: 50%;
              overflow: hidden;
              box-sizing: border-box;
            }
            .contacts-phone-btn-text { display: none; }
            .contacts-phone-btn-icon {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              height: 100%;
              position: absolute;
              inset: 0;
            }
            .contacts-phone-btn-icon img {
              width: 100%;
              height: 100%;
              min-width: 100%;
              min-height: 100%;
              object-fit: cover;
              object-position: center;
              filter: brightness(0) invert(1);
            }
          }

          .aside-meta { font-size: 13px; color: #6b7280; margin: 2px 0; }

          .articles-banner { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
          .articles-banner-title { margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #111827; }
          .articles-banner-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
          .article-banner-item {
            display: block;
            padding: 12px 14px;
            border-radius: 12px;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 1px solid #e2e8f0;
            box-shadow: 0 2px 8px rgba(15,23,42,0.04);
            transition: box-shadow 0.2s ease, border-color 0.2s ease;
          }
          .article-banner-item:hover { border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(15,23,42,0.08); }
          .article-banner-item-text { font-size: 13px; font-weight: 500; color: #334155; line-height: 1.4; }
          .articles-in-aside { display: none; }
          .articles-at-bottom { display: block; margin-top: 32px; padding: 20px 16px; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; }
          aside.card.aside-contact { top: 92px; }
          .articles-at-bottom .articles-banner { margin-top: 0; padding-top: 0; border-top: none; }
          .articles-at-bottom .articles-banner-title { font-size: 18px; margin-bottom: 14px; }

          .other-cars-section {
            margin-top: 40px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
          }
          .other-cars-title {
            font-size: 18px;
            font-weight: 600;
            color: #111827;
            margin: 0 0 16px;
            letter-spacing: -0.02em;
          }
          .other-cars-row {
            display: flex;
            gap: 16px;
            overflow-x: auto;
            padding-bottom: 8px;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: thin;
          }
          .other-cars-row::-webkit-scrollbar { height: 6px; }
          .other-cars-row::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
          .other-cars-row::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
          .other-cars-card {
            flex: 0 0 260px;
            display: flex;
            flex-direction: column;
            border-radius: 14px;
            overflow: hidden;
            background: #fff;
            box-shadow: 0 4px 20px rgba(15,23,42,0.06);
            border: 1px solid #e5e7eb;
            color: inherit;
            text-decoration: none;
            transition: box-shadow 0.2s ease, transform 0.2s ease;
          }
          .other-cars-card:hover {
            box-shadow: 0 12px 32px rgba(15,23,42,0.1);
            transform: translateY(-2px);
          }
          .other-cars-card-image {
            width: 100%;
            aspect-ratio: 16 / 10;
            background: #e5e7eb;
            overflow: hidden;
          }
          .other-cars-card-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .other-cars-card-image--empty {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #9ca3af;
            font-size: 12px;
          }
          .other-cars-card-body {
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .other-cars-card-title {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: #111827;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .other-cars-card-price {
            font-size: 13px;
            font-weight: 600;
            color: #059669;
          }
          .other-cars-card-desc {
            margin: 4px 0 0;
            font-size: 12px;
            color: #6b7280;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .lightbox-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15,23,42,0.92);
            display: none;
            flex-direction: column;
            align-items: stretch;
            justify-content: stretch;
            z-index: 40;
            overflow: hidden;
          }
          .lightbox-backdrop.open { display: flex; }
          .lightbox-top {
            flex: 0 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 8px 16px;
            min-height: 52px;
          }
          .lightbox-close {
            margin-left: auto;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: none;
            background: rgba(255,255,255,0.15);
            color: #fff;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-tap-highlight-color: transparent;
            flex-shrink: 0;
          }
          .lightbox-close:hover, .lightbox-close:active { background: rgba(255,255,255,0.3); }
          .lightbox-counter {
            color: rgba(255,255,255,0.9);
            font-size: 14px;
          }
          .lightbox-body {
            flex: 1;
            min-height: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            padding: 0 8px 16px;
          }
          .lightbox-inner {
            max-width: 100%;
            max-height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .lightbox-inner img {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            border-radius: 8px;
            object-fit: contain;
            background: #000;
          }
          .lightbox-prev, .lightbox-next {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: rgba(255,255,255,0.2);
            color: #fff;
            font-size: 22px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
            -webkit-tap-highlight-color: transparent;
          }
          .lightbox-prev { left: 8px; }
          .lightbox-next { right: 8px; }
          .lightbox-prev:hover, .lightbox-next:hover { background: rgba(255,255,255,0.35); }
          .lightbox-prev.hidden, .lightbox-next.hidden { visibility: hidden; }

          @media (min-width: 768px) {
            .page { padding: 24px 24px 40px; margin: 32px auto 40px; }
            header { margin-bottom: 24px; gap: 8px; }
            h1 { font-size: 26px; }
            .layout {
              display: grid;
              grid-template-columns: minmax(0, 2.2fr) minmax(260px, 0.9fr);
              gap: 24px;
              align-items: flex-start;
            }
            aside.card.aside-contact { position: sticky; top: 104px; align-self: flex-start; z-index: 10; }
            .gallery-shell { border-radius: 24px; padding: 14px 14px 12px; box-shadow: 0 16px 40px rgba(15,23,42,0.15); }
            .gallery-main { border-radius: 18px; }
            .gallery-main img { max-height: 420px; }
            .gallery-empty { padding: 32px; border-radius: 18px; }
            .nav-arrow { width: 36px; height: 36px; min-width: 36px; min-height: 36px; }
            .nav-arrow.left { left: 12px; }
            .nav-arrow.right { right: 12px; }
            .thumbs { margin-top: 10px; gap: 8px; }
            .thumb { flex: 0 0 96px; height: 72px; border-radius: 12px; }
            .card { border-radius: 18px; padding: 18px 20px; box-shadow: 0 16px 40px rgba(15,23,42,0.08); }
            .price-value { font-size: 24px; }
            .section-title { font-size: 16px; }
            .btn { padding: 8px 16px; min-height: auto; }
            .btn-msg { width: 40px; height: 40px; min-width: 40px; min-height: 40px; }
            .lightbox-body { padding: 0 56px 24px; }
            .lightbox-prev, .lightbox-next { width: 44px; height: 44px; font-size: 20px; left: 12px; right: 12px; }
            .lightbox-next { left: auto; right: 12px; }
            .other-cars-section { margin-top: 48px; padding-top: 32px; }
            .other-cars-title { font-size: 20px; margin-bottom: 20px; }
            .other-cars-card { flex: 0 0 280px; border-radius: 16px; box-shadow: 0 8px 24px rgba(15,23,42,0.08); }
            .other-cars-card:hover { box-shadow: 0 16px 40px rgba(15,23,42,0.12); }
            .articles-in-aside { display: block; }
            .articles-at-bottom { display: none; }
          }
        </style>
      </head>
      <body>
        ${platformHeaderHtml}
        <div class="page">
          <header>
            ${partnerTopCardHtml(partner, slug)}
            <h1>${car.title}</h1>
            <p class="meta">Добавлено: ${car.created_at}</p>
          </header>

          <div class="layout">
            <main>
              <div class="gallery-shell">
                ${
                  images.length === 0
                    ? '<div class="gallery-empty">Фото пока нет.</div>'
                    : `
                      <div class="gallery-main">
                        <img id="car-main-image" src="${images[0]}" alt="${car.title}" loading="lazy" />
                        ${
                          images.length > 1
                            ? '<button class="nav-arrow left" type="button" data-dir="-1"><span>&larr;</span></button><button class="nav-arrow right" type="button" data-dir="1"><span>&rarr;</span></button>'
                            : ''
                        }
                      </div>
                      ${
                        images.length > 1
                          ? `
                              <div class="thumbs">
                                ${images
                                  .map(
                                    (src) =>
                                      `<div class="thumb"><img src="${src}" alt="${car.title}" loading="lazy" /></div>`
                                  )
                                  .join('')}
                              </div>
                            `
                          : ''
                      }
                    `
                }
              </div>

              <section class="card" style="margin-top:18px;">
                <h2 class="section-title">Описание</h2>
                <div class="description">
                  ${descriptionBlock}
                </div>
              </section>
            </main>
            <aside class="card aside-contact">
              <section class="price-card" aria-label="Цена и варианты пригона">
                <div class="price-card-header">
                  <span class="price-label">Цена в стране покупки</span>
                  <span class="price-value">${priceText}</span>
                  <p class="price-subnote">Цена авто на внутреннем рынке страны продажи. Стоимость указана до пригона и таможенного оформления.</p>
                </div>
                <p class="price-explainer">Итоговая стоимость зависит от способа пригона, маршрута и страны растаможки.</p>
                <div class="price-range">
                  <span class="price-range-label">Ориентир по пригону</span>
                  <span class="price-range-pill">+20% – +80% к цене авто</span>
                  <p class="price-range-note">В зависимости от маршрута, утильсбора и схемы ввоза.</p>
                </div>
                <button class="price-toggle" type="button" id="price-options-toggle">Рассчитать варианты пригона</button>
                <section class="price-options" id="price-options" hidden>
                  <h3 class="price-options-title">Варианты пригона этого автомобиля</h3>
                  <div class="price-options-grid">
                    <article class="price-option">
                      <h4 class="price-option-title">Вариант 1 — Пригон напрямую в РФ</h4>
                      <ul class="price-option-list">
                        <li>Таможня: РФ</li>
                        <li>Утильсбор: да</li>
                        <li>Стоимость: высокая</li>
                      </ul>
                      <p class="price-option-note">Простой и прозрачный вариант оформления, подходит при стандартных сценариях ввоза.</p>
                    </article>
                    <article class="price-option">
                      <h4 class="price-option-title">Вариант 2 — Пригон через другую страну</h4>
                      <ul class="price-option-list">
                        <li>Таможня: промежуточная страна</li>
                        <li>Утильсбор: зависит от схемы</li>
                        <li>Стоимость: средняя</li>
                      </ul>
                      <p class="price-option-note">Часто используется пригонщиками для оптимизации стоимости и сроков.</p>
                    </article>
                    <article class="price-option">
                      <h4 class="price-option-title">Вариант 3 — Альтернативные схемы пригона</h4>
                      <ul class="price-option-list">
                        <li>Таможня: не РФ</li>
                        <li>Утильсбор: как правило, отсутствует</li>
                        <li>Стоимость: минимальная</li>
                      </ul>
                      <p class="price-option-note">Подходит не для всех случаев и требует отдельной оценки рисков и сроков.</p>
                    </article>
                  </div>
                  <section class="price-contact">
                    <h3 class="price-contact-title">Рассчитать точную стоимость пригона</h3>
                    <p class="price-contact-text">Мы поможем оценить итоговую стоимость для каждого варианта пригона с учётом страны, утильсбора и маршрута.</p>
                    <div class="price-contact-actions">
                      <button type="button" class="price-contact-btn price-contact-btn-primary" id="price-contact-scroll">Связаться и рассчитать</button>
                    </div>
                    <p class="price-microcopy">Вы получите расчёт по доступным вариантам и сможете выбрать подходящий по бюджету и срокам.</p>
                  </section>
                </section>
              </section>
              <div class="aside-profile-plaque">${partnerProfileLinkHtml(partner, slug)}</div>
              <h2 class="section-title" id="contact-section">Связаться</h2>
              ${contactsHtml}
              <div class="articles-in-aside">${articlesHtml}</div>
            </aside>
          </div>

          ${otherCarsHtml}

          <div class="articles-at-bottom">${articlesHtml}</div>

          <div class="lightbox-backdrop" id="lightbox">
            <div class="lightbox-top">
              <span class="lightbox-counter" id="lightbox-counter">${images.length > 1 ? '1 / ' + images.length : ''}</span>
              <button class="lightbox-close" type="button" id="lightbox-close" aria-label="Закрыть">×</button>
            </div>
            <div class="lightbox-body">
              ${
                images.length > 1
                  ? '<button class="lightbox-prev" type="button" id="lightbox-prev" aria-label="Предыдущее"><span>&larr;</span></button>'
                  : ''
              }
              <div class="lightbox-inner">
                <img id="lightbox-image" src="${images[0] || ''}" alt="${car.title}" />
              </div>
              ${
                images.length > 1
                  ? '<button class="lightbox-next" type="button" id="lightbox-next" aria-label="Следующее"><span>&rarr;</span></button>'
                  : ''
              }
            </div>
          </div>
        </div>

        <script>
          (function () {
            var images = ${JSON.stringify(images)};
            if (!Array.isArray(images) || images.length === 0) return;

            var index = 0;
            var mainImg = document.getElementById('car-main-image');
            var thumbs = document.querySelectorAll('.thumb');
            var arrows = document.querySelectorAll('.nav-arrow');
            var lb = document.getElementById('lightbox');
            var lbImg = document.getElementById('lightbox-image');
            var lbClose = document.getElementById('lightbox-close');
            var lbPrev = document.getElementById('lightbox-prev');
            var lbNext = document.getElementById('lightbox-next');
            var lbCounter = document.getElementById('lightbox-counter');

            function updateCounter() {
              if (lbCounter && images.length > 1) lbCounter.textContent = (index + 1) + ' / ' + images.length;
            }

            function show(i) {
              index = (i + images.length) % images.length;
              if (mainImg) mainImg.src = images[index];
              if (lbImg) lbImg.src = images[index];
              updateCounter();
            }

            arrows.forEach(function (btn) {
              btn.addEventListener('click', function (e) { e.stopPropagation(); var dir = Number(btn.getAttribute('data-dir') || '1'); show(index + dir); });
            });

            thumbs.forEach(function (thumbEl, i) {
              thumbEl.addEventListener('click', function () {
                show(i);
                if (lb) { lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
              });
            });

            function openLightbox() {
              if (!lb) return;
              lb.classList.add('open');
              document.body.style.overflow = 'hidden';
              updateCounter();
            }
            function closeLightbox() {
              if (!lb) return;
              lb.classList.remove('open');
              document.body.style.overflow = '';
            }

            if (mainImg && lb) mainImg.addEventListener('click', openLightbox);
            if (lbClose && lb) lbClose.addEventListener('click', closeLightbox);
            if (lbPrev) lbPrev.addEventListener('click', function (e) { e.stopPropagation(); show(index - 1); });
            if (lbNext) lbNext.addEventListener('click', function (e) { e.stopPropagation(); show(index + 1); });
            if (lb) {
              lb.addEventListener('click', function (e) {
                if (e.target === lb) closeLightbox();
                if (e.target.classList && (e.target.classList.contains('lightbox-body') || e.target.classList.contains('lightbox-inner'))) closeLightbox();
              });
            }
            document.addEventListener('keydown', function (e) {
              if (!lb || !lb.classList.contains('open')) return;
              if (e.key === 'Escape') closeLightbox();
              if (e.key === 'ArrowLeft') show(index - 1);
              if (e.key === 'ArrowRight') show(index + 1);
            });

            // Тоггл блока «Цена и варианты пригона»
            var priceToggle = document.getElementById('price-options-toggle');
            var priceOptions = document.getElementById('price-options');
            if (priceToggle && priceOptions) {
              priceToggle.addEventListener('click', function () {
                var isHidden = priceOptions.hasAttribute('hidden');
                if (isHidden) {
                  priceOptions.removeAttribute('hidden');
                  priceToggle.textContent = 'Свернуть варианты пригона';
                } else {
                  priceOptions.setAttribute('hidden', '');
                  priceToggle.textContent = 'Рассчитать варианты пригона';
                }
              });
            }

            // Скролл к блоку контактов из кнопки «Связаться и рассчитать»
            var scrollBtn = document.getElementById('price-contact-scroll');
            var contactSection = document.getElementById('contact-section');
            if (scrollBtn && contactSection) {
              scrollBtn.addEventListener('click', function () {
                try {
                  contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (e) {
                  // fallback без smooth-scroll для старых браузеров
                  var rect = contactSection.getBoundingClientRect();
                  window.scrollTo(0, window.pageYOffset + rect.top - 16);
                }
              });
            }
          })();
        </script>
      </body>
    </html>
  `);
});

module.exports = router;

