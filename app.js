const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fileRoutes = require("./routes/fileroutes");

const authRoutes = require("./routes/authRoutes");
const errorHandler = require("./middleware/errorHandler");
const testRoutes = require("./routes/tetsRoutes");


const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use("/api/test", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);

app.use(errorHandler);

module.exports = app;