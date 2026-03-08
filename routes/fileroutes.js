// routes/fileRoutes.js
const express = require("express");
const multer = require("multer");
const protect = require("../middleware/authmiddleware");
const {
  uploadFile,
  downloadFile,
  deleteFile,
  storeKey,
  getKey,
  listFiles,
  updateShare,
} = require("../controllers/filecontroller");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get("/", protect, listFiles); // dashboard data
router.post("/upload", protect, upload.single("file"), uploadFile);
router.get("/download/:id", protect, downloadFile);
router.delete("/:id", protect, deleteFile);
router.post("/store-key", protect, storeKey);
router.get("/get-key/:fileId", protect, getKey);
router.patch("/:fileId/share", protect, updateShare);

module.exports = router;
