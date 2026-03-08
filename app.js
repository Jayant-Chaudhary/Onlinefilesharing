const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const fileRoutes = require("./routes/fileroutes");
const authRoutes = require("./routes/authRoutes");
const errorHandler = require("./middleware/errorHandler");
const testRoutes = require("./routes/tetsRoutes");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Static frontend ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Root → home.html ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

// ── API routes ────────────────────────────────────────────────
app.use("/api/test", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);

app.use(errorHandler);

module.exports = app;
