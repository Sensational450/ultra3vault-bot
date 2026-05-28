const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ---------------- LOAD ROUTES AUTOMATICALLY ----------------
const routesPath = path.join(__dirname, "routes");

fs.readdirSync(routesPath).forEach((file) => {
    const route = require(`./routes/${file}`);

    if (typeof route === "function") {
        route(app);
    }
});

app.get("/", (req, res) => {
    res.send("Ultra3Vault API is running 🚀");
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});