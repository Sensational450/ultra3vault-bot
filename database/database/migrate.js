const db = require("./premium");

db.run(`ALTER TABLE premium_content ADD COLUMN type TEXT DEFAULT 'news'`);
db.run(`ALTER TABLE premium_content ADD COLUMN title TEXT DEFAULT ''`);
db.run(`ALTER TABLE premium_content ADD COLUMN link TEXT DEFAULT ''`);

console.log("✅ Database updated");