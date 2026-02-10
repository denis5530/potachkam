#!/usr/bin/env node
// Перенести привязку машины carId на критерий №criterionNum у клиента clientId
// Запуск: node scripts/move-car-to-criterion.js

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { initSchema } = require('../src/storage/db');
const Car = require('../src/models/Car');
const SearchCriteria = require('../src/models/SearchCriteria');
const CriterionFoundCar = require('../src/models/CriterionFoundCar');

initSchema();

const clientId = 1;
const carId = 2;
const criterionNum = 1;

const criteria = SearchCriteria.findByClientActive(clientId);
const criteriaOrdered = [...criteria].reverse();
const criterion = criteriaOrdered[criterionNum - 1];
if (!criterion) {
  console.error('Критерий №' + criterionNum + ' у клиента ' + clientId + ' не найден.');
  process.exit(1);
}

const car = Car.findById(carId);
if (!car || car.client_id !== clientId) {
  console.error('Машина ' + carId + ' не найдена или не принадлежит клиенту ' + clientId);
  process.exit(1);
}

const foundCar = CriterionFoundCar.findByCarId(carId);
if (!foundCar) {
  console.error('Машина ' + carId + ' не привязана ни к одному критерию.');
  process.exit(1);
}

CriterionFoundCar.updateSearchCriteriaId(foundCar.id, criterion.id);
console.log('Готово: машина', carId, 'теперь у критерия №' + criterionNum, '(id критерия:', criterion.id + ')');
