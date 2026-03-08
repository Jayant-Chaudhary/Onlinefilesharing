const bcrypt = require("bcryptjs");
const db = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");
const jwt = require("jsonwebtoken");
const generateToken = require("../utils/generateToken");
const generateRefreshToken = require("../utils/generateRefreshToken");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Cookie config — works on both localhost and HTTPS tunnel ──────────────────
function cookieOptions() {
  const isHttps =
    process.env.NODE_ENV === "production" ||
    process.env.USE_SECURE_COOKIES === "true";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax", // "none" required for cross-origin HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);
  if (existing.length > 0)
    return res.status(400).json({ message: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    "INSERT INTO users (email, password) VALUES (?, ?)",
    [email, hashedPassword],
  );

  res.json({ message: "User created", id: result.insertId });
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [users] = await db.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);
  if (users.length === 0)
    return res.status(404).json({ message: "User not found" });

  const user = users[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: "Invalid credentials" });

  const accessToken = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  await db.query("UPDATE users SET refresh_token = ? WHERE id = ?", [
    refreshToken,
    user.id,
  ]);

  res.cookie("refreshToken", refreshToken, cookieOptions());
  res.json({ accessToken });
});

// ── REFRESH TOKEN ─────────────────────────────────────────────────────────────
exports.refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ message: "Refresh token missing" });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (e) {
    return res
      .status(401)
      .json({ message: "Refresh token expired or invalid" });
  }

  const [users] = await db.query(
    "SELECT * FROM users WHERE id = ? AND refresh_token = ?",
    [decoded.id, token],
  );
  if (users.length === 0)
    return res.status(403).json({ message: "Invalid refresh token" });

  const accessToken = generateToken(users[0]);
  res.json({ accessToken });
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.sendStatus(204);

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    await db.query("UPDATE users SET refresh_token = NULL WHERE id = ?", [
      decoded.id,
    ]);
  } catch {}

  res.clearCookie("refreshToken", cookieOptions());
  res.json({ message: "Logged out successfully" });
});

// ── ME ────────────────────────────────────────────────────────────────────────
exports.me = asyncHandler(async (req, res) => {
  const [users] = await db.query(
    "SELECT id, email, name, avatar_url FROM users WHERE id = ?",
    [req.user.id],
  );
  if (users.length === 0)
    return res.status(404).json({ message: "User not found" });

  res.json({ user: users[0] });
});

// ── GOOGLE AUTH ───────────────────────────────────────────────────────────────
exports.googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken)
    return res.status(400).json({ message: "Google ID token required" });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ message: "Invalid Google token" });
  }

  const { email, name, sub: googleId, picture } = payload;
  const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);

  let user;
  if (existing.length > 0) {
    user = existing[0];
    if (!user.google_id) {
      await db.query(
        "UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?",
        [googleId, picture, user.id],
      );
    }
  } else {
    const [result] = await db.query(
      "INSERT INTO users (email, google_id, avatar_url, name) VALUES (?, ?, ?, ?)",
      [email, googleId, picture, name],
    );
    const [newUser] = await db.query("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);
    user = newUser[0];
  }

  const accessToken = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  await db.query("UPDATE users SET refresh_token = ? WHERE id = ?", [
    refreshToken,
    user.id,
  ]);

  res.cookie("refreshToken", refreshToken, cookieOptions());
  res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar_url,
    },
  });
});
