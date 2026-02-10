const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'autoplatform.sqlite');

// Убедимся, что каталог для БД существует
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Открываем соединение с SQLite (синхронный драйвер для простоты MVP)
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

function initSchema() {
  // Partner
  db.prepare(`
    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      contacts_json TEXT,
      logo_url TEXT
    );
  `).run();
  try {
    const pInfo = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfo.some((col) => col.name === 'logo_url')) {
      db.prepare('ALTER TABLE partners ADD COLUMN logo_url TEXT').run();
    }
  } catch (e) {}
  // status партнёра: active | disabled (для управления доступом и фильтров в админке)
  try {
    const pInfoStatus = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfoStatus.some((col) => col.name === 'status')) {
      db.prepare(
        "ALTER TABLE partners ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"
      ).run();
    }
  } catch (e) {}
  // public_id для партнёров — большой случайный ID (как у клиентов, машин, подборок)
  try {
    const pInfo2 = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfo2.some((col) => col.name === 'public_id')) {
      db.prepare('ALTER TABLE partners ADD COLUMN public_id INTEGER').run();
      const rows = db.prepare('SELECT id FROM partners').all();
      for (const row of rows) {
        let pid;
        do {
          pid = 400000000000 + Math.floor(Math.random() * 100000000000);
        } while (db.prepare('SELECT 1 FROM partners WHERE public_id = ?').get(pid));
        db.prepare('UPDATE partners SET public_id = ? WHERE id = ?').run(pid, row.id);
      }
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_public_id ON partners(public_id)').run();
    }
  } catch (e) {}
  // tagline и cover_url для партнёров (слоган и обложка)
  try {
    const pInfo3 = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfo3.some((col) => col.name === 'tagline')) {
      db.prepare('ALTER TABLE partners ADD COLUMN tagline TEXT').run();
    }
    if (!pInfo3.some((col) => col.name === 'cover_url')) {
      db.prepare('ALTER TABLE partners ADD COLUMN cover_url TEXT').run();
    }
  } catch (e) {}
  // logo_position — зона отображения логотипа (object-position: center center, top center, и т.д.)
  try {
    const pInfo4 = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfo4.some((col) => col.name === 'logo_position')) {
      db.prepare('ALTER TABLE partners ADD COLUMN logo_position TEXT').run();
    }
  } catch (e) {}
  // logo_crop_json — зона в круге: { "x": 50, "y": 50, "zoom": 1 } (центр в %, масштаб)
  try {
    const pInfo5 = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfo5.some((col) => col.name === 'logo_crop_json')) {
      db.prepare('ALTER TABLE partners ADD COLUMN logo_crop_json TEXT').run();
    }
  } catch (e) {}
  // cover_crop_json — зона обложки: { "x": 50, "y": 50, "zoom": 1 }
  try {
    const pInfo6 = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfo6.some((col) => col.name === 'cover_crop_json')) {
      db.prepare('ALTER TABLE partners ADD COLUMN cover_crop_json TEXT').run();
    }
  } catch (e) {}
  // cover_mobile_url, cover_mobile_crop_json — обложка и зона кадрирования для мобильной версии
  try {
    const pInfo7 = db.prepare('PRAGMA table_info(partners)').all();
    if (!pInfo7.some((col) => col.name === 'cover_mobile_url')) {
      db.prepare('ALTER TABLE partners ADD COLUMN cover_mobile_url TEXT').run();
    }
    if (!pInfo7.some((col) => col.name === 'cover_mobile_crop_json')) {
      db.prepare('ALTER TABLE partners ADD COLUMN cover_mobile_crop_json TEXT').run();
    }
  } catch (e) {}

  // Client
  db.prepare(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      selection_name TEXT,
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );
  `).run();
  // Миграция: добавить selection_name в существующую таблицу (если колонки ещё нет)
  try {
    const info = db.prepare('PRAGMA table_info(clients)').all();
    if (!info.some((col) => col.name === 'selection_name')) {
      db.prepare('ALTER TABLE clients ADD COLUMN selection_name TEXT').run();
    }
    if (!info.some((col) => col.name === 'notes')) {
      db.prepare('ALTER TABLE clients ADD COLUMN notes TEXT').run();
    }
  } catch (e) {
    // игнорируем
  }
  // public_id для клиентов — большой случайный ID в URL, чтобы нельзя было подобрать страницу
  try {
    const cInfo = db.prepare('PRAGMA table_info(clients)').all();
    if (!cInfo.some((col) => col.name === 'public_id')) {
      db.prepare('ALTER TABLE clients ADD COLUMN public_id INTEGER').run();
      const rows = db.prepare('SELECT id FROM clients').all();
      for (const row of rows) {
        let pid;
        do {
          pid = 100000000000 + Math.floor(Math.random() * 900000000000);
        } while (db.prepare('SELECT 1 FROM clients WHERE public_id = ?').get(pid));
        db.prepare('UPDATE clients SET public_id = ? WHERE id = ?').run(pid, row.id);
      }
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_public_id ON clients(public_id)').run();
    }
  } catch (e) {}

  // SearchCriteria
  db.prepare(`
    CREATE TABLE IF NOT EXISTS search_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT,
      country TEXT NOT NULL CHECK (country IN ('Korea', 'China', 'Europe')),
      source_site TEXT,
      search_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
  `).run();
  try {
    const scInfo = db.prepare('PRAGMA table_info(search_criteria)').all();
    if (!scInfo.some((col) => col.name === 'name')) {
      db.prepare('ALTER TABLE search_criteria ADD COLUMN name TEXT').run();
    }
    if (!scInfo.some((col) => col.name === 'deleted_at')) {
      db.prepare('ALTER TABLE search_criteria ADD COLUMN deleted_at TEXT').run();
    }
    if (!scInfo.some((col) => col.name === 'status')) {
      db.prepare('ALTER TABLE search_criteria ADD COLUMN status TEXT NOT NULL DEFAULT \'active\'').run();
      db.prepare('UPDATE search_criteria SET status = \'active\' WHERE status IS NULL OR status = \'\'').run();
    }
  } catch (e) {}

  // Справочник источников по странам (для настройки в админке менеджера)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS country_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL CHECK (country IN ('Korea', 'China', 'Europe')),
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      url_template TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `).run();
  try {
    const csInfo = db.prepare('PRAGMA table_info(country_sources)').all();
    if (!csInfo.some((col) => col.name === 'url_template')) {
      db.prepare('ALTER TABLE country_sources ADD COLUMN url_template TEXT').run();
    }
    if (!csInfo.some((col) => col.name === 'is_active')) {
      db.prepare('ALTER TABLE country_sources ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1').run();
    }
  } catch (e) {}
  // public_id для подборок (search_criteria)
  try {
    const scInfo2 = db.prepare('PRAGMA table_info(search_criteria)').all();
    if (!scInfo2.some((col) => col.name === 'public_id')) {
      db.prepare('ALTER TABLE search_criteria ADD COLUMN public_id INTEGER').run();
      const rows = db.prepare('SELECT id FROM search_criteria').all();
      for (const row of rows) {
        let pid;
        do {
          pid = 200000000000 + Math.floor(Math.random() * 800000000000);
        } while (db.prepare('SELECT 1 FROM search_criteria WHERE public_id = ?').get(pid));
        db.prepare('UPDATE search_criteria SET public_id = ? WHERE id = ?').run(pid, row.id);
      }
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_search_criteria_public_id ON search_criteria(public_id)').run();
    }
  } catch (e) {}

  // Найденные по критерию (источник + опционально машина на платформе)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS criterion_found_cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_criteria_id INTEGER NOT NULL,
      source_url TEXT NOT NULL,
      car_id INTEGER NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (search_criteria_id) REFERENCES search_criteria(id) ON DELETE CASCADE,
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL
    );
  `).run();
  // status: published | moderation | deleted (для вкладок и мягкого удаления)
  try {
    const fcInfo = db.prepare('PRAGMA table_info(criterion_found_cars)').all();
    if (!fcInfo.some((col) => col.name === 'status')) {
      db.prepare('ALTER TABLE criterion_found_cars ADD COLUMN status TEXT NOT NULL DEFAULT ?').run('published');
    }
  } catch (e) {}

  // Car
  db.prepare(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      price INTEGER,
      images_json TEXT,
      source_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
  `).run();
  // public_id и status для машин (cars)
  try {
    const carInfo = db.prepare('PRAGMA table_info(cars)').all();
    if (!carInfo.some((col) => col.name === 'public_id')) {
      db.prepare('ALTER TABLE cars ADD COLUMN public_id INTEGER').run();
      const rows = db.prepare('SELECT id FROM cars').all();
      for (const row of rows) {
        let pid;
        do {
          pid = 300000000000 + Math.floor(Math.random() * 700000000000);
        } while (db.prepare('SELECT 1 FROM cars WHERE public_id = ?').get(pid));
        db.prepare('UPDATE cars SET public_id = ? WHERE id = ?').run(pid, row.id);
      }
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_public_id ON cars(public_id)').run();
    }
    if (!carInfo.some((col) => col.name === 'status')) {
      db.prepare("ALTER TABLE cars ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").run();
      db.prepare("UPDATE cars SET status = 'active' WHERE status IS NULL OR status = ''").run();
    }
  } catch (e) {}

  // Partner credentials (логин/пароль для входа партнёра в кабинет)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS partner_credentials (
      partner_id INTEGER PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );
  `).run();
}

/** Генерирует уникальный 12-значный public_id для таблицы (для использования в публичных URL) */
function generatePublicId(table, prefixDigit) {
  const min = prefixDigit * 100000000000;
  const max = min + 900000000000 - 1;
  for (let i = 0; i < 50; i++) {
    const pid = min + Math.floor(Math.random() * 900000000000);
    if (pid > max) continue;
    const exists = db.prepare(`SELECT 1 FROM ${table} WHERE public_id = ?`).get(pid);
    if (!exists) return pid;
  }
  throw new Error(`Не удалось сгенерировать уникальный public_id для ${table}`);
}

module.exports = {
  db,
  initSchema,
  generatePublicId,
};

