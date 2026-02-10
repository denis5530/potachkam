const { db, generatePublicId } = require('../storage/db');

class Car {
  static table = 'cars';

  static create({
    clientId,
    title,
    description = null,
    price = null,
    imagesJson = null,
    sourceUrl = null,
    status = 'active',
  }) {
    const publicId = generatePublicId('cars', 3);
    const stmt = db.prepare(
      `INSERT INTO ${this.table} (client_id, title, description, price, images_json, source_url, public_id, status)
       VALUES (@client_id, @title, @description, @price, @images_json, @source_url, @public_id, @status)`
    );
    const info = stmt.run({
      client_id: clientId,
      title,
      description,
      price,
      images_json: imagesJson,
      source_url: sourceUrl,
      public_id: publicId,
      status,
    });
    return this.findById(info.lastInsertRowid);
  }

  static findById(id) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE id = ?`)
      .get(id);
  }

  /** Найти машину по публичному id (для URL /p/:slug/cars/:carId) */
  static findByPublicId(publicId) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE public_id = ?`)
      .get(publicId);
  }

  static findByClient(clientId) {
    return db
      .prepare(
        `SELECT * FROM ${this.table}
         WHERE client_id = ?
         ORDER BY datetime(created_at) DESC`
      )
      .all(clientId);
  }

  /** Машины, привязанные к подборке (критерию) через criterion_found_cars */
  static findByCriterionId(criteriaId) {
    return db
      .prepare(
        `SELECT c.* FROM ${this.table} c
         INNER JOIN criterion_found_cars fc ON fc.car_id = c.id
         WHERE fc.search_criteria_id = ?
         ORDER BY datetime(c.created_at) DESC`
      )
      .all(criteriaId);
  }

  static update(id, { title, description, price, imagesJson, sourceUrl }) {
    const row = this.findById(id);
    if (!row) return null;
    const updates = [];
    const values = [];
    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (price !== undefined) { updates.push('price = ?'); values.push(price); }
    if (imagesJson !== undefined) { updates.push('images_json = ?'); values.push(imagesJson); }
    if (sourceUrl !== undefined) { updates.push('source_url = ?'); values.push(sourceUrl); }
    if (Object.prototype.hasOwnProperty.call(arguments[1], 'status')) {
      updates.push('status = ?');
      values.push(arguments[1].status);
    }
    if (updates.length === 0) return row;
    values.push(id);
    db.prepare(`UPDATE ${this.table} SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  static deleteById(id) {
    return db
      .prepare(`DELETE FROM ${this.table} WHERE id = ?`)
      .run(id);
  }
}

module.exports = Car;

