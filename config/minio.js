const Minio = require("minio");
const BUCKET = "encrypted-files";
const minioClient = new Minio.Client({
  endPoint: "localhost",
  port: 9000,
  useSSL: false,
  accessKey: "minioadmin",
  secretKey: "minioadmin",
});

module.exports = { minioClient, BUCKET };
