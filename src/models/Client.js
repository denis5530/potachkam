// src/models/Client.js
const { db, generatePublicId } = require('../storage/db');

// Таблица: clients (id, partner_id, name, selection_name, notes, public_id)

function mapRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    publicId: row.public_id,
    partnerId: row.partner_id,
    name: row.name,
    selectionName: row.selection_name || null,
    notes: row.notes || null,
  };
}

const Client = {
  /**
   * Создать клиента (генерируется большой public_id для публичных URL)
   */
  create(data) {
    const publicId = generatePublicId('clients', 1);
    const notes = data.notes == null || data.notes === '' ? null : String(data.notes).trim();
    const stmt = db.prepare(
      `INSERT INTO clients (partner_id, name, notes, public_id) VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(data.partnerId, data.name, notes, publicId);
    return mapRow(db.prepare('SELECT id, partner_id, name, selection_name, notes, public_id FROM clients WHERE id = ?').get(info.lastInsertRowid));
  },

  /**
   * Найти клиента по внутреннему id
   */
  findById(id) {
    const stmt = db.prepare(
      `SELECT id, partner_id, name, selection_name, notes, public_id FROM clients WHERE id = ?`
    );
    const row = stmt.get(id);
    return mapRow(row);
  },

  /**
   * Найти клиента по публичному id (для URL /p/:slug/c/:clientId)
   */
  findByPublicId(publicId) {
    const stmt = db.prepare(
      `SELECT id, partner_id, name, selection_name, notes, public_id FROM clients WHERE public_id = ?`
    );
    const row = stmt.get(publicId);
    return mapRow(row);
  },

  /**
   * Найти всех клиентов партнёра
   * @param {number} partnerId
   * @returns {Array<{ id: number, partnerId: number, name: string }>}
   */
  findByPartnerId(partnerId) {
    const stmt = db.prepare(
      `SELECT id, partner_id, name, selection_name, notes, public_id FROM clients WHERE partner_id = ? ORDER BY id ASC`
    );
    const rows = stmt.all(partnerId);
    return rows.map(mapRow);
  },

  /**
   * Обновить название подборки для клиента
   * @param {number} id — id клиента
   * @param {string | null} selectionName — название подборки (или null чтобы сбросить)
   */
  updateSelectionName(id, selectionName) {
    const stmt = db.prepare(
      `UPDATE clients SET selection_name = ? WHERE id = ?`
    );
    stmt.run(selectionName == null || selectionName === '' ? null : String(selectionName).trim(), id);
  },
};

module.exports = Client;
