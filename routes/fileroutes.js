const express = require("express");
const router = express.Router();
const fileController = require("../controllers/filecontroller");
const upload = require("../middleware/upload.middleware");
const protect = require("../middleware/authmiddleware");


router.post("/upload", protect, upload.single("file"), fileController.uploadFile);

router.get("/download/:id", protect, fileController.downloadFile);

router.delete("/delete/:id", protect, fileController.deleteFile);

module.exports = router;
