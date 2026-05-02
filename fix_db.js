const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'arcos.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Add columns if they don't exist
    db.run("ALTER TABLE messages ADD COLUMN file_url TEXT;", (err) => {
        if(err) console.log("file_url already exists or error:", err.message);
    });
    db.run("ALTER TABLE messages ADD COLUMN file_type TEXT;", (err) => {
        if(err) console.log("file_type already exists or error:", err.message);
    });
    
    // Ensure reactions table exists
    db.run(`CREATE TABLE IF NOT EXISTS story_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        story_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});
db.close();
