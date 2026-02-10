const { db, generatePublicId } = require('../storage/db');

class Partner {
  static table = 'partners';

  static create({
    name,
    slug,
    contactsJson = null,
    logoUrl = null,
    tagline = null,
    coverUrl = null,
    coverMobileUrl = null,
    logoPosition = null,
    logoCropJson = null,
    coverCropJson = null,
    coverMobileCropJson = null,
    status = 'active',
  }) {
    const publicId = generatePublicId('partners', 4);
    const stmt = db.prepare(
      `INSERT INTO ${this.table} (name, slug, contacts_json, logo_url, tagline, cover_url, cover_mobile_url, logo_position, logo_crop_json, cover_crop_json, cover_mobile_crop_json, status, public_id)
       VALUES (@name, @slug, @contacts_json, @logo_url, @tagline, @cover_url, @cover_mobile_url, @logo_position, @logo_crop_json, @cover_crop_json, @cover_mobile_crop_json, @status, @public_id)`
    );
    const info = stmt.run({
      name,
      slug,
      contacts_json: contactsJson,
      logo_url: logoUrl,
      tagline: tagline || null,
      cover_url: coverUrl || null,
      cover_mobile_url: coverMobileUrl || null,
      logo_position: logoPosition || null,
      logo_crop_json: logoCropJson || null,
      cover_crop_json: coverCropJson || null,
      cover_mobile_crop_json: coverMobileCropJson || null,
      status: status || 'active',
      public_id: publicId,
    });
    return this.findById(info.lastInsertRowid);
  }

  static update(
    id,
    {
      name,
      slug,
      contactsJson,
      tagline,
      coverUrl,
      coverMobileUrl,
      logoPosition,
      logoCropJson,
      coverCropJson,
      coverMobileCropJson,
      status,
    }
  ) {
    const row = this.findById(id);
    if (!row) return null;
    const nameVal = name !== undefined ? name : row.name;
    const slugVal = slug !== undefined ? slug : row.slug;
    const contactsVal = contactsJson !== undefined ? contactsJson : row.contacts_json;
    const taglineVal = tagline !== undefined ? tagline : row.tagline;
    const coverVal = coverUrl !== undefined ? coverUrl : row.cover_url;
    const coverMobileVal = coverMobileUrl !== undefined ? coverMobileUrl : row.cover_mobile_url;
    const logoPosVal = logoPosition !== undefined ? logoPosition : row.logo_position;
    const logoCropVal = logoCropJson !== undefined ? logoCropJson : row.logo_crop_json;
    const coverCropVal = coverCropJson !== undefined ? coverCropJson : row.cover_crop_json;
    const coverMobileCropVal = coverMobileCropJson !== undefined ? coverMobileCropJson : row.cover_mobile_crop_json;
    const statusVal = status !== undefined ? status : (row.status || 'active');
    db.prepare(
      `UPDATE ${this.table} SET name = ?, slug = ?, contacts_json = ?, tagline = ?, cover_url = ?, cover_mobile_url = ?, logo_position = ?, logo_crop_json = ?, cover_crop_json = ?, cover_mobile_crop_json = ?, status = ? WHERE id = ?`
    ).run(nameVal, slugVal, contactsVal, taglineVal, coverVal, coverMobileVal, logoPosVal, logoCropVal, coverCropVal, coverMobileCropVal, statusVal, id);
    return this.findById(id);
  }

  static updateLogo(id, logoUrl) {
    db.prepare(`UPDATE ${this.table} SET logo_url = ? WHERE id = ?`).run(logoUrl, id);
    return this.findById(id);
  }

  static updateCover(id, coverUrl) {
    db.prepare(`UPDATE ${this.table} SET cover_url = ? WHERE id = ?`).run(coverUrl, id);
    return this.findById(id);
  }

  static clearLogo(id) {
    db.prepare(`UPDATE ${this.table} SET logo_url = NULL, logo_crop_json = NULL WHERE id = ?`).run(id);
    return this.findById(id);
  }

  static clearCover(id) {
    db.prepare(`UPDATE ${this.table} SET cover_url = NULL, cover_crop_json = NULL WHERE id = ?`).run(id);
    return this.findById(id);
  }

  static updateCoverMobile(id, coverMobileUrl) {
    db.prepare(`UPDATE ${this.table} SET cover_mobile_url = ? WHERE id = ?`).run(coverMobileUrl, id);
    return this.findById(id);
  }

  static clearCoverMobile(id) {
    db.prepare(`UPDATE ${this.table} SET cover_mobile_url = NULL, cover_mobile_crop_json = NULL WHERE id = ?`).run(id);
    return this.findById(id);
  }

  static findById(id) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE id = ?`)
      .get(id);
  }

  static findBySlug(slug) {
    return db
      .prepare(`SELECT * FROM ${this.table} WHERE slug = ?`)
      .get(slug);
  }

  static all() {
    return db.prepare(`SELECT * FROM ${this.table} ORDER BY id DESC`).all();
  }
}

module.exports = Partner;

