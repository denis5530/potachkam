// src/routes/partners.js
const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const Partner = require('../models/Partner');
const Client = require('../models/Client');
const { db } = require('../storage/db');
const Car = require('../models/Car');
const CriterionFoundCar = require('../models/CriterionFoundCar');
const SearchCriteria = require('../models/SearchCriteria');

// --- Настройки загрузки изображений машин ---
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'cars');
const UPLOAD_PARTNERS_DIR = path.join(__dirname, '..', '..', 'uploads', 'partners');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_PARTNERS_DIR)) {
  fs.mkdirSync(UPLOAD_PARTNERS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'car', ext);
    const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'car';
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  },
});

const storagePartnerLogo = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_PARTNERS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.png';
    const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.png';
    cb(null, `logo_${Date.now()}${safeExt}`);
  },
});

const storagePartnerMulti = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_PARTNERS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || (file.fieldname === 'cover' || file.fieldname === 'cover_mobile' ? '.jpg' : '.png');
    const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : (file.fieldname === 'cover' || file.fieldname === 'cover_mobile' ? '.jpg' : '.png');
    const prefix = file.fieldname === 'cover_mobile' ? 'cover_mobile_' : file.fieldname === 'cover' ? 'cover_' : 'logo_';
    cb(null, prefix + Date.now() + safeExt);
  },
});

const uploadCarImages = multer({ storage });
const uploadPartnerLogo = multer({ storage: storagePartnerLogo });
const uploadPartnerFiles = multer({ storage: storagePartnerMulti }).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
  { name: 'cover_mobile', maxCount: 1 },
]);

// --- Менеджерская авторизация (Basic Auth) ---
const MANAGER_LOGIN = process.env.MANAGER_LOGIN || 'admin';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'admin';

function requireManagerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Manager Area"');
    return res.status(401).send('Authentication required');
  }
  const base64 = header.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [login, password] = decoded.split(':');
  if (login === MANAGER_LOGIN && password === MANAGER_PASSWORD) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Manager Area"');
  return res.status(401).send('Invalid credentials');
}

// Простая валидация тела для создания партнёра
function validateCreatePartnerBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Body must be a JSON object' };
  }

  const { name, slug, contactsJson } = body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return { error: 'name must be a non-empty string' };
  }

  if (typeof slug !== 'string' || slug.trim().length === 0) {
    return { error: 'slug must be a non-empty string' };
  }

  // contactsJson можно не передавать, а можно передать строкой/объектом
  let normalizedContactsJson = null;
  if (typeof contactsJson !== 'undefined' && contactsJson !== null) {
    if (typeof contactsJson === 'string') {
      normalizedContactsJson = contactsJson;
    } else {
      // сериализуем объект в JSON
      normalizedContactsJson = JSON.stringify(contactsJson);
    }
  }

  return {
    error: null,
    value: {
      name: name.trim(),
      slug: slug.trim(),
      contactsJson: normalizedContactsJson,
    },
  };
}

// Примитивная HTML-админка для менеджера платформы
function renderAdminPartnersPage(
  res,
  { partners, carsPage, error, success, form } = {}
) {
  const safe = (v) => (v == null ? '' : String(v));
  const escapeHtml = (v) => safe(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const page = carsPage?.page || 1;
  const pages = carsPage?.pages || 1;

  let carsSectionHtml = '<p>Машины ещё не добавлены.</p>';
  if (carsPage && carsPage.items && carsPage.items.length) {
    const rows = carsPage.items
      .map((car) => {
        const publicUrl =
          '/p/' +
          encodeURIComponent(car.partner_slug) +
          '/cars/' +
          (car.car_public_id != null ? car.car_public_id : car.id);

        return (
          '<tr>' +
          `<td>${car.id}</td>` +
          '<td>' +
          `<a href="${publicUrl}" target="_blank">${safe(car.title)}</a>` +
          `<button type="button" class="icon-button" data-url="${publicUrl}" title="Скопировать ссылку">` +
          '<svg viewBox="0 0 24 24" fill="none">' +
          '<path d="M10 13a5 5 0 0 0 7.07 0l1.83-1.83a4 4 0 0 0-5.66-5.66L12 7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="M14 11a5 5 0 0 0-7.07 0L5.1 12.83a4 4 0 0 0 5.66 5.66L12 17" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
          '</button>' +
          '</td>' +
          `<td>${safe(car.client_name)} (#${car.client_id})</td>` +
          `<td>${safe(car.partner_name)}</td>` +
          `<td>${safe(car.created_at)}</td>` +
          '<td>' +
          '<form method="post" action="/admin/cars/' +
          car.id +
          '/delete" onsubmit="return confirm(\'Удалить машину #' +
          car.id +
          '?\');">' +
          `<input type="hidden" name="page" value="${page}" />` +
          '<button type="submit" style="background:#ef4444;">Удалить</button>' +
          '</form>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    carsSectionHtml = `
        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Заголовок</th>
              <th>Клиент</th>
              <th>Пригонщик</th>
              <th>Создано</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        </div>
        <div class="pagination">
          ${
            page > 1
              ? `<a href="/admin/partners?page=${page - 1}">&larr; Предыдущая</a>`
              : ''
          }
          <span class="current">Страница ${page} из ${pages}</span>
          ${
            page < pages
              ? `<a href="/admin/partners?page=${page + 1}">Следующая &rarr;</a>`
              : ''
          }
        </div>
    `;
  }

  const getContacts = (p) => {
    let c = {};
    if (p && p.contacts_json) {
      try {
        const parsed = JSON.parse(p.contacts_json);
        if (parsed && typeof parsed === 'object') c = parsed;
      } catch (e) {}
    }
    return c;
  };
  const partnersRows =
    partners && partners.length
      ? partners
          .map((p) => {
            const partnerId = Number(p.id);
            const displayId = p.public_id != null ? String(p.public_id) : String(partnerId);
            const c = getContacts(p);
            const phone = c.phone ? safe(c.phone) : '—';
            const messengers = [c.telegram && 'TG', c.whatsapp && 'WA', c.viber && 'Viber'].filter(Boolean).join(', ') || '—';
            const links = [c.website && 'Сайт', c.youtube && 'Ютуб', c.vk && 'ВК', c.telegram_channel && 'Канал'].filter(Boolean).join(', ') || '—';
            return (
              '<tr>' +
              `<td>${displayId}</td>` +
              `<td>${safe(p.name)}</td>` +
              `<td><code>${safe(p.slug)}</code></td>` +
              `<td>${phone}</td>` +
              `<td>${messengers}</td>` +
              `<td>${links}</td>` +
              `<td><a href="/p/${encodeURIComponent(p.slug)}" target="_blank">/p/${p.slug}</a></td>` +
              `<td><a href="/admin/partners/${partnerId}/edit" class="btn-link">Редактировать</a></td>` +
              '</tr>'
            );
          })
          .join('')
      : `
        <tr>
          <td colspan="8">Партнёры ещё не созданы.</td>
        </tr>
      `;

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Админка — партнёры</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 16px; max-width: 960px; box-sizing: border-box; }
          h1 { font-size: 22px; margin-bottom: 12px; }
          h2 { margin-top: 24px; font-size: 18px; }
          .table-wrap { overflow-x: auto; margin-top: 12px; -webkit-overflow-scrolling: touch; }
          table { border-collapse: collapse; width: 100%; min-width: 320px; margin-top: 0; }
          th, td { border: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; font-size: 14px; }
          th { background: #f3f4f6; }
          form { margin-top: 12px; display: grid; gap: 10px; max-width: 100%; }
          label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
          input[type="text"], input[type="number"], input[type="file"], textarea { padding: 10px 10px; border-radius: 6px; border: 1px solid #d1d5db; font: inherit; font-size: 16px; width: 100%; }
          button { padding: 12px 14px; border-radius: 6px; border: none; background: #2563eb; color: white; font-weight: 500; font-size: 16px; cursor: pointer; min-height: 44px; }
          button:hover { background: #1d4ed8; }
          .flash { padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
          .flash.error { background: #fee2e2; color: #b91c1c; }
          .flash.success { background: #dcfce7; color: #15803d; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 13px; word-break: break-all; }
          .pagination { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; font-size: 14px; align-items: center; }
          .pagination a { color: #2563eb; text-decoration: none; padding: 6px 0; }
          .pagination a:hover { text-decoration: underline; }
          .pagination .current { font-weight: 600; }
          .icon-button { border: none; background: transparent; cursor: pointer; padding: 8px; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
          .icon-button svg { width: 18px; height: 18px; stroke: #6b7280; }
          .icon-button:hover svg { stroke: #111827; }
          @media (min-width: 768px) {
            body { margin: 32px auto; padding: 0; }
            h1 { font-size: 26px; margin-bottom: 16px; }
            h2 { margin-top: 32px; }
            .table-wrap { margin-top: 12px; overflow-x: visible; }
            table { min-width: auto; }
            th, td { padding: 8px 10px; font-size: inherit; }
            form { max-width: 480px; gap: 8px; }
            input[type="text"], input[type="number"], input[type="file"], textarea { padding: 6px 8px; font-size: inherit; width: auto; }
            button { padding: 8px 14px; min-height: auto; font-size: inherit; }
          .icon-button { padding: 4px; min-width: auto; min-height: auto; }
          .icon-button svg { width: 16px; height: 16px; }
          .btn-link { color: #2563eb; text-decoration: none; font-weight: 500; }
          .btn-link:hover { text-decoration: underline; }
          }
        </style>
      </head>
      <body>
        <h1>Админка платформы — партнёры</h1>

        ${
          error
            ? `<div class="flash error">${escapeHtml(error)}</div>`
            : success
            ? `<div class="flash success">${escapeHtml(success)}</div>`
            : ''
        }

        <h2>Существующие партнёры</h2>
        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Имя</th>
              <th>Slug</th>
              <th>Телефон</th>
              <th>Контакты</th>
              <th>Ссылки</th>
              <th>Страница</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${partnersRows}
          </tbody>
        </table>
        </div>

        <h2>Создать нового партнёра</h2>
        <form method="post" action="/admin/partners" enctype="multipart/form-data">
          <label>
            Имя пригонщика (name)
            <input type="text" name="name" value="${safe(form?.name)}" required />
          </label>
          <label>
            Слоган (отображается на профиле и на странице авто)
            <input type="text" name="tagline" value="${safe(form?.tagline)}" placeholder="Подбор и пригон авто из Кореи, Китая, Европы" />
          </label>
          <label>
            Обложка (фон блока пригонщика на профиле и над машиной)
            <input type="file" name="cover" accept="image/*" />
          </label>
          <label>
            Логотип перегонщика (необязательно; если нет — будет показана первая буква имени)
            <input type="file" name="logo" accept="image/*" />
          </label>
          <label>
            Зона отображения логотипа (центрирование в рамке)
            <select name="logo_position">
              <option value="center center" ${(form?.logo_position || 'center center') === 'center center' ? 'selected' : ''}>По центру</option>
              <option value="top center" ${form?.logo_position === 'top center' ? 'selected' : ''}>Сверху по центру</option>
              <option value="bottom center" ${form?.logo_position === 'bottom center' ? 'selected' : ''}>Снизу по центру</option>
              <option value="left center" ${form?.logo_position === 'left center' ? 'selected' : ''}>Слева по центру</option>
              <option value="right center" ${form?.logo_position === 'right center' ? 'selected' : ''}>Справа по центру</option>
              <option value="top left" ${form?.logo_position === 'top left' ? 'selected' : ''}>Верхний левый угол</option>
              <option value="top right" ${form?.logo_position === 'top right' ? 'selected' : ''}>Верхний правый угол</option>
              <option value="bottom left" ${form?.logo_position === 'bottom left' ? 'selected' : ''}>Нижний левый угол</option>
              <option value="bottom right" ${form?.logo_position === 'bottom right' ? 'selected' : ''}>Нижний правый угол</option>
            </select>
          </label>
          <label>
            Slug (используется в ссылке <code>/p/&lt;slug&gt;</code>)
            <input type="text" name="slug" value="${safe(form?.slug)}" required />
          </label>
          <label>
            Логин для входа партнёра
            <input type="text" name="login" value="${safe(form?.login)}" placeholder="по умолчанию = slug" />
          </label>
          <label>
            Пароль для входа партнёра
            <input type="text" name="password" value="${safe(form?.password)}" placeholder="по умолчанию slug123" />
          </label>
          <label>
            Телефон (для кнопки «Позвонить»)
            <input type="text" name="phone" value="${safe(form?.phone)}" placeholder="+7..." required />
          </label>
          <label>
            Telegram (ник или ссылка)
            <input type="text" name="telegram" value="${safe(form?.telegram)}" placeholder="@nickname или ссылка" />
          </label>
          <label>
            WhatsApp (номер или ссылка)
            <input type="text" name="whatsapp" value="${safe(form?.whatsapp)}" placeholder="+7... или ссылка" />
          </label>
          <label>
            Viber (номер или ссылка)
            <input type="text" name="viber" value="${safe(form?.viber)}" placeholder="+7... или ссылка" />
          </label>
          <label>
            Сайт компании
            <input type="text" name="website" value="${safe(form?.website)}" placeholder="https://..." />
          </label>
          <label>
            Ютуб
            <input type="text" name="youtube" value="${safe(form?.youtube)}" placeholder="https://youtube.com/..." />
          </label>
          <label>
            ВК
            <input type="text" name="vk" value="${safe(form?.vk)}" placeholder="https://vk.com/..." />
          </label>
          <label>
            Телеграм-канал
            <input type="text" name="telegram_channel" value="${safe(form?.telegram_channel)}" placeholder="https://t.me/... или @channel" />
          </label>
          <button type="submit">Создать партнёра</button>
        </form>

        <h2>Добавить машину клиенту</h2>
        <form method="post" action="/admin/cars" enctype="multipart/form-data">
          <label>
            ID клиента
            <input type="text" name="clientId" value="${safe(form?.clientId)}" required />
          </label>
          <label>
            Заголовок объявления
            <input type="text" name="title" value="${safe(form?.title)}" required />
          </label>
          <label>
            Цена (в рублях)
            <input type="text" name="price" value="${safe(form?.price)}" placeholder="Например 1200000" />
          </label>
          <label>
            Описание
            <textarea name="description" rows="3" placeholder="Краткое описание машины">${safe(
              form?.description
            )}</textarea>
          </label>
          <label>
            Фото машины
            <input type="file" name="images" accept="image/*" multiple />
          </label>
          <label>
            Ссылка на источник (опционально)
            <input type="text" name="sourceUrl" value="${safe(form?.sourceUrl)}" placeholder="https://..." />
          </label>
          <label>
            ID найденной записи (привязать к списку найденных по критерию)
            <input type="text" name="foundCarId" value="${safe(form?.foundCarId)}" placeholder="опционально" />
          </label>
          <button type="submit">Создать машину</button>
        </form>
        
        <h2>Все машины</h2>
        ${carsSectionHtml}
        <script>
          document.addEventListener('click', function (e) {
            const btn = e.target.closest('.icon-button');
            if (!btn) return;
            const url = btn.getAttribute('data-url');
            if (!url || !navigator.clipboard) return;
            const absolute = location.origin + url;
            navigator.clipboard.writeText(absolute).catch(() => {});
          });
        </script>
      </body>
    </html>
  `);
}

// GET /admin/partners теперь обрабатывается в admin.js (новая админ-панель с сайдбаром).

function getPartnerContacts(partner) {
  let c = {};
  if (partner && partner.contacts_json) {
    try {
      const parsed = JSON.parse(partner.contacts_json);
      if (parsed && typeof parsed === 'object') c = parsed;
    } catch (e) {}
  }
  return c;
}

// GET /admin/partners/:id/edit — форма редактирования партнёра с подставленными данными
router.get('/admin/partners/:id/edit', requireManagerAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.redirect('/admin/partners');
  }
  const partner = Partner.findById(id);
  if (!partner) {
    return res.redirect('/admin/partners');
  }
  const c = getPartnerContacts(partner);
  const safe = (v) => (v == null ? '' : String(v));
  const esc = (v) => safe(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const logoNote = partner.logo_url
    ? `<p class="form-note">Текущий логотип: <img src="/uploads/${partner.logo_url.startsWith('partners/') ? partner.logo_url : 'partners/' + partner.logo_url}" alt="" style="max-height:40px;vertical-align:middle;" /> Загрузите новый файл, чтобы заменить.</p>`
    : '<p class="form-note">Логотип не загружен. Можно загрузить новый.</p>';
  const coverNote = partner.cover_url
    ? `<p class="form-note">Текущая обложка: <img src="/uploads/${partner.cover_url.startsWith('partners/') ? partner.cover_url : 'partners/' + partner.cover_url}" alt="" style="max-height:60px;vertical-align:middle;border-radius:6px;" /> Загрузите новый файл, чтобы заменить.</p>`
    : '<p class="form-note">Обложка не загружена.</p>';

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Редактировать партнёра — ${safe(partner.name)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 16px; max-width: 640px; }
          h1 { font-size: 22px; margin-bottom: 16px; }
          .flash { padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
          .flash.error { background: #fee2e2; color: #b91c1c; }
          form { display: grid; gap: 12px; }
          label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
          input[type="text"], input[type="file"] { padding: 10px; border-radius: 6px; border: 1px solid #d1d5db; font: inherit; font-size: 16px; width: 100%; }
          button[type="submit"] { padding: 12px 14px; border-radius: 6px; border: none; background: #2563eb; color: white; font-weight: 500; font-size: 16px; cursor: pointer; }
          button[type="submit"]:hover { background: #1d4ed8; }
          .form-actions { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
          .back-link { color: #2563eb; text-decoration: none; }
          .back-link:hover { text-decoration: underline; }
          .form-note { font-size: 13px; color: #6b7280; margin: 0 0 8px; }
        </style>
      </head>
      <body>
        <h1>Редактировать партнёра</h1>
        ${req.query.error ? `<div class="flash error">${safe(req.query.error).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</div>` : ''}
        <form method="post" action="/admin/partners/${partner.id}" enctype="multipart/form-data">
          <input type="hidden" name="logo_crop_json" value="${esc(partner.logo_crop_json || '')}" />
          <label>
            Имя пригонщика
            <input type="text" name="name" value="${esc(partner.name)}" required />
          </label>
          <label>
            Логотип
            <input type="file" name="logo" accept="image/*" />
            ${logoNote}
          </label>
          <label>
            Зона отображения логотипа (центрирование в рамке)
            <select name="logo_position">
              <option value="center center" ${(partner.logo_position || 'center center') === 'center center' ? 'selected' : ''}>По центру</option>
              <option value="top center" ${partner.logo_position === 'top center' ? 'selected' : ''}>Сверху по центру</option>
              <option value="bottom center" ${partner.logo_position === 'bottom center' ? 'selected' : ''}>Снизу по центру</option>
              <option value="left center" ${partner.logo_position === 'left center' ? 'selected' : ''}>Слева по центру</option>
              <option value="right center" ${partner.logo_position === 'right center' ? 'selected' : ''}>Справа по центру</option>
              <option value="top left" ${partner.logo_position === 'top left' ? 'selected' : ''}>Верхний левый угол</option>
              <option value="top right" ${partner.logo_position === 'top right' ? 'selected' : ''}>Верхний правый угол</option>
              <option value="bottom left" ${partner.logo_position === 'bottom left' ? 'selected' : ''}>Нижний левый угол</option>
              <option value="bottom right" ${partner.logo_position === 'bottom right' ? 'selected' : ''}>Нижний правый угол</option>
            </select>
          </label>
          <label>
            Слоган (на профиле и над машиной)
            <input type="text" name="tagline" value="${esc(partner.tagline)}" placeholder="Подбор и пригон авто из Кореи, Китая, Европы" />
          </label>
          <label>
            Обложка
            <input type="file" name="cover" accept="image/*" />
            ${coverNote}
          </label>
          <label>
            Slug (ссылка /p/<code>&lt;slug&gt;</code>)
            <input type="text" name="slug" value="${esc(partner.slug)}" required />
          </label>
          <label>
            Телефон (обязателен)
            <input type="text" name="phone" value="${esc(c.phone)}" placeholder="+7..." required />
          </label>
          <label>
            Telegram (ник или ссылка)
            <input type="text" name="telegram" value="${esc(c.telegram)}" placeholder="@nickname или ссылка" />
          </label>
          <label>
            WhatsApp (номер или ссылка)
            <input type="text" name="whatsapp" value="${esc(c.whatsapp)}" placeholder="+7... или ссылка" />
          </label>
          <label>
            Viber (номер или ссылка)
            <input type="text" name="viber" value="${esc(c.viber)}" placeholder="+7... или ссылка" />
          </label>
          <label>
            Сайт компании
            <input type="text" name="website" value="${esc(c.website)}" placeholder="https://..." />
          </label>
          <label>
            Ютуб
            <input type="text" name="youtube" value="${esc(c.youtube)}" placeholder="https://youtube.com/..." />
          </label>
          <label>
            ВК
            <input type="text" name="vk" value="${esc(c.vk)}" placeholder="https://vk.com/..." />
          </label>
          <label>
            Телеграм-канал
            <input type="text" name="telegram_channel" value="${esc(c.telegram_channel)}" placeholder="https://t.me/... или @channel" />
          </label>
          <div class="form-actions">
            <button type="submit">Сохранить</button>
            <a href="/admin/partners" class="back-link">← К списку партнёров</a>
          </div>
        </form>
      </body>
    </html>
  `);
});

// POST /admin/partners/:id — обновление партнёра
router.post('/admin/partners/:id', requireManagerAuth, uploadPartnerFiles, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.redirect('/admin/partners');
  }
  const partner = Partner.findById(id);
  if (!partner) {
    return res.redirect('/admin/partners');
  }

  const { name, slug, tagline, logo_position, logo_crop_json, cover_crop_json, cover_mobile_crop_json, delete_logo, delete_cover, delete_cover_mobile, phone, telegram, whatsapp, viber, website, youtube, vk, telegram_channel, status } = req.body || {};

  if (!name || String(name).trim().length === 0) {
    return res.redirect('/admin/partners/' + id + '/edit?error=' + encodeURIComponent('Имя обязательно'));
  }
  if (!slug || String(slug).trim().length === 0) {
    return res.redirect('/admin/partners/' + id + '/edit?error=' + encodeURIComponent('Slug обязателен'));
  }
  if (!phone || String(phone).trim().length === 0) {
    return res.redirect('/admin/partners/' + id + '/edit?error=' + encodeURIComponent('Телефон обязателен'));
  }

  const contacts = {
    phone: String(phone).trim(),
  };
  if (telegram && String(telegram).trim().length > 0) contacts.telegram = String(telegram).trim();
  if (whatsapp && String(whatsapp).trim().length > 0) contacts.whatsapp = String(whatsapp).trim();
  if (viber && String(viber).trim().length > 0) contacts.viber = String(viber).trim();
  if (website && String(website).trim().length > 0) contacts.website = String(website).trim();
  if (youtube && String(youtube).trim().length > 0) contacts.youtube = String(youtube).trim();
  if (vk && String(vk).trim().length > 0) contacts.vk = String(vk).trim();
  if (telegram_channel && String(telegram_channel).trim().length > 0) contacts.telegram_channel = String(telegram_channel).trim();

  const contactsJson = JSON.stringify(contacts);

  const taglineVal = tagline != null ? String(tagline).trim() || null : undefined;
  const logoPositionVal = logo_position != null && String(logo_position).trim().length > 0 ? String(logo_position).trim() : null;
  const logoCropVal = (delete_logo === 'on' || delete_logo === '1') ? null : (logo_crop_json != null && String(logo_crop_json).trim().length > 0 ? String(logo_crop_json).trim() : undefined);
  const coverCropVal = (delete_cover === 'on' || delete_cover === '1') ? null : (cover_crop_json != null && String(cover_crop_json).trim().length > 0 ? String(cover_crop_json).trim() : undefined);
  const coverMobileCropVal = (delete_cover_mobile === 'on' || delete_cover_mobile === '1') ? null : (cover_mobile_crop_json != null && String(cover_mobile_crop_json).trim().length > 0 ? String(cover_mobile_crop_json).trim() : undefined);
  const logoFile = req.files && req.files.logo && req.files.logo[0];
  const coverFile = req.files && req.files.cover && req.files.cover[0];
  const coverMobileFile = req.files && req.files.cover_mobile && req.files.cover_mobile[0];

  try {
    if (delete_logo === 'on' || delete_logo === '1') Partner.clearLogo(id);
    if (delete_cover === 'on' || delete_cover === '1') Partner.clearCover(id);
    if (delete_cover_mobile === 'on' || delete_cover_mobile === '1') Partner.clearCoverMobile(id);
    Partner.update(id, {
      name: String(name).trim(),
      slug: String(slug).trim(),
      contactsJson,
      tagline: taglineVal,
      logoPosition: logoPositionVal,
      logoCropJson: logoCropVal,
      coverCropJson: coverCropVal,
      coverMobileCropJson: coverMobileCropVal,
      status: status && String(status).trim() ? String(status).trim() : 'active',
    });
    if (logoFile && logoFile.filename) {
      Partner.updateLogo(id, 'partners/' + logoFile.filename);
    }
    if (coverFile && coverFile.filename) {
      Partner.updateCover(id, 'partners/' + coverFile.filename);
    }
    if (coverMobileFile && coverMobileFile.filename) {
      Partner.updateCoverMobile(id, 'partners/' + coverMobileFile.filename);
    }
    return res.redirect('/admin/partners?success=' + encodeURIComponent('Партнёр обновлён'));
  } catch (e) {
    console.error('Error updating partner:', e);
    return res.redirect('/admin/partners/' + id + '/edit?error=' + encodeURIComponent('Не удалось сохранить (возможно, slug уже занят)'));
  }
});

// Редактирование партнёра (форма) — GET /admin/partners/:id/edit остаётся здесь.

// POST /admin/partners — создание партнёра через HTML-форму
router.post('/admin/partners', requireManagerAuth, uploadPartnerFiles, async (req, res) => {
  const { name, slug, tagline, logo_position, logo_crop_json, cover_crop_json, cover_mobile_crop_json, login, password, phone, telegram, whatsapp, viber, website, youtube, vk, telegram_channel, status } = req.body || {};

  const formFields = { name, slug, tagline, logo_position, logo_crop_json, cover_crop_json, cover_mobile_crop_json, login, password, phone, telegram, whatsapp, viber, website, youtube, vk, telegram_channel, status };

  const contacts = {};
  if (!phone || phone.trim().length === 0) {
    const err = encodeURIComponent('Телефон обязателен');
    const qs = Object.keys(formFields).filter(k => formFields[k] != null && formFields[k] !== '').map(k => k + '=' + encodeURIComponent(formFields[k])).join('&');
    return res.redirect('/admin/partners/new?error=' + err + (qs ? '&' + qs : ''));
  }
  contacts.phone = phone.trim();
  if (telegram && telegram.trim().length > 0) contacts.telegram = telegram.trim();
  if (whatsapp && whatsapp.trim().length > 0) contacts.whatsapp = whatsapp.trim();
  if (viber && viber.trim().length > 0) contacts.viber = viber.trim();
  if (website && website.trim().length > 0) contacts.website = website.trim();
  if (youtube && youtube.trim().length > 0) contacts.youtube = youtube.trim();
  if (vk && vk.trim().length > 0) contacts.vk = vk.trim();
  if (telegram_channel && telegram_channel.trim().length > 0) contacts.telegram_channel = telegram_channel.trim();
  const contactsJson = Object.keys(contacts).length ? contacts : null;

  const { error, value } = validateCreatePartnerBody({
    name,
    slug,
    contactsJson,
  });

  if (error) {
    const err = encodeURIComponent(error);
    const qs = Object.keys(formFields).filter(k => formFields[k] != null && formFields[k] !== '').map(k => k + '=' + encodeURIComponent(formFields[k])).join('&');
    return res.redirect('/admin/partners/new?error=' + err + (qs ? '&' + qs : ''));
  }

  const taglineVal = tagline != null && String(tagline).trim().length > 0 ? String(tagline).trim() : null;
  const logoPositionVal = logo_position != null && String(logo_position).trim().length > 0 ? String(logo_position).trim() : null;
  const logoCropVal = logo_crop_json != null && String(logo_crop_json).trim().length > 0 ? String(logo_crop_json).trim() : null;
  const coverCropVal = cover_crop_json != null && String(cover_crop_json).trim().length > 0 ? String(cover_crop_json).trim() : null;
  const coverMobileCropVal = cover_mobile_crop_json != null && String(cover_mobile_crop_json).trim().length > 0 ? String(cover_mobile_crop_json).trim() : null;
  const logoFile = req.files && req.files.logo && req.files.logo[0];
  const coverFile = req.files && req.files.cover && req.files.cover[0];
  const coverMobileFile = req.files && req.files.cover_mobile && req.files.cover_mobile[0];

  try {
    const partner = Partner.create({
      ...value,
      tagline: taglineVal,
      coverUrl: coverFile && coverFile.filename ? 'partners/' + coverFile.filename : null,
      coverMobileUrl: coverMobileFile && coverMobileFile.filename ? 'partners/' + coverMobileFile.filename : null,
      logoPosition: logoPositionVal,
      logoCropJson: logoCropVal,
      coverCropJson: coverCropVal,
      coverMobileCropJson: coverMobileCropVal,
      status: status && status.trim() ? status.trim() : 'active',
    });

    if (logoFile && logoFile.filename) {
      Partner.updateLogo(partner.id, 'partners/' + logoFile.filename);
    }
    if (coverMobileFile && coverMobileFile.filename) {
      Partner.updateCoverMobile(partner.id, 'partners/' + coverMobileFile.filename);
    }

    const loginFinal = (login && login.trim()) || slug;
    const passwordPlain = password && password.length ? password : `${slug}123`;
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    db.prepare(
      `INSERT INTO partner_credentials (partner_id, login, password_hash) VALUES (?, ?, ?)`
    ).run(partner.id, loginFinal, passwordHash);

    const success = encodeURIComponent(`Партнёр создан. Логин: ${loginFinal}, пароль: ${passwordPlain}`);
    return res.redirect('/admin/partners?success=' + success);
  } catch (e) {
    console.error('Error creating partner from admin:', e);
    const err = encodeURIComponent('Не удалось создать партнёра (возможно, slug уже занят или логин уже используется)');
    const qs = Object.keys(formFields).filter(k => formFields[k] != null && formFields[k] !== '').map(k => k + '=' + encodeURIComponent(formFields[k])).join('&');
    return res.redirect('/admin/partners/new?error=' + err + (qs ? '&' + qs : ''));
  }
});

// POST /admin/partners/contacts — обновление контактных данных партнёра
router.post('/admin/partners/contacts', requireManagerAuth, (req, res) => {
  const { partnerId, phone, telegram, whatsapp, viber, website, youtube, vk, telegram_channel } = req.body || {};

  const formFields = { partnerId, phone, telegram, whatsapp, viber, website, youtube, vk, telegram_channel };

  const idNum = Number(partnerId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    const partners = Partner.all();
    return renderAdminPartnersPage(res, {
      partners,
      carsPage: null,
      error: 'Некорректный ID партнёра',
      form: formFields,
    });
  }

  const partner = Partner.findById(idNum);
  if (!partner) {
    const partners = Partner.all();
    return renderAdminPartnersPage(res, {
      partners,
      carsPage: null,
      error: 'Партнёр с таким ID не найден',
      form: formFields,
    });
  }

  if (!phone || phone.trim().length === 0) {
    const partners = Partner.all();
    return renderAdminPartnersPage(res, {
      partners,
      carsPage: null,
      error: 'Телефон обязателен',
      form: formFields,
    });
  }

  const contacts = {
    phone: phone.trim(),
  };
  if (telegram && telegram.trim().length > 0) contacts.telegram = telegram.trim();
  if (whatsapp && whatsapp.trim().length > 0) contacts.whatsapp = whatsapp.trim();
  if (viber && viber.trim().length > 0) contacts.viber = viber.trim();
  if (website && website.trim().length > 0) contacts.website = website.trim();
  if (youtube && youtube.trim().length > 0) contacts.youtube = youtube.trim();
  if (vk && vk.trim().length > 0) contacts.vk = vk.trim();
  if (telegram_channel && telegram_channel.trim().length > 0) contacts.telegram_channel = telegram_channel.trim();

  try {
    db.prepare(
      `
        UPDATE partners
        SET contacts_json = ?
        WHERE id = ?
      `
    ).run(JSON.stringify(contacts), idNum);

    const partners = Partner.all();
    return renderAdminPartnersPage(res, {
      partners,
      carsPage: null,
      success: 'Контакты партнёра обновлены',
    });
  } catch (e) {
    console.error('Error updating partner contacts:', e);
    const partners = Partner.all();
    return renderAdminPartnersPage(res, {
      partners,
      carsPage: null,
      error: 'Не удалось обновить контакты партнёра',
      form: formFields,
    });
  }
});

// POST /admin/cars — создание машины (редирект в новую админку)
router.post('/admin/cars', requireManagerAuth, uploadCarImages.array('images', 10), (req, res) => {
  const { clientId, title, price, description, sourceUrl, foundCarId } = req.body || {};

  const clientIdNum = Number(clientId);
  if (!Number.isInteger(clientIdNum) || clientIdNum <= 0) {
    return res.redirect('/admin/automobiles/new?error=' + encodeURIComponent('clientId должен быть положительным числом'));
  }

  const client = Client.findById(clientIdNum);
  if (!client) {
    return res.redirect('/admin/automobiles/new?error=' + encodeURIComponent('Клиент с таким ID не найден'));
  }

  if (!title || String(title).trim().length === 0) {
    return res.redirect('/admin/automobiles/new?error=' + encodeURIComponent('Заголовок машины обязателен'));
  }

  let priceValue = null;
  if (price && String(price).trim().length > 0) {
    const num = Number(price);
    if (!Number.isFinite(num) || num <= 0) {
      return res.redirect('/admin/automobiles/new?error=' + encodeURIComponent('Цена должна быть положительным числом'));
    }
    priceValue = Math.round(num);
  }

  let imagesJson = null;
  if (Array.isArray(req.files) && req.files.length > 0) {
    const urls = req.files.map((file) => `/uploads/cars/${file.filename}`);
    imagesJson = JSON.stringify(urls);
  }

  try {
    const newCar = Car.create({
      clientId: clientIdNum,
      title: String(title).trim(),
      description: description && String(description),
      price: priceValue,
      imagesJson,
      sourceUrl: sourceUrl && String(sourceUrl).trim(),
    });

    const rawFoundCarId = foundCarId != null ? String(foundCarId).trim() : '';
    if (rawFoundCarId && /^\d+$/.test(rawFoundCarId)) {
      const fcId = Number(rawFoundCarId);
      const foundCar = CriterionFoundCar.findById(fcId);
      if (foundCar && !foundCar.car_id) {
        const criterion = SearchCriteria.findById(foundCar.search_criteria_id);
        if (criterion && criterion.client_id === clientIdNum && !criterion.deleted_at) {
          CriterionFoundCar.updateCarId(fcId, newCar.id);
        }
      }
    }

    return res.redirect('/admin/automobiles?success=' + encodeURIComponent('Автомобиль добавлен'));
  } catch (e) {
    console.error('Error creating car from admin:', e);
    return res.redirect('/admin/automobiles/new?error=' + encodeURIComponent('Не удалось создать машину'));
  }
});

// Удаление машины из менеджерской админки
router.post('/admin/cars/:carId/delete', requireManagerAuth, (req, res) => {
  const rawId = req.params.carId;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return res.redirect('/admin/automobiles');
  }

  try {
    Car.deleteById(id);
  } catch (e) {
    console.error('Error deleting car from admin:', e);
  }

  const page = req.body && req.body.page ? Number(req.body.page) : 1;
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  return res.redirect(`/admin/automobiles?page=${safePage}`);
});

// POST /partners — создать партнёра (JSON API, только для менеджера)
router.post('/partners', requireManagerAuth, async (req, res) => {
  const { error, value } = validateCreatePartnerBody(req.body);
  if (error) {
    return res.status(400).json({
      error: 'ValidationError',
      message: error,
    });
  }

  try {
    const partner = Partner.create(value);

    // Логин/пароль можно передать в теле запроса или сгенерировать
    const login = req.body.login || value.slug;
    const passwordPlain = req.body.password || `${value.slug}123`;
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    db.prepare(
      `
        INSERT INTO partner_credentials (partner_id, login, password_hash)
        VALUES (?, ?, ?)
      `
    ).run(partner.id, login, passwordHash);

    return res.status(201).json({
      partner,
      credentials: { login, password: passwordPlain },
    });
  } catch (e) {
    console.error('Error creating partner:', e);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Could not create partner (slug or login may already exist)',
    });
  }
});

// GET /partners/:slug — данные партнёра + его клиенты
router.get('/partners/:slug', (req, res) => {
  const { slug } = req.params;

  const partner = Partner.findBySlug(slug);
  if (!partner) {
    return res.status(404).json({
      error: 'NotFound',
      message: 'Partner not found',
    });
  }

  const clients = Client.findByPartnerId(partner.id);

  return res.json({
    partner,
    clients,
  });
});

module.exports = router;

