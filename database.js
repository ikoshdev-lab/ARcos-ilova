const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ MONGODB GA MUVAFFAQIYATLI ULANDI!"))
    .catch((err) => {
        console.error("❌ MONGODB ULANISHIDA XATO:");
        console.error(err.message);
    });

// --- SCHEMAS ---

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    full_name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'https://i.pravatar.cc/150?u=guest' },
    bio: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    followers_count: { type: Number, default: 0 },
    following_count: { type: Number, default: 0 },
    posts_count: { type: Number, default: 0 },
    saved_posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    created_at: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    image_url: { type: String },
    caption: { type: String, default: '' },
    likes_count: { type: Number, default: 0 },
    comments_count: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

const likeSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    created_at: { type: Date, default: Date.now }
});
likeSchema.index({ user_id: 1, post_id: 1 }, { unique: true });

const commentSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    text: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
});

const followSchema = new mongoose.Schema({
    follower_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    following_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    created_at: { type: Date, default: Date.now }
});
followSchema.index({ follower_id: 1, following_id: 1 }, { unique: true });

const storySchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    image_url: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String },
    file_url: { type: String },
    file_type: { type: String },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    target_id: { type: mongoose.Schema.Types.ObjectId },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

const storyViewSchema = new mongoose.Schema({
    story_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    viewed_at: { type: Date, default: Date.now }
});
storyViewSchema.index({ story_id: 1, user_id: 1 }, { unique: true });

// --- MODELS ---

const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Like = mongoose.model('Like', likeSchema);
const Comment = mongoose.model('Comment', commentSchema);
const Follow = mongoose.model('Follow', followSchema);
const Story = mongoose.model('Story', storySchema);
const Message = mongoose.model('Message', messageSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const StoryView = mongoose.model('StoryView', storyViewSchema);

module.exports = {
    User, Post, Like, Comment, Follow, Story, Message, Notification, StoryView, mongoose
};
