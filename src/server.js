const express = require('express');
const path = require('path');
const { db, initSchema } = require('./storage/db');
const clientRoutes = require('./routes/clients');
const adminRoutes = require('./routes/admin');
const partnerRoutes = require('./routes/partners');
const searchCriteriaRoutes = require('./routes/searchCriteria');
const carRoutes = require('./routes/cars');
const publicRoutes = require('./routes/public');
const partnerPortalRoutes = require('./routes/partnerPortal');

async function bootstrap() {
  // Инициализация схемы БД (создание таблиц, если их ещё нет)
  initSchema();

  const app = express();
  // Парсинг JSON и form-urlencoded (для HTML-форм в админке)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Статика: логотип и прочие публичные ресурсы
  app.use('/public', express.static(path.join(__dirname, '..', 'public')));
  // Статика для загруженных файлов (фото машин)
  app.use(
    '/uploads',
    express.static(path.join(__dirname, '..', 'uploads'))
  );

  // Публичные страницы и главная
  app.use(publicRoutes);

  // Кабинет партнёра (логин + управление клиентами и критериями)
  app.use(partnerPortalRoutes);

  // Роуты клиентов
  app.use(clientRoutes);

  // Админ-панель (до партнёров, чтобы GET /admin/partners отдавала новый UI)
  app.use(adminRoutes);
  // Роуты партнёров (POST /admin/partners, GET /admin/partners/:id/edit, POST /admin/cars и т.д.)
  app.use(partnerRoutes);

  // Роуты критериев поиска
  app.use(searchCriteriaRoutes);

  // Роуты машин
  app.use(carRoutes);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}

bootstrap();
