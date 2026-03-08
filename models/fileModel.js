// models/fileModel.js
const db = require("../config/db");

// ── Create file record ────────────────────────────────────────────────────────
async function createFile(data) {
  const sql = `
    INSERT INTO files
      (file_id, user_id, original_name, storage_key, file_size,
       encryption_type, file_iv, share_type, share_domain, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const [result] = await db.execute(sql, [
    data.file_id,
    data.user_id,
    data.original_name,
    data.storage_key,
    data.file_size,
    data.encryption_type || "aes-gcm",
    data.file_iv || null,
    data.share_type || "private",
    data.share_domain || null,
    expiresAt,
  ]);
  return result;
}

// ── Get single file ───────────────────────────────────────────────────────────
async function getFileById(file_id) {
  const [rows] = await db.execute("SELECT * FROM files WHERE file_id = ?", [
    file_id,
  ]);
  return rows[0];
}

// ── Get all files for a user (dashboard) ─────────────────────────────────────
async function getFilesByUser(user_id) {
  const [rows] = await db.execute(
    `SELECT file_id, original_name, file_size, encryption_type,
            share_type, share_domain, expires_at, created_at
     FROM files
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [user_id],
  );
  return rows;
}

// ── Total storage used by user (bytes) ───────────────────────────────────────
async function getTotalSizeByUser(user_id) {
  const [rows] = await db.execute(
    "SELECT COALESCE(SUM(file_size), 0) AS total FROM files WHERE user_id = ?",
    [user_id],
  );
  return Number(rows[0].total);
}

// ── Store encrypted key ───────────────────────────────────────────────────────
async function storeEncryptedKey(file_id, encrypted_key, key_iv) {
  const [result] = await db.execute(
    "UPDATE files SET encrypted_key = ?, key_iv = ? WHERE file_id = ?",
    [encrypted_key, key_iv, file_id],
  );
  return result;
}

// ── Get key data for receiver ─────────────────────────────────────────────────
async function getEncryptedKey(file_id) {
  const [rows] = await db.execute(
    `SELECT encrypted_key, key_iv, file_iv, original_name, file_size,
            share_type, share_domain, expires_at
     FROM files WHERE file_id = ?`,
    [file_id],
  );
  return rows[0];
}

// ── Update share settings ─────────────────────────────────────────────────────
async function updateShareSettings(file_id, user_id, share_type, share_domain) {
  const [result] = await db.execute(
    "UPDATE files SET share_type = ?, share_domain = ? WHERE file_id = ? AND user_id = ?",
    [share_type, share_domain || null, file_id, user_id],
  );
  return result;
}

// ── Delete a file record ──────────────────────────────────────────────────────
async function deleteFile(file_id) {
  const [result] = await db.execute("DELETE FROM files WHERE file_id = ?", [
    file_id,
  ]);
  return result;
}

// ── Get all expired files (for cleanup cron) ──────────────────────────────────
async function getExpiredFiles() {
  const [rows] = await db.execute(
    "SELECT file_id, storage_key FROM files WHERE expires_at IS NOT NULL AND expires_at < NOW()",
  );
  return rows;
}

// ── Log access attempt ────────────────────────────────────────────────────────
async function logAccess(file_id, user_id, email, action = "download") {
  await db.execute(
    "INSERT INTO file_access_log (file_id, accessor_id, accessor_email, action) VALUES (?, ?, ?, ?)",
    [file_id, user_id || null, email || null, action],
  );
}

module.exports = {
  createFile,
  getFileById,
  getFilesByUser,
  getTotalSizeByUser,
  storeEncryptedKey,
  getEncryptedKey,
  updateShareSettings,
  deleteFile,
  getExpiredFiles,
  logAccess,
};
