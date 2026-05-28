module.exports = (app) => {
    app.get("/test", (req, res) => {
        res.json({
            status: "OK",
            message: "Ultra3Vault routes working 🚀"
        });
    });
};