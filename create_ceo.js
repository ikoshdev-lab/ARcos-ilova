const db = require('./database');
const bcrypt = require('bcrypt');

async function createCEO() {
    const username = 'ikrom';
    const fullName = 'Ikromjon (CEO)';
    const email = 'ikrom@arcos.app';
    const password = 'admin777';
    const bio = "ARcos ijtimoiy tarmog'ining asoschisi va CEO'si. Kelajak texnologiyalarini bugun yaratamiz. Savollar va takliflar uchun doim ochiqman.";
    const avatar = 'https://i.pravatar.cc/150?img=11'; // A professional looking avatar

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Check if user exists
        db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
            if (row) {
                // Update existing user to CEO
                db.run(`UPDATE users SET full_name = ?, bio = ?, verified = 1, avatar = ? WHERE id = ?`, 
                    [fullName, bio, avatar, row.id], (err) => {
                    if (err) console.error("Update error:", err.message);
                    else console.log("Mavjud foydalanuvchi CEO darajasiga ko'tarildi!");
                    process.exit();
                });
            } else {
                // Insert new CEO
                db.run(`INSERT INTO users (username, full_name, email, password, avatar, bio, verified) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                    [username, fullName, email, hashedPassword, avatar, bio], (err) => {
                    if (err) console.error("Insert error:", err.message);
                    else console.log("Yangi CEO akkaunti muvaffaqiyatli yaratildi!");
                    process.exit();
                });
            }
        });
    } catch (e) {
        console.error("Error:", e.message);
        process.exit();
    }
}

createCEO();
