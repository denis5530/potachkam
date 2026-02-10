#!/usr/bin/env node
// Одноразовый скрипт: связать машину carId с критерием №criterionNum у клиента clientId
// Запуск: node scripts/link-car-to-criterion.js

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { initSchema } = require('../src/storage/db');
const Car = require('../src/models/Car');
const SearchCriteria = require('../src/models/SearchCriteria');
const CriterionFoundCar = require('../src/models/CriterionFoundCar');

initSchema();

const clientId = 1;
const carId = 2;
const criterionNum = 2; // №2 в списке активных критериев (второй по счёту)

const criteria = SearchCriteria.findByClientActive(clientId);
const criterion = criteria[criterionNum - 1]; // №1 = index 0, №2 = index 1
if (!criterion) {
  console.error('Критерий №' + criterionNum + ' у клиента ' + clientId + ' не найден. Всего критериев:', criteria.length);
  process.exit(1);
}

const car = Car.findById(carId);
if (!car) {
  console.error('Машина с id ' + carId + ' не найдена.');
  process.exit(1);
}
if (car.client_id !== clientId) {
  console.error('Машина ' + carId + ' принадлежит клиенту ' + car.client_id + ', а не ' + clientId);
  process.exit(1);
}

const sourceUrl = car.source_url && String(car.source_url).trim() ? car.source_url : 'https://';
CriterionFoundCar.create({
  searchCriteriaId: criterion.id,
  sourceUrl,
  carId,
});

console.log('Готово: машина', carId, 'связана с критерием №' + criterionNum, '(id критерия:', criterion.id + ')');
