const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fileRoutes = require("./routes/fileroutes");

const authRoutes = require("./routes/authRoutes");
const errorHandler = require("./middleware/errorHandler");
const testRoutes = require("./routes/tetsRoutes");
const path = require("path");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5001",
    credentials: true, // ← required for refresh token cookie
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/test", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);

app.use(errorHandler);

module.exports = app;
