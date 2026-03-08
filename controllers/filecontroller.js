// controllers/fileController.js
const { v4: uuidv4 } = require("uuid");
const cron = require("node-cron");
const fileModel = require("../models/fileModel");
const { BUCKET, minioClient } = require("../config/minio");

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP CRON — runs every 10 minutes, auto-deletes expired files
// Call startCleanupCron() once from server.js
// ═══════════════════════════════════════════════════════════════════════════
function startCleanupCron() {
  cron.schedule("*/10 * * * *", async () => {
    try {
      const expired = await fileModel.getExpiredFiles();
      if (expired.length === 0) return;
      console.log(`[Cleanup] Deleting ${expired.length} expired file(s)…`);
      for (const file of expired) {
        try {
          await minioClient.removeObject(BUCKET, file.storage_key);
        } catch (e) {
          console.warn(
            `[Cleanup] MinIO remove failed for ${file.storage_key}:`,
            e.message,
          );
        }
        await fileModel.deleteFile(file.file_id);
      }
      console.log(`[Cleanup] Done.`);
    } catch (err) {
      console.error("[Cleanup] Error:", err);
    }
  });
  console.log("[Cleanup] Cron scheduled (every 10 min)");
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const MAX_QUOTA = 100 * 1024 * 1024; // 100 MB per user

function extractDomain(email) {
  return email ? email.split("@")[1]?.toLowerCase() : null;
}

// Check whether the requesting user is allowed to access a file
function canAccess(file, reqUser) {
  // Owner always allowed — use == (loose) to handle string vs number mismatch
  if (String(file.user_id) === String(reqUser.id)) return { ok: true };

  // Expired?
  if (file.expires_at && new Date(file.expires_at) < new Date()) {
    return { ok: false, reason: "File has expired" };
  }

  if (file.share_type === "private") {
    return { ok: false, reason: "This file is private" };
  }

  if (file.share_type === "public") {
    return { ok: true };
  }

  if (file.share_type === "domain") {
    const requesterDomain = extractDomain(reqUser.email);
    if (!requesterDomain || requesterDomain !== file.share_domain) {
      return {
        ok: false,
        reason: `Access restricted to @${file.share_domain}`,
      };
    }
    return { ok: true };
  }

  return { ok: false, reason: "Access denied" };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════════════════════════════════
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const share_type = ["public", "domain", "private"].includes(
      req.body.share_type,
    )
      ? req.body.share_type
      : "private";
    const share_domain =
      share_type === "domain"
        ? (req.body.share_domain || "").toLowerCase().trim() || null
        : null;
    const file_iv = req.body.file_iv || null;

    // Quota check
    const usedBytes = await fileModel.getTotalSizeByUser(req.user.id);
    if (usedBytes + req.file.size > MAX_QUOTA) {
      return res.status(413).json({
        message: `Quota exceeded. Used: ${(usedBytes / 1024 / 1024).toFixed(1)} MB / 100 MB`,
      });
    }

    const fileId = uuidv4();
    const objectKey = `${fileId}-${req.file.originalname}`;

    await minioClient.putObject(
      BUCKET,
      objectKey,
      req.file.buffer,
      req.file.size,
      {
        "Content-Type": "application/octet-stream",
      },
    );

    await fileModel.createFile({
      file_id: fileId,
      user_id: req.user.id,
      original_name: req.file.originalname,
      storage_key: objectKey,
      file_size: req.file.size,
      encryption_type: "aes-gcm",
      file_iv,
      share_type,
      share_domain,
    });

    res.json({ message: "File uploaded", fileId });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STORE KEY
// ═══════════════════════════════════════════════════════════════════════════
exports.storeKey = async (req, res) => {
  try {
    const { fileId, encryptedKey, keyIv } = req.body;
    if (!fileId || !encryptedKey || !keyIv)
      return res
        .status(400)
        .json({ message: "fileId, encryptedKey and keyIv required" });

    const file = await fileModel.getFileById(fileId);
    if (!file) return res.status(404).json({ message: "File not found" });
    if (file.user_id !== req.user.id)
      return res.status(403).json({ message: "Forbidden" });

    await fileModel.storeEncryptedKey(fileId, encryptedKey, keyIv);
    res.json({ message: "Key stored" });
  } catch (err) {
    console.error("storeKey error:", err);
    res.status(500).json({ error: "Failed to store key" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET KEY  (checks access rules + domain)
// ═══════════════════════════════════════════════════════════════════════════
exports.getKey = async (req, res) => {
  try {
    const { fileId } = req.params;
    const keyData = await fileModel.getEncryptedKey(fileId);
    if (!keyData || !keyData.encrypted_key)
      return res.status(404).json({ message: "Key not found" });

    // Re-use canAccess by fetching full record
    const file = await fileModel.getFileById(fileId);
    const access = canAccess(file, req.user);
    if (!access.ok) {
      await fileModel.logAccess(fileId, req.user.id, req.user.email, "denied");
      return res.status(403).json({ message: access.reason });
    }

    res.json({
      encryptedKey: keyData.encrypted_key,
      keyIv: keyData.key_iv,
      fileIv: keyData.file_iv,
      originalName: keyData.original_name,
      fileSize: keyData.file_size,
      shareType: keyData.share_type,
      expiresAt: keyData.expires_at,
    });
  } catch (err) {
    console.error("getKey error:", err);
    res.status(500).json({ error: "Failed to retrieve key" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD  (checks access rules)
// ═══════════════════════════════════════════════════════════════════════════
exports.downloadFile = async (req, res) => {
  try {
    const file = await fileModel.getFileById(req.params.id);
    if (!file) return res.status(404).json({ message: "File not found" });

    const access = canAccess(file, req.user);
    if (!access.ok) {
      await fileModel.logAccess(
        file.file_id,
        req.user.id,
        req.user.email,
        "denied",
      );
      return res.status(403).json({ message: access.reason });
    }

    await fileModel.logAccess(
      file.file_id,
      req.user.id,
      req.user.email,
      "download",
    );

    const stream = await minioClient.getObject(BUCKET, file.storage_key);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.original_name}.enc"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    stream.pipe(res);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ message: "Download failed" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — list user's files + quota
// ═══════════════════════════════════════════════════════════════════════════
exports.listFiles = async (req, res) => {
  try {
    const files = await fileModel.getFilesByUser(req.user.id);
    const usedBytes = await fileModel.getTotalSizeByUser(req.user.id);
    res.json({
      files,
      quota: { used: usedBytes, total: MAX_QUOTA },
    });
  } catch (err) {
    console.error("listFiles error:", err);
    res.status(500).json({ error: "Failed to list files" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE SHARE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
exports.updateShare = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { share_type, share_domain } = req.body;

    if (!["private", "public", "domain"].includes(share_type))
      return res.status(400).json({ message: "Invalid share_type" });

    if (share_type === "domain" && !share_domain)
      return res
        .status(400)
        .json({ message: "share_domain required for domain sharing" });

    await fileModel.updateShareSettings(
      fileId,
      req.user.id,
      share_type,
      share_type === "domain" ? share_domain.toLowerCase().trim() : null,
    );

    res.json({ message: "Share settings updated" });
  } catch (err) {
    console.error("updateShare error:", err);
    res.status(500).json({ error: "Update failed" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════
exports.deleteFile = async (req, res) => {
  try {
    const file = await fileModel.getFileById(req.params.id);
    if (!file) return res.status(404).json({ message: "File not found" });
    if (file.user_id != req.user.id)
      return res.status(403).json({ message: "Forbidden" });

    await minioClient.removeObject(BUCKET, file.storage_key);
    await fileModel.deleteFile(file.file_id);
    res.json({ message: "File deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
};

exports.startCleanupCron = startCleanupCron;
