const { db } = require('../storage/db');
const Car = require('./Car');

const TABLE = 'criterion_found_cars';

const STATUS_PUBLISHED = 'published';
const STATUS_MODERATION = 'moderation';
const STATUS_DELETED = 'deleted';

class CriterionFoundCar {
  static create({ searchCriteriaId, sourceUrl, carId = null, status = STATUS_PUBLISHED }) {
    const stmt = db.prepare(
      `INSERT INTO ${TABLE} (search_criteria_id, source_url, car_id, status)
       VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(searchCriteriaId, sourceUrl || null, carId, status);
    return this.findById(info.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
  }

  static findByCriterion(searchCriteriaId) {
    return db
      .prepare(
        `SELECT * FROM ${TABLE} WHERE search_criteria_id = ? ORDER BY id ASC`
      )
      .all(searchCriteriaId);
  }

  static updateCarId(id, carId) {
    db.prepare(`UPDATE ${TABLE} SET car_id = ? WHERE id = ?`).run(carId, id);
    return this.findById(id);
  }

  static updateSearchCriteriaId(id, searchCriteriaId) {
    db.prepare(`UPDATE ${TABLE} SET search_criteria_id = ? WHERE id = ?`).run(searchCriteriaId, id);
    return this.findById(id);
  }

  static findByCarId(carId) {
    return db.prepare(`SELECT * FROM ${TABLE} WHERE car_id = ?`).get(carId);
  }

  /** Все найденные авто по всем подборкам партнёра (с именами клиента и подборки) */
  static findByPartnerId(partnerId) {
    return db
      .prepare(
        `SELECT fc.*, sc.client_id, sc.name AS criterion_name, c.name AS client_name
         FROM ${TABLE} fc
         INNER JOIN search_criteria sc ON sc.id = fc.search_criteria_id
         INNER JOIN clients c ON c.id = sc.client_id
         WHERE c.partner_id = ?
         ORDER BY fc.id DESC`
      )
      .all(partnerId);
  }

  /** Мягкое удаление: перевести в статус deleted */
  static softDelete(id) {
    const row = this.findById(id);
    if (!row) return;
    db.prepare(`UPDATE ${TABLE} SET status = ? WHERE id = ?`).run(STATUS_DELETED, id);
    return this.findById(id);
  }

  /** Удалить запись навсегда (из вкладки «Удалённые»); если привязана машина — удалить и её */
  static permanentDelete(id) {
    const row = this.findById(id);
    if (!row) return;
    if (row.car_id) {
      Car.deleteById(row.car_id);
    }
    db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(id);
  }

  /** Удалить запись; если привязана машина — удалить и её с платформы (жёсткое удаление) */
  static deleteById(id) {
    const row = this.findById(id);
    if (!row) return;
    if (row.car_id) {
      Car.deleteById(row.car_id);
    }
    db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(id);
  }
}

CriterionFoundCar.STATUS_PUBLISHED = STATUS_PUBLISHED;
CriterionFoundCar.STATUS_MODERATION = STATUS_MODERATION;
CriterionFoundCar.STATUS_DELETED = STATUS_DELETED;

module.exports = CriterionFoundCar;
