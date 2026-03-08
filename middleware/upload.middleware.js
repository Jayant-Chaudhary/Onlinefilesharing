const multer = require("multer");

// store file in memory instead of disk
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

module.exports = upload;