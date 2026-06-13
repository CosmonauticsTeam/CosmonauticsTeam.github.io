import { 
  initializePlatform, 
  getCurrentUser, 
  updateUserProfile, 
  getAvatarColors, 
  subscribeComments, 
  addComment, 
  deleteComment, 
  flagComment,
  subscribeVotes, 
  submitVote,
  subscribePoll,
  submitPollVote,
  subscribeBugs,
  addBug,
  isDemoMode
} from './firebase-platform.js';

document.addEventListener('DOMContentLoaded', async () => {
  initSpaceBackground();
  await initializePlatform();
  loadJSONPosts();
  loadJSONDownloads();
  initScrollSpy();
  initCookieBannerAndLegals();
  initBugTracker();
});

function initSpaceBackground() {
  const canvas = document.getElementById('space-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let stars = [];
  let mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const starCount = 120;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createStars();
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.8 + 0.2,
        alpha: Math.random(),
        twinkleSpeed: 0.005 + Math.random() * 0.015,
        twinkleDir: Math.random() > 0.5 ? 1 : -1,
        parallaxFactor: Math.random() * 0.04 + 0.01
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    mouse.x += (mouse.targetX - mouse.x) * 0.08;
    mouse.y += (mouse.targetY - mouse.y) * 0.08;

    stars.forEach(star => {
      star.alpha += star.twinkleSpeed * star.twinkleDir;
      if (star.alpha >= 1) {
        star.alpha = 1;
        star.twinkleDir = -1;
      } else if (star.alpha <= 0.1) {
        star.alpha = 0.1;
        star.twinkleDir = 1;
      }

      const posX = (star.x + mouse.x * star.parallaxFactor + canvas.width) % canvas.width;
      const posY = (star.y + mouse.y * star.parallaxFactor + canvas.height) % canvas.height;

      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      ctx.beginPath();
      ctx.arc(posX, posY, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('mousemove', (e) => {
    mouse.targetX = e.clientX - window.innerWidth / 2;
    mouse.targetY = e.clientY - window.innerHeight / 2;
  });

  resizeCanvas();
  draw();
}

function parseMarkdown(text) {
  if (!text) return '';
  let html = text.replace(/\r\n/g, '\n');

  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');

  html = html.replace(/^\*\s+(.+)$/gm, '<li>$1</li>');

  html = html.replace(/(<li>.*<\/li>(?:\n<li>.*<\/li>)*)/g, '<ul>$1</ul>');

  const blocks = html.split('\n\n');
  const parsedBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<li')) {
      return block;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  });

  return parsedBlocks.join('\n');
}

async function loadJSONPosts() {
  const postsContainer = document.getElementById('posts-container');
  if (!postsContainer) return;

  try {
    const response = await fetch('data/posts.json');
    if (!response.ok) throw new Error('Network response was not ok');
    const posts = await response.json();

    postsContainer.innerHTML = '';

    posts.forEach(post => {
      const card = document.createElement('article');
      card.className = 'post-card';

      const tagsHtml = post.tags ? post.tags.map(t => `<span class="post-tag-pill">#${t}</span>`).join(' ') : '';
      
      const wordCount = post.summary ? post.summary.trim().split(/\s+/).length : 0;
      const readTime = Math.ceil(wordCount / 180);

      card.innerHTML = `
        <div class="post-header">
          <div class="post-author-info">
            <div class="author-avatar-badge">${post.author_initials || 'CT'}</div>
            <div class="author-meta">
              <span class="author-username">${post.author}</span>
              <span class="author-title-role">${post.author_role || 'Member'}</span>
            </div>
          </div>
          <span class="post-category-badge">${post.category}</span>
        </div>

        <div class="post-main-content">
          <h3 class="post-title">${post.title}</h3>
          <div class="post-summary">${parseMarkdown(post.summary)}</div>
          <div class="post-tags-row">${tagsHtml}</div>
        </div>

        <div class="post-footer-actions">
          <div class="post-metadata-details">
            <span class="post-read-time">${readTime} min read</span>
            <span class="post-meta-dot">•</span>
            <span class="post-publish-date">${post.date}</span>
          </div>
        </div>
      `;
      postsContainer.appendChild(card);
      
      if (post.poll) {
        const mainContent = card.querySelector('.post-main-content');
        const tagsRow = card.querySelector('.post-tags-row');
        const pollEl = document.createElement('div');
        pollEl.className = 'poll-container';
        pollEl.id = `poll-container-post_${post.id}`;
        mainContent.insertBefore(pollEl, tagsRow);
        renderPollWidget(pollEl, `post_${post.id}`, post.poll);
      }
      
      renderCommentsAndVoting(card, `post_${post.id}`);
    });
  } catch (error) {
    console.error('Failed to load news posts:', error);
    postsContainer.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">Failed to load latest posts. Please try again later.</p>`;
  }
}

function initScrollSpy() {
  const sections = document.querySelectorAll('section');
  const navLinks = document.querySelectorAll('nav a');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (pageYOffset >= (sectionTop - 200)) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') && a.getAttribute('href').slice(1) === current) {
        a.classList.add('active');
      }
    });
  });
}

async function loadJSONDownloads() {
  const downloadGrid = document.querySelector('.download-grid');
  if (!downloadGrid) return;

  try {
    const response = await fetch('data/downloads.json');
    if (!response.ok) throw new Error('Network response was not ok');
    const dl = await response.json();

    downloadGrid.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'download-card';
    card.style.maxWidth = '400px';
    card.style.width = '100%';
    
    card.innerHTML = `
      <h3 class="download-version">${dl.version} (${dl.status})</h3>
      <p class="download-platform">${dl.platform}</p>
      <div class="download-meta">
        <span>File size: ${dl.file_size}</span>
        <span>Requires: ${dl.requires}</span>
      </div>
      <a href="${dl.url}" target="_blank" style="text-decoration: none; display: block; width: 100%;">
        <button class="btn-primary" style="width: 100%;">Download</button>
      </a>
    `;
    downloadGrid.appendChild(card);
    renderCommentsAndVoting(card, `download_${dl.version.replace(/[^a-zA-Z0-9]/g, '_')}`);
  } catch (error) {
    console.error('Failed to load download data:', error);
  }
}

// === COMMENTS & VOTING RENDERING ENGINE ===

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Global list of active widgets to sync usernames instantly when edited
const activeCommentWidgets = new Set();

function updateAllProfileBars() {
  const user = getCurrentUser();
  activeCommentWidgets.forEach(postId => {
    const profileContainer = document.getElementById(`profile-${postId}`);
    if (profileContainer) {
      const initials = user.displayName.substring(0, 2).toUpperCase();
      profileContainer.innerHTML = `
        <div class="profile-bar-info">
          <div class="user-badge" style="background: ${user.avatarColor};">${initials}</div>
          <span class="user-name-text">${escapeHTML(user.displayName)} <span style="color: var(--text-muted); font-size: 0.75rem;">(You)</span></span>
        </div>
        <button class="btn-edit-profile" id="btn-edit-${postId}">Customize Identity</button>
      `;
      
      const editBtn = document.getElementById(`btn-edit-${postId}`);
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const editor = document.getElementById(`profile-editor-${postId}`);
          if (editor) {
            editor.style.display = editor.style.display === 'none' ? 'flex' : 'none';
          }
        });
      }
    }
  });
}

function renderCommentsAndVoting(card, postId) {
  // Find or create post-footer-actions
  let footerActions = card.querySelector('.post-footer-actions');
  if (!footerActions) {
    footerActions = document.createElement('div');
    footerActions.className = 'post-footer-actions';
    card.appendChild(footerActions);
  }

  // Create wrap for action elements
  const actionWrap = document.createElement('div');
  actionWrap.className = 'action-buttons-wrap';
  
  const voteContainer = document.createElement('div');
  voteContainer.className = 'voting-container';
  voteContainer.id = `vote-${postId}`;
  voteContainer.innerHTML = `
    <button class="vote-btn upvote-btn" title="Upvote">▲</button>
    <span class="vote-score">0</span>
    <button class="vote-btn downvote-btn" title="Downvote">▼</button>
  `;

  const commentToggleBtn = document.createElement('button');
  commentToggleBtn.className = 'btn-action-link comments-toggle';
  commentToggleBtn.id = `comments-toggle-${postId}`;
  commentToggleBtn.innerHTML = `Comments (<span class="comment-count">0</span>)`;

  actionWrap.appendChild(voteContainer);
  actionWrap.appendChild(commentToggleBtn);
  footerActions.appendChild(actionWrap);

  // Create comments drawer
  const drawer = document.createElement('div');
  drawer.className = 'comments-drawer';
  drawer.id = `drawer-${postId}`;
  drawer.innerHTML = `
    <div class="profile-bar" id="profile-${postId}"></div>
    <div class="profile-editor-inline" id="profile-editor-${postId}" style="display: none;"></div>
    
    <form class="comment-form" id="form-${postId}">
      <textarea class="comment-textarea" placeholder="Add transmission entry to logs..." maxlength="1000" required></textarea>
      <div class="comment-form-actions">
        <span class="comment-char-counter">0 / 1000</span>
        <button type="submit" class="btn-comment-submit">Post Entry</button>
      </div>
    </form>
    
    ${isDemoMode ? `<div class="system-demo-notice">▲ Running in local Demo Mode. Entries and votes saved in browser localStorage.</div>` : ''}
    
    <div class="comments-list" id="list-${postId}"></div>
  `;
  card.appendChild(drawer);

  // Setup state tracker for this widget
  activeCommentWidgets.add(postId);

  // Set up Toggle Comments Drawer
  commentToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const isVisible = drawer.style.display === 'block';
    drawer.style.display = isVisible ? 'none' : 'block';
    commentToggleBtn.classList.toggle('active', !isVisible);
  });

  // Render profile bar
  renderProfileEditor(postId);

  // --- Voting Functionality ---
  const upBtn = voteContainer.querySelector('.upvote-btn');
  const downBtn = voteContainer.querySelector('.downvote-btn');
  const scoreSpan = voteContainer.querySelector('.vote-score');
  let currentVoteState = 0; // tracking user's current vote

  subscribeVotes(postId, ({ score, userVote }) => {
    currentVoteState = userVote;
    scoreSpan.textContent = score > 0 ? `+${score}` : score;
    scoreSpan.className = 'vote-score';
    if (score > 0) scoreSpan.classList.add('positive');
    if (score < 0) scoreSpan.classList.add('negative');

    upBtn.className = 'vote-btn upvote-btn' + (userVote === 1 ? ' upvoted' : '');
    downBtn.className = 'vote-btn downvote-btn' + (userVote === -1 ? ' downvoted' : '');
  });

  upBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const newVote = currentVoteState === 1 ? 0 : 1;
    await submitVote(postId, newVote);
  });

  downBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const newVote = currentVoteState === -1 ? 0 : -1;
    await submitVote(postId, newVote);
  });

  // --- Comments Functionality ---
  const form = drawer.querySelector('.comment-form');
  const textarea = form.querySelector('.comment-textarea');
  const charCounter = form.querySelector('.comment-char-counter');
  const listContainer = drawer.querySelector('.comments-list');
  const commentCountSpan = commentToggleBtn.querySelector('.comment-count');

  // Char count updater
  textarea.addEventListener('input', () => {
    charCounter.textContent = `${textarea.value.length} / 1000`;
  });

  // Handle Comment Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = textarea.value.trim();
    if (!content) return;
    
    await addComment(postId, content);
    textarea.value = '';
    charCounter.textContent = '0 / 1000';
  });

  // Format Date beautifully
  function formatCommentDate(timestamp) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  // Subscribe to comments list
  subscribeComments(postId, (comments) => {
    commentCountSpan.textContent = comments.length;
    listContainer.innerHTML = '';

    if (comments.length === 0) {
      listContainer.innerHTML = `<div class="no-comments-prompt">No telemetry logs yet. Be the first to establish link.</div>`;
      return;
    }

    const user = getCurrentUser();

    // Separate into roots and replies
    const rootComments = [];
    const repliesByParentId = {};

    comments.forEach(c => {
      if (c.parentId) {
        if (!repliesByParentId[c.parentId]) {
          repliesByParentId[c.parentId] = [];
        }
        repliesByParentId[c.parentId].push(c);
      } else {
        rootComments.push(c);
      }
    });

    rootComments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      
      const initials = c.authorName ? c.authorName.substring(0, 2).toUpperCase() : '??';
      const isOwner = c.userId === user.uid;
      const reportBtnHtml = (!isOwner && !c.flagged) ? `<button class="comment-action-btn report-btn" data-id="${c.id}">Report</button>` : '';
      const reportedBadgeHtml = c.flagged ? `<span style="color: #ff007f; font-size: 0.65rem; font-family: var(--font-mono); margin-left: 5px;">[REPORTED]</span>` : '';

      item.innerHTML = `
        <div class="comment-item-header">
          <div class="comment-item-author-wrap">
            <div class="comment-item-badge" style="background: ${c.avatarColor || '#888'};">${initials}</div>
            <span class="comment-item-name">${escapeHTML(c.authorName || 'Anonymous')}</span>
            ${isOwner ? '<span style="color: var(--primary); font-size: 0.7rem; font-family: var(--font-mono); margin-left: 5px;">[YOU]</span>' : ''}
            ${reportedBadgeHtml}
          </div>
          <span class="comment-item-time">${formatCommentDate(c.timestamp)}</span>
        </div>
        <div class="comment-item-content">${escapeHTML(c.content)}</div>
        <div class="comment-item-actions">
          <button class="comment-action-btn reply-btn" data-id="${c.id}">Reply</button>
          ${reportBtnHtml}
          ${isOwner ? `<button class="comment-action-btn delete-btn" data-id="${c.id}">Delete</button>` : ''}
        </div>
        <div class="reply-container-inline" id="reply-box-${c.id}"></div>
        <div class="comment-replies-list" id="replies-${c.id}"></div>
      `;

      // Setup actions
      if (isOwner) {
        item.querySelector('.delete-btn').addEventListener('click', async (e) => {
          e.preventDefault();
          if (confirm("Are you sure you want to delete this transmission log?")) {
            await deleteComment(postId, c.id);
          }
        });
      }

      if (!isOwner && !c.flagged) {
        const reportBtn = item.querySelector('.report-btn');
        if (reportBtn) {
          reportBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm("Report this transmission entry for guidelines violation?")) {
              await flagComment(postId, c.id);
              alert("Comment reported. Space command flight controllers will review it.");
            }
          });
        }
      }

      // Toggle inline reply form
      const replyBtn = item.querySelector('.reply-btn');
      const replyBox = item.querySelector(`#reply-box-${c.id}`);
      
      replyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (replyBox.innerHTML) {
          replyBox.innerHTML = '';
        } else {
          replyBox.innerHTML = `
            <form class="reply-form-inline">
              <textarea class="reply-textarea" placeholder="Write transmission reply..." maxlength="1000" required></textarea>
              <div class="reply-form-actions">
                <button type="button" class="btn-reply-cancel">Cancel</button>
                <button type="submit" class="btn-reply-submit">Send</button>
              </div>
            </form>
          `;
          
          replyBox.querySelector('.btn-reply-cancel').addEventListener('click', () => {
            replyBox.innerHTML = '';
          });
          
          replyBox.querySelector('form').addEventListener('submit', async (formEv) => {
            formEv.preventDefault();
            const replyText = replyBox.querySelector('.reply-textarea').value.trim();
            if (!replyText) return;
            await addComment(postId, replyText, c.id);
            replyBox.innerHTML = '';
          });
        }
      });

      // Render nested replies
      const repliesList = item.querySelector(`#replies-${c.id}`);
      const replies = repliesByParentId[c.id] || [];
      
      replies.forEach(r => {
        const replyItem = document.createElement('div');
        replyItem.className = 'comment-item';
        const rInitials = r.authorName ? r.authorName.substring(0, 2).toUpperCase() : '??';
        const rIsOwner = r.userId === user.uid;
        const rReportBtnHtml = (!rIsOwner && !r.flagged) ? `<button class="comment-action-btn report-reply-btn" data-id="${r.id}">Report</button>` : '';
        const rReportedBadgeHtml = r.flagged ? `<span style="color: #ff007f; font-size: 0.65rem; font-family: var(--font-mono); margin-left: 5px;">[REPORTED]</span>` : '';

        replyItem.innerHTML = `
          <div class="comment-item-header">
            <div class="comment-item-author-wrap">
              <div class="comment-item-badge" style="background: ${r.avatarColor || '#888'};">${rInitials}</div>
              <span class="comment-item-name">${escapeHTML(r.authorName || 'Anonymous')}</span>
              ${rIsOwner ? '<span style="color: var(--primary); font-size: 0.7rem; font-family: var(--font-mono); margin-left: 5px;">[YOU]</span>' : ''}
              ${rReportedBadgeHtml}
            </div>
            <span class="comment-item-time">${formatCommentDate(r.timestamp)}</span>
          </div>
          <div class="comment-item-content">${escapeHTML(r.content)}</div>
          <div class="comment-item-actions">
            ${rReportBtnHtml}
            ${rIsOwner ? `<button class="comment-action-btn delete-btn">Delete</button>` : ''}
          </div>
        `;

        if (rIsOwner) {
          replyItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm("Are you sure you want to delete this reply?")) {
              await deleteComment(postId, r.id);
            }
          });
        }

        if (!rIsOwner && !r.flagged) {
          const rReportBtn = replyItem.querySelector('.report-reply-btn');
          if (rReportBtn) {
            rReportBtn.addEventListener('click', async (e) => {
              e.preventDefault();
              if (confirm("Report this reply for guidelines violation?")) {
                await flagComment(postId, r.id);
                alert("Reply reported. Space command flight controllers will review it.");
              }
            });
          }
        }

        repliesList.appendChild(replyItem);
      });

      listContainer.appendChild(item);
    });
  });
}

function renderProfileEditor(postId) {
  const editor = document.getElementById(`profile-editor-${postId}`);
  if (!editor) return;

  const user = getCurrentUser();
  const colors = getAvatarColors();

  let colorHtml = '';
  colors.forEach(col => {
    const isSelected = user.avatarColor === col ? 'selected' : '';
    colorHtml += `<div class="color-option ${isSelected}" style="background: ${col};" data-color="${col}"></div>`;
  });

  editor.innerHTML = `
    <div class="profile-editor-title">Configure Comms Frequency</div>
    <div class="profile-inputs-row">
      <input type="text" class="input-profile-name" id="name-input-${postId}" placeholder="Callsign" value="${escapeHTML(user.displayName)}" maxlength="32" required />
      <div class="color-picker-row">
        ${colorHtml}
      </div>
      <button class="btn-primary" id="save-profile-${postId}" style="padding: 0.4rem 1rem; font-size: 0.75rem;">Apply</button>
    </div>
  `;

  // Select color option
  const options = editor.querySelectorAll('.color-option');
  let selectedColor = user.avatarColor;
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedColor = opt.getAttribute('data-color');
    });
  });

  // Save changes
  const saveBtn = editor.querySelector(`#save-profile-${postId}`);
  const nameInput = editor.querySelector(`#name-input-${postId}`);

  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const newName = nameInput.value.trim();
    if (!newName) return;

    updateUserProfile(newName, selectedColor);
    updateAllProfileBars();
    // Collapse editor
    editor.style.display = 'none';
  });

  // Sync profile display in UI
  updateAllProfileBars();
}

function renderPollWidget(container, postId, pollData) {
  const { question, options } = pollData;
  
  let optionsHtml = '';
  options.forEach((opt, idx) => {
    optionsHtml += `
      <button class="poll-option-btn" data-index="${idx}">
        <div class="poll-option-progress-bg" style="width: 0%;"></div>
        <span class="poll-option-text">${escapeHTML(opt)}</span>
        <span class="poll-option-meta">
          <span class="opt-percent">0%</span>
          <span class="opt-count">(0)</span>
        </span>
      </button>
    `;
  });

  container.innerHTML = `
    <h4 class="poll-question">${escapeHTML(question)}</h4>
    <div class="poll-options-list">
      ${optionsHtml}
    </div>
    <div class="poll-total-votes">Total Votes: <span class="total-count">0</span></div>
  `;

  const optionBtns = container.querySelectorAll('.poll-option-btn');
  const totalCountSpan = container.querySelector('.total-count');

  subscribePoll(postId, ({ counts, userVotedOption }) => {
    // Tally total votes
    let total = 0;
    Object.keys(counts).forEach(k => {
      total += counts[k] || 0;
    });

    totalCountSpan.textContent = total;

    optionBtns.forEach((btn, idx) => {
      const count = counts[idx] || 0;
      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
      
      // Update progress bar width
      const progressBg = btn.querySelector('.poll-option-progress-bg');
      progressBg.style.width = `${percentage}%`;

      // Update meta text
      btn.querySelector('.opt-percent').textContent = `${percentage}%`;
      btn.querySelector('.opt-count').textContent = `(${count})`;

      // Highlight if user voted for this
      if (userVotedOption === idx) {
        btn.classList.add('voted');
      } else {
        btn.classList.remove('voted');
      }
    });
  });

  optionBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      await submitPollVote(postId, idx);
    });
  });
}

function initCookieBannerAndLegals() {
  if (localStorage.getItem('cosmo_cookies_accepted') === 'true') {
    return;
  }

  // Create cookie banner element
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-text">
      <strong>Transmission Node Authorization:</strong> We use localized storage (session tokens) and strictly necessary security cookies to authenticate your calls and prevent vote manipulation. No personal telemetry is sold. By connecting, you agree to our 
      <a id="btn-privacy-policy">Privacy Policy</a> and <a id="btn-terms-use">Terms of Use</a>.
    </div>
    <div class="cookie-actions">
      <button class="btn-cookie-accept" id="cookie-accept-btn">Establish Connection</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('cookie-accept-btn').addEventListener('click', () => {
    localStorage.setItem('cosmo_cookies_accepted', 'true');
    banner.style.display = 'none';
  });

  const openModal = (title, contentHtml) => {
    let modal = document.getElementById('legal-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'legal-modal-overlay';
      modal.id = 'legal-modal';
      document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
      <div class="legal-modal-card">
        <div class="legal-modal-header">
          <div class="legal-modal-title">${title}</div>
          <button class="btn-modal-close" id="legal-modal-close">&times;</button>
        </div>
        <div class="legal-modal-body">
          ${contentHtml}
        </div>
      </div>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('legal-modal-close').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  };

  const privacyPolicyContent = `
    <p>Last updated: June 13, 2026</p>
    <p>Welcome to the Create Cosmonautics Feedback Hub. We care deeply about your privacy and telemetry safety.</p>
    
    <h3>1. Telemetry & Data Stored</h3>
    <ul>
      <li><strong>Anonymous UID:</strong> To prevent vote manipulation, Sybil attacks, and comment duplication, we generate a random, non-identifying cryptographic hash representing your user session.</li>
      <li><strong>Custom callsign & Badge Color:</strong> Your selected username and avatar color are saved directly in your browser's <code>localStorage</code> to personalize your comment card author stamps.</li>
      <li><strong>Interactions:</strong> We record your upvote/downvote state per post and poll selections, stored securely on Firebase.</li>
    </ul>
    
    <h3>2. Cookies & LocalStorage</h3>
    <p>We do not collect third-party cookies or run advertising trackers. We strictly use localized storage (session tokens) and necessary Firebase tokens to maintain database connectivity and prevent spamming.</p>
    
    <h3>3. Security Measures</h3>
    <p>All database transactions are filtered through secure backend validation (Firestore Security Rules). Telemetry is not sold, shared, or analyzed for commercial marketing.</p>
  `;

  const termsOfUseContent = `
    <p>Welcome, Engineer. By establishing a data link to this terminal, you agree to these operational protocols:</p>
    
    <h3>1. Conduct Guidelines</h3>
    <ul>
      <li>All transmission logs (comments/replies) must remain constructive. Cyberbullying, hate speech, spam, and flooding are strictly prohibited.</li>
      <li>XSS attacks or trying to exploit the database is forbidden. All inputs are strictly escaped and sanitized.</li>
    </ul>
    
    <h3>2. Moderation rights</h3>
    <p>The space command core team reserves the right to delete, edit, or modify any comment logs containing spam or violating basic communication decency without prior warning.</p>
    
    <h3>3. Limitation of liability</h3>
    <p>This software platform is provided "as-is", in a pre-release state. Space Command does not guarantee 100% database persistence in case of cosmic interference or server overhaul migrations.</p>
  `;

  document.getElementById('btn-privacy-policy').addEventListener('click', (e) => {
    e.preventDefault();
    openModal('Privacy Policy', privacyPolicyContent);
  });

  document.getElementById('btn-terms-use').addEventListener('click', (e) => {
    e.preventDefault();
    openModal('Terms of Use', termsOfUseContent);
  });
}

function initBugTracker() {
  const container = document.getElementById('bugs-container');
  if (!container) return;

  const btnReport = document.getElementById('btn-report-anomaly');
  const btnCancel = document.getElementById('btn-cancel-report');
  const formContainer = document.getElementById('bug-form-container');
  const form = document.getElementById('anomaly-form');
  
  const filterStatus = document.getElementById('filter-status');
  const filterSeverity = document.getElementById('filter-severity');

  const selectSeverity = document.getElementById('bug-severity');
  const crashGroup = document.getElementById('crash-report-group');
  const inputCrash = document.getElementById('bug-crash');

  // Toggle crash report field based on severity selection
  selectSeverity.addEventListener('change', () => {
    if (selectSeverity.value === 'high') {
      crashGroup.style.display = 'flex';
      inputCrash.setAttribute('required', 'true');
    } else {
      crashGroup.style.display = 'none';
      inputCrash.removeAttribute('required');
      inputCrash.value = '';
    }
  });

  // Toggle form
  btnReport.addEventListener('click', () => {
    formContainer.style.display = formContainer.style.display === 'block' ? 'none' : 'block';
  });

  btnCancel.addEventListener('click', () => {
    formContainer.style.display = 'none';
  });

  // Handle form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('bug-title').value;
    const version = document.getElementById('bug-version').value;
    const severity = selectSeverity.value;
    const description = document.getElementById('bug-desc').value;
    const steps = document.getElementById('bug-steps').value;
    const crash = inputCrash.value;

    await addBug({ title, version, severity, description, steps, crash });
    
    // Reset form
    form.reset();
    crashGroup.style.display = 'none';
    inputCrash.removeAttribute('required');
    formContainer.style.display = 'none';
  });

  // Dynamic filter state
  let allBugs = [];

  function renderBugsFeed() {
    const statusVal = filterStatus.value;
    const severityVal = filterSeverity.value;

    const filtered = allBugs.filter(b => {
      const matchStatus = statusVal === 'all' || b.status === statusVal;
      const matchSeverity = severityVal === 'all' || b.severity === severityVal;
      return matchStatus && matchSeverity;
    });

    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 3rem;">No diagnostic logs found matching current parameters.</p>`;
      return;
    }

    filtered.forEach(b => {
      const card = document.createElement('article');
      card.className = 'post-card';
      
      const initials = b.authorName ? b.authorName.substring(0, 2).toUpperCase() : '??';
      const formattedDate = new Date(b.timestamp).toISOString().split('T')[0];

      const crashHtml = b.crash ? `
        <details style="margin-top: 1.2rem; border: 1px dashed rgba(255, 0, 127, 0.3); background: rgba(255, 0, 127, 0.02); border-radius: 4px; overflow: hidden;">
          <summary style="font-family: var(--font-mono); font-size: 0.8rem; color: #ff007f; padding: 0.6rem 1rem; cursor: pointer; user-select: none; font-weight: 600;">[+] View Diagnostics Stack Trace</summary>
          <pre style="margin: 0; padding: 1rem; background: #000; font-family: var(--font-mono); font-size: 0.8rem; color: #ff55aa; overflow-x: auto; max-height: 250px; border-top: 1px dashed rgba(255, 0, 127, 0.2); white-space: pre-wrap; word-break: break-all;">${escapeHTML(b.crash)}</pre>
        </details>
      ` : '';

      card.innerHTML = `
        <div class="post-header">
          <div class="post-author-info">
            <div class="author-avatar-badge" style="border-color: ${b.avatarColor || 'var(--border-light)'}; color: ${b.avatarColor || 'var(--primary)'};">${initials}</div>
            <div class="author-meta">
              <span class="author-username">${escapeHTML(b.authorName)}</span>
              <span class="author-title-role">Telemetry Reporter</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="badge-severity severity-${b.severity}">${b.severity}</span>
            <span class="badge-status status-${b.status}">${b.status}</span>
          </div>
        </div>

        <div class="post-main-content">
          <h3 class="post-title" style="font-size: 1.3rem;">${escapeHTML(b.title)}</h3>
          
          <div style="margin-top: 1rem;">
            <h4 style="font-size: 0.85rem; color: var(--primary); font-family: var(--font-mono); text-transform: uppercase;">1. System Description</h4>
            <p style="color: #c8c8d0; font-size: 0.95rem; margin-top: 0.4rem; white-space: pre-wrap;">${escapeHTML(b.description)}</p>
          </div>

          <div style="margin-top: 1.2rem;">
            <h4 style="font-size: 0.85rem; color: var(--primary); font-family: var(--font-mono); text-transform: uppercase;">2. Telemetry Replication Sequence</h4>
            <p style="color: #c8c8d0; font-size: 0.95rem; margin-top: 0.4rem; white-space: pre-wrap;">${escapeHTML(b.steps)}</p>
          </div>

          ${crashHtml}

          <div class="bug-details-row">
            <span class="bug-meta-pill">Scope: <span class="bug-label-value">${escapeHTML(b.version)}</span></span>
            <span class="bug-meta-pill">Filed: <span class="bug-label-value">${formattedDate}</span></span>
          </div>
        </div>

        <div class="post-footer-actions">
          <div class="post-metadata-details">
            <span>Diagnostics Log #${b.id.substring(0, 8)}</span>
          </div>
        </div>
      `;
      
      container.appendChild(card);
      renderCommentsAndVoting(card, `bug_${b.id}`);
    });
  }

  // Subscribe to real-time bugs list
  subscribeBugs((bugs) => {
    allBugs = bugs;
    renderBugsFeed();
  });

  // Filters event listeners
  filterStatus.addEventListener('change', renderBugsFeed);
  filterSeverity.addEventListener('change', renderBugsFeed);
}

