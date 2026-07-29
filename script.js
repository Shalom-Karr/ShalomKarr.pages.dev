// Homepage behaviour. No animation library, no canvas, no mousemove listeners.
// Everything below the fold is either CSS or a passive observer.

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const onIdle = window.requestIdleCallback || (fn => setTimeout(fn, 200));

const SUPABASE_URL = 'https://qvoxpfigbukidlmshiei.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2b3hwZmlnYnVraWRsbXNoaWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyOTM2OTEsImV4cCI6MjA2NTg2OTY5MX0.CEbyeIw6QiMxbLBhU7x7Re7SL_unWJMyaJQPS9y-k60';

const EMAILJS_PUBLIC_KEY = '6XAGlx_tFQG41xPB3';
const EMAILJS_SERVICE_ID = 'service_wcrrkbp';
const EMAILJS_TEMPLATE_ID = 'template_qgcjka4';

const AMPLITUDE_KEY = '1c885336c34e4a886e13e859363a199a';

// --- Scroll reveal -----------------------------------------------------------
const initReveal = () => {
    const targets = $$('[data-reveal]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
        targets.forEach(el => el.classList.add('revealed'));
        return;
    }
    const io = new IntersectionObserver((entries, obs) => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add('revealed');
            obs.unobserve(e.target);
        }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    targets.forEach(el => io.observe(el));
};

// --- Header, scrollspy, scroll progress, to-top ------------------------------
// One rAF-throttled scroll handler for all four. The only writes are class
// toggles and a single width on the progress bar.
const initScrollEffects = () => {
    const header = $('header');
    const progress = $('#scroll-progress');
    const toTop = $('#to-top');
    const navLinks = $$('header .nav-link');
    const sections = ['hero', 'about', 'skills', 'projects', 'opensource', 'contact']
        .map(id => document.getElementById(id)).filter(Boolean);

    let ticking = false;
    const update = () => {
        ticking = false;
        const y = scrollY;
        const doc = document.documentElement;

        header.classList.toggle('scrolled-nav', y > 50);
        toTop.classList.toggle('show', y > 400);

        const max = Math.max(1, doc.scrollHeight - doc.clientHeight);
        progress.style.width = ((y / max) * 100).toFixed(2) + '%';

        let active = sections[0]?.id;
        for (const s of sections) if (s.offsetTop <= y + 120) active = s.id;
        for (const a of navLinks) {
            a.classList.toggle('is-active', a.getAttribute('href') === '#' + active);
        }
    };

    addEventListener('scroll', () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
};

// --- Mobile menu -------------------------------------------------------------
const initMobileMenu = () => {
    const btn = $('#mobile-menu-btn');
    const menu = $('#mobile-menu');
    const close = $('#mobile-menu-close');
    if (!btn || !menu) return;

    const setOpen = (open) => {
        menu.classList.toggle('open', open);
        btn.classList.toggle('active', open);
        btn.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('menu-open', open);
    };

    btn.addEventListener('click', () => setOpen(!menu.classList.contains('open')));
    close?.addEventListener('click', () => setOpen(false));
    $$('.mobile-link', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
};

// --- Typing line -------------------------------------------------------------
// The first phrase is server-rendered, so the hero never shifts or flashes.
const initTyping = () => {
    const el = $('#typed');
    const caret = $('#caret');
    if (!el) return;

    if (reduceMotion) { caret?.remove(); return; }

    const phrases = [
        'Full-Stack Web Developer',
        'Digital Infrastructure Specialist',
        'AI & Automation Engineer',
        'Supabase & Serverless Architect',
    ];

    let phrase = 0, chars = phrases[0].length, deleting = true;
    const tick = () => {
        const full = phrases[phrase];
        chars += deleting ? -1 : 1;
        el.textContent = full.slice(0, chars);

        let delay = deleting ? 32 : 62;
        if (!deleting && chars === full.length) { delay = 1900; deleting = true; }
        else if (deleting && chars === 0) { deleting = false; phrase = (phrase + 1) % phrases.length; delay = 320; }
        setTimeout(tick, delay);
    };
    setTimeout(tick, 2200);
};

// --- Hero particle constellation ---------------------------------------------
// Booted after `load`, never on the critical path. Skipped entirely on phones and
// under reduced-motion, and the rAF loop stops whenever the hero is offscreen or
// the tab is hidden — so it costs nothing once you've scrolled past it.
const initParticles = () => {
    const canvas = $('#hero-canvas');
    const hero = $('#hero');
    if (!canvas || !hero || reduceMotion) return;
    if (!matchMedia('(min-width: 768px) and (pointer: fine)').matches) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const LINK_DIST = 130;
    let particles = [], w = 0, h = 0, dpr = 1, raf = 0;
    let onscreen = true, visible = !document.hidden;

    const resize = () => {
        dpr = Math.min(devicePixelRatio || 1, 2);
        w = hero.clientWidth;
        h = hero.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // ~1 particle per 14k css px², clamped. A 1440x900 hero gets ~90.
        const count = Math.max(28, Math.min(90, Math.round((w * h) / 14000)));
        particles = Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.28,
            vy: (Math.random() - 0.5) * 0.28,
            r: Math.random() * 1.4 + 0.7,
        }));
    };

    const frame = () => {
        raf = 0;
        ctx.clearRect(0, 0, w, h);

        for (const p of particles) {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
        }

        // Links first, so the dots sit on top of them.
        ctx.lineWidth = 1;
        for (let i = 0; i < particles.length; i++) {
            const a = particles[i];
            for (let j = i + 1; j < particles.length; j++) {
                const b = particles[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > LINK_DIST * LINK_DIST) continue;
                const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.35;
                ctx.strokeStyle = `rgba(96, 165, 250, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }

        ctx.fillStyle = 'rgba(147, 197, 253, 0.55)';
        for (const p of particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }

        schedule();
    };

    const schedule = () => {
        if (raf || !onscreen || !visible) return;
        raf = requestAnimationFrame(frame);
    };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    resize();
    canvas.classList.add('ready');
    schedule();

    new IntersectionObserver(([e]) => {
        onscreen = e.isIntersecting;
        onscreen ? schedule() : stop();
    }, { threshold: 0 }).observe(hero);

    document.addEventListener('visibilitychange', () => {
        visible = !document.hidden;
        visible ? schedule() : stop();
    });

    let resizeTimer;
    addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { resize(); schedule(); }, 150);
    }, { passive: true });
};

// --- Projects: revalidate the prerendered grid --------------------------------
// scripts/prerender.js bakes the current project list into index.html at build
// time, so this only patches the DOM when the admin has changed something since.
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const projectCardHTML = (p) => {
    const tags = (p.technologies || [])
        .map(t => `<span class="tech-pill">${escapeHtml(t)}</span>`).join('');
    return `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="project-card card group" style="--brand:#3b82f6">
  <div class="flex justify-between items-start mb-6">
    <div class="p-3 bg-gray-900/50 rounded-xl border border-gray-700/50 group-hover:border-blue-500/30 transition-colors">
      <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
    </div>
    <svg class="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
  </div>
  <h3 class="text-2xl font-extrabold mb-4 text-gray-100 group-hover:text-blue-400 transition-colors tracking-tight leading-tight">${escapeHtml(p.title)}</h3>
  <p class="project-desc text-gray-400 mb-8 leading-relaxed text-sm grow">${escapeHtml(p.description)}</p>
  <div class="mt-auto pt-6 border-t border-gray-700/40 group-hover:border-blue-500/20 transition-colors">
    <div class="flex flex-wrap gap-2">${tags}</div>
  </div>
</a>`;
};

const revalidateProjects = async () => {
    const grid = $('#projects-grid');
    if (!grid) return;
    const base = `${SUPABASE_URL}/rest/v1/profile_websites?select=title,url,description,technologies`;
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
    try {
        // Prefer the admin-set order; fall back if the sort_order column isn't there yet.
        let res = await fetch(`${base}&order=sort_order.asc.nullslast,created_at.desc`, { headers });
        if (!res.ok) res = await fetch(`${base}&order=created_at.desc`, { headers });
        if (!res.ok) return;
        const projects = await res.json();
        if (!Array.isArray(projects) || !projects.length) return;

        const fresh = projects.map(projectCardHTML).join('\n');
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        if (norm(grid.innerHTML) === norm(fresh)) return;

        grid.innerHTML = fresh;
    } catch {
        // The prerendered markup is already on screen — a failed refresh is a no-op.
    }
};

// --- Open source: stale-while-revalidate GitHub star counts ------------------
// prerender.js bakes star counts at build time. This keeps them current on the
// client without a rebuild, using 2 bulk requests (one per owner) instead of one
// per repo. Cache TTL is 8 hours — stars change rarely, and the unauthenticated
// GitHub API allows 60 req/hr per IP; 2 requests plus an 8-hour cache makes
// exhaustion essentially impossible even for frequent visitors.
const revalidateGithubStars = async () => {
    const cards = $$('.os-card');
    if (!cards.length) return;

    const CACHE_KEY = 'gh_stars_v1';
    const TTL_MS = 8 * 60 * 60 * 1000;

    const repoMap = new Map();
    for (const card of cards) {
        const src = card.querySelector('.os-link-src');
        const starSpan = card.querySelector('[title="GitHub stars"]');
        if (!src || !starSpan) continue;
        const m = src.href.match(/github\.com\/([^/?#]+\/[^/?#]+)/);
        if (!m) continue;
        repoMap.set(m[1], starSpan);
    }
    if (!repoMap.size) return;

    const applyStars = (data) => {
        for (const [repo, span] of repoMap) {
            const count = data[repo];
            if (typeof count !== 'number') continue;
            const tn = span.lastChild;
            if (tn?.nodeType !== Node.TEXT_NODE) continue;
            if (!span.style.minWidth) span.style.minWidth = span.getBoundingClientRect().width + 'px';
            tn.nodeValue = String(count);
        }
    };

    let cached = null;
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (p?.ts && p?.data) cached = p;
        }
    } catch {}

    const isFresh = cached && Date.now() - cached.ts < TTL_MS;
    if (cached) applyStars(cached.data);
    if (isFresh) return;

    try {
        const hdrs = { 'User-Agent': 'shalomkarr-portfolio', Accept: 'application/vnd.github+json' };
        const repos = [...repoMap.keys()];

        const ownerTally = {};
        for (const r of repos) { const o = r.split('/')[0]; ownerTally[o] = (ownerTally[o] || 0) + 1; }
        const mainOwner = Object.entries(ownerTally).sort((a, b) => b[1] - a[1])[0][0];
        const personal = repos.filter(r => r.startsWith(mainOwner + '/'));
        const external = repos.filter(r => !r.startsWith(mainOwner + '/'));

        const [bulkRes1, bulkRes2, ...extRes] = await Promise.all([
            fetch(`https://api.github.com/users/${mainOwner}/repos?per_page=100&page=1`, { headers: hdrs }),
            fetch(`https://api.github.com/users/${mainOwner}/repos?per_page=100&page=2`, { headers: hdrs }),
            ...external.map(r => fetch(`https://api.github.com/repos/${r}`, { headers: hdrs })),
        ]);

        const next = {};
        const nameSet = new Set(personal.map(r => r.split('/')[1]));

        for (const bulkRes of [bulkRes1, bulkRes2]) {
            if (!bulkRes.ok) continue;
            const list = await bulkRes.json();
            if (Array.isArray(list)) {
                for (const item of list) {
                    if (nameSet.has(item.name) && typeof item.stargazers_count === 'number') {
                        next[`${mainOwner}/${item.name}`] = item.stargazers_count;
                    }
                }
            }
        }

        for (let i = 0; i < external.length; i++) {
            if (!extRes[i]?.ok) continue;
            const j = await extRes[i].json();
            if (typeof j.stargazers_count === 'number') next[external[i]] = j.stargazers_count;
        }

        if (!Object.keys(next).length) return;
        applyStars(next);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: next })); } catch {}
    } catch {}
};

// --- Blog: revalidate the prerendered "latest posts" -------------------------
// The three cards are baked at build time; this refreshes them live on idle so a
// newly published post appears without a rebuild. Markup mirrors postCardHTML in
// scripts/prerender.js, so an unchanged list is a no-op (normalized compare).
const POST_ACCENTS = ['#3b82f6', '#a855f7', '#ec4899'];

const postCardHTML = (p, i) => {
    const date = new Date(p.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
    const tags = (p.tags || []).slice(0, 3)
        .map(t => `<span class="tech-pill">${escapeHtml(t)}</span>`).join('');
    const delay = i * 80;
    return `<a href="/blog/post/${escapeHtml(p.slug)}" data-reveal style="--brand:${POST_ACCENTS[i % POST_ACCENTS.length]}${delay ? `;--reveal-delay:${delay}ms` : ''}" class="card group flex flex-col p-6 text-left">
  <time datetime="${escapeHtml(p.created_at)}" class="text-xs font-mono text-gray-500 mb-3">${date}</time>
  <h3 class="text-lg font-bold text-white mb-2 leading-snug group-hover:text-blue-400 transition-colors">${escapeHtml(p.title)}</h3>
  <p class="post-excerpt text-sm text-gray-400 leading-relaxed grow">${escapeHtml(p.excerpt || '')}</p>
  <div class="flex flex-wrap gap-2 mt-4">${tags}</div>
</a>`;
};

const revalidateBlogPosts = async () => {
    const grid = $('#blog-posts');
    if (!grid) return;
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/posts?select=slug,title,excerpt,tags,created_at&is_published=eq.true&order=created_at.desc&limit=3`,
            { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
        );
        if (!res.ok) return;
        const posts = await res.json();
        if (!Array.isArray(posts) || !posts.length) return;

        const fresh = posts.map(postCardHTML).join('\n');
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        if (norm(grid.innerHTML) === norm(fresh)) return;

        grid.innerHTML = fresh;
        // These were injected after the reveal observer ran, so show them immediately.
        $$('[data-reveal]', grid).forEach(el => el.classList.add('revealed'));
    } catch {
        // Prerendered posts are already on screen — a failed refresh is a no-op.
    }
};

// --- Contact form ------------------------------------------------------------
// EmailJS (~13 KB) is fetched on first interaction, not on page load.
let emailjsReady = null;
const loadEmailJS = () => {
    if (emailjsReady) return emailjsReady;
    emailjsReady = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = () => { window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); resolve(window.emailjs); };
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return emailjsReady;
};

const initContactForm = () => {
    const form = $('#contact-form');
    if (!form) return;
    const btn = $('#contact-submit');
    const status = $('#contact-status');

    form.addEventListener('focusin', () => loadEmailJS().catch(() => {}), { once: true });

    const say = (msg, ok) => {
        status.textContent = msg;
        status.className = `mt-4 text-sm text-center ${ok ? 'text-green-400' : 'text-red-400'}`;
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;

        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = 'Sending…';
        try {
            const emailjs = await loadEmailJS();
            await emailjs.sendForm(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, form);
            say("Message sent — I'll get back to you shortly.", true);
            form.reset();
        } catch (err) {
            console.error('Contact form:', err);
            say('Could not send. Email shalomkarr@gmail.com directly.', false);
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    });
};

// --- Toast -------------------------------------------------------------------
const toast = (msg) => {
    document.getElementById('toast')?.remove();
    const t = document.createElement('div');
    t.id = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
};

// --- Command palette (⌘K) ----------------------------------------------------
const initCommandPalette = () => {
    const backdrop = $('#cmdk-backdrop');
    const input = $('#cmdk-input');
    const list = $('#cmdk-list');
    const help = $('#shortcut-help');
    if (!backdrop || !input || !list) return;

    const go = (href) => { location.href = href; };
    const copyEmail = async () => {
        try { await navigator.clipboard.writeText('shalomkarr@gmail.com'); toast('Email copied'); }
        catch { toast('Copy failed'); }
    };

    const closePalette = () => backdrop.classList.remove('open');

    const commands = [
        { group: 'Navigate', icon: '🏠', label: 'Home',     hint: 'g h', run: () => go('#hero') },
        { group: 'Navigate', icon: '👤', label: 'About',    hint: 'g a', run: () => go('#about') },
        { group: 'Navigate', icon: '💻', label: 'Skills',   hint: 'g s', run: () => go('#skills') },
        { group: 'Navigate', icon: '📁', label: 'Projects', hint: 'g p', run: () => go('#projects') },
        { group: 'Navigate', icon: '🌱', label: 'Open Source', hint: 'g o', run: () => go('#opensource') },
        { group: 'Navigate', icon: '📧', label: 'Contact',  hint: 'g c', run: () => go('#contact') },
        { group: 'Navigate', icon: '📝', label: 'Blog',     hint: 'g b', run: () => go('/blog/') },
        { group: 'Actions',  icon: '📋', label: 'Copy email address', hint: 'y e', run: copyEmail },
        { group: 'Actions',  icon: '✉️', label: 'Send an email',      run: () => go('mailto:shalomkarr@gmail.com') },
        { group: 'Actions',  icon: '📞', label: 'Call Shalom',        run: () => go('tel:+12164516698') },
        { group: 'Links',    icon: '🐙', label: 'GitHub',       run: () => open('https://github.com/Shalom-Karr', '_blank', 'noopener') },
        { group: 'Links',    icon: '🛡️', label: 'JTech Forums', run: () => open('https://forums.jtechforums.org/u/Shalom_Karr', '_blank', 'noopener') },
        { group: 'Help',     icon: '⌨️', label: 'Keyboard shortcuts', hint: '?', run: () => { closePalette(); help?.classList.add('open'); } },
    ];

    const fuzzy = (needle, haystack) => {
        if (!needle) return true;
        const t = haystack.toLowerCase();
        let i = 0;
        for (const c of needle.toLowerCase()) { i = t.indexOf(c, i); if (i < 0) return false; i++; }
        return true;
    };

    let filtered = commands, selected = 0;

    const updateSelection = () => {
        $$('.cmdk-item', list).forEach(el => {
            const on = Number(el.dataset.index) === selected;
            el.setAttribute('aria-selected', String(on));
            if (on) el.scrollIntoView({ block: 'nearest' });
        });
    };

    const runSelected = () => {
        const cmd = filtered[selected];
        if (!cmd) return;
        closePalette();
        cmd.run();
    };

    const render = () => {
        const q = input.value.trim();
        filtered = commands.filter(c => fuzzy(q, c.label + ' ' + c.group));
        selected = 0;
        list.textContent = '';

        if (!filtered.length) {
            list.innerHTML = '<div id="cmdk-empty">No results. Try <kbd>contact</kbd> or <kbd>blog</kbd>.</div>';
            return;
        }
        let group = null;
        filtered.forEach((cmd, i) => {
            if (cmd.group !== group) {
                group = cmd.group;
                const g = document.createElement('div');
                g.className = 'cmdk-group-label';
                g.textContent = group;
                list.appendChild(g);
            }
            const el = document.createElement('div');
            el.className = 'cmdk-item';
            el.setAttribute('role', 'option');
            el.setAttribute('aria-selected', String(i === selected));
            el.dataset.index = String(i);

            const ic = document.createElement('span'); ic.className = 'cmdk-icon'; ic.textContent = cmd.icon;
            const lb = document.createElement('span'); lb.className = 'cmdk-label'; lb.textContent = cmd.label;
            el.append(ic, lb);
            if (cmd.hint) {
                const h = document.createElement('span'); h.className = 'cmdk-hint'; h.textContent = cmd.hint;
                el.appendChild(h);
            }
            el.addEventListener('click', () => { selected = i; runSelected(); });
            list.appendChild(el);
        });
    };

    const openPalette = () => { backdrop.classList.add('open'); input.value = ''; render(); input.focus(); };

    input.addEventListener('input', render);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closePalette(); });
    help?.addEventListener('click', e => { if (e.target === help) help.classList.remove('open'); });

    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, filtered.length - 1); updateSelection(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); updateSelection(); }
        else if (e.key === 'Enter') { e.preventDefault(); runSelected(); }
        else if (e.key === 'Escape') closePalette();
    });

    // Global shortcuts. `g`- and `y`-prefixed chords use a 900 ms window.
    let pending = '', pendingTimer;
    addEventListener('keydown', e => {
        const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            backdrop.classList.contains('open') ? closePalette() : openPalette();
            return;
        }
        if (typing) return;

        if (e.key === 'Escape') { closePalette(); help?.classList.remove('open'); return; }
        if (e.key === '?') { e.preventDefault(); help?.classList.toggle('open'); return; }

        const jumps = { h: '#hero', a: '#about', s: '#skills', p: '#projects', o: '#opensource', c: '#contact', b: '/blog/' };
        const k = e.key.toLowerCase();

        if (pending === 'g' && jumps[k]) { go(jumps[k]); pending = ''; return; }
        if (pending === 'y' && k === 'e') { copyEmail(); pending = ''; return; }
        if (k === 'g' || k === 'y') {
            pending = k;
            clearTimeout(pendingTimer);
            pendingTimer = setTimeout(() => { pending = ''; }, 900);
        } else {
            pending = '';
        }
    });

    window.openCommandPalette = openPalette;
};

// --- Easter eggs -------------------------------------------------------------
const initEasterEggs = () => {
    window.hire = () => {
        document.getElementById('contact')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        console.log('%c🎉 Excellent choice! Scrolling you to the contact form…', 'color:#3b82f6;font-size:14px;font-weight:bold');
        return "Let's build something.";
    };

    const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
    let idx = 0;
    addEventListener('keydown', e => {
        idx = e.key.toLowerCase() === KONAMI[idx] ? idx + 1 : 0;
        if (idx === KONAMI.length) {
            idx = 0;
            document.body.style.transition = 'filter 1s';
            document.body.style.filter = 'hue-rotate(180deg)';
            toast('🎮 Konami code!');
            setTimeout(() => { document.body.style.filter = ''; }, 4000);
        }
    });

    console.log(
        '%cShalom Karr%c\nFull-stack & AI engineer · Cleveland, OH\n\n' +
        '📧 shalomkarr@gmail.com\n💼 Try window.hire()\n⌨️  Press ⌘K / Ctrl+K for the command palette\n',
        'color:#3b82f6;font-size:28px;font-weight:800',
        'color:#94a3b8;font-size:13px;line-height:1.6'
    );
};

// --- Analytics ---------------------------------------------------------------
// Loaded after `load`, so it never competes with the critical path.
const initAnalytics = () => {
    const add = (src) => new Promise(res => {
        const s = document.createElement('script');
        s.src = src; s.async = true; s.onload = res; s.onerror = res;
        document.head.appendChild(s);
    });
    Promise.all([
        add('https://cdn.amplitude.com/libs/analytics-browser-2.11.1-min.js.gz'),
        add('https://cdn.amplitude.com/libs/plugin-session-replay-browser-1.8.0-min.js.gz'),
    ]).then(() => {
        try {
            if (window.amplitude && window.sessionReplay) {
                window.amplitude.add(window.sessionReplay.plugin({ sampleRate: 1 }));
                window.amplitude.init(AMPLITUDE_KEY, { autocapture: { elementInteractions: true } });
            }
        } catch {
            // Tracking prevention blocked it. Nothing to do.
        }
    });
};

// --- Boot --------------------------------------------------------------------
const boot = () => {
    const year = $('#currentYear');
    if (year) year.textContent = new Date().getFullYear();
    initReveal();
    initScrollEffects();
    initMobileMenu();
    initTyping();
    initContactForm();
    initCommandPalette();
    initEasterEggs();
};

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();

// Deferred work: none of this blocks first paint or interaction.
addEventListener('load', () => {
    initParticles();
    onIdle(() => {
        revalidateProjects();
        revalidateBlogPosts();
        revalidateGithubStars();
        initAnalytics();
        import('./tracker.js').then(m => m.initTracker?.()).catch(() => {});
    });
});
