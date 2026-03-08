exports.testProtected = (req, res) => {
  res.json({
    message: "Protected route accessed successfully",
    user: req.user
  });
};