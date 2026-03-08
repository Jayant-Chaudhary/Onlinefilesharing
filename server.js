const dotenv = require("dotenv").config();
const express = require("express");
const app = require("./app");
const { startCleanupCron } = require("./controllers/filecontroller");

const port = process.env.PORT || 5001;

startCleanupCron();

app.listen(port,'192.168.31.82', () => {
  console.log(`Server is running on http://localhost:${port}`);
});
