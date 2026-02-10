const { db, generatePublicId } = require('../storage/db');

class SearchCriteria {
  static table = 'search_criteria';

  static create({ clientId, name = null, country, sourceSite = null, searchUrl, status = 'review' }) {
    const publicId = generatePublicId('search_criteria', 2);
    const stmt = db.prepare(
      `INSERT INTO ${this.table} (client_id, name, country, source_site, search_url, status, public_id)
       VALUES (@client_id, @name, @country, @source_site, @search_url, @status, @public_id)`
    );
    const info = stmt.run({
      client_id: clientId,
      name: name == null || name === '' ? null : String(name).trim(),
      country,
      source_site: sourceSite,
      search_url: searchUrl,
      status,
      public_id: publicId,
    });
    return this.findById(info.lastInsertRowid);
  }

  static findById(id) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE id = ?`)
      .get(id);
  }

  /** Найти подборку по публичному id (для URL /p/:slug/selection/:criteriaId) */
  static findByPublicId(publicId) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE public_id = ?`)
      .get(publicId);
  }

  static findByClient(clientId) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE client_id = ? AND deleted_at IS NULL ORDER BY id DESC`)
      .all(clientId);
  }

  static findByClientActive(clientId) {
    return this.findByClient(clientId);
  }

  static findByClientDeleted(clientId) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE client_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`)
      .all(clientId);
  }

  /** Все подборки (активные и удалённые) по всем клиентам партнёра */
  static findByPartnerId(partnerId) {
    return db
      .prepare(
        `SELECT sc.* FROM ${this.table} sc
         INNER JOIN clients c ON c.id = sc.client_id
         WHERE c.partner_id = ?
         ORDER BY sc.deleted_at IS NULL DESC, sc.id DESC`
      )
      .all(partnerId);
  }

  static softDelete(id) {
    db.prepare(`UPDATE ${this.table} SET deleted_at = datetime('now') WHERE id = ?`).run(id);
    return this.findById(id);
  }

  static restore(id) {
    db.prepare(`UPDATE ${this.table} SET deleted_at = NULL WHERE id = ?`).run(id);
    return this.findById(id);
  }

  static permanentDelete(id) {
    db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }

  static update(id, { name, country, sourceSite, searchUrl, status }) {
    const stmt = db.prepare(
      `UPDATE ${this.table} SET name = ?, country = ?, source_site = ?, search_url = ?, status = COALESCE(?, status) WHERE id = ?`
    );
    stmt.run(
      name == null || name === '' ? null : String(name).trim(),
      country,
      sourceSite == null || sourceSite === '' ? null : String(sourceSite).trim(),
      String(searchUrl).trim(),
      status != null && status !== '' ? String(status).trim() : null,
      id
    );
    return this.findById(id);
  }
}

module.exports = SearchCriteria;

