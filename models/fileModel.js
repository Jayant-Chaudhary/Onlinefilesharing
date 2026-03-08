const db = require("../config/db");

async function createFile(data) {
  const sql = `
        INSERT INTO files 
        (file_id, user_id, original_name, storage_key, file_size, encryption_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

  const values = [
    data.file_id,
    data.user_id,
    data.original_name,
    data.storage_key,
    data.file_size,
    data.encryption_type,
  ];

  const [result] = await db.execute(sql, values);
  return result;
}

async function getFileById(file_id) {
  const [rows] = await db.execute("SELECT * FROM files WHERE file_id = ?", [
    file_id,
  ]);
  return rows[0];
}

async function deleteFile(file_id) {
  const [result] = await db.execute("DELETE FROM files WHERE file_id = ?", [
    file_id,
  ]);
  return result;
}

module.exports = {
  createFile,
  getFileById,
  deleteFile,
};
