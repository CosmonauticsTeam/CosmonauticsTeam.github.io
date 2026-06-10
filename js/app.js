document.addEventListener('DOMContentLoaded', () => {
  initSpaceBackground();
  loadJSONPosts();
  loadJSONDownloads();
  initScrollSpy();
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

    downloadGrid.innerHTML = `
      <div class="download-card" style="max-width: 400px; width: 100%;">
        <h3 class="download-version">${dl.version} (${dl.status})</h3>
        <p class="download-platform">${dl.platform}</p>
        <div class="download-meta">
          <span>File size: ${dl.file_size}</span>
          <span>Requires: ${dl.requires}</span>
        </div>
        <a href="${dl.url}" target="_blank" style="text-decoration: none; display: block; width: 100%;">
          <button class="btn-primary" style="width: 100%;">Download</button>
        </a>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load download data:', error);
  }
}
