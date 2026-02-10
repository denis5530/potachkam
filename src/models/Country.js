const { db } = require('../storage/db');

class Country {
  static table = 'countries';

  static create({ name }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO ${this.table} (name) VALUES (?)`
    );
    stmt.run(trimmed);
    return this.findByName(trimmed);
  }

  static findAll() {
    return db
      .prepare(
        `SELECT * FROM ${this.table}
         ORDER BY id ASC`
      )
      .all();
  }

  static findById(id) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE id = ?`)
      .get(id);
  }

  static findByName(name) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE name = ?`)
      .get(name);
  }

  static update(id, { name }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    db.prepare(
      `UPDATE ${this.table}
       SET name = ?
       WHERE id = ?`
    ).run(trimmed, id);
    return this.findById(id);
  }

  static delete(id) {
    db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
}

module.exports = Country;

