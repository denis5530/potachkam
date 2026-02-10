/**
 * Современная админ-панель: боковое меню, вкладки Партнёры / Автомобили / Найденные авто.
 * UX: минимализм, читаемость, уровень Notion / Linear / Stripe.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const router = express.Router();

const Partner = require('../models/Partner');
const Client = require('../models/Client');
const Car = require('../models/Car');
const CriterionFoundCar = require('../models/CriterionFoundCar');
const SearchCriteria = require('../models/SearchCriteria');
const CountrySource = require('../models/CountrySource');
const { db } = require('../storage/db');

const MANAGER_LOGIN = process.env.MANAGER_LOGIN || 'admin';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'admin';

function requireManagerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
  const base64 = header.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [login, password] = decoded.split(':');
  if (login === MANAGER_LOGIN && password === MANAGER_PASSWORD) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
}

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'cars');
const UPLOAD_PARTNERS_DIR = path.join(__dirname, '..', '..', 'uploads', 'partners');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_PARTNERS_DIR)) fs.mkdirSync(UPLOAD_PARTNERS_DIR, { recursive: true });

const storagePartnerLogo = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_PARTNERS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.png';
    const safe = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.png';
    cb(null, `logo_${Date.now()}${safe}`);
  },
});
const uploadPartnerLogo = multer({ storage: storagePartnerLogo });

const storageCars = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const base = path.basename(file.originalname || 'car', ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'car';
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const uploadCarImages = multer({ storage: storageCars });

function safe(v) {
  return v == null ? '' : String(v);
}
function esc(v) {
  return safe(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getPartnerContacts(p) {
  let c = {};
  if (p && p.contacts_json) {
    try {
      const parsed = JSON.parse(p.contacts_json);
      if (parsed && typeof parsed === 'object') c = parsed;
    } catch (e) {}
  }
  return c;
}

// ——— Layout: sidebar + main ———
const SIDEBAR_HTML = `
  <nav class="admin-sidebar" aria-label="Админ-меню">
    <div class="admin-sidebar-header">
      <span class="admin-sidebar-logo">Платформа</span>
    </div>
    <ul class="admin-sidebar-nav">
      <li><a href="/admin/partners" class="admin-nav-item" data-section="partners">
        <svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Партнёры</span>
      </a></li>
      <li><a href="/admin/automobiles" class="admin-nav-item" data-section="automobiles">
        <svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14v-5H5v5z"/><path d="M19 9l-2-4H7L5 9"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/></svg>
        <span>Автомобили</span>
      </a></li>
      <li><a href="/admin/selections" class="admin-nav-item" data-section="selections">
        <svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="7" height="7"/><rect x="14" y="4" width="7" height="7"/><rect x="3" y="13" width="7" height="7"/><rect x="14" y="13" width="7" height="7"/></svg>
        <span>Подборки</span>
      </a></li>
      <li><a href="/admin/found-cars" class="admin-nav-item" data-section="found-cars">
        <svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span>Найденные авто</span>
      </a></li>
      <li><a href="/admin/sources" class="admin-nav-item" data-section="sources">
        <svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v4H4z"/><path d="M4 10h10v4H4z"/><path d="M4 16h7v4H4z"/></svg>
        <span>Источники</span>
      </a></li>
    </ul>
  </nav>
`;

const ADMIN_STYLES = `
  * { box-sizing: border-box; }
  .admin-root { display: flex; min-height: 100vh; background: #f8fafc; color: #0f172a; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .admin-sidebar { width: 240px; flex-shrink: 0; background: #0f172a; color: #e2e8f0; }
  .admin-sidebar-header { padding: 20px 20px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .admin-sidebar-logo { font-size: 15px; font-weight: 600; letter-spacing: -0.02em; }
  .admin-sidebar-nav { list-style: none; margin: 0; padding: 12px 0; }
  .admin-nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 20px; color: #94a3b8; text-decoration: none; font-size: 14px; transition: background 0.15s, color 0.15s; }
  .admin-nav-item:hover { background: rgba(255,255,255,0.06); color: #f1f5f9; }
  .admin-nav-item.active { background: rgba(255,255,255,0.1); color: #fff; }
  .admin-nav-icon { width: 20px; height: 20px; flex-shrink: 0; }
  .admin-main { flex: 1; min-width: 0; padding: 32px 40px 48px; }
  .admin-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; flex-wrap: wrap; }
  .admin-title { font-size: 24px; font-weight: 600; letter-spacing: -0.03em; margin: 0 0 4px; }
  .admin-subtitle { font-size: 14px; color: #64748b; margin: 0; }
  .admin-actions { flex-shrink: 0; }
  .admin-btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; border: none; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .admin-btn-primary { background: #0f172a; color: #fff; }
  .admin-btn-primary:hover { background: #1e293b; }
  .admin-btn-secondary { background: #fff; color: #475569; border: 1px solid #e2e8f0; }
  .admin-btn-secondary:hover { background: #f8fafc; }
  .admin-btn-danger { background: #dc2626; color: #fff; }
  .admin-btn-danger:hover { background: #b91c1c; }
  .admin-card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
  .admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .admin-table th { text-align: left; padding: 12px 16px; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .admin-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; }
  .admin-table tr:hover td { background: #fafafa; }
  .admin-table .admin-cell-mono { font-variant-numeric: tabular-nums; color: #64748b; }
  .admin-table .admin-cell-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .admin-table .admin-link { color: #2563eb; text-decoration: none; }
  .admin-table .admin-link:hover { text-decoration: underline; }
  .admin-toggle {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    border: 1px solid #e2e8f0;
    background: #f1f5f9;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .admin-toggle-knob {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15,23,42,0.25);
    transform: translateX(2px);
    transition: transform 0.15s ease;
  }
  .admin-toggle-on {
    background: #4f46e5;
    border-color: #4f46e5;
  }
  .admin-toggle-on .admin-toggle-knob {
    transform: translateX(18px);
  }
  .admin-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #64748b;
    font-size: 14px;
    padding: 0;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .admin-icon-btn:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1d4ed8;
  }
  .admin-icon-btn-danger {
    border-color: #fecaca;
    color: #b91c1c;
  }
  .admin-icon-btn-danger:hover {
    background: #fee2e2;
    border-color: #fecaca;
    color: #b91c1c;
  }
  .admin-search { max-width: 280px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
  .admin-search:focus { outline: none; border-color: #0f172a; box-shadow: 0 0 0 2px rgba(15,23,42,0.1); }
  .admin-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
  .admin-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid #e2e8f0;
    background: #f9fafb;
    color: #64748b;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .admin-tab:hover { background: #eef2ff; color: #111827; border-color: #c7d2fe; }
  .admin-tab.admin-tab-active {
    background: #2563eb;
    color: #ffffff;
    border-color: #2563eb;
    font-weight: 600;
  }
  .admin-empty { text-align: center; padding: 48px 24px; color: #64748b; font-size: 14px; }
  .admin-empty-title { font-size: 16px; font-weight: 500; color: #475569; margin: 0 0 8px; }
  .admin-flash {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 10px 25px rgba(15,23,42,0.25);
    z-index: 80;
    max-width: 480px;
    width: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .admin-flash.success { background: #16a34a; color: #ecfdf3; }
  .admin-flash.error { background: #dc2626; color: #fef2f2; }
  .admin-pagination { display: flex; align-items: center; gap: 12px; margin-top: 20px; font-size: 14px; color: #64748b; }
  .admin-pagination a { color: #2563eb; text-decoration: none; }
  .admin-pagination a:hover { text-decoration: underline; }
  .admin-form-group { margin-bottom: 20px; }
  .admin-form-group label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px; }
  .admin-form-group input, .admin-form-group textarea { width: 100%; max-width: 400px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
  .admin-form-group input:focus, .admin-form-group textarea:focus { outline: none; border-color: #0f172a; }
  .admin-form-actions { display: flex; gap: 12px; margin-top: 24px; }
  .admin-form-section { margin-bottom: 28px; }
  .admin-form-section-title { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px; }
  .admin-form-hint { font-size: 12px; color: #64748b; margin-top: 4px; }
  .admin-thumb { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; background: #f1f5f9; }
  .admin-contact-icons { display: flex; gap: 6px; }
  .admin-contact-icons a { color: #64748b; padding: 4px; }
  .admin-contact-icons a:hover { color: #0f172a; }
  .admin-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: none; align-items: center; justify-content: center; z-index: 50; padding: 24px; }
  .admin-modal-backdrop.open { display: flex; }
  .admin-modal { background: #fff; border-radius: 12px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 48px rgba(0,0,0,0.2); }
  .admin-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 20px 16px; border-bottom: 1px solid #e2e8f0; }
  .admin-modal-title { font-size: 18px; font-weight: 600; margin: 0; }
  .admin-modal-close { width: 36px; height: 36px; border: none; background: transparent; border-radius: 8px; cursor: pointer; font-size: 20px; line-height: 1; color: #64748b; }
  .admin-modal-close:hover { background: #f1f5f9; color: #0f172a; }
  .admin-modal-body { padding: 20px; }
  .logo-crop-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: none; align-items: center; justify-content: center; z-index: 60; padding: 24px; }
  .logo-crop-backdrop.open { display: flex; }
  .logo-crop-modal { background: #fff; border-radius: 12px; max-width: 400px; width: 100%; padding: 20px; box-shadow: 0 24px 48px rgba(0,0,0,0.25); }
  .logo-crop-title { font-size: 16px; font-weight: 600; margin: 0 0 16px; }
  .logo-crop-viewport { width: 280px; height: 280px; margin: 0 auto 16px; border-radius: 50%; overflow: hidden; background: #e2e8f0; position: relative; cursor: move; user-select: none; touch-action: none; }
  .logo-crop-image { width: 100%; height: 100%; background-repeat: no-repeat; background-color: #e2e8f0; }
  .logo-crop-zoom { margin-bottom: 16px; }
  .logo-crop-zoom label { display: block; font-size: 12px; color: #64748b; margin-bottom: 6px; }
  .logo-crop-zoom input[type="range"] { width: 100%; }
  .logo-crop-actions { display: flex; gap: 10px; justify-content: flex-end; }
  .admin-btn-small { padding: 8px 14px; font-size: 13px; }
  .cover-crop-viewport { width: 300px; height: 120px; margin: 0 auto 16px; border-radius: 8px; overflow: hidden; background: #e2e8f0; position: relative; cursor: move; user-select: none; touch-action: none; }
  .cover-crop-image { width: 100%; height: 100%; background-repeat: no-repeat; background-color: #e2e8f0; }
  .cover-mobile-crop-viewport { width: 280px; height: 165px; margin: 0 auto 16px; border-radius: 8px; overflow: hidden; background: #e2e8f0; position: relative; cursor: move; user-select: none; touch-action: none; }
  .cover-mobile-crop-image { width: 100%; height: 100%; background-repeat: no-repeat; background-color: #e2e8f0; }
  .admin-form-recommend { font-size: 12px; color: #64748b; margin-top: 6px; padding: 8px 10px; background: #f8fafc; border-radius: 6px; }
  .admin-form-media-block { margin-bottom: 24px; }
  .admin-form-media-row { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
  .admin-form-media-preview { width: 64px; height: 64px; border-radius: 12px; overflow: hidden; background: #f1f5f9; flex-shrink: 0; background-size: cover; background-position: center; background-repeat: no-repeat; }
  .admin-form-media-preview--wide { width: 120px; height: 48px; }
  .admin-form-media-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .admin-form-media-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .admin-form-media-current-actions { display: inline-flex; gap: 8px; }
  .admin-form-file-hidden { position: absolute; width: 0.1px; height: 0.1px; opacity: 0; overflow: hidden; z-index: -1; }
  @media (max-width: 768px) {
    .admin-sidebar { width: 64px; }
    .admin-sidebar-nav span { display: none; }
    .admin-nav-item { justify-content: center; padding: 12px; }
    .admin-main { padding: 20px 16px; }
  }
`;

const LOGO_CROP_MODAL_HTML = `
  <div class="logo-crop-backdrop" id="admin-logo-crop-backdrop" aria-hidden="true">
    <div class="logo-crop-modal" id="admin-logo-crop-modal">
      <h3 class="logo-crop-title">Зона логотипа в круге</h3>
      <p style="font-size:13px;color:#64748b;margin:0 0 12px;">Перетаскивайте картинку и двигайте ползунок — в круге будет видно то, что попадёт на сайт.</p>
      <div class="logo-crop-viewport" id="admin-logo-crop-viewport">
        <div class="logo-crop-image" id="admin-logo-crop-image"></div>
      </div>
      <div class="logo-crop-zoom">
        <label>Масштаб: <span id="admin-logo-crop-zoom-value">1</span>×</label>
        <input type="range" id="admin-logo-crop-zoom-slider" min="0.5" max="3" step="0.1" value="1" />
      </div>
      <div class="logo-crop-actions">
        <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-logo-crop-cancel">Отмена</button>
        <button type="button" class="admin-btn admin-btn-primary admin-btn-small" id="admin-logo-crop-apply">Применить</button>
      </div>
    </div>
  </div>
`;

const COVER_CROP_MODAL_HTML = `
  <div class="logo-crop-backdrop" id="admin-cover-crop-backdrop" aria-hidden="true">
    <div class="logo-crop-modal" id="admin-cover-crop-modal">
      <h3 class="logo-crop-title">Зона обложки (ПК)</h3>
      <p style="font-size:13px;color:#64748b;margin:0 0 12px;">Пропорции 2,5:1 (1200×480). Перетаскивайте картинку и масштаб — так будет на сайте на ПК.</p>
      <div class="cover-crop-viewport" id="admin-cover-crop-viewport">
        <div class="cover-crop-image" id="admin-cover-crop-image"></div>
      </div>
      <div class="logo-crop-zoom">
        <label>Масштаб: <span id="admin-cover-crop-zoom-value">1</span>×</label>
        <input type="range" id="admin-cover-crop-zoom-slider" min="0.5" max="3" step="0.1" value="1" />
      </div>
      <div class="logo-crop-actions">
        <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-cover-crop-cancel">Отмена</button>
        <button type="button" class="admin-btn admin-btn-primary admin-btn-small" id="admin-cover-crop-apply">Применить</button>
      </div>
    </div>
  </div>
`;

const COVER_MOBILE_CROP_MODAL_HTML = `
  <div class="logo-crop-backdrop" id="admin-cover-mobile-crop-backdrop" aria-hidden="true">
    <div class="logo-crop-modal" id="admin-cover-mobile-crop-modal">
      <h3 class="logo-crop-title">Зона обложки (мобильная)</h3>
      <p style="font-size:13px;color:#64748b;margin:0 0 12px;">Пропорции ~1,7:1 (800×470). Так будет на телефоне.</p>
      <div class="cover-mobile-crop-viewport" id="admin-cover-mobile-crop-viewport">
        <div class="cover-mobile-crop-image" id="admin-cover-mobile-crop-image"></div>
      </div>
      <div class="logo-crop-zoom">
        <label>Масштаб: <span id="admin-cover-mobile-crop-zoom-value">1</span>×</label>
        <input type="range" id="admin-cover-mobile-crop-zoom-slider" min="0.5" max="3" step="0.1" value="1" />
      </div>
      <div class="logo-crop-actions">
        <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-cover-mobile-crop-cancel">Отмена</button>
        <button type="button" class="admin-btn admin-btn-primary admin-btn-small" id="admin-cover-mobile-crop-apply">Применить</button>
      </div>
    </div>
  </div>
`;

function adminLayout(activeSection, mainContent, { title = '', subtitle = '' } = {}) {
  return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${esc(title || 'Админка')}</title>
      <style>${ADMIN_STYLES}</style>
    </head>
    <body class="admin-root">
      ${SIDEBAR_HTML}
      <main class="admin-main">
        ${title ? `<div class="admin-top"><div><h1 class="admin-title">${esc(title)}</h1>${subtitle ? `<p class="admin-subtitle">${esc(subtitle)}</p>` : ''}</div>` : ''}
        ${mainContent}
      </main>
    </body>
    </html>
  `;
}

// ——— GET /admin ———
router.get('/admin', requireManagerAuth, (req, res) => {
  res.redirect('/admin/partners');
});

// ——— GET /admin/partners ———
router.get('/admin/partners', requireManagerAuth, (req, res) => {
  const partners = Partner.all();
  const success = req.query.success || null;
  const error = req.query.error || null;
  const q = (req.query.q || '').trim().toLowerCase();
  const statusFilter = (req.query.status || 'all').toLowerCase();
  let list = partners;
  if (q) {
    list = partners.filter(p => {
      const name = safe(p.name).toLowerCase();
      const slug = safe(p.slug).toLowerCase();
      const idStr = String(p.public_id || p.id);
      return name.includes(q) || slug.includes(q) || idStr.includes(q);
    });
  }
  if (statusFilter === 'active') {
    list = list.filter((p) => (p.status || 'active') === 'active');
  } else if (statusFilter === 'disabled') {
    list = list.filter((p) => (p.status || 'active') === 'disabled');
  }
  const pageSize = 15;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;
  const items = list.slice(offset, offset + pageSize);

  let tableRows = '';
  if (items.length) {
    tableRows = items.map(p => {
      const c = getPartnerContacts(p);
      const displayId = p.public_id != null ? String(p.public_id) : String(p.id);
      const contacts = [];
      if (c.phone) contacts.push(`<a href="tel:${esc(c.phone)}" title="Телефон">📞</a>`);
      if (c.telegram) contacts.push(`<a href="https://t.me/${c.telegram.replace(/^@/,'')}" target="_blank" rel="noopener" title="Telegram">TG</a>`);
      if (c.whatsapp) contacts.push(`<a href="https://wa.me/${(c.whatsapp).replace(/\D/g,'')}" target="_blank" rel="noopener" title="WhatsApp">WA</a>`);
      if (c.viber) contacts.push(`<a href="https://viber.click/${(c.viber).replace(/\D/g,'')}" target="_blank" rel="noopener" title="Viber">VB</a>`);
      const contactsHtml = contacts.length ? `<div class="admin-contact-icons">${contacts.join('')}</div>` : '—';
      const status = (p.status || 'active') === 'disabled' ? 'disabled' : 'active';
      const statusBadge =
        status === 'active'
          ? '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:12px;background:#DCFCE7;color:#166534;">Активен</span>'
          : '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:12px;background:#FEE2E2;color:#B91C1C;">Отключён</span>';
      return (
        '<tr>' +
        `<td class="admin-cell-mono">${esc(displayId)}</td>` +
        `<td>${esc(p.name)}</td>` +
        `<td><code>${esc(p.slug)}</code></td>` +
        `<td>${statusBadge}</td>` +
        `<td>${contactsHtml}</td>` +
        `<td><div class="admin-cell-actions">` +
        `<button type="button" class="admin-btn admin-btn-secondary admin-edit-partner" data-id="${p.id}" style="padding:6px 12px;font-size:13px;">Профиль</button>` +
        ` <a class="admin-link" href="/p/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Публичная страница</a>` +
        `</div></td>` +
        '</tr>'
      );
    }).join('');
  }

  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Партнёры</h1>
        <p class="admin-subtitle">Все пригонщики и партнёры платформы</p>
      </div>
      <div class="admin-actions" style="display:flex;align-items:center;gap:12px;">
        <input type="search" class="admin-search" placeholder="Поиск по имени, slug или ID" id="admin-partners-search" value="${esc(q)}" />
        <select id="admin-partners-status" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;">
          <option value="all"${statusFilter === 'all' ? ' selected' : ''}>Все</option>
          <option value="active"${statusFilter === 'active' ? ' selected' : ''}>Активные</option>
          <option value="disabled"${statusFilter === 'disabled' ? ' selected' : ''}>Отключённые</option>
        </select>
        <a href="/admin/partners/new" class="admin-btn admin-btn-primary">Добавить партнёра</a>
      </div>
    </div>
  `;

  const emptyState = !tableRows ? `
    <div class="admin-empty admin-card" style="margin-top:0;">
      <p class="admin-empty-title">Партнёров пока нет</p>
      <p>Добавьте первого партнёра, нажав кнопку «Добавить партнёра».</p>
      <p style="margin-top:16px;"><a href="/admin/partners/new" class="admin-btn admin-btn-primary">Добавить партнёра</a></p>
    </div>
  ` : '';

  const tableHtml = tableRows ? `
    ${success ? `<div class="admin-flash success">${esc(success)}</div>` : ''}
    ${error ? `<div class="admin-flash error">${esc(error)}</div>` : ''}
    <div class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя / ник</th>
            <th>Slug</th>
            <th>Статус</th>
            <th>Контакты</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${total > pageSize ? `
        <div class="admin-pagination" style="padding:12px 16px;">
          ${safePage > 1 ? `<a href="/admin/partners?page=${safePage - 1}${q ? '&q=' + encodeURIComponent(q) : ''}${statusFilter !== 'all' ? '&status=' + encodeURIComponent(statusFilter) : ''}">← Пред.</a>` : ''}
          <span>Стр. ${safePage} из ${pages}</span>
          ${safePage < pages ? `<a href="/admin/partners?page=${safePage + 1}${q ? '&q=' + encodeURIComponent(q) : ''}${statusFilter !== 'all' ? '&status=' + encodeURIComponent(statusFilter) : ''}">След. →</a>` : ''}
        </div>
      ` : ''}
    </div>
  ` : '';

  const partnerEditModalHtml = `
    <div class="admin-modal-backdrop" id="admin-partner-modal" aria-hidden="true">
      <div class="admin-modal" role="dialog" aria-labelledby="admin-partner-modal-title">
        <div class="admin-modal-header">
          <h2 class="admin-modal-title" id="admin-partner-modal-title">Редактировать партнёра</h2>
          <button type="button" class="admin-modal-close" id="admin-partner-modal-close" aria-label="Закрыть">&times;</button>
        </div>
        <div class="admin-modal-body">
          <form id="admin-partner-edit-form" method="post" action="" enctype="multipart/form-data">
            <div class="admin-form-section">
              <div class="admin-form-section-title">Основная информация</div>
              <div class="admin-form-group"><label>Имя</label><input type="text" name="name" required /></div>
              <div class="admin-form-group"><label>Slug (ссылка /p/slug)</label><input type="text" name="slug" required /></div>
              <div class="admin-form-group"><label>Слоган (на профиле и над машиной)</label><input type="text" name="tagline" placeholder="Подбор и пригон авто из Кореи, Китая, Европы" /></div>
              <div class="admin-form-group">
                <label>Статус</label>
                <select name="status">
                  <option value="active">Активен</option>
                  <option value="disabled">Отключён</option>
                </select>
              </div>
              <div class="admin-form-group admin-form-media-block">
                <label>Логотип</label>
                <input type="hidden" name="delete_logo" id="admin-partner-delete-logo" value="" />
                <input type="file" name="logo" accept="image/*" id="admin-partner-logo-file" class="admin-form-file-hidden" />
                <input type="hidden" name="logo_crop_json" id="admin-partner-logo-crop-json" />
                <div class="admin-form-media-row">
                  <div class="admin-form-media-preview" id="admin-partner-logo-preview"></div>
                  <div class="admin-form-media-actions">
                    <label class="admin-btn admin-btn-secondary admin-btn-small" for="admin-partner-logo-file" id="admin-partner-logo-file-label">Выбрать файл</label>
                    <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-open-crop">Настроить зону</button>
                    <span class="admin-form-media-current-actions" id="admin-partner-logo-current-actions" style="display:none;">
                      <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-logo-replace">Заменить</button>
                      <button type="button" class="admin-btn admin-btn-danger admin-btn-small" id="admin-partner-logo-delete">Удалить</button>
                    </span>
                  </div>
                </div>
                <p class="admin-form-hint">Круглая зона отображается на сайте. Выберите файл и настройте область в круге.</p>
              </div>
              <div class="admin-form-group admin-form-media-block">
                <label>Обложка (ПК)</label>
                <input type="hidden" name="delete_cover" id="admin-partner-delete-cover" value="" />
                <input type="file" name="cover" accept="image/*" id="admin-partner-cover-file" class="admin-form-file-hidden" />
                <input type="hidden" name="cover_crop_json" id="admin-partner-cover-crop-json" />
                <div class="admin-form-media-row">
                  <div class="admin-form-media-preview admin-form-media-preview--wide" id="admin-partner-cover-preview"></div>
                  <div class="admin-form-media-actions">
                    <label class="admin-btn admin-btn-secondary admin-btn-small" for="admin-partner-cover-file" id="admin-partner-cover-file-label">Выбрать файл</label>
                    <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-open-cover-crop">Настроить зону</button>
                    <span class="admin-form-media-current-actions" id="admin-partner-cover-current-actions" style="display:none;">
                      <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-cover-replace">Заменить</button>
                      <button type="button" class="admin-btn admin-btn-danger admin-btn-small" id="admin-partner-cover-delete">Удалить</button>
                    </span>
                  </div>
                </div>
                <p class="admin-form-recommend">1200×480 px (2,5:1) или 1200×400 px (3:1). Важное — по центру.</p>
              </div>
              <div class="admin-form-group admin-form-media-block">
                <label>Обложка (мобильная)</label>
                <input type="hidden" name="delete_cover_mobile" id="admin-partner-delete-cover-mobile" value="" />
                <input type="file" name="cover_mobile" accept="image/*" id="admin-partner-cover-mobile-file" class="admin-form-file-hidden" />
                <input type="hidden" name="cover_mobile_crop_json" id="admin-partner-cover-mobile-crop-json" />
                <div class="admin-form-media-row">
                  <div class="admin-form-media-preview admin-form-media-preview--wide" id="admin-partner-cover-mobile-preview"></div>
                  <div class="admin-form-media-actions">
                    <label class="admin-btn admin-btn-secondary admin-btn-small" for="admin-partner-cover-mobile-file" id="admin-partner-cover-mobile-file-label">Выбрать файл</label>
                    <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-open-cover-mobile-crop">Настроить зону</button>
                    <span class="admin-form-media-current-actions" id="admin-partner-cover-mobile-current-actions" style="display:none;">
                      <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-cover-mobile-replace">Заменить</button>
                      <button type="button" class="admin-btn admin-btn-danger admin-btn-small" id="admin-partner-cover-mobile-delete">Удалить</button>
                    </span>
                  </div>
                </div>
                <p class="admin-form-recommend">800×470 px (~1,7:1). Если не загрузить — на телефоне будет обложка ПК.</p>
              </div>
            </div>
            <div class="admin-form-section">
              <div class="admin-form-section-title">Контакты</div>
              <div class="admin-form-group"><label>Телефон</label><input type="text" name="phone" required /></div>
              <div class="admin-form-group"><label>Telegram</label><input type="text" name="telegram" /></div>
              <div class="admin-form-group"><label>WhatsApp</label><input type="text" name="whatsapp" /></div>
              <div class="admin-form-group"><label>Viber</label><input type="text" name="viber" /></div>
            </div>
            <div class="admin-form-section">
              <div class="admin-form-section-title">Дополнительно</div>
              <div class="admin-form-group"><label>Сайт</label><input type="text" name="website" /></div>
              <div class="admin-form-group"><label>Ютуб</label><input type="text" name="youtube" /></div>
              <div class="admin-form-group"><label>ВК</label><input type="text" name="vk" /></div>
              <div class="admin-form-group"><label>Телеграм-канал</label><input type="text" name="telegram_channel" /></div>
            </div>
            <div class="admin-form-actions">
              <button type="submit" class="admin-btn admin-btn-primary">Сохранить</button>
              <button type="button" class="admin-btn admin-btn-secondary" id="admin-partner-modal-cancel">Отмена</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const content = topBar + (tableRows ? tableHtml : emptyState) + partnerEditModalHtml + LOGO_CROP_MODAL_HTML + COVER_CROP_MODAL_HTML + COVER_MOBILE_CROP_MODAL_HTML;
  const html = adminLayout('partners', content, { title: '', subtitle: '' });
  res.send(html.replace('</body>', `<script>
    var search = document.getElementById('admin-partners-search');
    if (search) {
      search.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          var q = this.value.trim();
          var status = document.getElementById('admin-partners-status');
          var s = status ? status.value : 'all';
          var qs = [];
          if (q) qs.push('q=' + encodeURIComponent(q));
          if (s && s !== 'all') qs.push('status=' + encodeURIComponent(s));
          location.href = '/admin/partners' + (qs.length ? '?' + qs.join('&') : '');
        }
      });
    }
    var statusSelect = document.getElementById('admin-partners-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', function() {
        var s = this.value;
        var q = search ? search.value.trim() : '';
        var qs = [];
        if (q) qs.push('q=' + encodeURIComponent(q));
        if (s && s !== 'all') qs.push('status=' + encodeURIComponent(s));
        location.href = '/admin/partners' + (qs.length ? '?' + qs.join('&') : '');
      });
    }
    document.querySelectorAll('.admin-nav-item').forEach(function(a) {
      if (location.pathname.indexOf('/admin/partners') === 0) { if (a.getAttribute('href') === '/admin/partners') a.classList.add('active'); }
    });
    (function() {
      var modal = document.getElementById('admin-partner-modal');
      var form = document.getElementById('admin-partner-edit-form');
      var closeBtn = document.getElementById('admin-partner-modal-close');
      var cancelBtn = document.getElementById('admin-partner-modal-cancel');
      function closeModal() { if (modal) modal.classList.remove('open'); }
      function openModal() { if (modal) modal.classList.add('open'); }
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
      document.querySelectorAll('.admin-edit-partner').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.getAttribute('data-id');
          if (!id) return;
          form.action = '/admin/partners/' + id;
          modal.classList.add('open');
          fetch('/admin/partners/' + id, { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
              form.querySelector('[name=name]').value = data.partner.name || '';
              form.querySelector('[name=slug]').value = data.partner.slug || '';
              form.querySelector('[name=phone]').value = data.contacts.phone || '';
              form.querySelector('[name=telegram]').value = data.contacts.telegram || '';
              form.querySelector('[name=whatsapp]').value = data.contacts.whatsapp || '';
              form.querySelector('[name=viber]').value = data.contacts.viber || '';
              form.querySelector('[name=website]').value = data.contacts.website || '';
              form.querySelector('[name=youtube]').value = data.contacts.youtube || '';
              form.querySelector('[name=vk]').value = data.contacts.vk || '';
              form.querySelector('[name=telegram_channel]').value = data.contacts.telegram_channel || '';
              if (form.querySelector('[name=status]')) {
                form.querySelector('[name=status]').value = (data.partner.status || 'active');
              }
              form.querySelector('[name=tagline]').value = data.partner.tagline || '';
              var cropInput = document.getElementById('admin-partner-logo-crop-json');
              if (cropInput) cropInput.value = data.partner.logo_crop_json || '';
              var coverCropInput = document.getElementById('admin-partner-cover-crop-json');
              if (coverCropInput) coverCropInput.value = data.partner.cover_crop_json || '';
              var coverMobileCropInput = document.getElementById('admin-partner-cover-mobile-crop-json');
              if (coverMobileCropInput) coverMobileCropInput.value = data.partner.cover_mobile_crop_json || '';
              window._adminPartnerLogoUrl = data.partner.logo_url ? '/uploads/' + (data.partner.logo_url.indexOf('partners/') === 0 ? data.partner.logo_url : 'partners/' + data.partner.logo_url) : '';
              window._adminPartnerCoverUrl = data.partner.cover_url ? '/uploads/' + (data.partner.cover_url.indexOf('partners/') === 0 ? data.partner.cover_url : 'partners/' + data.partner.cover_url) : '';
              window._adminPartnerCoverMobileUrl = data.partner.cover_mobile_url ? '/uploads/' + (data.partner.cover_mobile_url.indexOf('partners/') === 0 ? data.partner.cover_mobile_url : 'partners/' + data.partner.cover_mobile_url) : '';
              var delLogo = document.getElementById('admin-partner-delete-logo');
              if (delLogo) delLogo.value = '';
              var delCover = document.getElementById('admin-partner-delete-cover');
              if (delCover) delCover.value = '';
              var delCoverMobile = document.getElementById('admin-partner-delete-cover-mobile');
              if (delCoverMobile) delCoverMobile.value = '';
              var logoPreview = document.getElementById('admin-partner-logo-preview');
              var logoLabel = document.getElementById('admin-partner-logo-file-label');
              if (logoPreview) {
                if (data.partner.logo_url) {
                  logoPreview.style.backgroundImage = 'url(/uploads/' + (data.partner.logo_url.indexOf('partners/') === 0 ? data.partner.logo_url : 'partners/' + data.partner.logo_url) + ')';
                  logoPreview.style.backgroundSize = 'cover';
                  logoPreview.style.backgroundPosition = 'center';
                  logoPreview.innerHTML = '';
                  document.getElementById('admin-partner-logo-current-actions').style.display = 'inline-flex';
                  if (logoLabel) logoLabel.style.display = 'none';
                } else { logoPreview.style.backgroundImage = ''; logoPreview.innerHTML = ''; document.getElementById('admin-partner-logo-current-actions').style.display = 'none'; if (logoLabel) logoLabel.style.display = 'inline-flex'; }
              }
              var coverPreview = document.getElementById('admin-partner-cover-preview');
              var coverLabel = document.getElementById('admin-partner-cover-file-label');
              if (coverPreview) {
                if (data.partner.cover_url) {
                  coverPreview.style.backgroundImage = 'url(/uploads/' + (data.partner.cover_url.indexOf('partners/') === 0 ? data.partner.cover_url : 'partners/' + data.partner.cover_url) + ')';
                  coverPreview.style.backgroundSize = 'cover';
                  coverPreview.style.backgroundPosition = 'center';
                  coverPreview.innerHTML = '';
                  document.getElementById('admin-partner-cover-current-actions').style.display = 'inline-flex';
                  if (coverLabel) coverLabel.style.display = 'none';
                } else { coverPreview.style.backgroundImage = ''; coverPreview.innerHTML = ''; document.getElementById('admin-partner-cover-current-actions').style.display = 'none'; if (coverLabel) coverLabel.style.display = 'inline-flex'; }
              }
              var coverMobilePreview = document.getElementById('admin-partner-cover-mobile-preview');
              var coverMobileLabel = document.getElementById('admin-partner-cover-mobile-file-label');
              if (coverMobilePreview) {
                if (data.partner.cover_mobile_url) {
                  coverMobilePreview.style.backgroundImage = 'url(/uploads/' + (data.partner.cover_mobile_url.indexOf('partners/') === 0 ? data.partner.cover_mobile_url : 'partners/' + data.partner.cover_mobile_url) + ')';
                  coverMobilePreview.style.backgroundSize = 'cover';
                  coverMobilePreview.style.backgroundPosition = 'center';
                  coverMobilePreview.innerHTML = '';
                  document.getElementById('admin-partner-cover-mobile-current-actions').style.display = 'inline-flex';
                  if (coverMobileLabel) coverMobileLabel.style.display = 'none';
                } else { coverMobilePreview.style.backgroundImage = ''; coverMobilePreview.innerHTML = ''; document.getElementById('admin-partner-cover-mobile-current-actions').style.display = 'none'; if (coverMobileLabel) coverMobileLabel.style.display = 'inline-flex'; }
              }
            })
            .catch(function() { closeModal(); });
        });
      });
      function setupMediaButtons() {
        var logoDel = document.getElementById('admin-partner-logo-delete');
        if (logoDel) logoDel.addEventListener('click', function() {
          var inp = document.getElementById('admin-partner-delete-logo');
          if (inp) inp.value = '1';
          var prev = document.getElementById('admin-partner-logo-preview');
          if (prev) { prev.style.backgroundImage = ''; prev.innerHTML = ''; }
          var acts = document.getElementById('admin-partner-logo-current-actions');
          if (acts) acts.style.display = 'none';
          var lbl = document.getElementById('admin-partner-logo-file-label');
          if (lbl) lbl.style.display = 'inline-flex';
        });
        var logoReplace = document.getElementById('admin-partner-logo-replace');
        if (logoReplace) logoReplace.addEventListener('click', function() { var f = document.getElementById('admin-partner-logo-file'); if (f) f.click(); });
        var coverDel = document.getElementById('admin-partner-cover-delete');
        if (coverDel) coverDel.addEventListener('click', function() {
          var inp = document.getElementById('admin-partner-delete-cover');
          if (inp) inp.value = '1';
          var prev = document.getElementById('admin-partner-cover-preview');
          if (prev) { prev.style.backgroundImage = ''; prev.innerHTML = ''; }
          var acts = document.getElementById('admin-partner-cover-current-actions');
          if (acts) acts.style.display = 'none';
          var lbl = document.getElementById('admin-partner-cover-file-label');
          if (lbl) lbl.style.display = 'inline-flex';
        });
        var coverReplace = document.getElementById('admin-partner-cover-replace');
        if (coverReplace) coverReplace.addEventListener('click', function() { var f = document.getElementById('admin-partner-cover-file'); if (f) f.click(); });
        var coverMobileDel = document.getElementById('admin-partner-cover-mobile-delete');
        if (coverMobileDel) coverMobileDel.addEventListener('click', function() {
          var inp = document.getElementById('admin-partner-delete-cover-mobile');
          if (inp) inp.value = '1';
          var prev = document.getElementById('admin-partner-cover-mobile-preview');
          if (prev) { prev.style.backgroundImage = ''; prev.innerHTML = ''; }
          var acts = document.getElementById('admin-partner-cover-mobile-current-actions');
          if (acts) acts.style.display = 'none';
          var lbl = document.getElementById('admin-partner-cover-mobile-file-label');
          if (lbl) lbl.style.display = 'inline-flex';
        });
        var coverMobileReplace = document.getElementById('admin-partner-cover-mobile-replace');
        if (coverMobileReplace) coverMobileReplace.addEventListener('click', function() { var f = document.getElementById('admin-partner-cover-mobile-file'); if (f) f.click(); });
      }
      setupMediaButtons();
      var logoFileInput = document.getElementById('admin-partner-logo-file');
      if (logoFileInput) logoFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          var prev = document.getElementById('admin-partner-logo-preview');
          if (prev) { prev.style.backgroundImage = 'url(' + URL.createObjectURL(this.files[0]) + ')'; prev.style.backgroundSize = 'cover'; prev.style.backgroundPosition = 'center'; prev.innerHTML = ''; }
          var delInp = document.getElementById('admin-partner-delete-logo');
          if (delInp) delInp.value = '';
          var acts = document.getElementById('admin-partner-logo-current-actions');
          if (acts) acts.style.display = 'inline-flex';
          var lbl = document.getElementById('admin-partner-logo-file-label');
          if (lbl) lbl.style.display = 'none';
        }
      });
      var coverFileInput = document.getElementById('admin-partner-cover-file');
      if (coverFileInput) coverFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          var prev = document.getElementById('admin-partner-cover-preview');
          if (prev) { prev.style.backgroundImage = 'url(' + URL.createObjectURL(this.files[0]) + ')'; prev.style.backgroundSize = 'cover'; prev.style.backgroundPosition = 'center'; prev.innerHTML = ''; }
          var delInp = document.getElementById('admin-partner-delete-cover');
          if (delInp) delInp.value = '';
          var acts = document.getElementById('admin-partner-cover-current-actions');
          if (acts) acts.style.display = 'inline-flex';
          var lbl = document.getElementById('admin-partner-cover-file-label');
          if (lbl) lbl.style.display = 'none';
        }
      });
      var coverMobileFileInput = document.getElementById('admin-partner-cover-mobile-file');
      if (coverMobileFileInput) coverMobileFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          var prev = document.getElementById('admin-partner-cover-mobile-preview');
          if (prev) { prev.style.backgroundImage = 'url(' + URL.createObjectURL(this.files[0]) + ')'; prev.style.backgroundSize = 'cover'; prev.style.backgroundPosition = 'center'; prev.innerHTML = ''; }
          var delInp = document.getElementById('admin-partner-delete-cover-mobile');
          if (delInp) delInp.value = '';
          var acts = document.getElementById('admin-partner-cover-mobile-current-actions');
          if (acts) acts.style.display = 'inline-flex';
          var lbl = document.getElementById('admin-partner-cover-mobile-file-label');
          if (lbl) lbl.style.display = 'none';
        }
      });
    })();
    (function() {
      var cropBackdrop = document.getElementById('admin-logo-crop-backdrop');
      var cropViewport = document.getElementById('admin-logo-crop-viewport');
      var cropImage = document.getElementById('admin-logo-crop-image');
      var cropZoomSlider = document.getElementById('admin-logo-crop-zoom-slider');
      var cropZoomValue = document.getElementById('admin-logo-crop-zoom-value');
      var cropApply = document.getElementById('admin-logo-crop-apply');
      var cropCancel = document.getElementById('admin-logo-crop-cancel');
      var currentCropInputId = 'admin-partner-logo-crop-json';
      var getCropInput = function() { return document.getElementById(currentCropInputId); };
      var VIEWPORT_SIZE = 280;
      var state = { x: 50, y: 50, zoom: 1 };
      var logoUrl = '';
      var dragging = false;
      var startX, startY, startStateX, startStateY;

      function applyCropStyle() {
        if (!cropImage || !logoUrl) return;
        var size = 100 * state.zoom;
        var px = (100 - state.x).toFixed(1);
        var py = (100 - state.y).toFixed(1);
        cropImage.style.backgroundImage = 'url(' + logoUrl + ')';
        cropImage.style.backgroundSize = size + '%';
        cropImage.style.backgroundPosition = px + '% ' + py + '%';
        if (cropZoomValue) cropZoomValue.textContent = state.zoom.toFixed(1);
        if (cropZoomSlider) cropZoomSlider.value = state.zoom;
      }

      function openCropModal(url) {
        logoUrl = url;
        var cropInput = getCropInput();
        if (cropInput && cropInput.value) {
          try {
            var parsed = JSON.parse(cropInput.value);
            if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.zoom === 'number') {
              state.x = Math.max(0, Math.min(100, parsed.x));
              state.y = Math.max(0, Math.min(100, parsed.y));
              state.zoom = Math.max(0.5, Math.min(3, parsed.zoom));
            }
          } catch (e) {}
        } else {
          state.x = 50;
          state.y = 50;
          state.zoom = 1;
        }
        applyCropStyle();
        if (cropBackdrop) cropBackdrop.classList.add('open');
      }

      function closeCropModal() {
        if (cropBackdrop) cropBackdrop.classList.remove('open');
      }

      document.querySelectorAll('#admin-partner-open-crop, #admin-partner-new-open-crop').forEach(function(btn) {
        btn.addEventListener('click', function() {
          currentCropInputId = (this.id === 'admin-partner-new-open-crop') ? 'admin-partner-new-logo-crop-json' : 'admin-partner-logo-crop-json';
          var url = (this.id === 'admin-partner-new-open-crop') ? '' : (window._adminPartnerLogoUrl || '');
          var fileInput = document.getElementById((this.id === 'admin-partner-new-open-crop') ? 'admin-partner-new-logo-file' : 'admin-partner-logo-file');
          if (fileInput && fileInput.files && fileInput.files[0]) url = URL.createObjectURL(fileInput.files[0]);
          if (!url) {
            alert('Сначала загрузите логотип (текущий или новый файл).');
            return;
          }
          openCropModal(url);
        });
      });
      if (cropCancel) cropCancel.addEventListener('click', closeCropModal);
      if (cropBackdrop) cropBackdrop.addEventListener('click', function(e) { if (e.target === cropBackdrop) closeCropModal(); });
      if (cropApply) {
        cropApply.addEventListener('click', function() {
          var inp = getCropInput();
          if (inp) inp.value = JSON.stringify({ x: Math.round(state.x * 10) / 10, y: Math.round(state.y * 10) / 10, zoom: Math.round(state.zoom * 10) / 10 });
          closeCropModal();
        });
      }
      if (cropZoomSlider) {
        cropZoomSlider.addEventListener('input', function() {
          state.zoom = Math.max(0.5, Math.min(3, parseFloat(this.value) || 1));
          applyCropStyle();
        });
      }
      if (cropViewport) {
        cropViewport.addEventListener('mousedown', function(e) {
          e.preventDefault();
          dragging = true;
          startX = e.clientX;
          startY = e.clientY;
          startStateX = state.x;
          startStateY = state.y;
        });
        cropViewport.addEventListener('touchstart', function(e) {
          if (e.touches.length !== 1) return;
          e.preventDefault();
          dragging = true;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          startStateX = state.x;
          startStateY = state.y;
        });
      }
      document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var k = 100 / (VIEWPORT_SIZE * state.zoom);
        state.x = Math.max(0, Math.min(100, startStateX + dx * k));
        state.y = Math.max(0, Math.min(100, startStateY + dy * k));
        startX = e.clientX;
        startY = e.clientY;
        startStateX = state.x;
        startStateY = state.y;
        applyCropStyle();
      });
      document.addEventListener('mouseup', function() { dragging = false; });
      document.addEventListener('touchmove', function(e) {
        if (!dragging || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        var k = 100 / (VIEWPORT_SIZE * state.zoom);
        state.x = Math.max(0, Math.min(100, state.x + dx * k));
        state.y = Math.max(0, Math.min(100, state.y + dy * k));
        applyCropStyle();
      }, { passive: false });
      document.addEventListener('touchend', function(e) { if (e.touches.length === 0) dragging = false; });
      if (cropViewport) {
        cropViewport.addEventListener('wheel', function(e) {
          e.preventDefault();
          var delta = e.deltaY > 0 ? -0.1 : 0.1;
          state.zoom = Math.max(0.5, Math.min(3, state.zoom + delta));
          applyCropStyle();
        }, { passive: false });
      }
      window._adminOpenLogoCrop = openCropModal;
    })();
    (function() {
      var cropBackdrop = document.getElementById('admin-cover-crop-backdrop');
      var cropViewport = document.getElementById('admin-cover-crop-viewport');
      var cropImage = document.getElementById('admin-cover-crop-image');
      var cropZoomSlider = document.getElementById('admin-cover-crop-zoom-slider');
      var cropZoomValue = document.getElementById('admin-cover-crop-zoom-value');
      var cropApply = document.getElementById('admin-cover-crop-apply');
      var cropCancel = document.getElementById('admin-cover-crop-cancel');
      var coverCropInputId = 'admin-partner-cover-crop-json';
      var getCoverCropInput = function() { return document.getElementById(coverCropInputId); };
      var VIEWPORT_SIZE = 300;
      var state = { x: 50, y: 50, zoom: 1 };
      var coverUrl = '';
      var dragging = false;
      var startX, startY, startStateX, startStateY;
      function applyCoverCropStyle() {
        if (!cropImage || !coverUrl) return;
        var size = 100 * state.zoom;
        var px = (100 - state.x).toFixed(1);
        var py = (100 - state.y).toFixed(1);
        cropImage.style.backgroundImage = 'url(' + coverUrl + ')';
        cropImage.style.backgroundSize = size + '%';
        cropImage.style.backgroundPosition = px + '% ' + py + '%';
        if (cropZoomValue) cropZoomValue.textContent = state.zoom.toFixed(1);
        if (cropZoomSlider) cropZoomSlider.value = state.zoom;
      }
      function openCoverCropModal(url) {
        coverUrl = url;
        var inp = getCoverCropInput();
        if (inp && inp.value) {
          try {
            var parsed = JSON.parse(inp.value);
            if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.zoom === 'number') {
              state.x = Math.max(0, Math.min(100, parsed.x));
              state.y = Math.max(0, Math.min(100, parsed.y));
              state.zoom = Math.max(0.5, Math.min(3, parsed.zoom));
            }
          } catch (e) {}
        } else { state.x = 50; state.y = 50; state.zoom = 1; }
        applyCoverCropStyle();
        if (cropBackdrop) cropBackdrop.classList.add('open');
      }
      function closeCoverCropModal() { if (cropBackdrop) cropBackdrop.classList.remove('open'); }
      var openCoverBtn = document.getElementById('admin-partner-open-cover-crop');
      if (openCoverBtn) openCoverBtn.addEventListener('click', function() {
        coverCropInputId = 'admin-partner-cover-crop-json';
        var url = window._adminPartnerCoverUrl || '';
        var fileInput = document.getElementById('admin-partner-cover-file');
        if (fileInput && fileInput.files && fileInput.files[0]) url = URL.createObjectURL(fileInput.files[0]);
        if (!url) { alert('Сначала загрузите обложку для ПК (текущую или новый файл).'); return; }
        openCoverCropModal(url);
      });
      var openCoverMobileBtn = document.getElementById('admin-partner-open-cover-mobile-crop');
      if (openCoverMobileBtn) openCoverMobileBtn.addEventListener('click', function() {
        var url = window._adminPartnerCoverMobileUrl || '';
        var fileInput = document.getElementById('admin-partner-cover-mobile-file');
        if (fileInput && fileInput.files && fileInput.files[0]) url = URL.createObjectURL(fileInput.files[0]);
        if (!url) { alert('Сначала загрузите обложку для мобильной (текущую или новый файл).'); return; }
        if (window._adminOpenCoverMobileCrop) window._adminOpenCoverMobileCrop(url);
      });
      if (cropCancel) cropCancel.addEventListener('click', closeCoverCropModal);
      if (cropBackdrop) cropBackdrop.addEventListener('click', function(e) { if (e.target === cropBackdrop) closeCoverCropModal(); });
      if (cropApply) cropApply.addEventListener('click', function() {
        var inp = getCoverCropInput();
        if (inp) inp.value = JSON.stringify({ x: Math.round(state.x * 10) / 10, y: Math.round(state.y * 10) / 10, zoom: Math.round(state.zoom * 10) / 10 });
        closeCoverCropModal();
      });
      if (cropZoomSlider) cropZoomSlider.addEventListener('input', function() {
        state.zoom = Math.max(0.5, Math.min(3, parseFloat(this.value) || 1));
        applyCoverCropStyle();
      });
      if (cropViewport) {
        cropViewport.addEventListener('mousedown', function(e) { e.preventDefault(); dragging = true; startX = e.clientX; startY = e.clientY; startStateX = state.x; startStateY = state.y; });
        cropViewport.addEventListener('touchstart', function(e) { if (e.touches.length !== 1) return; e.preventDefault(); dragging = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; startStateX = state.x; startStateY = state.y; });
        cropViewport.addEventListener('wheel', function(e) { e.preventDefault(); var delta = e.deltaY > 0 ? -0.1 : 0.1; state.zoom = Math.max(0.5, Math.min(3, state.zoom + delta)); applyCoverCropStyle(); }, { passive: false });
      }
      document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        var dx = e.clientX - startX; var dy = e.clientY - startY;
        var k = 100 / (VIEWPORT_SIZE * state.zoom);
        state.x = Math.max(0, Math.min(100, startStateX + dx * k));
        state.y = Math.max(0, Math.min(100, startStateY + dy * k));
        startX = e.clientX; startY = e.clientY; startStateX = state.x; startStateY = state.y;
        applyCoverCropStyle();
      });
      document.addEventListener('mouseup', function() { dragging = false; });
      document.addEventListener('touchmove', function(e) {
        if (!dragging || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - startX; var dy = e.touches[0].clientY - startY;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        var k = 100 / (VIEWPORT_SIZE * state.zoom);
        state.x = Math.max(0, Math.min(100, state.x + dx * k));
        state.y = Math.max(0, Math.min(100, state.y + dy * k));
        applyCoverCropStyle();
      }, { passive: false });
      document.addEventListener('touchend', function(e) { if (e.touches.length === 0) dragging = false; });
      window._adminOpenCoverCrop = openCoverCropModal;
    })();
    (function() {
      var cropBackdrop = document.getElementById('admin-cover-mobile-crop-backdrop');
      var cropViewport = document.getElementById('admin-cover-mobile-crop-viewport');
      var cropImage = document.getElementById('admin-cover-mobile-crop-image');
      var cropZoomSlider = document.getElementById('admin-cover-mobile-crop-zoom-slider');
      var cropZoomValue = document.getElementById('admin-cover-mobile-crop-zoom-value');
      var cropApply = document.getElementById('admin-cover-mobile-crop-apply');
      var cropCancel = document.getElementById('admin-cover-mobile-crop-cancel');
      var getCoverMobileInput = function() {
        return document.getElementById('admin-partner-cover-mobile-crop-json') || document.getElementById('admin-partner-new-cover-mobile-crop-json');
      };
      var VIEWPORT_SIZE = 280;
      var state = { x: 50, y: 50, zoom: 1 };
      var coverUrl = '';
      var dragging = false;
      var startX, startY, startStateX, startStateY;
      function applyStyle() {
        if (!cropImage || !coverUrl) return;
        var size = 100 * state.zoom;
        var px = (100 - state.x).toFixed(1);
        var py = (100 - state.y).toFixed(1);
        cropImage.style.backgroundImage = 'url(' + coverUrl + ')';
        cropImage.style.backgroundSize = size + '%';
        cropImage.style.backgroundPosition = px + '% ' + py + '%';
        if (cropZoomValue) cropZoomValue.textContent = state.zoom.toFixed(1);
        if (cropZoomSlider) cropZoomSlider.value = state.zoom;
      }
      function openModal(url) {
        coverUrl = url;
        var inp = getCoverMobileInput();
        if (inp && inp.value) {
          try {
            var parsed = JSON.parse(inp.value);
            if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.zoom === 'number') {
              state.x = Math.max(0, Math.min(100, parsed.x));
              state.y = Math.max(0, Math.min(100, parsed.y));
              state.zoom = Math.max(0.5, Math.min(3, parsed.zoom));
            }
          } catch (e) {}
        } else { state.x = 50; state.y = 50; state.zoom = 1; }
        applyStyle();
        if (cropBackdrop) cropBackdrop.classList.add('open');
      }
      function closeModal() { if (cropBackdrop) cropBackdrop.classList.remove('open'); }
      if (cropCancel) cropCancel.addEventListener('click', closeModal);
      if (cropBackdrop) cropBackdrop.addEventListener('click', function(e) { if (e.target === cropBackdrop) closeModal(); });
      if (cropApply) cropApply.addEventListener('click', function() {
        var inp = getCoverMobileInput();
        if (inp) inp.value = JSON.stringify({ x: Math.round(state.x * 10) / 10, y: Math.round(state.y * 10) / 10, zoom: Math.round(state.zoom * 10) / 10 });
        closeModal();
      });
      if (cropZoomSlider) cropZoomSlider.addEventListener('input', function() {
        state.zoom = Math.max(0.5, Math.min(3, parseFloat(this.value) || 1));
        applyStyle();
      });
      if (cropViewport) {
        cropViewport.addEventListener('mousedown', function(e) { e.preventDefault(); dragging = true; startX = e.clientX; startY = e.clientY; startStateX = state.x; startStateY = state.y; });
        cropViewport.addEventListener('touchstart', function(e) { if (e.touches.length !== 1) return; e.preventDefault(); dragging = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; startStateX = state.x; startStateY = state.y; });
        cropViewport.addEventListener('wheel', function(e) { e.preventDefault(); var delta = e.deltaY > 0 ? -0.1 : 0.1; state.zoom = Math.max(0.5, Math.min(3, state.zoom + delta)); applyStyle(); }, { passive: false });
      }
      document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        var dx = e.clientX - startX; var dy = e.clientY - startY;
        var k = 100 / (VIEWPORT_SIZE * state.zoom);
        state.x = Math.max(0, Math.min(100, startStateX + dx * k));
        state.y = Math.max(0, Math.min(100, startStateY + dy * k));
        startX = e.clientX; startY = e.clientY; startStateX = state.x; startStateY = state.y;
        applyStyle();
      });
      document.addEventListener('mouseup', function() { dragging = false; });
      document.addEventListener('touchmove', function(e) {
        if (!dragging || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - startX; var dy = e.touches[0].clientY - startY;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        var k = 100 / (VIEWPORT_SIZE * state.zoom);
        state.x = Math.max(0, Math.min(100, state.x + dx * k));
        state.y = Math.max(0, Math.min(100, state.y + dy * k));
        applyStyle();
      }, { passive: false });
      document.addEventListener('touchend', function(e) { if (e.touches.length === 0) dragging = false; });
      window._adminOpenCoverMobileCrop = openModal;
    })();
    (function() {
      var logoFileInput = document.getElementById('admin-partner-logo-file');
      if (logoFileInput) logoFileInput.addEventListener('change', function() {
        if (this.files && this.files[0] && window._adminOpenLogoCrop) window._adminOpenLogoCrop(URL.createObjectURL(this.files[0]));
      });
      var coverFileInput = document.getElementById('admin-partner-cover-file');
      if (coverFileInput) coverFileInput.addEventListener('change', function() {
        if (this.files && this.files[0] && window._adminOpenCoverCrop) window._adminOpenCoverCrop(URL.createObjectURL(this.files[0]), 'admin-partner-cover-crop-json');
      });
      var coverMobileFileInput = document.getElementById('admin-partner-cover-mobile-file');
      if (coverMobileFileInput) coverMobileFileInput.addEventListener('change', function() {
        if (this.files && this.files[0] && window._adminOpenCoverMobileCrop) window._adminOpenCoverMobileCrop(URL.createObjectURL(this.files[0]));
      });
    })();
  </script></body>`));
});

// ——— GET /admin/partners/new ———
router.get('/admin/partners/new', requireManagerAuth, (req, res) => {
  const error = req.query.error || null;
  const form = req.query;
  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Добавить партнёра</h1>
        <p class="admin-subtitle">Основная информация, контакты и доп. поля</p>
      </div>
      <a href="/admin/partners" class="admin-btn admin-btn-secondary">← К списку</a>
    </div>
  `;
  const formHtml = `
    ${error ? `<div class="admin-flash error">${esc(error)}</div>` : ''}
    <div class="admin-card" style="padding:24px; max-width:520px;">
      <form method="post" action="/admin/partners" enctype="multipart/form-data">
        <div class="admin-form-section">
          <div class="admin-form-section-title">Основная информация</div>
          <div class="admin-form-group"><label>Имя</label><input type="text" name="name" value="${esc(form.name)}" required /></div>
          <div class="admin-form-group"><label>Slug (ссылка /p/slug)</label><input type="text" name="slug" value="${esc(form.slug)}" required /></div>
          <div class="admin-form-group"><label>Слоган (на профиле и над машиной)</label><input type="text" name="tagline" value="${esc(form.tagline)}" placeholder="Подбор и пригон авто из Кореи, Китая, Европы" /></div>
          <div class="admin-form-group">
            <label>Статус</label>
            <select name="status">
              <option value="active"${form.status === 'disabled' ? '' : ' selected'}>Активен</option>
              <option value="disabled"${form.status === 'disabled' ? ' selected' : ''}>Отключён</option>
            </select>
          </div>
          <div class="admin-form-group admin-form-media-block">
            <label>Логотип</label>
            <input type="file" name="logo" accept="image/*" id="admin-partner-new-logo-file" class="admin-form-file-hidden" />
            <input type="hidden" name="logo_crop_json" id="admin-partner-new-logo-crop-json" />
            <div class="admin-form-media-row">
              <div class="admin-form-media-preview" id="admin-partner-new-logo-preview"></div>
              <div class="admin-form-media-actions">
                <label class="admin-btn admin-btn-secondary admin-btn-small" for="admin-partner-new-logo-file">Выбрать файл</label>
                <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-new-open-crop">Настроить зону</button>
              </div>
            </div>
            <p class="admin-form-hint">Круглая зона отображается на сайте. Выберите файл и настройте область в круге.</p>
          </div>
          <div class="admin-form-group admin-form-media-block">
            <label>Обложка (ПК)</label>
            <input type="file" name="cover" accept="image/*" id="admin-partner-new-cover-file" class="admin-form-file-hidden" />
            <input type="hidden" name="cover_crop_json" id="admin-partner-new-cover-crop-json" />
            <div class="admin-form-media-row">
              <div class="admin-form-media-preview admin-form-media-preview--wide" id="admin-partner-new-cover-preview"></div>
              <div class="admin-form-media-actions">
                <label class="admin-btn admin-btn-secondary admin-btn-small" for="admin-partner-new-cover-file">Выбрать файл</label>
                <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-new-open-cover-crop">Настроить зону</button>
              </div>
            </div>
            <p class="admin-form-recommend">1200×480 px (2,5:1) или 1200×400 px (3:1). Важное — по центру.</p>
          </div>
          <div class="admin-form-group admin-form-media-block">
            <label>Обложка (мобильная)</label>
            <input type="file" name="cover_mobile" accept="image/*" id="admin-partner-new-cover-mobile-file" class="admin-form-file-hidden" />
            <input type="hidden" name="cover_mobile_crop_json" id="admin-partner-new-cover-mobile-crop-json" />
            <div class="admin-form-media-row">
              <div class="admin-form-media-preview admin-form-media-preview--wide" id="admin-partner-new-cover-mobile-preview"></div>
              <div class="admin-form-media-actions">
                <label class="admin-btn admin-btn-secondary admin-btn-small" for="admin-partner-new-cover-mobile-file">Выбрать файл</label>
                <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" id="admin-partner-new-open-cover-mobile-crop">Настроить зону</button>
              </div>
            </div>
            <p class="admin-form-recommend">800×470 px (~1,7:1). Если не загрузить — на телефоне будет обложка ПК.</p>
          </div>
        </div>
        <div class="admin-form-section">
          <div class="admin-form-section-title">Контакты</div>
          <div class="admin-form-group"><label>Телефон</label><input type="text" name="phone" value="${esc(form.phone)}" placeholder="+7…" required /></div>
          <div class="admin-form-group"><label>Telegram</label><input type="text" name="telegram" value="${esc(form.telegram)}" placeholder="@nick или ссылка" /></div>
          <div class="admin-form-group"><label>WhatsApp</label><input type="text" name="whatsapp" value="${esc(form.whatsapp)}" /></div>
          <div class="admin-form-group"><label>Viber</label><input type="text" name="viber" value="${esc(form.viber)}" /></div>
        </div>
        <div class="admin-form-section">
          <div class="admin-form-section-title">Дополнительно</div>
          <div class="admin-form-group"><label>Сайт</label><input type="text" name="website" value="${esc(form.website)}" /></div>
          <div class="admin-form-group"><label>Ютуб</label><input type="text" name="youtube" value="${esc(form.youtube)}" /></div>
          <div class="admin-form-group"><label>ВК</label><input type="text" name="vk" value="${esc(form.vk)}" /></div>
          <div class="admin-form-group"><label>Телеграм-канал</label><input type="text" name="telegram_channel" value="${esc(form.telegram_channel)}" /></div>
          <div class="admin-form-group"><label>Логин входа</label><input type="text" name="login" value="${esc(form.login)}" placeholder="по умолчанию = slug" /></div>
          <div class="admin-form-group"><label>Пароль</label><input type="text" name="password" value="${esc(form.password)}" placeholder="по умолчанию slug123" /></div>
        </div>
        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary">Сохранить партнёра</button>
          <a href="/admin/partners" class="admin-btn admin-btn-secondary">Отмена</a>
        </div>
      </form>
    </div>
  `;
  const html = adminLayout('partners', topBar + formHtml + LOGO_CROP_MODAL_HTML + COVER_CROP_MODAL_HTML + COVER_MOBILE_CROP_MODAL_HTML, {});
  res.send(html.replace('</body>', `<script>
    document.querySelectorAll('.admin-nav-item').forEach(function(a) { if (a.getAttribute('href') === '/admin/partners') a.classList.add('active'); });
    (function(){
      var cropBackdrop=document.getElementById('admin-logo-crop-backdrop');var cropViewport=document.getElementById('admin-logo-crop-viewport');var cropImage=document.getElementById('admin-logo-crop-image');var cropZoomSlider=document.getElementById('admin-logo-crop-zoom-slider');var cropZoomValue=document.getElementById('admin-logo-crop-zoom-value');var cropApply=document.getElementById('admin-logo-crop-apply');var cropCancel=document.getElementById('admin-logo-crop-cancel');
      var currentCropInputId='admin-partner-new-logo-crop-json';var getCropInput=function(){return document.getElementById(currentCropInputId);};var VIEWPORT_SIZE=280;var state={x:50,y:50,zoom:1};var logoUrl='';var dragging=false;var startX,startY,startStateX,startStateY;
      function applyCropStyle(){if(!cropImage||!logoUrl)return;var size=100*state.zoom;var px=(100-state.x).toFixed(1);var py=(100-state.y).toFixed(1);cropImage.style.backgroundImage='url('+logoUrl+')';cropImage.style.backgroundSize=size+'%';cropImage.style.backgroundPosition=px+'% '+py+'%';if(cropZoomValue)cropZoomValue.textContent=state.zoom.toFixed(1);if(cropZoomSlider)cropZoomSlider.value=state.zoom;}
      function openCropModal(url){logoUrl=url;var cropInput=getCropInput();if(cropInput&&cropInput.value){try{var parsed=JSON.parse(cropInput.value);if(parsed&&typeof parsed.x==='number'&&typeof parsed.y==='number'&&typeof parsed.zoom==='number'){state.x=Math.max(0,Math.min(100,parsed.x));state.y=Math.max(0,Math.min(100,parsed.y));state.zoom=Math.max(0.5,Math.min(3,parsed.zoom));}}catch(e){}}else{state.x=50;state.y=50;state.zoom=1;}applyCropStyle();if(cropBackdrop)cropBackdrop.classList.add('open');}
      function closeCropModal(){if(cropBackdrop)cropBackdrop.classList.remove('open');}
      var openBtn=document.getElementById('admin-partner-new-open-crop');if(openBtn)openBtn.addEventListener('click',function(){var fileInput=document.getElementById('admin-partner-new-logo-file');var url='';if(fileInput&&fileInput.files&&fileInput.files[0])url=URL.createObjectURL(fileInput.files[0]);if(!url){alert('Сначала выберите файл логотипа.');return;}openCropModal(url);});
      if(cropCancel)cropCancel.addEventListener('click',closeCropModal);if(cropBackdrop)cropBackdrop.addEventListener('click',function(e){if(e.target===cropBackdrop)closeCropModal();});
      if(cropApply)cropApply.addEventListener('click',function(){var inp=getCropInput();if(inp)inp.value=JSON.stringify({x:Math.round(state.x*10)/10,y:Math.round(state.y*10)/10,zoom:Math.round(state.zoom*10)/10});closeCropModal();});
      if(cropZoomSlider)cropZoomSlider.addEventListener('input',function(){state.zoom=Math.max(0.5,Math.min(3,parseFloat(this.value)||1));applyCropStyle();});
      if(cropViewport){cropViewport.addEventListener('mousedown',function(e){e.preventDefault();dragging=true;startX=e.clientX;startY=e.clientY;startStateX=state.x;startStateY=state.y;});cropViewport.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;e.preventDefault();dragging=true;startX=e.touches[0].clientX;startY=e.touches[0].clientY;startStateX=state.x;startStateY=state.y;});}
      document.addEventListener('mousemove',function(e){if(!dragging)return;var dx=e.clientX-startX;var dy=e.clientY-startY;var k=100/(VIEWPORT_SIZE*state.zoom);state.x=Math.max(0,Math.min(100,startStateX+dx*k));state.y=Math.max(0,Math.min(100,startStateY+dy*k));startX=e.clientX;startY=e.clientY;startStateX=state.x;startStateY=state.y;applyCropStyle();});
      document.addEventListener('mouseup',function(){dragging=false;});document.addEventListener('touchmove',function(e){if(!dragging||e.touches.length!==1)return;var dx=e.touches[0].clientX-startX;var dy=e.touches[0].clientY-startY;startX=e.touches[0].clientX;startY=e.touches[0].clientY;var k=100/(VIEWPORT_SIZE*state.zoom);state.x=Math.max(0,Math.min(100,state.x+dx*k));state.y=Math.max(0,Math.min(100,state.y+dy*k));applyCropStyle();},{passive:false});document.addEventListener('touchend',function(e){if(e.touches.length===0)dragging=false;});
      if(cropViewport)cropViewport.addEventListener('wheel',function(e){e.preventDefault();var delta=e.deltaY>0?-0.1:0.1;state.zoom=Math.max(0.5,Math.min(3,state.zoom+delta));applyCropStyle();},{passive:false});
      var logoFileInput=document.getElementById('admin-partner-new-logo-file');if(logoFileInput)logoFileInput.addEventListener('change',function(){if(this.files&&this.files[0]){var url=URL.createObjectURL(this.files[0]);var prev=document.getElementById('admin-partner-new-logo-preview');if(prev){prev.style.backgroundImage='url('+url+')';prev.style.backgroundSize='cover';prev.style.backgroundPosition='center';prev.innerHTML='';}openCropModal(url);}});
    })();
    (function(){
      var cropBackdrop=document.getElementById('admin-cover-crop-backdrop');var cropViewport=document.getElementById('admin-cover-crop-viewport');var cropImage=document.getElementById('admin-cover-crop-image');var cropZoomSlider=document.getElementById('admin-cover-crop-zoom-slider');var cropZoomValue=document.getElementById('admin-cover-crop-zoom-value');var cropApply=document.getElementById('admin-cover-crop-apply');var cropCancel=document.getElementById('admin-cover-crop-cancel');
      var coverCropInputId='admin-partner-new-cover-crop-json';var getCoverCropInput=function(){return document.getElementById(coverCropInputId);};var VIEWPORT_SIZE=300;var state={x:50,y:50,zoom:1};var coverUrl='';var dragging=false;var startX,startY,startStateX,startStateY;
      function applyCoverCropStyle(){if(!cropImage||!coverUrl)return;var size=100*state.zoom;var px=(100-state.x).toFixed(1);var py=(100-state.y).toFixed(1);cropImage.style.backgroundImage='url('+coverUrl+')';cropImage.style.backgroundSize=size+'%';cropImage.style.backgroundPosition=px+'% '+py+'%';if(cropZoomValue)cropZoomValue.textContent=state.zoom.toFixed(1);if(cropZoomSlider)cropZoomSlider.value=state.zoom;}
      function openCoverCropModal(url,optionalInputId){if(optionalInputId)coverCropInputId=optionalInputId;coverUrl=url;var inp=getCoverCropInput();if(inp&&inp.value){try{var parsed=JSON.parse(inp.value);if(parsed&&typeof parsed.x==='number'&&typeof parsed.y==='number'&&typeof parsed.zoom==='number'){state.x=Math.max(0,Math.min(100,parsed.x));state.y=Math.max(0,Math.min(100,parsed.y));state.zoom=Math.max(0.5,Math.min(3,parsed.zoom));}}catch(e){}}else{state.x=50;state.y=50;state.zoom=1;}applyCoverCropStyle();if(cropBackdrop)cropBackdrop.classList.add('open');}
      function closeCoverCropModal(){if(cropBackdrop)cropBackdrop.classList.remove('open');}
      var openCoverBtn=document.getElementById('admin-partner-new-open-cover-crop');if(openCoverBtn)openCoverBtn.addEventListener('click',function(){coverCropInputId='admin-partner-new-cover-crop-json';var url='';var fileInput=document.getElementById('admin-partner-new-cover-file');if(fileInput&&fileInput.files&&fileInput.files[0])url=URL.createObjectURL(fileInput.files[0]);if(!url){alert('Сначала выберите файл обложки (ПК).');return;}openCoverCropModal(url);});
      var openCoverMobileBtn=document.getElementById('admin-partner-new-open-cover-mobile-crop');if(openCoverMobileBtn)openCoverMobileBtn.addEventListener('click',function(){var url='';var fileInput=document.getElementById('admin-partner-new-cover-mobile-file');if(fileInput&&fileInput.files&&fileInput.files[0])url=URL.createObjectURL(fileInput.files[0]);if(!url){alert('Сначала выберите файл обложки (мобильная).');return;}if(window._adminOpenCoverMobileCrop)window._adminOpenCoverMobileCrop(url);});
      if(cropCancel)cropCancel.addEventListener('click',closeCoverCropModal);if(cropBackdrop)cropBackdrop.addEventListener('click',function(e){if(e.target===cropBackdrop)closeCoverCropModal();});
      if(cropApply)cropApply.addEventListener('click',function(){var inp=getCoverCropInput();if(inp)inp.value=JSON.stringify({x:Math.round(state.x*10)/10,y:Math.round(state.y*10)/10,zoom:Math.round(state.zoom*10)/10});closeCoverCropModal();});
      if(cropZoomSlider)cropZoomSlider.addEventListener('input',function(){state.zoom=Math.max(0.5,Math.min(3,parseFloat(this.value)||1));applyCoverCropStyle();});
      if(cropViewport){cropViewport.addEventListener('mousedown',function(e){e.preventDefault();dragging=true;startX=e.clientX;startY=e.clientY;startStateX=state.x;startStateY=state.y;});cropViewport.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;e.preventDefault();dragging=true;startX=e.touches[0].clientX;startY=e.touches[0].clientY;startStateX=state.x;startStateY=state.y;});cropViewport.addEventListener('wheel',function(e){e.preventDefault();var delta=e.deltaY>0?-0.1:0.1;state.zoom=Math.max(0.5,Math.min(3,state.zoom+delta));applyCoverCropStyle();},{passive:false});}
      document.addEventListener('mousemove',function(e){if(!dragging)return;var dx=e.clientX-startX;var dy=e.clientY-startY;var k=100/(VIEWPORT_SIZE*state.zoom);state.x=Math.max(0,Math.min(100,startStateX+dx*k));state.y=Math.max(0,Math.min(100,startStateY+dy*k));startX=e.clientX;startY=e.clientY;startStateX=state.x;startStateY=state.y;applyCoverCropStyle();});
      document.addEventListener('mouseup',function(){dragging=false;});document.addEventListener('touchmove',function(e){if(!dragging||e.touches.length!==1)return;var dx=e.touches[0].clientX-startX;var dy=e.touches[0].clientY-startY;startX=e.touches[0].clientX;startY=e.touches[0].clientY;var k=100/(VIEWPORT_SIZE*state.zoom);state.x=Math.max(0,Math.min(100,state.x+dx*k));state.y=Math.max(0,Math.min(100,state.y+dy*k));applyCoverCropStyle();},{passive:false});document.addEventListener('touchend',function(e){if(e.touches.length===0)dragging=false;});
      var coverFileInput=document.getElementById('admin-partner-new-cover-file');if(coverFileInput)coverFileInput.addEventListener('change',function(){if(this.files&&this.files[0]){var url=URL.createObjectURL(this.files[0]);var prev=document.getElementById('admin-partner-new-cover-preview');if(prev){prev.style.backgroundImage='url('+url+')';prev.style.backgroundSize='cover';prev.style.backgroundPosition='center';prev.innerHTML='';}openCoverCropModal(url,'admin-partner-new-cover-crop-json');}});
      var coverMobileFileInput=document.getElementById('admin-partner-new-cover-mobile-file');if(coverMobileFileInput)coverMobileFileInput.addEventListener('change',function(){if(this.files&&this.files[0]){var url=URL.createObjectURL(this.files[0]);var prev=document.getElementById('admin-partner-new-cover-mobile-preview');if(prev){prev.style.backgroundImage='url('+url+')';prev.style.backgroundSize='cover';prev.style.backgroundPosition='center';prev.innerHTML='';}if(window._adminOpenCoverMobileCrop)window._adminOpenCoverMobileCrop(url);else openCoverCropModal(url,'admin-partner-new-cover-mobile-crop-json');}});
    })();
    (function(){
      var cropBackdrop=document.getElementById('admin-cover-mobile-crop-backdrop');var cropViewport=document.getElementById('admin-cover-mobile-crop-viewport');var cropImage=document.getElementById('admin-cover-mobile-crop-image');var cropZoomSlider=document.getElementById('admin-cover-mobile-crop-zoom-slider');var cropZoomValue=document.getElementById('admin-cover-mobile-crop-zoom-value');var cropApply=document.getElementById('admin-cover-mobile-crop-apply');var cropCancel=document.getElementById('admin-cover-mobile-crop-cancel');
      var getCoverMobileInput=function(){return document.getElementById('admin-partner-cover-mobile-crop-json')||document.getElementById('admin-partner-new-cover-mobile-crop-json');};var VIEWPORT_SIZE=280;var state={x:50,y:50,zoom:1};var coverUrl='';var dragging=false;var startX,startY,startStateX,startStateY;
      function applyStyle(){if(!cropImage||!coverUrl)return;var size=100*state.zoom;var px=(100-state.x).toFixed(1);var py=(100-state.y).toFixed(1);cropImage.style.backgroundImage='url('+coverUrl+')';cropImage.style.backgroundSize=size+'%';cropImage.style.backgroundPosition=px+'% '+py+'%';if(cropZoomValue)cropZoomValue.textContent=state.zoom.toFixed(1);if(cropZoomSlider)cropZoomSlider.value=state.zoom;}
      function openModal(url){coverUrl=url;var inp=getCoverMobileInput();if(inp&&inp.value){try{var parsed=JSON.parse(inp.value);if(parsed&&typeof parsed.x==='number'&&typeof parsed.y==='number'&&typeof parsed.zoom==='number'){state.x=Math.max(0,Math.min(100,parsed.x));state.y=Math.max(0,Math.min(100,parsed.y));state.zoom=Math.max(0.5,Math.min(3,parsed.zoom));}}catch(e){}}else{state.x=50;state.y=50;state.zoom=1;}applyStyle();if(cropBackdrop)cropBackdrop.classList.add('open');}
      function closeModal(){if(cropBackdrop)cropBackdrop.classList.remove('open');}
      if(cropCancel)cropCancel.addEventListener('click',closeModal);if(cropBackdrop)cropBackdrop.addEventListener('click',function(e){if(e.target===cropBackdrop)closeModal();});
      if(cropApply)cropApply.addEventListener('click',function(){var inp=getCoverMobileInput();if(inp)inp.value=JSON.stringify({x:Math.round(state.x*10)/10,y:Math.round(state.y*10)/10,zoom:Math.round(state.zoom*10)/10});closeModal();});
      if(cropZoomSlider)cropZoomSlider.addEventListener('input',function(){state.zoom=Math.max(0.5,Math.min(3,parseFloat(this.value)||1));applyStyle();});
      if(cropViewport){cropViewport.addEventListener('mousedown',function(e){e.preventDefault();dragging=true;startX=e.clientX;startY=e.clientY;startStateX=state.x;startStateY=state.y;});cropViewport.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;e.preventDefault();dragging=true;startX=e.touches[0].clientX;startY=e.touches[0].clientY;startStateX=state.x;startStateY=state.y;});cropViewport.addEventListener('wheel',function(e){e.preventDefault();var delta=e.deltaY>0?-0.1:0.1;state.zoom=Math.max(0.5,Math.min(3,state.zoom+delta));applyStyle();},{passive:false});}
      document.addEventListener('mousemove',function(e){if(!dragging)return;var dx=e.clientX-startX;var dy=e.clientY-startY;var k=100/(VIEWPORT_SIZE*state.zoom);state.x=Math.max(0,Math.min(100,startStateX+dx*k));state.y=Math.max(0,Math.min(100,startStateY+dy*k));startX=e.clientX;startY=e.clientY;startStateX=state.x;startStateY=state.y;applyStyle();});
      document.addEventListener('mouseup',function(){dragging=false;});document.addEventListener('touchmove',function(e){if(!dragging||e.touches.length!==1)return;var dx=e.touches[0].clientX-startX;var dy=e.touches[0].clientY-startY;startX=e.touches[0].clientX;startY=e.touches[0].clientY;var k=100/(VIEWPORT_SIZE*state.zoom);state.x=Math.max(0,Math.min(100,state.x+dx*k));state.y=Math.max(0,Math.min(100,state.y+dy*k));applyStyle();},{passive:false});document.addEventListener('touchend',function(e){if(e.touches.length===0)dragging=false;});
      window._adminOpenCoverMobileCrop=openModal;
    })();
  </script></body>`));
});

// POST /admin/partners from form at /admin/partners/new is handled by partners.js; on success/error it redirects.

// ——— GET /admin/partners/:id (JSON для модалки редактирования; после /new, чтобы "new" не матчился как id)
router.get('/admin/partners/:id', requireManagerAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
  const partner = Partner.findById(id);
  if (!partner) return res.status(404).json({ error: 'Not found' });
  const contacts = getPartnerContacts(partner);
  res.json({
    partner: {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      logo_url: partner.logo_url,
      logo_position: partner.logo_position,
      logo_crop_json: partner.logo_crop_json,
      tagline: partner.tagline,
      cover_url: partner.cover_url,
      cover_crop_json: partner.cover_crop_json,
      cover_mobile_url: partner.cover_mobile_url,
      cover_mobile_crop_json: partner.cover_mobile_crop_json,
      public_id: partner.public_id,
      status: partner.status || 'active',
    },
    contacts,
  });
});

// ——— GET /admin/cars/:id (JSON для модалки редактирования авто)
router.get('/admin/cars/:id', requireManagerAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
  const row = db
    .prepare(
      `SELECT c.*,
              cl.id AS client_id,
              cl.name AS client_name,
              cl.public_id AS client_public_id,
              p.name AS partner_name,
              p.slug AS partner_slug,
              sel.selection_id,
              sel.selection_public_id,
              sel.selection_name,
              sel.selection_country,
              sel.selection_source_site,
              sel.selection_search_url
       FROM cars c
       JOIN clients cl ON c.client_id = cl.id
       JOIN partners p ON cl.partner_id = p.id
       LEFT JOIN (
         SELECT fc.car_id,
                MIN(sc.id) AS selection_id,
                MIN(sc.public_id) AS selection_public_id,
                MIN(sc.name) AS selection_name,
                MIN(sc.country) AS selection_country,
                MIN(sc.source_site) AS selection_source_site,
                MIN(sc.search_url) AS selection_search_url
         FROM criterion_found_cars fc
         JOIN search_criteria sc ON sc.id = fc.search_criteria_id
         WHERE fc.car_id IS NOT NULL
         GROUP BY fc.car_id
       ) AS sel ON sel.car_id = c.id
       WHERE c.id = ?`
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({
    car: {
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      source_url: row.source_url,
      images_json: row.images_json,
      client_id: row.client_id,
      client_name: row.client_name,
      client_public_id: row.client_public_id,
      partner_name: row.partner_name,
      partner_slug: row.partner_slug,
      selection_id: row.selection_id,
      selection_public_id: row.selection_public_id,
      selection_name: row.selection_name,
      selection_country: row.selection_country,
      selection_source_site: row.selection_source_site,
      selection_search_url: row.selection_search_url,
    },
  });
});

// ——— POST /admin/cars/:id (обновление автомобиля)
router.post('/admin/cars/:id', requireManagerAuth, uploadCarImages.array('images', 10), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.redirect('/admin/automobiles');
  const car = Car.findById(id);
  if (!car) return res.redirect('/admin/automobiles');

  const { title, description, price, sourceUrl, existingImagesJson, redirect: redirectRaw } = req.body || {};
  let imagesJson = car.images_json;
  if (existingImagesJson !== undefined) {
    try {
      const parsed = existingImagesJson ? JSON.parse(existingImagesJson) : [];
      if (Array.isArray(parsed)) {
        imagesJson = JSON.stringify(parsed);
      }
    } catch (e) {
      // игнорируем, оставим текущее images_json
    }
  }
  if (Array.isArray(req.files) && req.files.length > 0) {
    const newUrls = req.files.map((f) => '/uploads/cars/' + f.filename);
    let existing = [];
    if (imagesJson) try { existing = JSON.parse(imagesJson); } catch (e) {}
    imagesJson = JSON.stringify(existing.concat(newUrls));
  }

  const updates = {};
  if (title !== undefined) updates.title = String(title).trim();
  if (description !== undefined) updates.description = description ? String(description) : null;
  if (price !== undefined && price !== '') {
    const num = Number(price);
    updates.price = Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
  } else if (price === '') updates.price = null;
  if (sourceUrl !== undefined) updates.sourceUrl = sourceUrl ? String(sourceUrl).trim() : null;
  if (imagesJson !== undefined) updates.imagesJson = imagesJson;

  const redirectBase = typeof redirectRaw === 'string' && redirectRaw.trim() ? redirectRaw.trim() : '/admin/automobiles';

  function withMessage(baseUrl, key, message) {
    if (!message) return baseUrl;
    const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
    return baseUrl + sep + key + '=' + encodeURIComponent(message);
  }

  try {
    Car.update(id, {
      title: updates.title !== undefined ? updates.title : car.title,
      description: updates.description !== undefined ? updates.description : car.description,
      price: updates.price !== undefined ? updates.price : car.price,
      sourceUrl: updates.sourceUrl !== undefined ? updates.sourceUrl : car.source_url,
      imagesJson: updates.imagesJson !== undefined ? updates.imagesJson : car.images_json,
    });
    return res.redirect(withMessage(redirectBase, 'success', 'Автомобиль обновлён'));
  } catch (e) {
    console.error('Error updating car:', e);
    return res.redirect(withMessage(redirectBase, 'error', 'Не удалось сохранить'));
  }
});

// ——— POST /admin/cars/:id/delete (мягкое удаление автомобиля) ———
router.post('/admin/cars/:id/delete', requireManagerAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.redirect('/admin/automobiles');
  const car = Car.findById(id);
  if (!car) return res.redirect('/admin/automobiles');
  const redirectRaw = (req.body && req.body.redirect) || '';
  const redirectBase = typeof redirectRaw === 'string' && redirectRaw.trim() ? redirectRaw.trim() : '/admin/automobiles?status=deleted';
  function withMessage(baseUrl, key, message) {
    if (!message) return baseUrl;
    const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
    return baseUrl + sep + key + '=' + encodeURIComponent(message);
  }
  try {
    Car.update(id, { status: 'deleted' });
    return res.redirect(withMessage(redirectBase, 'success', 'Автомобиль перемещён во вкладку «Удалённые»'));
  } catch (e) {
    console.error('Error soft-deleting car:', e);
    return res.redirect(withMessage(redirectBase, 'error', 'Не удалось удалить автомобиль'));
  }
});

// ——— GET /admin/automobiles/:id/edit ———
router.get('/admin/automobiles/:id/edit', requireManagerAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.redirect('/admin/automobiles');
  }
  const row = db
    .prepare(
      `SELECT c.*,
              cl.id AS client_id,
              cl.name AS client_name,
              cl.public_id AS client_public_id,
              p.name AS partner_name,
              p.slug AS partner_slug,
              sc.id AS selection_id,
              sc.public_id AS selection_public_id,
              sc.name AS selection_name,
              sc.country AS selection_country,
              sc.source_site AS selection_source_site,
              sc.search_url AS selection_search_url
       FROM cars c
       JOIN clients cl ON c.client_id = cl.id
       JOIN partners p ON cl.partner_id = p.id
       LEFT JOIN criterion_found_cars fc ON fc.car_id = c.id
       LEFT JOIN search_criteria sc ON sc.id = fc.search_criteria_id
       WHERE c.id = ?
       ORDER BY fc.id ASC
       LIMIT 1`
    )
    .get(id);
  if (!row) {
    return res.redirect('/admin/automobiles');
  }

  let images = [];
  if (row.images_json) {
    try {
      const parsed = JSON.parse(row.images_json);
      if (Array.isArray(parsed)) images = parsed;
    } catch (e) {}
  }

  const carPublicId = row.public_id != null ? row.public_id : row.id;
  const redirectBack = (req.query.redirect && String(req.query.redirect)) || '/admin/automobiles';
  const selectionRealId = row.selection_public_id != null ? row.selection_public_id : row.selection_id;

  let selectionLinkHtml = '—';
  if (selectionRealId || row.selection_name) {
    const baseName =
      row.selection_name && String(row.selection_name).trim() !== ''
        ? String(row.selection_name)
        : selectionRealId
        ? 'Подборка ' + String(selectionRealId)
        : 'Подборка';
    if (row.partner_slug && selectionRealId) {
      const href =
        '/p/' + encodeURIComponent(row.partner_slug) + '/selection/' + encodeURIComponent(String(selectionRealId));
      selectionLinkHtml =
        '<a href="' + href + '" target="_blank" rel="noopener" class="admin-link">' + esc(baseName) + '</a>';
    } else {
      selectionLinkHtml = esc(baseName);
    }
  }

  let metaParts = [];
  if (row.selection_country) {
    metaParts.push('Страна: ' + esc(row.selection_country));
  }
  let metaHtml = '';
  const bestUrl =
    (row.source_url && String(row.source_url).trim()) ||
    (row.selection_search_url && String(row.selection_search_url).trim()) ||
    '';
  if (row.selection_source_site) {
    const label = String(row.selection_source_site);
    if (bestUrl) {
      let external = bestUrl;
      if (!/^https?:\/\//i.test(external)) external = 'https://' + external;
      metaHtml += metaParts.length ? esc(metaParts.join(' · ')) + ' · ' : '';
      metaHtml +=
        'Источник: <a href="' +
        esc(external) +
        '" target="_blank" rel="noopener" class="admin-link">' +
        esc(label) +
        '</a>';
    } else {
      metaParts.push('Источник: ' + label);
      metaHtml = esc(metaParts.join(' · '));
    }
  } else if (metaParts.length) {
    metaHtml = esc(metaParts.join(' · '));
  } else {
    metaHtml = '—';
  }

  let ownerHtml = '';
  if (row.client_name) {
    const clientPublicId = row.client_public_id != null ? row.client_public_id : row.client_id;
    if (row.partner_slug && clientPublicId) {
      const cu =
        '/p/' + encodeURIComponent(row.partner_slug) + '/c/' + encodeURIComponent(String(clientPublicId));
      ownerHtml +=
        'Клиент: <a href="' + cu + '" target="_blank" rel="noopener" class="admin-link">' + esc(row.client_name) + '</a>';
    } else {
      ownerHtml += 'Клиент: ' + esc(row.client_name);
    }
  }
  if (row.partner_name) {
    if (ownerHtml) ownerHtml += ' · ';
    if (row.partner_slug) {
      const pu = '/p/' + encodeURIComponent(row.partner_slug);
      ownerHtml +=
        'Перегонщик: <a href="' +
        pu +
        '" target="_blank" rel="noopener" class="admin-link">' +
        esc(row.partner_name) +
        '</a>';
    } else {
      ownerHtml += 'Перегонщик: ' + esc(row.partner_name);
    }
  }
  if (!ownerHtml) ownerHtml = '—';

  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Редактировать автомобиль</h1>
        <p class="admin-subtitle">ID: ${esc(String(carPublicId))}</p>
      </div>
      <a href="${esc(redirectBack)}" class="admin-btn admin-btn-secondary">← К списку</a>
    </div>
  `;

  const imagesGrid = '<div class="admin-form-media-row" id="admin-edit-car-images"></div>';

  const formHtml = `
    <div class="admin-card" style="padding:24px;max-width:720px;">
      <form method="post" action="/admin/cars/${row.id}" enctype="multipart/form-data">
        <input type="hidden" name="redirect" value="${esc(redirectBack)}" />
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Привязка</h3>
        <div class="admin-form-group">
            <label>Подборка</label>
            <div class="admin-form-hint">${selectionLinkHtml}</div>
          </div>
        <div class="admin-form-group">
          <label>Парсинг</label>
          <div class="admin-form-hint">${
            row.selection_search_url
              ? (function() {
                  const raw = String(row.selection_search_url).trim();
                  const href = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
                  return '<a href="' + esc(href) + '" target="_blank" rel="noopener" class="admin-link" title="Открыть ссылку парсинга">↗</a>';
                })()
              : '—'
          }</div>
        </div>
          <div class="admin-form-group">
            <label>Страна и источник</label>
            <div class="admin-form-hint">${metaHtml}</div>
          </div>
          <div class="admin-form-group">
            <label>Клиент и перегонщик</label>
            <div class="admin-form-hint">${ownerHtml}</div>
          </div>
        </div>
        <div class="admin-form-group">
          <label>Заголовок</label>
          <input type="text" name="title" required value="${esc(row.title || '')}" />
        </div>
        <div class="admin-form-group">
          <label>Цена (₽)</label>
          <input type="number" name="price" placeholder="Число" value="${row.price != null ? esc(String(row.price)) : ''}" />
        </div>
        <div class="admin-form-group">
          <label>Описание</label>
          <textarea name="description" rows="4">${row.description ? esc(row.description) : ''}</textarea>
        </div>
        <div class="admin-form-group">
          <label>Ссылка на источник</label>
          <input type="text" name="sourceUrl" value="${row.source_url ? esc(row.source_url) : ''}" />
        </div>
        <div class="admin-form-group">
          <label>Текущие фото</label>
          <input type="hidden" name="existingImagesJson" value="${esc(row.images_json || '[]')}" />
          ${imagesGrid}
          <div class="admin-form-hint">Перетащите фото мышью, чтобы изменить порядок. Первое фото считается главным.</div>
        </div>
        <div class="admin-form-group">
          <label>Добавить фото</label>
          <input type="file" name="images" accept="image/*" multiple />
          <div class="admin-form-hint">Новые фото будут добавлены к существующим.</div>
        </div>
        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary">Сохранить изменения</button>
          <a href="${esc(redirectBack)}" class="admin-btn admin-btn-secondary">Отмена</a>
        </div>
      </form>
    </div>
  `;

  const content = topBar + formHtml;
  const html = adminLayout('automobiles', content, {});
  res.send(
    html.replace(
      '</body>',
      `<script>
        document.querySelectorAll('.admin-nav-item').forEach(function(a) {
          if (a.getAttribute('href') === '/admin/automobiles') a.classList.add('active');
        });
        (function() {
          var flashes = document.querySelectorAll('.admin-flash');
          if (flashes && flashes.length) {
            setTimeout(function() {
              flashes.forEach(function(el) { el.style.display = 'none'; });
            }, 5000);
          }
          var imagesInput = document.querySelector('input[name="existingImagesJson"]');
          var imagesContainer = document.getElementById('admin-edit-car-images');
          if (imagesInput && imagesContainer) {
            var images = [];
            try {
              var parsed = JSON.parse(imagesInput.value || '[]');
              if (Array.isArray(parsed)) images = parsed;
            } catch (e) {
              images = [];
            }
            var dragIndex = null;
            function saveImages() {
              try {
                imagesInput.value = JSON.stringify(images);
              } catch (e) {}
            }
            function renderImages() {
              imagesContainer.innerHTML = '';
              if (!images.length) {
                var empty = document.createElement('p');
                empty.className = 'admin-form-hint';
                empty.textContent = 'Фото ещё не загружены.';
                imagesContainer.appendChild(empty);
                saveImages();
                return;
              }
              images.forEach(function(url, index) {
                var item = document.createElement('div');
                item.className = 'admin-form-media-preview';
                item.style.width = '96px';
                item.style.height = '96px';
                item.style.borderRadius = '10px';
                item.style.backgroundImage = 'url(' + url.replace(/"/g, '&quot;') + ')';
                item.style.backgroundSize = 'cover';
                item.style.backgroundPosition = 'center';
                item.style.position = 'relative';
                item.setAttribute('data-index', String(index));
                item.setAttribute('draggable', 'true');
                if (index === 0) {
                  var mainBadge = document.createElement('div');
                  mainBadge.textContent = 'Главная';
                  mainBadge.style.position = 'absolute';
                  mainBadge.style.left = '4px';
                  mainBadge.style.bottom = '4px';
                  mainBadge.style.padding = '2px 6px';
                  mainBadge.style.borderRadius = '999px';
                  mainBadge.style.fontSize = '10px';
                  mainBadge.style.fontWeight = '600';
                  mainBadge.style.background = 'rgba(15,23,42,0.85)';
                  mainBadge.style.color = '#fff';
                  item.appendChild(mainBadge);
                }
                item.addEventListener('dragstart', function() {
                  dragIndex = index;
                });
                item.addEventListener('dragover', function(e) {
                  e.preventDefault();
                  var targetIndex = parseInt(item.getAttribute('data-index') || '0', 10);
                  if (!isFinite(targetIndex) || dragIndex === null || dragIndex === targetIndex) return;
                  var moved = images.splice(dragIndex, 1)[0];
                  images.splice(targetIndex, 0, moved);
                  dragIndex = targetIndex;
                  saveImages();
                  renderImages();
                });
                item.addEventListener('drop', function(e) {
                  e.preventDefault();
                  dragIndex = null;
                });
                imagesContainer.appendChild(item);
              });
              saveImages();
            }
            renderImages();
          }
        })();
      </script></body>`
    )
  );
});

// ——— GET /admin/automobiles ———
router.get('/admin/automobiles', requireManagerAuth, (req, res) => {
  const success = req.query.success || null;
  const qRaw = (req.query.q || '').trim();
  const q = qRaw.toLowerCase();
  const statusRaw = req.query.status || 'review';
  const allowedStatuses = ['review', 'active', 'deleted'];
  const status = allowedStatuses.includes(statusRaw) ? statusRaw : 'review';
  const country = (req.query.country || '').trim();
  const sourceFilter = (req.query.source || '').trim();
  const clientFilter = (req.query.client || '').trim();
  const partnerFilter = (req.query.partner || '').trim();

  const baseRows = db
    .prepare(
      `SELECT c.id,
              c.public_id AS car_public_id,
              c.title,
              c.description,
              c.price,
              c.images_json,
              c.source_url,
              c.created_at,
              c.status,
              cl.id AS client_id,
              cl.public_id AS client_public_id,
              cl.name AS client_name,
              p.name AS partner_name,
              p.slug AS partner_slug,
              sel.selection_id,
              sel.selection_public_id,
              sel.selection_name,
              sel.selection_country,
              sel.selection_source_site,
              sel.selection_search_url
       FROM cars c
       JOIN clients cl ON c.client_id = cl.id
       JOIN partners p ON cl.partner_id = p.id
       LEFT JOIN (
         SELECT fc.car_id,
                MIN(sc.id) AS selection_id,
                MIN(sc.public_id) AS selection_public_id,
                MIN(sc.name) AS selection_name,
                MIN(sc.country) AS selection_country,
                MIN(sc.source_site) AS selection_source_site,
                MIN(sc.search_url) AS selection_search_url
         FROM criterion_found_cars fc
         JOIN search_criteria sc ON sc.id = fc.search_criteria_id
         WHERE fc.car_id IS NOT NULL
         GROUP BY fc.car_id
       ) AS sel ON sel.car_id = c.id`
    )
    .all();

  const statusCounts = { review: 0, active: 0, deleted: 0 };
  baseRows.forEach((r) => {
    const s = r.status || 'active';
    if (statusCounts[s] !== undefined) statusCounts[s]++;
  });

  let list = baseRows.filter((r) => {
    const s = r.status || 'active';
    if (status === 'deleted') return s === 'deleted';
    if (status === 'active') return s === 'active';
    // 'review'
    return s === 'review';
  });

  if (country) {
    list = list.filter((r) => (r.selection_country || '') === country);
  }
  const baseForFilters = list.slice();

  if (sourceFilter) {
    list = list.filter((r) => (r.selection_source_site || '') === sourceFilter);
  }
  if (clientFilter) {
    list = list.filter((r) => (r.client_name || '') === clientFilter);
  }
  if (partnerFilter) {
    list = list.filter((r) => (r.partner_name || '') === partnerFilter);
  }

  if (q) {
    list = list.filter((r) => {
      const title = (r.title || '').toLowerCase();
      const clientName = (r.client_name || '').toLowerCase();
      const partnerName = (r.partner_name || '').toLowerCase();
      const sourceUrl = (r.source_url || '').toLowerCase();
      const selectionName = (r.selection_name || '').toLowerCase();
      const selectionSource = (r.selection_source_site || '').toLowerCase();
      const idStr = String(r.car_public_id != null ? r.car_public_id : r.id);
      const priceStr = r.price != null ? String(r.price) : '';
      return (
        title.includes(q) ||
        clientName.includes(q) ||
        partnerName.includes(q) ||
        sourceUrl.includes(q) ||
        selectionName.includes(q) ||
        selectionSource.includes(q) ||
        idStr.includes(q) ||
        priceStr.includes(q)
      );
    });
  }

  const countries = Array.from(
    new Set(
      baseForFilters
        .map((r) => r.selection_country || '')
        .filter((v) => v && v.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'));
  const sourceOptions = Array.from(
    new Set(
      baseForFilters
        .map((r) => r.selection_source_site || '')
        .filter((v) => v && v.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'));
  const clientOptions = Array.from(
    new Set(
      baseForFilters
        .map((r) => r.client_name || '')
        .filter((v) => v && v.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'));
  const partnerOptions = Array.from(
    new Set(
      baseForFilters
        .map((r) => r.partner_name || '')
        .filter((v) => v && v.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'));

  const pageSize = 20;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;
  const items = list.slice(offset, offset + pageSize);

  let rows = '';
  const redirectUrl = esc(req.originalUrl || '/admin/automobiles');

  items.forEach((car) => {
    let imgs = [];
    if (car.images_json) {
      try {
        imgs = JSON.parse(car.images_json);
      } catch (e) {}
    }
    const thumb = imgs[0]
      ? `<img class="admin-thumb" src="${imgs[0]}" alt="" />`
      : '<div class="admin-thumb" style="display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;">Нет</div>';
    const price = car.price != null && car.price > 0 ? car.price.toLocaleString('ru-RU') + ' ₽' : '—';
    const publicUrl =
      '/p/' + encodeURIComponent(car.partner_slug) + '/cars/' + (car.car_public_id != null ? car.car_public_id : car.id);
    const idDisplay = car.car_public_id != null ? car.car_public_id : car.id;
    const selectionRealId = car.selection_public_id != null ? car.selection_public_id : car.selection_id;
    let selectionCell = '<span style="color:#9CA3AF;">—</span>';
    if (selectionRealId || car.selection_name) {
      const rawName = (car.selection_name && String(car.selection_name).trim() !== '')
        ? String(car.selection_name)
        : (selectionRealId ? 'Подборка ' + String(selectionRealId) : 'Подборка');
      const safeName = esc(rawName);
      if (car.partner_slug && selectionRealId) {
        const selectionUrl =
          '/p/' + encodeURIComponent(car.partner_slug) + '/selection/' + encodeURIComponent(String(selectionRealId));
        selectionCell = `<a href="${selectionUrl}" target="_blank" rel="noopener" class="admin-link">${safeName}</a>`;
      } else {
        selectionCell = safeName;
      }
    }
    let parsingCell = '<span style="color:#9CA3AF;">—</span>';
    if (car.selection_source_site || car.selection_search_url) {
      const rawLabel = (car.selection_source_site && String(car.selection_source_site).trim()) || '';
      const rawSearch = (car.selection_search_url && String(car.selection_search_url).trim()) || '';
      let label = rawLabel;
      let href = '';
      if (rawSearch) {
        href = /^https?:\/\//i.test(rawSearch) ? rawSearch : 'https://' + rawSearch;
      }
      if (!label && href) {
        // если имя сайта не задано – берём домен из ссылки
        const withoutProto = href.replace(/^https?:\/\//i, '');
        label = withoutProto.split('/')[0];
      }
      if (label && href) {
        parsingCell = `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="admin-link" title="Открыть страницу поиска">${esc(
          label
        )}</a>`;
      } else if (label) {
        parsingCell = esc(label);
      }
    }
    const countryCell = car.selection_country ? esc(car.selection_country) : '—';
    let sourceCell = '<span style="color:#9CA3AF;">—</span>';
    if (car.source_url && String(car.source_url).trim() !== '') {
      let rawUrl = String(car.source_url).trim();
      let externalHref = rawUrl;
      if (!/^https?:\/\//i.test(externalHref)) externalHref = 'https://' + externalHref;
      sourceCell = `<a href="${externalHref.replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="admin-link" title="Открыть объявление на сайте-источнике">↗</a>`;
    }
    const clientPublicId = car.client_public_id != null ? car.client_public_id : car.client_id;
    const clientPublicUrl =
      car.partner_slug && clientPublicId
        ? '/p/' + encodeURIComponent(car.partner_slug) + '/c/' + encodeURIComponent(String(clientPublicId))
        : null;
    const clientCell = clientPublicUrl
      ? `<a href="${clientPublicUrl}" target="_blank" rel="noopener" class="admin-link">${esc(car.client_name || '')}</a>`
      : esc(car.client_name || '');
    const partnerPublicUrl = car.partner_slug
      ? '/p/' + encodeURIComponent(car.partner_slug)
      : null;
    const partnerCell = partnerPublicUrl
      ? `<a href="${partnerPublicUrl}" target="_blank" rel="noopener" class="admin-link">${esc(car.partner_name || '')}</a>`
      : esc(car.partner_name || '');
    rows +=
      '<tr>' +
      `<td class="admin-cell-mono" style="width:80px;">${esc(String(idDisplay))}</td>` +
      `<td>${thumb}</td>` +
      `<td><a class="admin-link" href="${publicUrl}" target="_blank" rel="noopener">${esc(car.title || '')}</a></td>` +
      `<td class="admin-cell-mono">${price}</td>` +
      `<td>${selectionCell}</td>` +
      `<td>${countryCell}</td>` +
      `<td>${parsingCell}</td>` +
      `<td>${sourceCell}</td>` +
      `<td>${clientCell}</td>` +
      `<td>${partnerCell}</td>` +
      `<td><div class="admin-cell-actions">
        <a href="/admin/automobiles/${car.id}/edit?redirect=${encodeURIComponent(redirectUrl)}" class="admin-icon-btn" title="Редактировать автомобиль" aria-label="Редактировать автомобиль">✏️</a>
        <form method="post" action="/admin/cars/${car.id}/delete" style="display:inline;" onsubmit="return confirm('Удалить автомобиль?');">
          <input type="hidden" name="redirect" value="${redirectUrl}" />
          <button type="submit" class="admin-icon-btn admin-icon-btn-danger" title="Удалить автомобиль" aria-label="Удалить автомобиль">🗑</button>
        </form>
      </div></td>` +
      '</tr>';
  });

  const statusTabs = [
    { key: 'review', label: 'К проверке' },
    { key: 'active', label: 'Активные' },
    { key: 'deleted', label: 'Удалённые' },
  ];

  const tabsHtml = `
    <nav class="admin-tabs" aria-label="Фильтр по статусу автомобилей">
      ${statusTabs
        .map((t) => {
          const href =
            '/admin/automobiles?status=' +
            t.key +
            (qRaw ? '&q=' + encodeURIComponent(qRaw) : '') +
            (page !== 1 ? '&page=1' : '');
          const cls = 'admin-tab' + (status === t.key ? ' admin-tab-active' : '');
          const count = statusCounts[t.key] != null ? statusCounts[t.key] : 0;
          return '<a href="' + href + '" class="' + cls + '">' + t.label + (count ? ' · ' + count : '') + '</a>';
        })
        .join('')}
    </nav>`;

  const searchHtml = `
    <form method="get" action="/admin/automobiles" style="margin-bottom:12px;">
      <input type="hidden" name="status" value="${status}" />
      ${country ? `<input type="hidden" name="country" value="${esc(country)}" />` : ''}
      ${sourceFilter ? `<input type="hidden" name="source" value="${esc(sourceFilter)}" />` : ''}
      ${clientFilter ? `<input type="hidden" name="client" value="${esc(clientFilter)}" />` : ''}
      ${partnerFilter ? `<input type="hidden" name="partner" value="${esc(partnerFilter)}" />` : ''}
      <input
        type="text"
        name="q"
        class="admin-search"
        id="admin-automobiles-search"
        style="width:100%;max-width:none;"
        placeholder="Поиск по ID, марке, клиенту, партнёру, источнику или ссылке"
        value="${esc(qRaw)}"
      />
    </form>`;

  const resetUrl =
    '/admin/automobiles?status=' + encodeURIComponent(status);

  const filtersHtml = `
    <form method="get" action="/admin/automobiles" id="admin-automobiles-filters" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px;">
      <input type="hidden" name="status" value="${status}" />
      ${qRaw ? `<input type="hidden" name="q" value="${esc(qRaw)}" />` : ''}
      <select name="country" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;min-width:140px;">
        <option value="">Страна: все</option>
        ${countries
          .map(
            (c) =>
              `<option value="${c}" ${country === c ? 'selected' : ''}>${c}</option>`
          )
          .join('')}
      </select>
      <select name="source" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;min-width:160px;">
        <option value="">Источник: все</option>
        ${sourceOptions
          .map(
            (s) =>
              `<option value="${esc(s)}" ${
                sourceFilter === s ? 'selected' : ''
              }>${esc(s)}</option>`
          )
          .join('')}
      </select>
      <select name="client" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;min-width:160px;">
        <option value="">Клиент: все</option>
        ${clientOptions
          .map(
            (c) =>
              `<option value="${esc(c)}" ${
                clientFilter === c ? 'selected' : ''
              }>${esc(c)}</option>`
          )
          .join('')}
      </select>
      <select name="partner" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;min-width:160px;">
        <option value="">Партнёр: все</option>
        ${partnerOptions
          .map(
            (p) =>
              `<option value="${esc(p)}" ${
                partnerFilter === p ? 'selected' : ''
              }>${esc(p)}</option>`
          )
          .join('')}
      </select>
      <button type="submit" class="admin-btn admin-btn-secondary admin-btn-small">Применить</button>
      <a href="${resetUrl}" class="admin-btn admin-btn-secondary admin-btn-small">Сбросить</a>
    </form>`;

  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Автомобили</h1>
        <p class="admin-subtitle">Все автомобили на платформе</p>
      </div>
      <a href="/admin/automobiles/new" class="admin-btn admin-btn-primary">Добавить автомобиль</a>
    </div>
  `;

  const emptyState = !rows
    ? `
    <div class="admin-empty admin-card" style="margin-top:0;">
      <p class="admin-empty-title">Автомобилей пока нет</p>
      <p>Добавьте автомобиль через кнопку выше или из вкладки «Найденные авто».</p>
      <p style="margin-top:16px;"><a href="/admin/automobiles/new" class="admin-btn admin-btn-primary">Добавить автомобиль</a></p>
    </div>
  `
    : '';

  const carEditModalHtml = `
    <div class="admin-modal-backdrop" id="admin-car-modal" aria-hidden="true">
      <div class="admin-modal" role="dialog" aria-labelledby="admin-car-modal-title">
        <div class="admin-modal-header">
          <h2 class="admin-modal-title" id="admin-car-modal-title">Редактировать автомобиль</h2>
          <button type="button" class="admin-modal-close" id="admin-car-modal-close" aria-label="Закрыть">&times;</button>
        </div>
        <div class="admin-modal-body">
          <form id="admin-car-edit-form" method="post" action="" enctype="multipart/form-data">
            <input type="hidden" name="redirect" id="admin-car-redirect" />
            <div class="admin-form-section">
              <h3 class="admin-form-section-title">Привязка</h3>
              <div class="admin-form-group">
                <label>Подборка</label>
                <div id="admin-car-selection-info" class="admin-form-hint">—</div>
              </div>
              <div class="admin-form-group">
                <label>Страна и источник</label>
                <div id="admin-car-meta-info" class="admin-form-hint">—</div>
              </div>
              <div class="admin-form-group">
                <label>Клиент и перегонщик</label>
                <div id="admin-car-owner-info" class="admin-form-hint">—</div>
              </div>
            </div>
            <div class="admin-form-group"><label>Заголовок</label><input type="text" name="title" required /></div>
            <div class="admin-form-group"><label>Цена (₽)</label><input type="number" name="price" placeholder="Число" /></div>
            <div class="admin-form-group"><label>Описание</label><textarea name="description" rows="3"></textarea></div>
            <div class="admin-form-group"><label>Ссылка на источник</label><input type="text" name="sourceUrl" /></div>
            <div class="admin-form-group">
              <label>Текущие фото</label>
              <input type="hidden" name="existingImagesJson" id="admin-car-existing-images" />
              <div class="admin-form-media-row" id="admin-car-existing-images-list"></div>
              <div class="admin-form-hint">Нажмите на корзину, чтобы убрать фото. Новые файлы добавятся к оставшимся.</div>
            </div>
            <div class="admin-form-group"><label>Добавить фото (новые файлы добавятся к существующим)</label><input type="file" name="images" accept="image/*" multiple /></div>
            <div class="admin-form-actions">
              <button type="submit" class="admin-btn admin-btn-primary">Сохранить</button>
              <button type="button" class="admin-btn admin-btn-secondary" id="admin-car-modal-cancel">Отмена</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const tableHtml = rows
    ? `
    ${success ? `<div class="admin-flash success">${esc(success)}</div>` : ''}
    ${req.query.error ? `<div class="admin-flash error">${esc(req.query.error)}</div>` : ''}
    <div class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:80px;">ID</th>
            <th>Фото</th>
            <th>Марка / модель</th>
            <th>Цена</th>
            <th>Подборка</th>
            <th>Страна</th>
            <th>Парсинг</th>
            <th>Источник</th>
            <th>Клиент</th>
            <th>Партнёр</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${total > pageSize ? `
        <div class="admin-pagination" style="padding:12px 16px;">
          ${safePage > 1 ? `<a href="/admin/automobiles?status=${encodeURIComponent(
            status
          )}&q=${encodeURIComponent(qRaw)}&page=${safePage - 1}">← Пред.</a>` : ''}
          <span>Стр. ${safePage} из ${pages}</span>
          ${
            safePage < pages
              ? `<a href="/admin/automobiles?status=${encodeURIComponent(
                  status
                )}&q=${encodeURIComponent(qRaw)}&page=${safePage + 1}">След. →</a>`
              : ''
          }
        </div>
      ` : ''}
    </div>
  `
    : '';

  const content = topBar + tabsHtml + searchHtml + filtersHtml + (rows ? tableHtml : emptyState) + carEditModalHtml;
  const html = adminLayout('automobiles', content, {});
  res.send(html.replace('</body>', `<script>
    document.querySelectorAll('.admin-nav-item').forEach(function(a) { if (a.getAttribute('href') === '/admin/automobiles') a.classList.add('active'); });
    (function() {
      var modal = document.getElementById('admin-car-modal');
      var form = document.getElementById('admin-car-edit-form');
      var closeBtn = document.getElementById('admin-car-modal-close');
      var cancelBtn = document.getElementById('admin-car-modal-cancel');
      var existingImagesInput = document.getElementById('admin-car-existing-images');
      var existingImagesList = document.getElementById('admin-car-existing-images-list');
      var selectionInfo = document.getElementById('admin-car-selection-info');
      var metaInfo = document.getElementById('admin-car-meta-info');
      var ownerInfo = document.getElementById('admin-car-owner-info');
      var existingImages = [];
      var dragIndex = null;
      var redirectInput = document.getElementById('admin-car-redirect');

      function renderExistingImages() {
        if (!existingImagesList) return;
        existingImagesList.innerHTML = '';
        if (!existingImages.length) {
          existingImagesList.innerHTML = '<span class="admin-form-hint">Нет загруженных фото.</span>';
          if (existingImagesInput) existingImagesInput.value = '[]';
          return;
        }
        existingImages.forEach(function(url, index) {
          var item = document.createElement('div');
          item.className = 'admin-form-media-preview';
          item.style.backgroundImage = 'url(' + url.replace(/"/g, '&quot;') + ')';
          item.style.position = 'relative';
          item.style.width = '96px';
          item.style.height = '96px';
          item.setAttribute('data-index', String(index));
          item.setAttribute('draggable', 'true');
          // Главная метка
          if (index === 0) {
            var mainBadge = document.createElement('div');
            mainBadge.textContent = 'Главная';
            mainBadge.style.position = 'absolute';
            mainBadge.style.left = '4px';
            mainBadge.style.bottom = '4px';
            mainBadge.style.padding = '2px 6px';
            mainBadge.style.borderRadius = '999px';
            mainBadge.style.fontSize = '10px';
            mainBadge.style.fontWeight = '600';
            mainBadge.style.background = 'rgba(15,23,42,0.85)';
            mainBadge.style.color = '#fff';
            item.appendChild(mainBadge);
          }
          var removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'admin-icon-btn admin-icon-btn-danger';
          removeBtn.textContent = '🗑';
          removeBtn.style.position = 'absolute';
          removeBtn.style.top = '4px';
          removeBtn.style.right = '4px';
          removeBtn.addEventListener('click', function(ev) {
            ev.stopPropagation();
            existingImages.splice(index, 1);
            if (existingImagesInput) existingImagesInput.value = JSON.stringify(existingImages);
            renderExistingImages();
          });
          item.addEventListener('click', function() {
            if (!url) return;
            var viewer = document.getElementById('admin-car-photo-viewer');
            var img = document.getElementById('admin-car-photo-viewer-img');
            if (!viewer) {
              viewer = document.createElement('div');
              viewer.id = 'admin-car-photo-viewer';
              viewer.className = 'admin-modal-backdrop open';
              viewer.innerHTML = '<div class="admin-modal"><div class="admin-modal-body" style="text-align:center;padding:16px;"><img id="admin-car-photo-viewer-img" src="" alt="" style="max-width:100%;max-height:80vh;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,0.3);" /></div></div>';
              document.body.appendChild(viewer);
              viewer.addEventListener('click', function(e) {
                if (e.target === viewer) viewer.classList.remove('open');
              });
              img = document.getElementById('admin-car-photo-viewer-img');
            } else {
              viewer.classList.add('open');
            }
            if (img) img.src = url;
          });
          // drag & drop
          item.addEventListener('dragstart', function() {
            dragIndex = index;
          });
          item.addEventListener('dragover', function(e) {
            e.preventDefault();
            var targetIndex = parseInt(item.getAttribute('data-index') || '0', 10);
            if (!isFinite(targetIndex) || dragIndex === null || dragIndex === targetIndex) return;
            var moved = existingImages.splice(dragIndex, 1)[0];
            existingImages.splice(targetIndex, 0, moved);
            dragIndex = targetIndex;
            if (existingImagesInput) existingImagesInput.value = JSON.stringify(existingImages);
            renderExistingImages();
          });
          item.addEventListener('drop', function(e) {
            e.preventDefault();
            dragIndex = null;
          });
          item.appendChild(removeBtn);
          existingImagesList.appendChild(item);
        });
        if (existingImagesInput) existingImagesInput.value = JSON.stringify(existingImages);
      }

      function closeModal() { if (modal) modal.classList.remove('open'); }
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
      document.querySelectorAll('.admin-edit-car').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.getAttribute('data-id');
          if (!id) return;
          form.action = '/admin/cars/' + id;
          if (redirectInput) {
            try {
              var u = new URL(window.location.href);
              u.searchParams.delete('success');
              u.searchParams.delete('error');
              redirectInput.value = u.pathname + u.search;
            } catch (e) {
              redirectInput.value = window.location.pathname + window.location.search;
            }
          }
          if (modal) modal.classList.add('open');
          fetch('/admin/cars/' + id, { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
              var c = data.car;
              form.querySelector('[name=title]').value = c.title || '';
              form.querySelector('[name=description]').value = c.description || '';
              form.querySelector('[name=price]').value = c.price != null && c.price !== '' ? c.price : '';
              form.querySelector('[name=sourceUrl]').value = c.source_url || '';
              // Привязка и ссылки
              if (selectionInfo) {
                var realId = c.selection_public_id != null ? c.selection_public_id : c.selection_id;
                var baseName;
                if (c.selection_name && String(c.selection_name).trim() !== '') {
                  baseName = String(c.selection_name);
                } else if (realId) {
                  baseName = 'Подборка ' + String(realId);
                } else {
                  baseName = 'Подборка';
                }
                var labelText = baseName;
                var rawSearchUrl = (c.selection_search_url && String(c.selection_search_url).trim()) || '';
                selectionInfo.innerHTML = '';
                if (rawSearchUrl) {
                  var externalHref = rawSearchUrl;
                  if (!/^https?:\/\//i.test(externalHref)) externalHref = 'https://' + externalHref;
                  var aSel = document.createElement('a');
                  aSel.href = externalHref;
                  aSel.target = '_blank';
                  aSel.rel = 'noopener';
                  aSel.className = 'admin-link';
                  aSel.textContent = labelText;
                  selectionInfo.appendChild(aSel);
                } else if (c.partner_slug && realId) {
                  var hrefSel = '/p/' + encodeURIComponent(c.partner_slug) + '/selection/' + encodeURIComponent(String(realId));
                  var aSel2 = document.createElement('a');
                  aSel2.href = hrefSel;
                  aSel2.target = '_blank';
                  aSel2.rel = 'noopener';
                  aSel2.className = 'admin-link';
                  aSel2.textContent = labelText;
                  selectionInfo.appendChild(aSel2);
                } else {
                  selectionInfo.textContent = labelText;
                }
              }
              if (metaInfo) {
                metaInfo.innerHTML = '';
                var metaParts = [];
                if (c.selection_country) {
                  metaParts.push('Страна: ' + String(c.selection_country));
                }
                if (c.selection_source_site) {
                  var label = String(c.selection_source_site);
                  var bestUrl =
                    (c.source_url && String(c.source_url).trim()) ||
                    (c.selection_search_url && String(c.selection_search_url).trim()) ||
                    '';
                  if (bestUrl) {
                    var extHref = bestUrl;
                    if (!/^https?:\/\//i.test(extHref)) extHref = 'https://' + extHref;
                    metaParts.push('Источник: ');
                    metaInfo.appendChild(document.createTextNode(metaParts.join(' · ')));
                    var aSrc = document.createElement('a');
                    aSrc.href = extHref;
                    aSrc.target = '_blank';
                    aSrc.rel = 'noopener';
                    aSrc.className = 'admin-link';
                    aSrc.textContent = label;
                    if (metaParts.length > 1) {
                      metaInfo.appendChild(document.createTextNode(' · '));
                    }
                    metaInfo.appendChild(aSrc);
                  } else {
                    metaParts.push('Источник: ' + label);
                    metaInfo.textContent = metaParts.join(' · ');
                  }
                } else if (metaParts.length) {
                  metaInfo.textContent = metaParts.join(' · ');
                } else {
                  metaInfo.textContent = '—';
                }
              }
              if (ownerInfo) {
                var ownerParts = [];
                if (c.client_name) {
                  var clientId = c.client_public_id != null ? c.client_public_id : c.client_id;
                  if (c.partner_slug && clientId) {
                    var cu = '/p/' + encodeURIComponent(c.partner_slug) + '/c/' + encodeURIComponent(String(clientId));
                    ownerParts.push('Клиент: <a href="' + cu + '" target="_blank" rel="noopener" class="admin-link">' + String(c.client_name).replace(/</g, '&lt;') + '</a>');
                  } else {
                    ownerParts.push('Клиент: ' + String(c.client_name));
                  }
                }
                if (c.partner_name && c.partner_slug) {
                  var pu = '/p/' + encodeURIComponent(c.partner_slug);
                  ownerParts.push('Перегонщик: <a href="' + pu + '" target="_blank" rel="noopener" class="admin-link">' + String(c.partner_name).replace(/</g, '&lt;') + '</a>');
                } else if (c.partner_name) {
                  ownerParts.push('Перегонщик: ' + String(c.partner_name));
                }
                ownerInfo.innerHTML = ownerParts.length ? ownerParts.join(' · ') : '—';
              }
              // Текущие фото
              existingImages = [];
              if (c.images_json) {
                try {
                  var parsed = JSON.parse(c.images_json);
                  if (Array.isArray(parsed)) existingImages = parsed;
                } catch (e) {}
              }
              renderExistingImages();
            })
            .catch(function() { if (modal) modal.classList.remove('open'); });
        });
      });
      var searchInput = document.getElementById('admin-automobiles-search');
      if (searchInput && searchInput.form) {
        searchInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.form.submit();
          }
        });
      }
      var filtersForm = document.getElementById('admin-automobiles-filters');
      if (filtersForm) {
        var selects = filtersForm.querySelectorAll('select');
        for (var i = 0; i < selects.length; i++) {
          selects[i].addEventListener('change', function() {
            filtersForm.submit();
          });
        }
      }
      var flashes = document.querySelectorAll('.admin-flash');
      if (flashes && flashes.length) {
        setTimeout(function() {
          flashes.forEach(function(el) {
            el.style.display = 'none';
          });
        }, 5000);
      }
      // Убираем success/error из адресной строки, чтобы при обновлении страницы алерт не появлялся снова
      if (window.history && window.history.replaceState) {
        try {
          var url = new URL(window.location.href);
          url.searchParams.delete('success');
          url.searchParams.delete('error');
          window.history.replaceState(null, '', url.pathname + url.search);
        } catch (e) {}
      }
    })();
  </script></body>`));
});

// ——— GET /admin/automobiles/new ———
router.get('/admin/automobiles/new', requireManagerAuth, (req, res) => {
  const error = req.query.error || null;
  const clients = db.prepare(`
    SELECT cl.id, cl.name, p.name AS partner_name
    FROM clients cl
    JOIN partners p ON cl.partner_id = p.id
    ORDER BY p.name, cl.name
  `).all();
  const clientOptions = clients.map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.partner_name)})</option>`).join('');

  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Добавить автомобиль</h1>
        <p class="admin-subtitle">Клиент и описание</p>
      </div>
      <a href="/admin/automobiles" class="admin-btn admin-btn-secondary">← К списку</a>
    </div>
  `;
  const formHtml = `
    ${error ? `<div class="admin-flash error">${esc(error)}</div>` : ''}
    <div class="admin-card" style="padding:24px; max-width:520px;">
      <form method="post" action="/admin/cars" enctype="multipart/form-data">
        <div class="admin-form-group">
          <label>Клиент</label>
          <select name="clientId" required style="width:100%;max-width:400px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
            <option value="">Выберите клиента</option>${clientOptions}
          </select>
        </div>
        <div class="admin-form-group"><label>Заголовок</label><input type="text" name="title" required /></div>
        <div class="admin-form-group"><label>Цена (₽)</label><input type="number" name="price" placeholder="Число" /></div>
        <div class="admin-form-group"><label>Описание</label><textarea name="description" rows="3"></textarea></div>
        <div class="admin-form-group"><label>Фото</label><input type="file" name="images" accept="image/*" multiple /></div>
        <div class="admin-form-group"><label>Ссылка на источник</label><input type="text" name="sourceUrl" /></div>
        <div class="admin-form-group"><label>ID найденной записи (привязать к подборке)</label><input type="text" name="foundCarId" value="${esc(req.query.foundCarId || '')}" placeholder="опционально" /></div>
        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary">Создать автомобиль</button>
          <a href="/admin/automobiles" class="admin-btn admin-btn-secondary">Отмена</a>
        </div>
      </form>
    </div>
  `;
  const html = adminLayout('automobiles', topBar + formHtml, {});
  res.send(html.replace('</body>', `<script>
    document.querySelectorAll('.admin-nav-item').forEach(function(a) { if (a.getAttribute('href') === '/admin/automobiles') a.classList.add('active'); });
  </script></body>`));
});

// ——— GET /admin/found-cars ———
router.get('/admin/found-cars', requireManagerAuth, (req, res) => {
  const found = db.prepare(`
    SELECT fc.id, fc.source_url, fc.created_at, fc.car_id,
           sc.name AS criterion_name, cl.name AS client_name, p.name AS partner_name
    FROM criterion_found_cars fc
    JOIN search_criteria sc ON fc.search_criteria_id = sc.id
    JOIN clients cl ON sc.client_id = cl.id
    JOIN partners p ON cl.partner_id = p.id
    WHERE fc.car_id IS NULL AND (sc.deleted_at IS NULL OR sc.deleted_at = '')
    ORDER BY datetime(fc.created_at) DESC
    LIMIT 100
  `).all();

  let rows = '';
  found.forEach(f => {
    rows += (
      '<tr>' +
      `<td><a class="admin-link" href="${esc(f.source_url)}" target="_blank" rel="noopener">Источник</a></td>` +
      `<td>${esc(f.criterion_name || '—')}</td>` +
      `<td>${esc(f.client_name)}</td>` +
      `<td>${esc(f.partner_name)}</td>` +
      `<td>${esc(f.created_at)}</td>` +
      `<td><div class="admin-cell-actions">
        <a class="admin-btn admin-btn-primary" href="/admin/automobiles/new?foundCarId=${f.id}" style="padding:6px 12px;font-size:13px;text-decoration:none;">Добавить на платформу</a>
        <form method="post" action="/admin/found-cars/${f.id}/reject" style="display:inline;" onsubmit="return confirm('Отклонить запись?');">
          <button type="submit" class="admin-btn admin-btn-secondary" style="padding:6px 12px;font-size:13px;">Отклонить</button>
        </form>
      </div></td>` +
      '</tr>'
    );
  });

  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Найденные авто</h1>
        <p class="admin-subtitle">Автомобили, ожидающие добавления на платформу</p>
      </div>
    </div>
  `;

  const emptyState = !rows ? `
    <div class="admin-empty admin-card" style="margin-top:0;">
      <p class="admin-empty-title">Нет записей в очереди</p>
      <p>Здесь появятся автомобили, найденные по критериям и ещё не опубликованные.</p>
    </div>
  ` : '';

  const tableHtml = rows ? `
    <div class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Источник</th>
            <th>Подборка</th>
            <th>Клиент</th>
            <th>Партнёр</th>
            <th>Дата</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  ` : '';

  const content = topBar + (rows ? tableHtml : emptyState);
  const html = adminLayout('found-cars', content, {});
  res.send(html.replace('</body>', `<script>
    document.querySelectorAll('.admin-nav-item').forEach(function(a) { if (a.getAttribute('href') === '/admin/found-cars') a.classList.add('active'); });
  </script></body>`));
});

// ——— GET /admin/selections ———
router.get('/admin/selections', requireManagerAuth, (req, res) => {
  const qRaw = (req.query.q || '').trim();
  const q = qRaw.toLowerCase();
  const statusRaw = req.query.status || 'review';
  const status = ['review', 'active', 'deleted'].includes(statusRaw) ? statusRaw : 'review';
  const country = (req.query.country || '').trim();
  const sourceFilter = (req.query.source || '').trim();
  const clientFilter = (req.query.client || '').trim();
  const partnerFilter = (req.query.partner || '').trim();

  const rows = db
    .prepare(
      `SELECT sc.*, cl.name AS client_name, p.name AS partner_name, p.slug AS partner_slug
       FROM search_criteria sc
       JOIN clients cl ON sc.client_id = cl.id
       JOIN partners p ON cl.partner_id = p.id`
    )
    .all();

  let list = rows;
  if (status === 'deleted') {
    list = list.filter((r) => !!r.deleted_at);
  } else if (status === 'active') {
    // Активные (прошли модерацию): все, кто не в статусе review, включая отключённые для парсинга
    list = list.filter((r) => !r.deleted_at && (r.status || 'active') !== 'review');
  } else {
    // 'review' — к проверке
    list = list.filter((r) => !r.deleted_at && (r.status || 'active') === 'review');
  }
  if (country) {
    list = list.filter((r) => (r.country || '') === country);
  }
  const baseForFilters = list.slice();

  if (sourceFilter) {
    list = list.filter((r) => (r.source_site || '') === sourceFilter);
  }
  if (clientFilter) {
    list = list.filter((r) => (r.client_name || '') === clientFilter);
  }
  if (partnerFilter) {
    list = list.filter((r) => (r.partner_name || '') === partnerFilter);
  }
  if (q) {
    list = list.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const client = (r.client_name || '').toLowerCase();
      const partner = (r.partner_name || '').toLowerCase();
      const source = (r.source_site || '').toLowerCase();
      const url = (r.search_url || '').toLowerCase();
      const idStr = String(r.public_id || r.id);
      return (
        name.includes(q) ||
        client.includes(q) ||
        partner.includes(q) ||
        source.includes(q) ||
        url.includes(q) ||
        idStr.includes(q)
      );
    });
  }

  const countries = ['Korea', 'China', 'Europe'];
  const sourceOptions = Array.from(
    new Set(
      baseForFilters
        .map((r) => r.source_site || '')
        .filter((v) => v && v.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'));
  const clientOptions = Array.from(
    new Set(
      baseForFilters
        .map((r) => r.client_name || '')
        .filter((v) => v && v.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'));
  const partnerOptions = Array.from(
    new Set(
      baseForFilters
        .map((r) => r.partner_name || '')
        .filter((v) => v && v.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'));
  const statusTabs = [
    { key: 'review', label: 'К проверке' },
    { key: 'active', label: 'Активные' },
    { key: 'deleted', label: 'Удалённые' },
  ];

  const tabsHtml = `
    <nav class="admin-tabs" aria-label="Фильтр по статусу подборок">
      ${statusTabs
        .map((t) => {
          const href = '/admin/selections?status=' + t.key +
            (country ? '&country=' + encodeURIComponent(country) : '') +
            (qRaw ? '&q=' + encodeURIComponent(qRaw) : '') +
            (sourceFilter ? '&source=' + encodeURIComponent(sourceFilter) : '') +
            (clientFilter ? '&client=' + encodeURIComponent(clientFilter) : '') +
            (partnerFilter ? '&partner=' + encodeURIComponent(partnerFilter) : '');
          const cls = 'admin-tab' + (status === t.key ? ' admin-tab-active' : '');
          return '<a href=\"' + href + '\" class=\"' + cls + '\">' + t.label + '</a>';
        })
        .join('')}
    </nav>`;

  const searchHtml = `
    <form method="get" action="/admin/selections" style="margin-bottom:12px;">
      <input type="hidden" name="status" value="${status}" />
      ${country ? `<input type="hidden" name="country" value="${esc(country)}" />` : ''}
      ${sourceFilter ? `<input type="hidden" name="source" value="${esc(sourceFilter)}" />` : ''}
      ${clientFilter ? `<input type="hidden" name="client" value="${esc(clientFilter)}" />` : ''}
      ${partnerFilter ? `<input type="hidden" name="partner" value="${esc(partnerFilter)}" />` : ''}
      <input
        type="text"
        name="q"
        class="admin-search"
        id="admin-selections-search"
        style="width:100%;max-width:none;"
        placeholder="Поиск по названию, клиенту, партнёру, ID, источнику или ссылке"
        value="${esc(qRaw)}"
      />
    </form>`;

  const resetUrl =
    '/admin/selections?status=' + encodeURIComponent(status);

  const filtersHtml = `
    <form method="get" action="/admin/selections" id="admin-selections-filters" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px;">
      <input type="hidden" name="status" value="${status}" />
      ${qRaw ? `<input type="hidden" name="q" value="${esc(qRaw)}" />` : ''}
      <select name="country" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;">
        <option value="">Страна: все</option>
        ${countries
          .map(
            (c) =>
              `<option value="${c}" ${
                country === c ? 'selected' : ''
              }>${c}</option>`
          )
          .join('')}
      </select>
      <select name="source" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;min-width:160px;">
        <option value="">Источник: все</option>
        ${sourceOptions
          .map(
            (s) =>
              `<option value="${esc(s)}" ${
                sourceFilter === s ? 'selected' : ''
              }>${esc(s)}</option>`
          )
          .join('')}
      </select>
      <select name="client" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;min-width:160px;">
        <option value="">Клиент: все</option>
        ${clientOptions
          .map(
            (c) =>
              `<option value="${esc(c)}" ${
                clientFilter === c ? 'selected' : ''
              }>${esc(c)}</option>`
          )
          .join('')}
      </select>
      <select name="partner" style="padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;min-width:160px;">
        <option value="">Партнёр: все</option>
        ${partnerOptions
          .map(
            (p) =>
              `<option value="${esc(p)}" ${
                partnerFilter === p ? 'selected' : ''
              }>${esc(p)}</option>`
          )
          .join('')}
      </select>
      <button type="submit" class="admin-btn admin-btn-secondary admin-btn-small">Применить</button>
      <a href="${resetUrl}" class="admin-btn admin-btn-secondary admin-btn-small">Сбросить</a>
    </form>`;

  const redirectUrl = esc(req.originalUrl || '/admin/selections');

  let tableRows = '';
  if (list.length) {
    tableRows = list
      .map((r) => {
        const idDisplay = r.public_id != null ? r.public_id : r.id;
        const realId = r.public_id != null ? r.public_id : r.id;
        const currentStatus = r.status || 'active';
        const canToggleParsing = !r.deleted_at && currentStatus !== 'review';
        const parsingIsOn = currentStatus !== 'disabled';
        const parsingCell = canToggleParsing
          ? `<td style="width:80px;">
              <form method="post" action="/admin/selections/${r.id}/toggle-parsing" style="margin:0;display:flex;align-items:center;justify-content:center;">
                <input type="hidden" name="redirect" value="${redirectUrl}" />
                <input type="hidden" name="nextStatus" value="${parsingIsOn ? 'disabled' : 'active'}" />
                <button type="submit" class="admin-toggle${parsingIsOn ? ' admin-toggle-on' : ''}" title="${
                  parsingIsOn ? 'Остановить парсинг по подборке' : 'Включить парсинг по подборке'
                }" aria-label="${
                  parsingIsOn ? 'Остановить парсинг по подборке' : 'Включить парсинг по подборке'
                }">
                  <span class="admin-toggle-knob"></span>
                </button>
              </form>
            </td>`
          : '<td style="width:80px;"><span style="color:#9CA3AF;">—</span></td>';

        const rawSearchUrl = (r.search_url && String(r.search_url).trim()) || '';
        const hasSearchUrl = !!rawSearchUrl;
        let externalHref = rawSearchUrl;
        if (externalHref && !/^https?:\/\//i.test(externalHref)) {
          externalHref = 'https://' + externalHref;
        }
        const sourceLabel = r.source_site
          ? hasSearchUrl
            ? `<a href="${esc(externalHref)}" target="_blank" rel="noopener" class="admin-link">${esc(
                r.source_site
              )}</a>`
            : esc(r.source_site)
          : '<span style="color:#9CA3AF;">—</span>';

        const partnerSlug = r.partner_slug || '';
        const hasPublicSelectionUrl = partnerSlug && realId;
        const selectionPublicUrl = hasPublicSelectionUrl
          ? '/p/' + encodeURIComponent(partnerSlug) + '/selection/' + encodeURIComponent(String(realId))
          : null;
        const hasName = r.name && String(r.name).trim() !== '';
        const nameDisplay = hasName ? esc(r.name) : `Подборка ${esc(String(realId))}`;
        const nameCellContent = selectionPublicUrl
          ? `<a href="${selectionPublicUrl}" target="_blank" rel="noopener" class="admin-link">${nameDisplay}</a>`
          : nameDisplay;

        const partnerCellContent =
          partnerSlug && r.partner_name
            ? `<a href="/p/${encodeURIComponent(partnerSlug)}" target="_blank" rel="noopener" class="admin-link">${esc(
                r.partner_name
              )}</a>`
            : esc(r.partner_name || '');

        const actionsCell =
          !r.deleted_at
            ? `<td>
                <div class="admin-cell-actions">
                  <button type="button" class="admin-icon-btn admin-edit-selection" data-id="${r.id}" title="Редактировать подборку" aria-label="Редактировать подборку">
                    ✏️
                  </button>
                  <form method="post" action="/admin/selections/${r.id}/delete" style="display:inline;">
                    <input type="hidden" name="redirect" value="${redirectUrl}" />
                    <button type="submit" class="admin-icon-btn admin-icon-btn-danger" title="Удалить подборку" aria-label="Удалить подборку" onclick="return confirm('Удалить подборку?');">
                      🗑
                    </button>
                  </form>
                </div>
              </td>`
            : '<td><span style="color:#9CA3AF;">—</span></td>';

        return (
          '<tr>' +
          parsingCell +
          `<td class="admin-cell-mono" style="width:72px;white-space:nowrap;">${esc(String(idDisplay))}</td>` +
          `<td>${nameCellContent}</td>` +
          `<td>${esc(r.country || '')}</td>` +
          `<td>${sourceLabel}</td>` +
          `<td>${esc(r.client_name || '')}</td>` +
          `<td>${partnerCellContent}</td>` +
          actionsCell +
          '</tr>'
        );
      })
      .join('');
  }

  const tableHtml = list.length
    ? `
    <div class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:80px;">Парсинг</th>
            <th style="width:80px;">ID</th>
            <th>Название</th>
            <th>Страна</th>
            <th>Источник</th>
            <th>Клиент</th>
            <th>Партнёр</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`
    : `
    <div class="admin-empty admin-card" style="margin-top:0;">
      <p class="admin-empty-title">Подборок в этом разделе нет.</p>
      <p>Добавьте критерии в кабинетах партнёров или измените фильтры.</p>
    </div>`;

  const selectionEditModalHtml = `
    <div class="admin-modal-backdrop" id="admin-selection-modal" aria-hidden="true">
      <div class="admin-modal" role="dialog" aria-labelledby="admin-selection-modal-title">
        <div class="admin-modal-header">
          <h2 class="admin-modal-title" id="admin-selection-modal-title">Редактировать подборку</h2>
          <button type="button" class="admin-modal-close" id="admin-selection-modal-close" aria-label="Закрыть">&times;</button>
        </div>
        <div class="admin-modal-body">
          <form id="admin-selection-edit-form" method="post" action="">
            <input type="hidden" name="redirect" id="admin-selection-redirect" value="" />
            <div class="admin-form-section">
              <div class="admin-form-section-title">Основное</div>
              <div class="admin-form-group">
                <label>ID подборки</label>
                <div id="admin-selection-id" class="admin-cell-mono" style="font-size:13px;color:#64748b;"></div>
              </div>
              <div class="admin-form-group">
                <label>Название</label>
                <input type="text" name="name" id="admin-selection-name" placeholder="Например: Подборка кроссоверов из Кореи" />
                <p class="admin-form-hint">Если не заполнено — на сайте будет «Подборка &lt;ID&gt;».</p>
              </div>
              <div class="admin-form-group">
                <label>Страна</label>
                <select name="country" id="admin-selection-country" required>
                  ${countries
                    .map(
                      (c) =>
                        `<option value="${c}">${c}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div class="admin-form-group">
                <label>Источник (название площадки)</label>
                <input type="text" name="sourceSite" id="admin-selection-source" placeholder="@site.com" />
                <p class="admin-form-hint">Только имя площадки, без протокола. Например: korea_auto.com.</p>
              </div>
              <div class="admin-form-group">
                <label>Ссылка поиска (URL с фильтрами)</label>
                <input type="text" name="searchUrl" id="admin-selection-url" required placeholder="https://example.com/search?..." />
                <p class="admin-form-hint">Полная ссылка с выставленными фильтрами. Используется для парсинга.</p>
              </div>
              <div class="admin-form-group">
                <label>Статус</label>
                <select name="status" id="admin-selection-status">
                  <option value="review">К проверке</option>
                  <option value="active">Активна (парсинг включён)</option>
                  <option value="disabled">Отключена (парсинг выключен)</option>
                </select>
              </div>
            </div>
            <div class="admin-form-section">
              <div class="admin-form-section-title">Связи</div>
              <div class="admin-form-group">
                <label>Клиент</label>
                <div id="admin-selection-client" style="font-size:13px;color:#111827;"></div>
              </div>
              <div class="admin-form-group">
                <label>Партнёр</label>
                <div id="admin-selection-partner" style="font-size:13px;color:#111827;"></div>
              </div>
            </div>
            <div class="admin-form-actions">
              <button type="submit" class="admin-btn admin-btn-primary">Сохранить</button>
              <button type="button" class="admin-btn admin-btn-secondary" id="admin-selection-modal-cancel">Отмена</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Подборки</h1>
        <p class="admin-subtitle">Все критерии поиска по всем партнёрам и клиентам.</p>
      </div>
    </div>`;

  const content = topBar + tabsHtml + searchHtml + filtersHtml + tableHtml + selectionEditModalHtml;
  const html = adminLayout('selections', content, {});
  res.send(
    html.replace(
      '</body>',
      `<script>
        (function() {
          var searchInput = document.getElementById('admin-selections-search');
          var filtersForm = document.getElementById('admin-selections-filters');
          if (filtersForm) {
            var selects = filtersForm.querySelectorAll('select');
            for (var i = 0; i < selects.length; i++) {
              selects[i].addEventListener('change', function() {
                if (searchInput) {
                  var existingHidden = filtersForm.querySelector('input[name="q"]');
                  var val = searchInput.value.trim();
                  if (val) {
                    if (!existingHidden) {
                      existingHidden = document.createElement('input');
                      existingHidden.type = 'hidden';
                      existingHidden.name = 'q';
                      filtersForm.appendChild(existingHidden);
                    }
                    existingHidden.value = val;
                  } else if (existingHidden && existingHidden.parentNode) {
                    existingHidden.parentNode.removeChild(existingHidden);
                  }
                }
                filtersForm.submit();
              });
            }
          }
          if (searchInput && searchInput.form) {
            searchInput.addEventListener('keydown', function(e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                this.form.submit();
              }
            });
          }

          var selectionModal = document.getElementById('admin-selection-modal');
          var selectionForm = document.getElementById('admin-selection-edit-form');
          var selectionClose = document.getElementById('admin-selection-modal-close');
          var selectionCancel = document.getElementById('admin-selection-modal-cancel');
          var selectionIdEl = document.getElementById('admin-selection-id');
          var selectionClientEl = document.getElementById('admin-selection-client');
          var selectionPartnerEl = document.getElementById('admin-selection-partner');
          var selectionNameInput = document.getElementById('admin-selection-name');
          var selectionCountryInput = document.getElementById('admin-selection-country');
          var selectionSourceInput = document.getElementById('admin-selection-source');
          var selectionUrlInput = document.getElementById('admin-selection-url');
          var selectionStatusInput = document.getElementById('admin-selection-status');
          var selectionRedirectInput = document.getElementById('admin-selection-redirect');

          function openSelectionModal() {
            if (selectionModal) selectionModal.classList.add('open');
          }
          function closeSelectionModal() {
            if (selectionModal) selectionModal.classList.remove('open');
          }
          if (selectionClose) selectionClose.addEventListener('click', closeSelectionModal);
          if (selectionCancel) selectionCancel.addEventListener('click', closeSelectionModal);
          if (selectionModal) {
            selectionModal.addEventListener('click', function(e) {
              if (e.target === selectionModal) closeSelectionModal();
            });
          }

          document.querySelectorAll('.admin-edit-selection').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var id = btn.getAttribute('data-id');
              if (!id || !selectionForm) return;
              selectionForm.action = '/admin/selections/' + id;
              if (selectionRedirectInput) {
                selectionRedirectInput.value = location.pathname + location.search;
              }
              fetch('/admin/selections/' + id, { credentials: 'same-origin' })
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                  if (!data || !data.selection) return;
                  var s = data.selection;
                  if (selectionIdEl) selectionIdEl.textContent = s.public_id || s.id;
                  if (selectionNameInput) selectionNameInput.value = s.name || '';
                  if (selectionCountryInput && s.country) selectionCountryInput.value = s.country;
                  if (selectionSourceInput) selectionSourceInput.value = s.source_site || '';
                  if (selectionUrlInput) selectionUrlInput.value = s.search_url || '';
                  if (selectionStatusInput) selectionStatusInput.value = s.status || 'active';
                  if (selectionClientEl) selectionClientEl.textContent = data.clientName || '';
                  if (selectionPartnerEl) selectionPartnerEl.textContent = data.partnerName || '';
                  openSelectionModal();
                })
                .catch(function() {});
            });
          });

          document.querySelectorAll('.admin-nav-item').forEach(function(a) {
            if (a.getAttribute('href') === '/admin/selections') a.classList.add('active');
          });
        })();
      </script></body>`
    )
  );
});

// Включение / отключение парсинга по подборке (переключатель в таблице)
router.post('/admin/selections/:id/toggle-parsing', requireManagerAuth, (req, res) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    return res.redirect('/admin/selections');
  }
  const nextStatusRaw = (req.body && req.body.nextStatus) || '';
  const allowedStatuses = ['active', 'disabled'];
  const nextStatus = allowedStatuses.includes(nextStatusRaw) ? nextStatusRaw : 'active';
  db.prepare('UPDATE search_criteria SET status = ? WHERE id = ?').run(nextStatus, id);
  const redirect =
    (req.body && typeof req.body.redirect === 'string' && req.body.redirect.trim()) ||
    '/admin/selections';
  res.redirect(redirect);
});

// Удаление подборки из таблицы менеджера (мягкое удаление)
router.post('/admin/selections/:id/delete', requireManagerAuth, (req, res) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    return res.redirect('/admin/selections');
  }
  SearchCriteria.softDelete(id);
  const redirect =
    (req.body && typeof req.body.redirect === 'string' && req.body.redirect.trim()) ||
    '/admin/selections?status=deleted';
  res.redirect(redirect);
});

// Получить данные подборки для модального окна (JSON)
router.get('/admin/selections/:id', requireManagerAuth, (req, res) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const row = db
    .prepare(
      `SELECT sc.*, cl.name AS client_name, p.name AS partner_name
       FROM search_criteria sc
       JOIN clients cl ON sc.client_id = cl.id
       JOIN partners p ON cl.partner_id = p.id
       WHERE sc.id = ?`
    )
    .get(id);
  if (!row) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({
    selection: {
      id: row.id,
      public_id: row.public_id,
      name: row.name,
      country: row.country,
      source_site: row.source_site,
      search_url: row.search_url,
      status: row.status || 'active',
    },
    clientName: row.client_name || '',
    partnerName: row.partner_name || '',
  });
});

// Сохранение изменений подборки из модального окна
router.post('/admin/selections/:id', requireManagerAuth, (req, res) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    return res.redirect('/admin/selections');
  }

  const existing = SearchCriteria.findById(id);
  if (!existing) {
    return res.redirect('/admin/selections');
  }

  const countriesAllowed = ['Korea', 'China', 'Europe'];
  const name = (req.body.name || '').trim();
  const countryRaw = (req.body.country || '').trim();
  const country = countriesAllowed.includes(countryRaw) ? countryRaw : existing.country;
  const sourceSite = (req.body.sourceSite || '').trim();
  const searchUrlRaw = (req.body.searchUrl || '').trim();
  const statusRaw = (req.body.status || '').trim();
  const statusAllowed = ['review', 'active', 'disabled'];
  const status = statusAllowed.includes(statusRaw) ? statusRaw : existing.status || 'active';

  if (!searchUrlRaw) {
    const redirectBase =
      (req.body && typeof req.body.redirect === 'string' && req.body.redirect.trim()) ||
      '/admin/selections';
    const sep = redirectBase.indexOf('?') === -1 ? '?' : '&';
    return res.redirect(redirectBase + sep + 'error=' + encodeURIComponent('Укажите ссылку поиска'));
  }

  SearchCriteria.update(id, {
    name,
    country,
    sourceSite: sourceSite || null,
    searchUrl: searchUrlRaw,
    status,
  });

  const redirect =
    (req.body && typeof req.body.redirect === 'string' && req.body.redirect.trim()) ||
    '/admin/selections';
  res.redirect(redirect);
});

// ——— GET /admin/sources ———
router.get('/admin/sources', requireManagerAuth, (req, res) => {
  const all = CountrySource.findAll();
  const countries = ['Korea', 'China', 'Europe'];
  const byCountry = {};
  countries.forEach((c) => {
    byCountry[c] = [];
  });
  all.forEach((row) => {
    if (!byCountry[row.country]) byCountry[row.country] = [];
    byCountry[row.country].push(row);
  });

  const flash = {
    success: req.query.success || '',
    error: req.query.error || '',
  };

  const rowsHtml = countries
    .map((country) => {
      const list = byCountry[country] || [];
      const items =
        list.length === 0
          ? '<tr><td colspan="5" class="admin-empty" style="border-top:1px solid #f1f5f9;">Для этой страны источников пока нет.</td></tr>'
          : list
              .map((s) => {
                return `
          <tr>
            <td class="admin-cell-mono">${s.id}</td>
            <td>${esc(s.label)}</td>
            <td><code>${esc(s.code)}</code></td>
            <td>${s.url_template ? `<a href="${esc(s.url_template)}" target="_blank" rel="noopener" class="admin-link">Шаблон</a>` : '<span style="color:#94a3b8;">—</span>'}</td>
            <td>
              <form method="post" action="/admin/sources/${s.id}" class="admin-inline-form" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <input type="hidden" name="country" value="${country}" />
                <input type="text" name="label" value="${esc(s.label)}" placeholder="Название" style="width:160px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;" />
                <input type="text" name="code" value="${esc(s.code)}" placeholder="Код" style="width:120px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;" />
                <input type="text" name="urlTemplate" value="${esc(s.url_template || '')}" placeholder="https://..." style="width:200px;max-width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;" />
                <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#64748b;">
                  <input type="checkbox" name="isActive" value="1" ${s.is_active ? 'checked' : ''} />
                  Активен
                </label>
                <button type="submit" class="admin-btn admin-btn-secondary admin-btn-small">Сохранить</button>
                <button type="submit" name="delete" value="1" class="admin-btn admin-btn-danger admin-btn-small" onclick="return confirm('Удалить источник?');">Удалить</button>
              </form>
            </td>
          </tr>`;
              })
              .join('');
      return `
        <tbody>
          <tr>
            <th colspan="5" style="background:#f9fafb;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Страна: ${country}</th>
          </tr>
          ${items}
        </tbody>`;
    })
    .join('');

  const countryOptions = countries
    .map(
      (c) =>
        `<option value="${c}" ${req.query.country === c ? 'selected' : ''}>${c}</option>`
    )
    .join('');

  const topBar = `
    <div class="admin-top">
      <div>
        <h1 class="admin-title">Источники по странам</h1>
        <p class="admin-subtitle">Справочник площадок для критериев поиска и фильтров «Все авто».</p>
      </div>
    </div>
  `;

  const flashHtml = `
    ${flash.success ? `<div class="admin-flash success">${esc(flash.success)}</div>` : ''}
    ${flash.error ? `<div class="admin-flash error">${esc(flash.error)}</div>` : ''}
  `;

  const addFormHtml = `
    <div class="admin-card" style="padding:20px;margin-bottom:24px;">
      <form method="post" action="/admin/sources">
        <div class="admin-form-section">
          <h2 class="admin-form-section-title">Добавить источник</h2>
          <div class="admin-form-group">
            <label>Страна</label>
            <select name="country" required style="width:100%;max-width:260px;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;">
              <option value="">Выберите страну</option>
              ${countryOptions}
            </select>
          </div>
          <div class="admin-form-group">
            <label>Название источника (label для пригонщика)</label>
            <input type="text" name="label" required placeholder="Например: Korea @car.com" />
          </div>
          <div class="admin-form-group">
            <label>Код источника (внутренний ключ)</label>
            <input type="text" name="code" required placeholder="Например: korea_car_com" />
            <p class="admin-form-hint">Латиница/цифры/нижнее подчёркивание — для фильтров и интеграций.</p>
          </div>
          <div class="admin-form-group">
            <label>Шаблон URL (опционально)</label>
            <input type="text" name="urlTemplate" placeholder="https://example.com/search?..." />
            <p class="admin-form-hint">Необязательное поле — можно использовать как подсказку при создании критериев.</p>
          </div>
        </div>
        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary">Добавить источник</button>
        </div>
      </form>
    </div>
  `;

  const tableHtml = `
    <div class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Код</th>
            <th>Шаблон URL</th>
            <th>Настройки</th>
          </tr>
        </thead>
        ${rowsHtml}
      </table>
    </div>
  `;

  const content = topBar + flashHtml + addFormHtml + tableHtml;
  const html = adminLayout('sources', content, {});
  res.send(
    html.replace(
      '</body>',
      `<script>
        document.querySelectorAll('.admin-nav-item').forEach(function(a) {
          if (a.getAttribute('href') === '/admin/sources') a.classList.add('active');
        });
      </script></body>`
    )
  );
});

// ——— POST /admin/sources ———
router.post('/admin/sources', requireManagerAuth, (req, res) => {
  const { country, label, code, urlTemplate } = req.body || {};
  if (!country || !label || !code) {
    return res.redirect('/admin/sources?error=' + encodeURIComponent('Укажите страну, название и код источника.'));
  }
  try {
    CountrySource.create({
      country,
      label,
      code,
      urlTemplate: urlTemplate && urlTemplate.trim() ? urlTemplate.trim() : null,
      isActive: true,
    });
    return res.redirect('/admin/sources?success=' + encodeURIComponent('Источник добавлен.'));
  } catch (e) {
    return res.redirect('/admin/sources?error=' + encodeURIComponent('Не удалось добавить источник.'));
  }
});

// ——— POST /admin/sources/:id ———
router.post('/admin/sources/:id', requireManagerAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.redirect('/admin/sources?error=' + encodeURIComponent('Некорректный идентификатор.'));
  }
  const { country, label, code, urlTemplate, delete: deleteFlag, isActive } = req.body || {};
  try {
    if (deleteFlag) {
      CountrySource.delete(id);
      return res.redirect('/admin/sources?success=' + encodeURIComponent('Источник удалён.'));
    }
    CountrySource.update(id, {
      country,
      label,
      code,
      urlTemplate: urlTemplate && urlTemplate.trim() ? urlTemplate.trim() : null,
      isActive: !!isActive,
    });
    return res.redirect('/admin/sources?success=' + encodeURIComponent('Источник обновлён.'));
  } catch (e) {
    return res.redirect('/admin/sources?error=' + encodeURIComponent('Не удалось сохранить изменения.'));
  }
});

// ——— POST /admin/found-cars/:id/reject ———
router.post('/admin/found-cars/:id/reject', requireManagerAuth, (req, res) => {
  const id = Number(req.params.id);
  if (Number.isInteger(id) && id > 0) {
    const row = CriterionFoundCar.findById(id);
    if (row && !row.car_id) {
      db.prepare('DELETE FROM criterion_found_cars WHERE id = ?').run(id);
    }
  }
  res.redirect('/admin/found-cars');
});

module.exports = router;
