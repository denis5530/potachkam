const { db } = require('../storage/db');

class CountrySource {
  static table = 'country_sources';

  static create({ country, code, label, urlTemplate = null, isActive = true }) {
    const stmt = db.prepare(
      `INSERT INTO ${this.table} (country, code, label, url_template, is_active)
       VALUES (@country, @code, @label, @url_template, @is_active)`
    );
    const info = stmt.run({
      country,
      code: String(code || '').trim(),
      label: String(label || '').trim(),
      url_template: urlTemplate || null,
      is_active: isActive ? 1 : 0,
    });
    return this.findById(info.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  static findAll() {
    return db
      .prepare(
        `SELECT * FROM ${this.table}
         ORDER BY country, label, id`
      )
      .all();
  }

  static findActiveByCountry(country) {
    return db
      .prepare(
        `SELECT * FROM ${this.table}
         WHERE country = ? AND is_active = 1
         ORDER BY label, id`
      )
      .all(country);
  }

  static update(id, { country, code, label, urlTemplate, isActive }) {
    const row = this.findById(id);
    if (!row) return null;
    const newCountry = country !== undefined ? country : row.country;
    const newCode = code !== undefined ? String(code || '').trim() : row.code;
    const newLabel = label !== undefined ? String(label || '').trim() : row.label;
    const newUrlTemplate =
      urlTemplate !== undefined ? (urlTemplate ? String(urlTemplate) : null) : row.url_template;
    const newIsActive =
      isActive !== undefined ? (isActive ? 1 : 0) : row.is_active;

    db.prepare(
      `UPDATE ${this.table}
       SET country = ?, code = ?, label = ?, url_template = ?, is_active = ?
       WHERE id = ?`
    ).run(newCountry, newCode, newLabel, newUrlTemplate, newIsActive, id);
    return this.findById(id);
  }

  static delete(id) {
    db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
}

module.exports = CountrySource;

