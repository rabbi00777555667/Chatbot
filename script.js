// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

// Firebase services initialized in the <script> tag in index.html and exposed to window object

// Access Firebase services from window object
const auth = window.firebaseAuth;
const db = window.firebaseDB;
const storage = window.firebaseStorage;

// DOM Elements
const authContainer = document.getElementById('auth-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const toggleAuth = document.getElementById('toggle-auth');
const toggleLink = document.getElementById('toggle-link');
const authError = document.getElementById('auth-error');
const authSuccess = document.getElementById('auth-success');
const nameField = document.getElementById('name-field');
const nameInput = document.getElementById('name');
const avatarField = document.getElementById('avatar-field');
const avatarInput = document.getElementById('avatar');

const chatContainer = document.getElementById('chat-container');
const logoutBtn = document.getElementById('logout-btn');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

// State to track authentication mode
let isLogin = true;

// Toggle between Login and Register
toggleLink.addEventListener('click', () => {
    isLogin = !isLogin;
    if (isLogin) {
        authTitle.textContent = 'Login';
        toggleLink.textContent = 'Register';
        toggleAuth.innerHTML = "Don't have an account? <span id='toggle-link'>Register</span>";
        nameField.classList.add('hidden');
        avatarField.classList.add('hidden');
        authSuccess.classList.add('hidden');
    } else {
        authTitle.textContent = 'Register';
        toggleLink.textContent = 'Login';
        toggleAuth.innerHTML = "Already have an account? <span id='toggle-link'>Login</span>";
        nameField.classList.remove('hidden');
        avatarField.classList.remove('hidden');
        authSuccess.classList.add('hidden');
    }
});

// Handle Authentication Form Submission
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    authSuccess.textContent = '';
    authSuccess.classList.add('hidden');

    const email = authForm.email.value.trim();
    const password = authForm.password.value.trim();
    const name = nameInput.value.trim();
    const avatarFile = avatarInput.files[0];

    // Basic Email Validation
    if (!validateEmail(email)) {
        authError.textContent = 'Please enter a valid email address.';
        return;
    }

    if (password.length < 6) {
        authError.textContent = 'Password should be at least 6 characters.';
        return;
    }

    if (!isLogin && !name) {
        authError.textContent = 'Please enter your name.';
        return;
    }

    if (!isLogin && avatarFile && !avatarFile.type.startsWith('image/')) {
        authError.textContent = 'Please upload a valid image for your avatar.';
        return;
    }

    if (isLogin) {
        // Login
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                await sendEmailVerification(user);
                authSuccess.textContent = 'Verification email sent. Please check your inbox.';
                authSuccess.classList.remove('hidden');
                await signOut(auth);
                return;
            }

            authForm.reset();
        } catch (error) {
            authError.textContent = error.message;
        }
    } else {
        // Register
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            let avatarURL = '';
            if (avatarFile) {
                // Upload Avatar to Firebase Storage
                const avatarRef = ref(storage, `avatars/${user.uid}/${avatarFile.name}`);
                const snapshot = await uploadBytes(avatarRef, avatarFile);
                avatarURL = await getDownloadURL(snapshot.ref);
            }

            // Add user details to Firestore with UID as document ID
            await setDoc(doc(db, "users", user.uid), {
                name: name,
                email: email,
                avatar: avatarURL,
                createdAt: serverTimestamp()
            });

            // Send Email Verification
            await sendEmailVerification(user);
            authSuccess.textContent = 'Registration successful! Verification email sent. Please check your inbox.';
            authSuccess.classList.remove('hidden');
            authForm.reset();
        } catch (error) {
            authError.textContent = error.message;
        }
    }
});

// Listen for Authentication State Changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.emailVerified) {
            // User is logged in and verified
            authContainer.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            loadMessages();
        } else {
            // User is not verified
            authContainer.classList.remove('hidden');
            chatContainer.classList.add('hidden');
            authSuccess.textContent = 'Please verify your email to access the chat.';
            authSuccess.classList.remove('hidden');
        }
    } else {
        // User is logged out
        authContainer.classList.remove('hidden');
        chatContainer.classList.add('hidden');
        messagesDiv.innerHTML = '';
    }
});

// Logout Functionality
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
    }
});

// Send Message
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageText = messageInput.value.trim();
    if (messageText === '') return;

    const user = auth.currentUser;
    if (!user) return;

    try {
        // Fetch user data from Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
            throw new Error("User data not found.");
        }

        const userData = userDoc.data();

        // Add message to Firestore
        await addDoc(collection(db, "messages"), {
            text: messageText,
            createdAt: serverTimestamp(),
            userId: user.uid,
            userName: userData.name,
            userAvatar: userData.avatar || ''
        });

        messageForm.reset();
        scrollToBottom();
    } catch (error) {
        console.error("Error sending message:", error);
        // Optionally display error to user
    }
});

// Load Messages in Real-Time
function loadMessages() {
    const q = query(collection(db, "messages"), orderBy("createdAt"));
    onSnapshot(q, (snapshot) => {
        messagesDiv.innerHTML = '';
        snapshot.forEach((doc) => {
            const message = doc.data();
            displayMessage(message);
        });
        scrollToBottom();
    });
}

// Display a Single Message
function displayMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    if (auth.currentUser.uid === message.userId) {
        messageDiv.classList.add('sent');
    } else {
        messageDiv.classList.add('received');
    }

    if (message.userAvatar) {
        const avatarImg = document.createElement('img');
        avatarImg.src = message.userAvatar;
        avatarImg.alt = `${message.userName}'s avatar`;
        avatarImg.classList.add('avatar');
        messageDiv.appendChild(avatarImg);
    }

    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');

    const userName = document.createElement('span');
    userName.classList.add('user-name');
    userName.textContent = message.userName;
    messageContent.appendChild(userName);

    const text = document.createElement('p');
    text.classList.add('text');
    text.textContent = message.text;
    messageContent.appendChild(text);

    const timestamp = document.createElement('span');
    timestamp.classList.add('timestamp');
    if (message.createdAt) {
        const date = message.createdAt.toDate();
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 || 12;
        timestamp.textContent = `${formattedHours}:${minutes} ${ampm}`;
    } else {
        timestamp.textContent = '';
    }
    messageContent.appendChild(timestamp);

    messageDiv.appendChild(messageContent);
    messagesDiv.appendChild(messageDiv);
}

// Scroll to the Bottom of Messages
function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Email Validation Function
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}