exports.getFile = async (req, res) => {

    const fileId = req.params.id;

    const file = await fileModel.getFileById(fileId);

    if (!file) {
        return res.status(404).json({ message: "File not found" });
    }

    res.json(file);
};