const express = require("express");
const router = express.Router();

const protect = require("../middleware/authmiddleware");
const { testProtected } = require("../controllers/testController");

router.get("/protected", protect, testProtected);

module.exports = router;