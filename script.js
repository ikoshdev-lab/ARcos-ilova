// --- STATE ---
let currentUser = null;
let postsData = [];
let storiesData = [];
let exploreData = [];
let messagesData = [];
let notifData = [];
let peer = null;
let localStream = null;
const isLocalFile = window.location.protocol === 'file:';
const API_URL = isLocalFile ? 'http://localhost:3000/api' : '/api';
const SOCKET_URL = isLocalFile ? 'http://localhost:3000' : undefined;



// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Theme setup
    const savedTheme = localStorage.getItem('arcos_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Start socket connection immediately
    initSocket();
});

// --- API HELPERS ---
async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('arcos_token') || sessionStorage.getItem('arcos_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...headers, ...options.headers }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API Error');
        return data;
    } catch (err) {
        showToast(err.message);
        throw err;
    }
}

function timeAgo(dateString) {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " yil oldin";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " oy oldin";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " kun oldin";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " soat oldin";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " daqiqa oldin";
    return Math.floor(seconds) + " soniya oldin";
}

// --- AUTHENTICATION ---
async function checkAuth() {
    const token = localStorage.getItem('arcos_token') || sessionStorage.getItem('arcos_token');
    if (token) {
        try {
            currentUser = await apiFetch('/users/me');
            showApp();
        } catch (e) {
            logout();
        }
    }
}

function switchAuth(page) {
    document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${page}-page`).classList.add('active');
}

function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Kirilmoqda...';

    const identifier = document.getElementById('l-ident').value;
    const password = document.getElementById('l-pass').value;

    try {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });

        const remember = document.getElementById('remember').checked;
        if (remember) {
            localStorage.setItem('arcos_token', data.token);
        } else {
            sessionStorage.setItem('arcos_token', data.token);
        }
        await checkAuth();
    } catch (e) {
        btn.innerHTML = originalText;
    }
}

let registerAvatarBase64 = '';
function previewRegAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('r-avatar-preview').src = e.target.result;
            registerAvatarBase64 = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Hisob yaratilmoqda...';

    const body = {
        username: document.getElementById('r-uname').value,
        fullName: `${document.getElementById('r-fname').value} ${document.getElementById('r-lname').value}`,
        email: document.getElementById('r-email').value,
        password: document.getElementById('r-pass').value,
        bio: document.getElementById('r-bio').value,
        avatar: registerAvatarBase64 // send base64 if selected
    };

    try {
        const data = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        localStorage.setItem('arcos_token', data.token);
        showToast('Xush kelibsiz! Hisob yaratildi.');
        await checkAuth();
    } catch (e) {
        btn.innerHTML = originalText;
    }
}

function forgotPassword() {
    showToast('Parolni tiklash funksiyasi tez orada ishga tushadi!');
}

function loginAsGuest() {
    const btn = document.querySelector('.btn-social');
    const orig = btn.innerHTML;
    btn.innerHTML = 'Mehmon sifatida kirilmoqda...';

    apiFetch('/auth/guest', { method: 'POST' })
        .then(async (data) => {
            sessionStorage.setItem('arcos_token', data.token);
            showToast('Mehmon sifatida kirdingiz');
            await checkAuth();
        })
        .catch(() => {
            btn.innerHTML = orig;
            showToast('Mehmon rejimi hozircha ishlamayapti');
        });
}

function logout() {
    localStorage.removeItem('arcos_token');
    sessionStorage.removeItem('arcos_token');
    currentUser = null;
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
}

// --- APP LOGIC ---
async function loadAllData() {
    try {
        const [posts, stories, explore, messages, notifs] = await Promise.all([
            apiFetch('/posts').catch(() => []),
            apiFetch('/stories').catch(() => []),
            apiFetch('/explore').catch(() => []),
            apiFetch('/messages').catch(() => []),
            apiFetch('/notifications').catch(() => [])
        ]);

        postsData = posts;
        storiesData = stories;
        exploreData = explore;
        messagesData = messages;
        notifData = notifs;
    } catch (e) {
        console.error('Failed to load some data');
    }
}

async function showApp() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');

    populateUserData();
    await loadAllData();

    renderFeed();
    renderStories();
    renderExplore();
    renderMessages();
    renderNotifications();
    renderProfilePosts();

    // Identify user to the server
    if (socket && socket.connected && currentUser) {
        console.log('Identifying user after login:', currentUser.id);
        socket.emit('identify', currentUser.id);
    }
}

function populateUserData() {
    if (!currentUser) return;
    document.getElementById('sb-avatar').src = currentUser.avatar;
    document.getElementById('sb-name').textContent = currentUser.full_name;
    document.getElementById('sb-handle').textContent = `@${currentUser.username}`;

    document.getElementById('qp-avatar').src = currentUser.avatar;
    document.getElementById('cp-avatar').src = currentUser.avatar;
    document.getElementById('cp-name').textContent = currentUser.full_name;

    document.getElementById('profile-avatar').src = currentUser.avatar;
    document.getElementById('profile-fullname').textContent = currentUser.full_name;
    document.getElementById('profile-handle').textContent = `@${currentUser.username}`;
    document.getElementById('profile-bio-text').textContent = currentUser.bio || 'Bio kiritilmagan';
    document.getElementById('stat-posts').textContent = currentUser.posts_count || 0;
    document.getElementById('stat-followers').textContent = currentUser.followers_count || 0;
    document.getElementById('stat-following').textContent = currentUser.following_count || 0;
}

// --- NAVIGATION ---
function goTo(pageId, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');

    // Bottom nav and Sidebar sync
    document.querySelectorAll('.sb-link, .bn-link').forEach(l => l.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else {
        const target = document.querySelector(`[data-page="${pageId}"]`);
        if (target) target.classList.add('active');
    }

    window.scrollTo(0, 0);
}

// --- THEME ---
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('arcos_theme', newTheme);
}

// --- RENDERERS ---
function renderStories() {
    const list = document.getElementById('stories-list');
    if (!list) return;

    let html = `
    <div class="story-item create" onclick="openStoryModal()">
        <div class="story-ring">
            <img src="${currentUser.avatar}" alt="Siz">
            <div class="add-icon">+</div>
        </div>
        <div class="story-name">Sizning hikoyangiz</div>
    </div>`;

    activeLivesData.forEach(l => {
        html += `
        <div class="story-item live" onclick="joinLive('${l.socketId}', '${l.fullName}', '${l.avatar}', '${l.username}')">
            <div class="story-ring"><img src="${l.avatar}" alt="${l.fullName}"></div>
            <div class="story-name">${l.fullName}</div>
        </div>`;
    });

    html += (storiesData || []).map(s => `
        <div class="story-item" onclick="viewStory(${s.id})">
            <div class="story-ring"><img src="${s.avatar}" alt="${s.full_name}"></div>
            <div class="story-name">${s.full_name}</div>
        </div>`
    ).join('');

    list.innerHTML = html;
}

function renderFeed() {
    const list = document.getElementById('feed-list');
    if (postsData.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted)">Hali hech qanday post yo'q.</div>`;
    } else {
        list.innerHTML = postsData.map(p => createPostHTML(p)).join('');
    }
}

function createPostHTML(p) {
    const verifiedIcon = p.user.verified ? `<svg class="verified" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z"/></svg>` : '';
    const imgUrl = p.image_url || '';

    return `
    <article class="post" id="post-${p.id}">
        <div class="post-header">
            <div class="post-user" onclick="viewUserProfile('${p.user.handle.replace('@', '')}')" style="cursor:pointer">
                <img src="${p.user.avatar}">
                <div class="pu-info">
                    <span class="pu-name">${p.user.name} ${verifiedIcon}</span>
                    <span class="pu-meta">${timeAgo(p.time)}</span>
                </div>
            </div>
        </div>
        ${imgUrl ? `<div class="post-img-wrap" ondblclick="doubleTapLike(${p.id}, this)"><img src="${imgUrl}" class="post-img" onclick="openPostView(${p.id})"><div class="heart-anim">❤️</div></div>` : ''}
        <div class="post-actions">
            <div class="pa-left">
                <button class="pa-btn ${p.is_liked ? 'liked' : ''}" onclick="toggleLike(${p.id}, this)">
                    <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
                <button class="pa-btn" onclick="openPostView(${p.id})">
                    <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </button>
            </div>
        </div>
        <div class="post-likes"><span>${p.likes_count}</span> ta like</div>
        <div class="post-caption"><strong>${p.user.handle}</strong> ${p.caption}</div>
    </article>
    `;
}

function renderExplore() {
    const list = document.getElementById('explore-content');
    const images = postsData.map(p => p.image_url).filter(i => i);
    list.innerHTML = `<div class="explore-grid">${images.map(img => `<div class="explore-grid-item"><img src="${img}"></div>`).join('')}</div>`;
}

function renderMessages() {
    const list = document.getElementById('chat-list');
    if (!messagesData || messagesData.length === 0) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:#666;">Xabarlar yo'q</div>`;
        return;
    }
    list.innerHTML = messagesData.map(m => `
        <div class="chat-item" onclick="openChat(${m.contact_id}, '${m.username}', '${m.avatar}')">
            <img src="${m.avatar}">
            <div class="ci-info">
                <div class="ci-name">${m.full_name}</div>
                <div class="ci-msg ${m.is_read ? '' : 'unread'}">${m.text || (m.file_type ? 'Fayl' : '')}</div>
            </div>
            ${m.sender_id == currentUser.id ? `<span class="read-receipt ${m.is_read ? '' : 'unread'}">✓✓</span>` : ''}
        </div>
    `).join('');
}

function renderNotifications() {
    document.getElementById('notif-list').innerHTML = notifData.map(n => `
        <div class="chat-item">
            <img src="${n.avatar}">
            <div class="ci-info"><strong>${n.full_name}</strong> ${n.type === 'like' ? 'postingizga layk bosdi' : "obuna bo'ldi"}</div>
        </div>
    `).join('');
}

// --- INTERACTIONS ---
async function toggleLike(id, btn) {
    const res = await apiFetch(`/posts/${id}/like`, { method: 'POST' });
    btn.classList.toggle('liked', res.liked);
    loadAllData().then(() => renderFeed());
}

async function viewUserProfile(username) {
    const user = await apiFetch(`/users/${username}`);
    document.getElementById('profile-avatar').src = user.avatar;
    document.getElementById('profile-fullname').textContent = user.full_name;
    document.getElementById('profile-handle').textContent = `@${user.username}`;
    document.getElementById('profile-bio-text').textContent = user.bio || 'Bio kiritilmagan';

    const actions = document.querySelector('.profile-actions');
    if (user.id !== currentUser.id) {
        actions.innerHTML = `
            <button class="btn-primary" onclick="toggleFollow(${user.id}, this)">${user.is_following ? 'Obuna bekor' : 'Obuna bo\'lish'}</button>
            <button class="btn-secondary" onclick="openChat(${user.id}, '${user.username}', '${user.avatar}')">Xabar</button>
        `;
    } else {
        actions.innerHTML = `<button class="btn-primary" onclick="openEditProfile()">Tahrirlash</button>`;
    }

    const userPosts = postsData.filter(p => p.user.id === user.id);
    document.getElementById('profile-posts-grid').innerHTML = `<div class="explore-grid">${userPosts.map(p => `<div class="explore-grid-item" onclick="openPostView(${p.id})"><img src="${p.image_url}"></div>`).join('')}</div>`;
    goTo('profile-page');
}

// --- STORY REACTIONS ---
let currentStoryId = null;
async function viewStory(id) {
    currentStoryId = id;
    const story = storiesData.find(s => s.id === id);
    if (!story) return;
    const modal = document.getElementById('story-modal');
    document.getElementById('story-img').src = story.image_url;
    document.getElementById('story-user-info').innerHTML = `<img src="${story.avatar}"><span>${story.full_name}</span>`;
    modal.classList.remove('hidden');

    // Track view
    apiFetch(`/stories/${id}/view`, { method: 'POST' }).catch(() => { });

    // If it's my story, show viewers button
    const reactionRow = document.querySelector('.story-reactions');
    if (story.user_id === currentUser.id) {
        reactionRow.innerHTML = `<button onclick="showStoryViewers(${id})">👁 Ko'ruvchilar</button>`;
    } else {
        reactionRow.innerHTML = `
            <button onclick="reactToStory('❤️')">❤️</button>
            <button onclick="reactToStory('🔥')">🔥</button>
            <button onclick="reactToStory('😂')">😂</button>
            <button onclick="reactToStory('😮')">😮</button>
            <button onclick="reactToStory('😢')">😢</button>
            <button onclick="reactToStory('👏')">👏</button>
        `;
    }

    setTimeout(() => closeModal('story-modal'), 10000);
}

async function showStoryViewers(id) {
    const viewers = await apiFetch(`/stories/${id}/viewers`);
    showToast(`${viewers.length} kishi ko'rdi: ` + viewers.map(v => v.full_name).join(', '));
}

async function reactToStory(emoji) {
    if (!currentStoryId) return;
    await apiFetch(`/stories/${currentStoryId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji })
    });
    showToast(`Reaksiya qoldirildi: ${emoji}`);
}

function closeStory() { closeModal('story-modal'); }

// --- MESSAGING & CALLS ---
let currentChatUser = null; // { id, username, avatar }
let currentChatUserId = null;

async function openChat(userId, username, avatar) {
    if (userId) {
        currentChatUser = { id: userId, username, avatar };
    } else if (currentChatUser) {
        userId = currentChatUser.id;
        username = currentChatUser.username;
        avatar = currentChatUser.avatar;
    } else return;

    currentChatUserId = userId;
    const convCol = document.getElementById('conv-col');
    if (!convCol) return;

    // Show conv col on mobile
    convCol.classList.add('active');

    // Mark messages as read
    const unreadMessages = messagesData.filter(m => m.sender_id == userId && !m.is_read);
    unreadMessages.forEach(m => socket.emit('mark-as-read', { messageId: m.id, senderId: m.sender_id }));

    convCol.innerHTML = `
        <div class="conv-header">
            <button class="icon-btn mobile-only" onclick="document.getElementById('conv-col').classList.remove('active')">←</button>
            <img src="${avatar}" onclick="viewUserProfile('${username.replace(/'/g, "\\'")}')" style="cursor:pointer">
            <div onclick="viewUserProfile('${username.replace(/'/g, "\\'")}')" style="cursor:pointer"><strong>${username}</strong></div>
            <div class="conv-header-actions">
                <button class="icon-btn" onclick="startCall(${userId}, '${username.replace(/'/g, "\\'")}', '${avatar}')">📞</button>
                <button class="icon-btn" onclick="document.getElementById('chat-file-input').click()">📎</button>
                <button class="icon-btn" onclick="startRoundVideo()">📹</button>
            </div>
        </div>
        <div id="messages-container" class="messages-container"></div>
        <div class="conv-input">
            <input type="file" id="chat-file-input" style="display:none" onchange="uploadChatFile(event)">
            <input type="text" id="msg-input" placeholder="Xabar yozing..." onkeypress="if(event.key==='Enter') sendPrivateMessage()">
            <button onclick="sendPrivateMessage()">Ulashish</button>
        </div>
    `;

    const history = await apiFetch(`/messages/${userId}`);
    const container = document.getElementById('messages-container');
    container.innerHTML = history.map(m => createMessageHTML(m)).join('');
    container.scrollTop = container.scrollHeight;

    // Focus input
    setTimeout(() => {
        const input = document.getElementById('msg-input');
        if (input) input.focus();
    }, 100);
}

function createMessageHTML(m) {
    const isMe = m.sender_id == currentUser.id;
    let content = m.text || '';
    if (m.file_url) {
        if (m.file_type === 'image') content = `<div class="msg-media"><img src="${m.file_url}"></div>` + content;
        else if (m.file_type === 'round-video') content = `<video class="msg-round-video" src="${m.file_url}" autoplay loop muted></video>`;
        else content = `<a href="${m.file_url}" class="msg-file" download>📎 Fayl (${m.file_type})</a>` + content;
    }
    
    // Grey ✓✓ if unread, Blue ✓✓ if read
    const checkmarks = isMe ? `<span class="read-receipt ${m.is_read ? 'read' : 'unread'}">✓✓</span>` : '';
    
    return `
        <div class="message ${isMe ? 'outgoing' : 'incoming'}">
            <div class="msg-bubble">
                ${content}
                ${checkmarks}
            </div>
        </div>
    `;
}

function sendPrivateMessage(fileData = {}) {
    if (!socket || !socket.connected) {
        showToast("Server bilan bog'lanish yo'q. Iltimos, sahifani yangilang.");
        return;
    }
    const input = document.getElementById('msg-input');
    const text = input ? input.value.trim() : '';
    if (!text && !fileData.fileUrl) return;

    socket.emit('send-private-message', {
        senderId: currentUser.id,
        receiverId: currentChatUserId,
        text: text,
        fileUrl: fileData.fileUrl || null,
        fileType: fileData.fileType || null
    });
    if (input) input.value = '';

    // Add optimistic UI or at least feedback
    console.log("Xabar yuborildi:", text);
}

async function uploadChatFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const type = file.type.startsWith('image') ? 'image' : 'file';
        sendPrivateMessage({ fileUrl: ev.target.result, fileType: type });
    };
    reader.readAsDataURL(file);
}

function startRoundVideo() {
    showToast("Dumaloq video xabar yozishni boshlash...");
    // Mock implementation for demo
    setTimeout(() => {
        sendPrivateMessage({ fileUrl: 'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHYybXl6bjR4ZG0xbnd4ZG0xbnd4ZG0xbnd4ZG0xbnd4ZG0xbnd4ZG0meXpueCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKMGpxrL6pXN3mU/giphy.gif', fileType: 'round-video' });
    }, 2000);
}

// --- AUDIO FEEDBACK ---
function playDialingSound() { document.getElementById('audio-dialing').play().catch(e => { }); }
function stopDialingSound() {
    const a = document.getElementById('audio-dialing');
    if (a) { a.pause(); a.currentTime = 0; }
}
function playRingingSound() { document.getElementById('audio-ringing').play().catch(e => { }); }
function stopRingingSound() {
    const a = document.getElementById('audio-ringing');
    if (a) { a.pause(); a.currentTime = 0; }
}

function playMessageSound() {
    const a = document.getElementById('audio-message');
    if (a) a.play().catch(e => { });
}

// --- VIDEO CALL LOGIC ---
async function startCall(toUserId, name, avatar) {
    if (!socket || !socket.connected) {
        showToast("Server bilan bog'lanish yo'q. Qayta ulanishga harakat qilinmoqda...");
        initSocket(); // Force re-init if disconnected
        return;
    }
    const modal = document.getElementById('call-modal');
    modal.classList.remove('hidden');
    document.getElementById('call-avatar').src = avatar;
    document.getElementById('call-name').textContent = name;
    document.getElementById('call-status').textContent = "Qo'ng'iroq qilinmoqda...";

    playDialingSound();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            }, 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        document.getElementById('local-video').srcObject = localStream;

        console.log("Creating peer (initiator)...");
        peer = new SimplePeer({
            initiator: true,
            trickle: false,
            stream: localStream,
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
        });

        peer.on('signal', data => {
            console.log("Sending offer to:", toUserId);
            socket.emit('call-user', {
                to: toUserId,
                offer: data,
                fromName: currentUser.full_name,
                fromAvatar: currentUser.avatar,
                fromUserId: currentUser.id
            });
        });

        peer.on('stream', stream => {
            console.log("Received remote stream");
            const remoteVideo = document.getElementById('remote-video');
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(e => console.error("Remote video play error:", e));
        });

        peer.on('error', err => {
            console.error("Peer error:", err);
            showToast("Aloqa uzildi");
            endCall();
        });

        peer.on('close', () => endCall());
    } catch (err) {
        console.error("Camera error:", err);
        showToast("Kameraga ruxsat berilmadi yoki xatolik yuz berdi");
        endCall();
    }
}

function acceptCall(data) {
    if (!data) {
        console.error("Accept call error: No data provided");
        // Fallback for button click without data (it should have been set in socket listener)
        return;
    }
    stopRingingSound();
    document.getElementById('call-status').textContent = "Bog'lanmoqda...";
    document.getElementById('accept-call').style.display = 'none';

    navigator.mediaDevices.getUserMedia({ 
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
        }, 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    }).then(stream => {
        localStream = stream;
        document.getElementById('local-video').srcObject = localStream;

        peer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream: localStream,
            config: { 
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ] 
            }
        });

        peer.on('signal', signal => {
            socket.emit('answer-call', { to: data.from, answer: signal });
        });

        peer.on('stream', stream => {
            const remoteVideo = document.getElementById('remote-video');
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(e => console.error("Remote video play error:", e));
        });

        peer.on('error', err => {
            console.error("Peer error:", err);
            endCall();
        });

        peer.signal(data.offer);
    }).catch(err => {
        console.error("UserMedia error:", err);
        showToast("Xatolik: " + err.message);
        endCall();
    });
}

function endCall() {
    stopDialingSound();
    stopRingingSound();
    if (peer) peer.destroy();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    document.getElementById('call-modal').classList.add('hidden');
    document.getElementById('accept-call').style.display = 'inline-block';
    peer = null;
}

// --- SOCKET ---
let activeLivesData = [];
let socket = null;

function initSocket() {
    if (socket && socket.connected) return;

    const stateEl = document.getElementById('conn-state');
    if (stateEl) stateEl.textContent = "Bog'lanmoqda...";

    if (typeof io === 'undefined') {
        if (stateEl) {
            stateEl.textContent = "Kutubxona yo'q!";
            stateEl.style.color = "red";
        }
        console.error("Socket.io library not loaded!");
        return;
    }

    // Auto-detect connection URL
    socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 500
    });

    console.log('Connecting to socket...');

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        const stateEl = document.getElementById('conn-state');
        if (stateEl) {
            stateEl.textContent = "Online";
            stateEl.style.color = "#22c55e";
        }
        if (currentUser) {
            console.log('Identifying user:', currentUser.id);
            socket.emit('identify', currentUser.id);
        }
    });

    socket.on('disconnect', () => {
        console.warn('Socket disconnected');
        const stateEl = document.getElementById('conn-state');
        if (stateEl) {
            stateEl.textContent = "Oflayn";
            stateEl.style.color = "#ef4444";
        }
    });

    socket.on('reconnect', (attempt) => {
        console.log('Socket reconnected after', attempt, 'attempts');
        const stateEl = document.getElementById('conn-state');
        if (stateEl) {
            stateEl.textContent = "Online";
            stateEl.style.color = "#22c55e";
        }
        if (currentUser) {
            socket.emit('identify', currentUser.id);
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        const stateEl = document.getElementById('conn-state');
        if (stateEl) {
            stateEl.textContent = "Xatolik";
            stateEl.style.color = "#f59e0b";
        }
    });

    // Ensure identify is sent if already connected
    if (socket && socket.connected && currentUser) {
        socket.emit('identify', currentUser.id);
    }

    socket.on('new-private-message', (msg) => {
        playMessageSound();
        if (currentChatUserId == msg.sender_id) {
            const container = document.getElementById('messages-container');
            container.innerHTML += createMessageHTML(msg);
            container.scrollTop = container.scrollHeight;
            socket.emit('mark-as-read', { messageId: msg.id, senderId: msg.sender_id });
        } else {
            showToast(`Yangi xabar: ${msg.text || 'Fayl'}`);
            loadAllData().then(() => renderMessages());
        }
    });

    socket.on('message-sent', (msg) => {
        if (currentChatUserId == msg.receiver_id) {
            const container = document.getElementById('messages-container');
            container.innerHTML += createMessageHTML(msg);
            container.scrollTop = container.scrollHeight;
        }
        loadAllData().then(() => renderMessages());
    });

    socket.on('message-read', (data) => {
        loadAllData().then(() => {
            renderMessages();
            if (currentChatUserId) openChat(); // Use stored info
        });
    });

    socket.on('incoming-call', (data) => {
        console.log("Incoming call from:", data.fromName);
        showToast(`Kiruvchi qo'ng'iroq: ${data.fromName}`);
        playRingingSound();
        const modal = document.getElementById('call-modal');
        modal.classList.remove('hidden');
        document.getElementById('call-avatar').src = data.fromAvatar;
        document.getElementById('call-name').textContent = data.fromName;
        document.getElementById('call-status').textContent = "Kiruvchi qo'ng'iroq...";

        // Update accept button to pass data
        const acceptBtn = document.getElementById('accept-call');
        acceptBtn.onclick = () => acceptCall(data);

        // Show the accept button in case it was hidden
        acceptBtn.style.display = 'inline-block';
    });

    socket.on('call-accepted', (data) => {
        stopDialingSound();
        document.getElementById('call-status').textContent = "Bog'landi";
        if (peer) peer.signal(data.answer);
    });

    socket.on('call-failed', (data) => {
        showToast(data.reason);
        endCall();
    });

    socket.on('message-error', (data) => {
        showToast(data.error);
    });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

function openCreateModal() { document.getElementById('create-modal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeIfOverlay(e, id) { if (e.target.id === id) closeModal(id); }

async function handleSearch(q) {
    if (!q) { renderExplore(); return; }
    const users = await apiFetch(`/users/search?q=${q}`);
    const content = document.getElementById('explore-content');
    content.innerHTML = `<div class="search-results">${users.map(u => `
        <div class="chat-item" onclick="viewUserProfile('${u.username}')">
            <img src="${u.avatar}">
            <div class="ci-info">
                <div class="ci-name">${u.full_name}</div>
                <div class="ci-msg">@${u.username}</div>
            </div>
        </div>`).join('')}</div>`;
}

function openSettings() { document.getElementById('settings-modal').classList.remove('hidden'); }
function openEditProfile() { document.getElementById('edit-profile-modal').classList.remove('hidden'); }
function logout() { localStorage.removeItem('arcos_token'); location.reload(); }

// --- POST CREATION ---
let postImageBase64 = '';

function previewImg(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('img-preview').src = e.target.result;
            document.getElementById('img-preview-wrap').classList.remove('hidden');
            postImageBase64 = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

function removeImg() {
    postImageBase64 = '';
    document.getElementById('img-preview-wrap').classList.add('hidden');
    document.getElementById('img-upload').value = '';
}

async function submitPost() {
    const caption = document.getElementById('post-text').value.trim();
    if (!caption && !postImageBase64) {
        showToast("Post mazmuni bo'sh bo'lishi mumkin emas");
        return;
    }

    const btn = document.querySelector('#create-modal .btn-primary');
    const origText = btn.textContent;
    btn.textContent = 'Yuklanmoqda...';
    btn.disabled = true;

    try {
        await apiFetch('/posts', {
            method: 'POST',
            body: JSON.stringify({ caption, image: postImageBase64 })
        });
        showToast("Post muvaffaqiyatli qo'shildi!");
        closeModal('create-modal');
        // Reset
        document.getElementById('post-text').value = '';
        removeImg();
        await loadAllData();
        renderFeed();
    } catch (e) {
        showToast("Xatolik: " + e.message);
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}

function suggestCaption() {
    const captions = [
        "Bugungi kun ajoyib o'tdi! ✨",
        "Yangi marralar sari... 🚀",
        "Hayot go'zal, uni qadrlang. ❤️",
        "ARcos orqali ulanish yanada oson! 🌐",
        "Tabiat qo'ynida dam olish bari bir boshqacha. 🌿"
    ];
    document.getElementById('post-text').value = captions[Math.floor(Math.random() * captions.length)];
}
