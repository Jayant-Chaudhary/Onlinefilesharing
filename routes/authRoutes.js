const express = require("express");
const router = express.Router();

const {
  register,
  login,
  refresh,
  logout,
  me,
} = require("../controllers/authController");
const protect = require("../middleware/authmiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me",protect, me);

module.exports = router;
