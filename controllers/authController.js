const bcrypt = require("bcryptjs");
const db = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");
const jwt = require("jsonwebtoken");

const generateToken = require("../utils/generateToken");
const generateRefreshToken = require("../utils/generateRefreshToken");

// REGISTER USER

exports.register = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);

  if (existing.length > 0) {
    return res.status(400).json({
      message: "User already exists",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const [result] = await db.query(
    "INSERT INTO users (email,password) VALUES (?,?)",
    [email, hashedPassword],
  );

  res.json({
    message: "User created",
    id: result.insertId,
  });
});

// LOGIN USER

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [users] = await db.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);

  if (users.length === 0) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const user = users[0];

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(401).json({
      message: "Invalid credentials",
    });
  }

  const accessToken = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  await db.query("UPDATE users SET refresh_token=? WHERE id=?", [
    refreshToken,
    user.id,
  ]);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false, // true in production
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    accessToken,
  });
});

//refresh  PAGE

exports.refresh = asyncHandler(async (req, res) => {

  const token = req.cookies.refreshToken;

  if (!token) {
    return res.status(401).json({
      message: "Refresh token missing"
    });
  }

  const decoded = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET
  );

  const [users] = await db.query(
    "SELECT * FROM users WHERE id=? AND refresh_token=?",
    [decoded.id, token]
  );

  if (users.length === 0) {
    return res.status(403).json({
      message: "Invalid refresh token"
    });
  }

  const accessToken = generateToken(users[0]);

  res.json({
    accessToken
  });

});

// LOGOUT USER
exports.logout = asyncHandler(async (req, res) => {

  const token = req.cookies.refreshToken;

  if (!token) {
    return res.sendStatus(204);
  }

  const decoded = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET
  );

  await db.query(
    "UPDATE users SET refresh_token=NULL WHERE id=?",
    [decoded.id]
  );

  res.clearCookie("refreshToken");

  res.json({
    message: "Logged out successfully"
  });

});

// GET CURRENT USER LOGGED IN
exports.me = asyncHandler(async (req, res) => {

  const [users] = await db.query(
    "SELECT id,email FROM users WHERE id = ?",
    [req.user.id]
  );

  if (users.length === 0) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  res.json({
    user: users[0]
  });

});
