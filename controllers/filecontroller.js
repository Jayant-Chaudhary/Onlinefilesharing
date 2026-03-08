const { v4: uuidv4 } = require("uuid");
const fileModel = require("../models/fileModel");
const { BUCKET, minioClient } = require("../config/minio");

//upload file
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileId = uuidv4();

    const objectKey = fileId + "-" + req.file.originalname;

    // upload to MinIO
    await minioClient.putObject(
      BUCKET,
      objectKey,
      req.file.buffer,
      req.file.size,
      { "Content-Type": req.file.mimetype },
    );

    const fileData = {
      file_id: fileId,
      user_id: req.user.id,
      original_name: req.file.originalname,
      storage_key: objectKey,
      file_size: req.file.size,
      encryption_type: "none",
    };

    await fileModel.createFile(fileData);

    res.json({
      message: "File uploaded successfully",
      fileId: fileId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
};

//download file
exports.downloadFile = async (req, res) => {
  try {
    const fileId = req.params.id;

    const file = await fileModel.getFileById(fileId);

    if (!file) {
      return res.status(404).json({
        message: "File not found",
      });
    }

    const stream = await minioClient.getObject(BUCKET, file.storage_key);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.original_name}"`,
    );

    res.setHeader("Content-Type", "application/octet-stream");

    stream.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Download failed",
    });
  }
};

// Delete file
exports.deleteFile = async (req, res) => {
  try {
    const fileId = req.params.id;

    const file = await fileModel.getFileById(fileId);

    if (!file) {
      return res.status(404).json({
        message: "File not found",
      });
    }

    // delete from MinIO
    await minioClient.removeObject(BUCKET, file.storage_key);

    // delete metadata
    await fileModel.deleteFile(fileId);

    res.json({
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Delete failed",
    });
  }
};
