const db = require("./premium");

db.serialize(() => {

    db.run(`ALTER TABLE premium_content ADD COLUMN type TEXT DEFAULT 'news'`, (err) => {
        if (err) console.log("type already exists");
    });

    db.run(`ALTER TABLE premium_content ADD COLUMN title TEXT DEFAULT ''`, (err) => {
        if (err) console.log("title already exists");
    });

    db.run(`ALTER TABLE premium_content ADD COLUMN link TEXT DEFAULT ''`, (err) => {
        if (err) console.log("link already exists");
    });

    console.log("Migration complete");
});
