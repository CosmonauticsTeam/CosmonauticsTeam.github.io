import { firebaseConfig, isDemoMode } from './firebase-config.js';
export { isDemoMode };

// Global state
let app, auth, db;
let currentUser = {
  uid: null,
  displayName: '',
  avatarColor: ''
};

// Available premium cybercolors for avatars
const AVATAR_COLORS = [
  '#00f3ff', // Cyan
  '#ff007f', // Pink/Neon Red
  '#9d00ff', // Purple
  '#00ff66', // Lime Green
  '#ffaa00', // Amber
  '#e5fe00', // Yellow-green
  '#ff3c00'  // Solar flare orange
];

// Initialize Auth Profile
function getOrInitLocalProfile() {
  let profile = localStorage.getItem('cosmo_user_profile');
  if (profile) {
    try {
      return JSON.parse(profile);
    } catch (e) {
      // ignore parsing error
    }
  }

  // Generate new profile
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const newProfile = {
    uid: 'guest_' + Math.random().toString(36).substr(2, 9),
    displayName: `Cosmonaut #${randNum}`,
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  };
  localStorage.setItem('cosmo_user_profile', JSON.stringify(newProfile));
  return newProfile;
}

const localProfile = getOrInitLocalProfile();
currentUser.displayName = localProfile.displayName;
currentUser.avatarColor = localProfile.avatarColor;

// Event listener registry for Demo Mode (simulates Firestore's realtime updates)
const listeners = {
  comments: {}, // postId -> array of callbacks
  votes: {},    // postId -> array of callbacks
  polls: {},    // postId -> array of callbacks
  bugs: []      // array of callbacks for bugs
};

function triggerLocalEvent(type, postId, data) {
  if (type === 'bugs') {
    listeners.bugs.forEach(cb => cb(data));
    return;
  }
  if (listeners[type] && listeners[type][postId]) {
    listeners[type][postId].forEach(cb => cb(data));
  }
}

// --- INITIALIZATION ---
export async function initializePlatform() {
  if (isDemoMode) {
    console.log("%c[CosmoPlatform] Running in DEMO MODE (LocalStorage)", "color: #00f3ff; font-weight: bold;");
    currentUser.uid = localProfile.uid;
    return { demo: true };
  }

  try {
    // Dynamically import Firebase libraries
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    const { getAuth, signInAnonymously, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Sign in anonymously
    await signInAnonymously(auth);

    return new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        if (user) {
          currentUser.uid = user.uid;
          // Sync local profile UID
          const profile = getOrInitLocalProfile();
          profile.uid = user.uid;
          localStorage.setItem('cosmo_user_profile', JSON.stringify(profile));
          console.log("%c[CosmoPlatform] Connected to Live Firebase Auth & Firestore!", "color: #00ff66; font-weight: bold;");
          resolve({ demo: false, user });
        }
      });
    });
  } catch (error) {
    console.error("Firebase connection failed. Falling back to Demo Mode.", error);
    // Force demo mode on error
    currentUser.uid = localProfile.uid;
    return { demo: true, error };
  }
}

// --- USER PROFILE ---
export function getCurrentUser() {
  return currentUser;
}

export function updateUserProfile(displayName, avatarColor) {
  if (!displayName || displayName.trim().length === 0) return;
  currentUser.displayName = displayName.trim().substring(0, 32);
  if (avatarColor && AVATAR_COLORS.includes(avatarColor)) {
    currentUser.avatarColor = avatarColor;
  }
  
  // Save to local storage
  const profile = getOrInitLocalProfile();
  profile.displayName = currentUser.displayName;
  profile.avatarColor = currentUser.avatarColor;
  localStorage.setItem('cosmo_user_profile', JSON.stringify(profile));

  // If Firebase is active, we could store it in a users collection if needed, 
  // but comments themselves store authorName and avatarColor at the time of writing to avoid extra reads.
}

export function getAvatarColors() {
  return AVATAR_COLORS;
}

// --- COMMENTS SYSTEM ---

// Subscribe to comments in real-time
export async function subscribeComments(postId, callback) {
  if (isDemoMode || !db) {
    // Register local listener
    if (!listeners.comments[postId]) {
      listeners.comments[postId] = [];
    }
    listeners.comments[postId].push(callback);

    // Initial load
    const loadLocal = () => {
      const allComments = JSON.parse(localStorage.getItem(`cosmo_comments_${postId}`) || '[]');
      // Sort by timestamp asc
      allComments.sort((a, b) => a.timestamp - b.timestamp);
      callback(allComments);
    };
    loadLocal();
    return () => {
      listeners.comments[postId] = listeners.comments[postId].filter(cb => cb !== callback);
    };
  }

  // Live Firestore version
  const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  const q = query(collection(db, 'posts', postId.toString(), 'comments'), orderBy('timestamp', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const comments = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      comments.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp ? data.timestamp.toMillis() : Date.now()
      });
    });
    callback(comments);
  }, (error) => {
    console.error("Firestore comments snapshot error:", error);
  });
}

// Add a comment
export async function addComment(postId, content, parentId = null) {
  if (!content || content.trim().length === 0) return;
  const cleanContent = content.trim().substring(0, 1000);

  if (isDemoMode || !db) {
    const commentsKey = `cosmo_comments_${postId}`;
    const allComments = JSON.parse(localStorage.getItem(commentsKey) || '[]');
    const newComment = {
      id: 'comment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      content: cleanContent,
      authorName: currentUser.displayName,
      userId: currentUser.uid,
      avatarColor: currentUser.avatarColor,
      timestamp: Date.now(),
      parentId: parentId
    };
    allComments.push(newComment);
    localStorage.setItem(commentsKey, JSON.stringify(allComments));
    triggerLocalEvent('comments', postId, allComments);
    return newComment;
  }

  // Live Firestore
  const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  return await addDoc(collection(db, 'posts', postId.toString(), 'comments'), {
    content: cleanContent,
    authorName: currentUser.displayName,
    userId: currentUser.uid,
    avatarColor: currentUser.avatarColor,
    timestamp: serverTimestamp(),
    parentId: parentId
  });
}

// Delete a comment
export async function deleteComment(postId, commentId) {
  if (isDemoMode || !db) {
    const commentsKey = `cosmo_comments_${postId}`;
    let allComments = JSON.parse(localStorage.getItem(commentsKey) || '[]');
    allComments = allComments.filter(c => c.id !== commentId);
    localStorage.setItem(commentsKey, JSON.stringify(allComments));
    triggerLocalEvent('comments', postId, allComments);
    return;
  }

  // Live Firestore
  const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  await deleteDoc(doc(db, 'posts', postId.toString(), 'comments', commentId));
}

// Flag comment
export async function flagComment(postId, commentId) {
  if (isDemoMode || !db) {
    const commentsKey = `cosmo_comments_${postId}`;
    let allComments = JSON.parse(localStorage.getItem(commentsKey) || '[]');
    allComments = allComments.map(c => c.id === commentId ? { ...c, flagged: true } : c);
    localStorage.setItem(commentsKey, JSON.stringify(allComments));
    triggerLocalEvent('comments', postId, allComments);
    return;
  }

  const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  await updateDoc(doc(db, 'posts', postId.toString(), 'comments', commentId), { flagged: true });
}

// Unflag comment
export async function unflagComment(postId, commentId) {
  if (isDemoMode || !db) {
    const commentsKey = `cosmo_comments_${postId}`;
    let allComments = JSON.parse(localStorage.getItem(commentsKey) || '[]');
    allComments = allComments.map(c => {
      if (c.id === commentId) {
        const copy = { ...c };
        delete copy.flagged;
        return copy;
      }
      return c;
    });
    localStorage.setItem(commentsKey, JSON.stringify(allComments));
    triggerLocalEvent('comments', postId, allComments);
    return;
  }

  const { doc, updateDoc, deleteField } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  await updateDoc(doc(db, 'posts', postId.toString(), 'comments', commentId), { flagged: deleteField() });
}

// --- VOTING SYSTEM ---

// Subscribe to votes in real-time
export async function subscribeVotes(postId, callback) {
  if (isDemoMode || !db) {
    if (!listeners.votes[postId]) {
      listeners.votes[postId] = [];
    }
    listeners.votes[postId].push(callback);

    const loadLocal = () => {
      const votesMap = JSON.parse(localStorage.getItem(`cosmo_votes_${postId}`) || '{}');
      let score = 0;
      let userVote = 0;
      Object.keys(votesMap).forEach(uid => {
        score += votesMap[uid];
        if (uid === currentUser.uid) {
          userVote = votesMap[uid];
        }
      });
      callback({ score, userVote });
    };
    loadLocal();
    return () => {
      listeners.votes[postId] = listeners.votes[postId].filter(cb => cb !== callback);
    };
  }

  // Live Firestore version
  const { collection, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  
  return onSnapshot(collection(db, 'posts', postId.toString(), 'votes'), (snapshot) => {
    let score = 0;
    let userVote = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      const voteVal = data.vote || 0;
      score += voteVal;
      if (doc.id === currentUser.uid) {
        userVote = voteVal;
      }
    });
    callback({ score, userVote });
  }, (error) => {
    console.error("Firestore votes snapshot error:", error);
  });
}

// Submit a vote
export async function submitVote(postId, value) {
  // value is expected to be: 1 (up), -1 (down), 0 (retracted)
  if (value !== 1 && value !== -1 && value !== 0) return;

  if (isDemoMode || !db) {
    const votesKey = `cosmo_votes_${postId}`;
    const votesMap = JSON.parse(localStorage.getItem(votesKey) || '{}');
    if (value === 0) {
      delete votesMap[currentUser.uid];
    } else {
      votesMap[currentUser.uid] = value;
    }
    localStorage.setItem(votesKey, JSON.stringify(votesMap));
    
    // Tally up
    let score = 0;
    let userVote = 0;
    Object.keys(votesMap).forEach(uid => {
      score += votesMap[uid];
      if (uid === currentUser.uid) {
        userVote = votesMap[uid];
      }
    });
    triggerLocalEvent('votes', postId, { score, userVote });
    return;
  }

  // Live Firestore
  const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  const voteDocRef = doc(db, 'posts', postId.toString(), 'votes', currentUser.uid);
  await setDoc(voteDocRef, {
    vote: value,
    timestamp: serverTimestamp()
  });
}

// --- POLL SYSTEM ---

// Subscribe to poll votes in real-time
export async function subscribePoll(postId, callback) {
  if (isDemoMode || !db) {
    if (!listeners.polls[postId]) {
      listeners.polls[postId] = [];
    }
    listeners.polls[postId].push(callback);

    const loadLocal = () => {
      const votesMap = JSON.parse(localStorage.getItem(`cosmo_poll_votes_${postId}`) || '{}');
      const counts = {};
      let userVotedOption = null;
      
      Object.keys(votesMap).forEach(uid => {
        const optionIndex = votesMap[uid];
        counts[optionIndex] = (counts[optionIndex] || 0) + 1;
        if (uid === currentUser.uid) {
          userVotedOption = optionIndex;
        }
      });
      callback({ counts, userVotedOption });
    };
    loadLocal();
    return () => {
      listeners.polls[postId] = listeners.polls[postId].filter(cb => cb !== callback);
    };
  }

  // Live Firestore version
  const { collection, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  
  return onSnapshot(collection(db, 'posts', postId.toString(), 'pollVotes'), (snapshot) => {
    const counts = {};
    let userVotedOption = null;
    snapshot.forEach((doc) => {
      const data = doc.data();
      const optionIndex = data.optionIndex;
      if (optionIndex !== undefined) {
        counts[optionIndex] = (counts[optionIndex] || 0) + 1;
        if (doc.id === currentUser.uid) {
          userVotedOption = optionIndex;
        }
      }
    });
    callback({ counts, userVotedOption });
  }, (error) => {
    console.error("Firestore poll snapshot error:", error);
  });
}

// Submit a vote in the poll
export async function submitPollVote(postId, optionIndex) {
  if (optionIndex === null || optionIndex === undefined) return;

  if (isDemoMode || !db) {
    const votesKey = `cosmo_poll_votes_${postId}`;
    const votesMap = JSON.parse(localStorage.getItem(votesKey) || '{}');
    votesMap[currentUser.uid] = optionIndex;
    localStorage.setItem(votesKey, JSON.stringify(votesMap));
    
    // Tally up
    const counts = {};
    let userVotedOption = null;
    Object.keys(votesMap).forEach(uid => {
      const optIdx = votesMap[uid];
      counts[optIdx] = (counts[optIdx] || 0) + 1;
      if (uid === currentUser.uid) {
        userVotedOption = optIdx;
      }
    });
    triggerLocalEvent('polls', postId, { counts, userVotedOption });
    return;
  }

  // Live Firestore
  const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  const pollVoteDocRef = doc(db, 'posts', postId.toString(), 'pollVotes', currentUser.uid);
  await setDoc(pollVoteDocRef, {
    optionIndex: optionIndex,
    timestamp: serverTimestamp()
  });
}

// --- BUG TRACKER SYSTEM ---

export async function addBug(bugData) {
  const { title, description, steps, version, severity, crash } = bugData;
  const newBug = {
    title: title.trim().substring(0, 100),
    description: description.trim(),
    steps: steps.trim(),
    version: version.trim().substring(0, 50),
    severity: severity,
    status: 'open',
    authorName: currentUser.displayName,
    userId: currentUser.uid,
    avatarColor: currentUser.avatarColor,
    crash: crash ? crash.trim() : null
  };

  if (isDemoMode || !db) {
    const allBugs = JSON.parse(localStorage.getItem('cosmo_bugs') || '[]');
    const bug = {
      id: 'bug_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      ...newBug,
      timestamp: Date.now()
    };
    allBugs.push(bug);
    localStorage.setItem('cosmo_bugs', JSON.stringify(allBugs));
    triggerLocalEvent('bugs', null, allBugs);
    return bug;
  }

  const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  return await addDoc(collection(db, 'bugs'), {
    ...newBug,
    timestamp: serverTimestamp()
  });
}

export async function subscribeBugs(callback) {
  if (isDemoMode || !db) {
    listeners.bugs.push(callback);
    const loadLocal = () => {
      const allBugs = JSON.parse(localStorage.getItem('cosmo_bugs') || '[]');
      allBugs.sort((a, b) => b.timestamp - a.timestamp);
      callback(allBugs);
    };
    loadLocal();
    return () => {
      listeners.bugs = listeners.bugs.filter(cb => cb !== callback);
    };
  }

  const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  const q = query(collection(db, 'bugs'), orderBy('timestamp', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const bugs = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      bugs.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp ? data.timestamp.toMillis() : Date.now()
      });
    });
    callback(bugs);
  }, (error) => {
    console.error("Firestore bugs snapshot error:", error);
  });
}
