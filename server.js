const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { User, Post, Like, Comment, Follow, Story, Message, Notification, StoryView, mongoose } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'arcos_super_secret_key_2026'; // Simple hardcoded secret for now

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '')));

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
};

// --- AUTHENTICATION ROUTES ---

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, fullName, email, password, bio, avatar } = req.body;
    if (!username || !fullName || !email || !password) {
        return res.status(400).json({ error: "Barcha majburiy maydonlarni to'ldiring" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        let finalAvatarUrl = 'https://i.pravatar.cc/150?img=' + Math.floor(Math.random() * 70);

        if (avatar && avatar.startsWith('data:image')) {
            const matches = avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const ext = matches[1].split('/')[1] === 'jpeg' ? 'jpg' : 'png';
                const buffer = Buffer.from(matches[2], 'base64');
                const filename = 'avatar-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + ext;
                fs.writeFileSync(path.join(uploadsDir, filename), buffer);
                finalAvatarUrl = '/uploads/' + filename;
            }
        }

        const newUser = new User({
            username,
            full_name: fullName,
            email,
            password: hashedPassword,
            avatar: finalAvatarUrl,
            bio: bio || ''
        });

        await newUser.save();
        const token = jwt.sign({ id: newUser._id, username }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ message: "Muvaffaqiyatli ro'yxatdan o'tdingiz", token });

    } catch (err) {
        console.error("Registratsiya xatosi:", err);
        if (err.code === 11000) {
            return res.status(400).json({ error: "Bu foydalanuvchi nomi yoki email allaqachon band" });
        }
        res.status(500).json({ error: "Server xatosi: " + err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.status(400).json({ error: "Ma'lumotlarni to'liq kiriting" });
    }

    try {
        const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
        if (!user) return res.status(400).json({ error: "Foydalanuvchi topilmadi" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: "Parol noto'g'ri" });

        const token = jwt.sign({ id: user._id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ message: "Kirish muvaffaqiyatli", token });
    } catch (err) {
        res.status(500).json({ error: "Server xatosi" });
    }
});

// Guest Login
app.post('/api/auth/guest', async (req, res) => {
    try {
        const guestUsername = 'guest_' + Math.floor(Math.random() * 100000);
        const newUser = new User({
            username: guestUsername,
            full_name: 'Mehmon',
            email: guestUsername + '@arcos.app',
            password: 'guest_password',
            avatar: 'https://i.pravatar.cc/150?img=0',
            bio: 'Mehmon foydalanuvchi'
        });
        await newUser.save();
        const token = jwt.sign({ id: newUser._id, username: guestUsername }, SECRET_KEY, { expiresIn: '1d' });
        res.json({ message: "Mehmon sifatida kirdingiz", token });
    } catch (err) {
        res.status(500).json({ error: "Mehmon yaratishda xato" });
    }
});

// Get Current User Info
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Server xatosi" });
    }
});

// --- POSTS ROUTES ---

// Get all posts (Feed)
app.get('/api/posts', authenticateToken, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('user_id', 'username full_name avatar verified')
            .sort({ created_at: -1 })
            .limit(50);

        const formattedPosts = await Promise.all(posts.map(async (p) => {
            const isLiked = await Like.exists({ user_id: req.user.id, post_id: p._id });
            return {
                id: p._id,
                image_url: p.image_url,
                caption: p.caption,
                likes_count: p.likes_count,
                comments_count: p.comments_count,
                time: p.created_at,
                is_liked: !!isLiked,
                user: {
                    id: p.user_id._id,
                    name: p.user_id.full_name,
                    handle: '@' + p.user_id.username,
                    avatar: p.user_id.avatar,
                    verified: p.user_id.verified
                }
            };
        }));
        res.json(formattedPosts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Post
app.post('/api/posts', authenticateToken, async (req, res) => {
    const { caption, image } = req.body;
    let imageUrl = '';

    if (image && image.startsWith('data:image')) {
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
            const ext = matches[1].split('/')[1] === 'jpeg' ? 'jpg' : 'png';
            const buffer = Buffer.from(matches[2], 'base64');
            const filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + ext;
            fs.writeFileSync(path.join(uploadsDir, filename), buffer);
            imageUrl = '/uploads/' + filename;
        }
    } else if (image) {
        imageUrl = image;
    }

    try {
        const newPost = new Post({
            user_id: req.user.id,
            image_url: imageUrl,
            caption: caption || ''
        });
        await newPost.save();
        await User.findByIdAndUpdate(req.user.id, { $inc: { posts_count: 1 } });
        res.json({ message: "Post qo'shildi", post_id: newPost._id });
    } catch (err) {
        res.status(500).json({ error: "Post yaratishda xato" });
    }
});

// Toggle Like
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        const existingLike = await Like.findOne({ user_id: userId, post_id: postId });

        if (existingLike) {
            await Like.deleteOne({ _id: existingLike._id });
            await Post.findByIdAndUpdate(postId, { $inc: { likes_count: -1 } });
            res.json({ liked: false });
        } else {
            await new Like({ user_id: userId, post_id: postId }).save();
            await Post.findByIdAndUpdate(postId, { $inc: { likes_count: 1 } });
            res.json({ liked: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- POST EXTRAS (Comments & Saves) ---

// Get Comments
app.get('/api/posts/:id/comments', authenticateToken, async (req, res) => {
    try {
        const comments = await Comment.find({ post_id: req.params.id })
            .populate('user_id', 'username full_name avatar')
            .sort({ created_at: -1 });
        res.json(comments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Comment
app.post('/api/posts/:id/comments', authenticateToken, async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Izoh matni bo'sh" });

    try {
        const newComment = new Comment({
            user_id: req.user.id,
            post_id: req.params.id,
            text
        });
        await newComment.save();
        const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { comments_count: 1 } });
        
        if (post && post.user_id.toString() !== req.user.id) {
            await new Notification({
                user_id: post.user_id,
                actor_id: req.user.id,
                type: 'comment',
                target_id: post._id
            }).save();
        }
        res.json({ message: "Izoh qo'shildi", comment_id: newComment._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle Save
app.post('/api/posts/:id/save', authenticateToken, (req, res) => {
    const postId = req.params.id;
    const userId = req.user.id;

    db.get(`SELECT 1 FROM saves WHERE user_id = ? AND post_id = ?`, [userId, postId], (err, row) => {
        if (row) {
            db.run(`DELETE FROM saves WHERE user_id = ? AND post_id = ?`, [userId, postId], () => {
                res.json({ saved: false });
            });
        } else {
            db.run(`INSERT INTO saves (user_id, post_id) VALUES (?, ?)`, [userId, postId], () => {
                res.json({ saved: true });
            });
        }
    });
});

// Explore
app.get('/api/explore', authenticateToken, async (req, res) => {
    try {
        const posts = await Post.find({ image_url: { $ne: '' } }).limit(20);
        res.json(posts.map(p => p.image_url));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PROFILE & FOLLOWS ---

// Edit Profile
app.put('/api/users/me', authenticateToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { 
            full_name: req.body.fullName, 
            bio: req.body.bio 
        });
        res.json({ message: "Profil yangilandi" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Profile
app.get('/api/users/:username', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).select('-password');
        if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        
        const isFollowing = await Follow.exists({ follower_id: req.user.id, following_id: user._id });
        const userObj = user.toObject();
        userObj.is_following = !!isFollowing;
        res.json(userObj);
    } catch (err) {
        res.status(500).json({ error: "Server xatosi" });
    }
});

// Follow
app.post('/api/users/:id/follow', authenticateToken, async (req, res) => {
    try {
        const followingId = req.params.id;
        const followerId = req.user.id;
        if (followingId === followerId) return res.status(400).json({ error: "O'zingizga obuna bo'la olmaysiz" });

        const existingFollow = await Follow.findOne({ follower_id: followerId, following_id: followingId });
        if (existingFollow) {
            await Follow.deleteOne({ _id: existingFollow._id });
            await User.findByIdAndUpdate(followingId, { $inc: { followers_count: -1 } });
            await User.findByIdAndUpdate(followerId, { $inc: { following_count: -1 } });
            res.json({ followed: false });
        } else {
            await new Follow({ follower_id: followerId, following_id: followingId }).save();
            await User.findByIdAndUpdate(followingId, { $inc: { followers_count: 1 } });
            await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } });
            await new Notification({ user_id: followingId, actor_id: followerId, type: 'follow' }).save();
            res.json({ followed: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- STORIES ---
app.get('/api/stories', authenticateToken, (req, res) => {
    // Get all stories from all users within the last 24 hours
    const sql = `
        SELECT s.id, s.image_url, u.id as user_id, u.username, u.full_name, u.avatar
        FROM stories s
        JOIN users u ON s.user_id = u.id
        WHERE s.created_at >= datetime('now', '-1 day')
        ORDER BY s.created_at DESC
        LIMIT 50
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/stories/:id/react', authenticateToken, (req, res) => {
    const { emoji } = req.body;
    const storyId = req.params.id;
    const userId = req.user.id;

    db.run(`INSERT INTO story_reactions (story_id, user_id, emoji) VALUES (?, ?, ?)`, [storyId, userId, emoji], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Reaksiya qoldirildi" });
    });
});

// Record Story View
app.post('/api/stories/:id/view', authenticateToken, (req, res) => {
    const storyId = req.params.id;
    const userId = req.user.id;
    db.run(`INSERT OR IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)`, [storyId, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Ko'rildi" });
    });
});

// Get Story Viewers
app.get('/api/stories/:id/viewers', authenticateToken, (req, res) => {
    const storyId = req.params.id;
    const sql = `
        SELECT u.id, u.username, u.full_name, u.avatar
        FROM story_views sv
        JOIN users u ON sv.user_id = u.id
        WHERE sv.story_id = ?
        ORDER BY sv.viewed_at DESC
    `;
    db.all(sql, [storyId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get Conversation Messages
app.get('/api/messages/:contactId', authenticateToken, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender_id: req.user.id, receiver_id: req.params.contactId },
                { sender_id: req.params.contactId, receiver_id: req.user.id }
            ]
        }).sort({ created_at: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Story
app.post('/api/stories', authenticateToken, async (req, res) => {
    const { image } = req.body;
    let imageUrl = '';
    if (image && image.startsWith('data:image')) {
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
            const ext = matches[1].split('/')[1] === 'jpeg' ? 'jpg' : 'png';
            const buffer = Buffer.from(matches[2], 'base64');
            const filename = 'story-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + ext;
            fs.writeFileSync(path.join(uploadsDir, filename), buffer);
            imageUrl = '/uploads/' + filename;
        }
    } else {
        return res.status(400).json({ error: "Rasm noto'g'ri" });
    }

    try {
        const newStory = new Story({ user_id: req.user.id, image_url: imageUrl });
        await newStory.save();
        res.json({ message: "Hikoya qo'shildi", id: newStory._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Conversations
app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const conversations = await Message.aggregate([
            { $match: { $or: [{ sender_id: new mongoose.Types.ObjectId(req.user.id) }, { receiver_id: new mongoose.Types.ObjectId(req.user.id) }] } },
            { $sort: { created_at: -1 } },
            { $group: {
                _id: { $cond: [{ $eq: ["$sender_id", new mongoose.Types.ObjectId(req.user.id)] }, "$receiver_id", "$sender_id"] },
                lastMessage: { $first: "$$ROOT" }
            }},
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            { $project: {
                id: '$lastMessage._id',
                text: '$lastMessage.text',
                created_at: '$lastMessage.created_at',
                is_read: '$lastMessage.is_read',
                contact_id: '$user._id',
                username: '$user.username',
                full_name: '$user.full_name',
                avatar: '$user.avatar'
            }},
            { $sort: { created_at: -1 } }
        ]);
        res.json(conversations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/messages/:contactId', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const contactId = req.params.contactId;
    const sql = `
        SELECT m.id, m.text, strftime('%Y-%m-%dT%H:%M:%SZ', m.created_at) as created_at,
               m.sender_id, m.receiver_id
        FROM messages m
        WHERE (m.sender_id = ? AND m.receiver_id = ?)
           OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.created_at ASC
    `;
    db.all(sql, [userId, contactId, contactId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/messages', authenticateToken, (req, res) => {
    const { receiverId, text } = req.body;
    db.run(`INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)`, [req.user.id, receiverId, text], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Yuborildi", id: this.lastID });
    });
});

// --- FOLLOWS ---
app.post('/api/users/:userId/follow', authenticateToken, (req, res) => {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    if (followerId == followingId) return res.status(400).json({ error: "O'zingizga obuna bo'lolmaysiz" });

    db.get(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`, [followerId, followingId], (err, row) => {
        if (row) {
            db.run(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`, [followerId, followingId], (err) => {
                res.json({ followed: false });
            });
        } else {
            db.run(`INSERT INTO follows (follower_id, following_id) VALUES (?, ?)`, [followerId, followingId], (err) => {
                res.json({ followed: true });
            });
        }
    });
});

// Get Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ user_id: req.user.id, actor_id: { $ne: req.user.id } })
            .populate('actor_id', 'username full_name avatar')
            .sort({ created_at: -1 })
            .limit(30);
        await Notification.updateMany({ user_id: req.user.id }, { is_read: true });
        const formatted = notifications.map(n => ({
            id: n._id,
            type: n.type,
            target_id: n.target_id,
            created_at: n.created_at,
            is_read: n.is_read,
            actor_id: n.actor_id._id,
            username: n.actor_id.username,
            full_name: n.actor_id.full_name,
            avatar: n.actor_id.avatar
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Search
app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json([]);
        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: 'i' } },
                { full_name: { $regex: query, $options: 'i' } }
            ]
        }).limit(10);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LIVE SIGNALING & REAL-TIME CHAT ---
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    allowEIO3: true
});

const activeLives = {}; // { userId: { socketId, username, fullName, avatar, startTime, viewers: [] } }
const userSockets = {}; // { userId: socketId }

io.on('connection', (socket) => {
    console.log('>>> Yangi foydalanuvchi ulandi! ID:', socket.id);

    socket.on('identify', (userId) => {
        userSockets[userId] = socket.id;
        console.log(`✅ FOYDALANUVCHI TANINDI: ${userId} -> ${socket.id}`);
        // Optionally notify user that they are connected
        socket.emit('identified', { status: 'success' });
    });

    socket.on('start-live', (data) => {
        const { userId, username, fullName, avatar } = data;
        activeLives[userId] = {
            userId,
            socketId: socket.id,
            username,
            fullName,
            avatar,
            startTime: Date.now(),
            viewers: []
        };
        socket.broadcast.emit('live-started', activeLives[userId]);
    });

    socket.on('stop-live', (userId) => {
        if (activeLives[userId]) {
            delete activeLives[userId];
            io.emit('live-stopped', userId);
        }
    });

    socket.on('join-live', (data) => {
        const { streamerId } = data;
        if (activeLives[streamerId]) {
            socket.join(`live-${streamerId}`);
            io.to(activeLives[streamerId].socketId).emit('viewer-joined', socket.id);
        }
    });

    socket.on('signal', (data) => {
        const { to, signal } = data;
        io.to(to).emit('signal', { signal, from: socket.id });
    });

    // Private Messaging with Media
    socket.on('send-private-message', async (data) => {
        const { senderId, receiverId, text, fileUrl, fileType } = data;
        try {
            const newMsg = new Message({
                sender_id: senderId,
                receiver_id: receiverId,
                text,
                file_url: fileUrl,
                file_type: fileType
            });
            await newMsg.save();

            const msgData = {
                id: newMsg._id,
                sender_id: senderId,
                receiver_id: receiverId,
                text: text,
                file_url: fileUrl,
                file_type: fileType,
                created_at: newMsg.created_at,
                is_read: false
            };

            const receiverSocketId = userSockets[receiverId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new-private-message', msgData);
            }
            socket.emit('message-sent', msgData);
        } catch (err) {
            socket.emit('message-error', { error: "Xato" });
        }
    });

    socket.on('mark-as-read', async (data) => {
        const { messageId, senderId } = data;
        try {
            await Message.findByIdAndUpdate(messageId, { is_read: true });
            const senderSocketId = userSockets[senderId];
            if (senderSocketId) {
                io.to(senderSocketId).emit('message-read', { messageId });
            }
        } catch (err) { }
    });

    // Real-time Video Calls
    socket.on('call-user', (data) => {
        const { to, offer, fromName, fromAvatar, fromUserId } = data;
        const targetSocketId = userSockets[to];
        if (targetSocketId) {
            console.log(`Forwarding call from ${fromUserId} to ${to} (Socket: ${targetSocketId})`);
            io.to(targetSocketId).emit('incoming-call', { from: socket.id, offer, fromName, fromAvatar, fromUserId: fromUserId });
        } else {
            console.warn(`Call failed: User ${to} is offline or not identified`);
            socket.emit('call-failed', { reason: "Foydalanuvchi hozirda oflayn" });
        }
    });

    socket.on('answer-call', (data) => {
        const { to, answer } = data;
        io.to(to).emit('call-accepted', { answer, from: socket.id });
    });

    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data;
        io.to(to).emit('ice-candidate', { candidate, from: socket.id });
    });

    socket.on('disconnect', () => {
        // Remove from userSockets
        for (const userId in userSockets) {
            if (userSockets[userId] === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
        // Cleanup lives
        for (const userId in activeLives) {
            if (activeLives[userId].socketId === socket.id) {
                delete activeLives[userId];
                io.emit('live-stopped', userId);
                break;
            }
        }
    });
});

// Start Server
const os = require('os');
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

server.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log(`
=====================================================
🚀 ARcos serveri muvaffaqiyatli ishga tushdi!
   
🏠 Kompyuterda: http://localhost:${PORT}
📱 Telefondan kirish: http://${localIP}:${PORT}
=====================================================
    `);
});
