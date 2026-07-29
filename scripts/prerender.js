#!/usr/bin/env node
/**
 * Bakes three things into index.html before Tailwind runs:
 *   1. An inline SVG <symbol> sprite for the skill icons (replaces a 1.6 MB icon font).
 *   2. The skills grid itself, generated from SKILL_GROUPS below.
 *   3. The project cards, fetched from Supabase (replaces a runtime fetch + CDN client).
 *
 * The sprite is derived from SKILL_GROUPS, so it can only ever contain icons that are
 * actually rendered — add a skill here and both the card and its symbol appear.
 *
 * All three are written between HTML comment markers and are safe to re-run. If Supabase
 * is unreachable the existing project markup is left untouched, so a network blip at
 * build time can never ship an empty portfolio.
 */
const fs = require('fs');
const path = require('path');
const simpleIcons = require('simple-icons');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

const SUPABASE_URL = 'https://qvoxpfigbukidlmshiei.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2b3hwZmlnYnVraWRsbXNoaWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyOTM2OTEsImV4cCI6MjA2NTg2OTY5MX0.CEbyeIw6QiMxbLBhU7x7Re7SL_unWJMyaJQPS9y-k60';

// [label, simple-icons export, accent colour]
//
// The accent is chosen here rather than taken from simple-icons: several brands ship a
// near-black hex (Java/OpenJDK, Angular, Ember, Three.js, Discourse, SQLite) that would
// be invisible against the dark background.
// Icons simple-icons doesn't carry (SQL isn't a brand). Value is a 24x24 path, filled
// via the same currentColor CSS as the brand glyphs. Referenced as 'custom:<key>'.
const CUSTOM_ICONS = {
    // Stacked-cylinder database glyph (Material "database").
    sql: 'M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.59 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm6 14c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23c1.61.78 3.72 1.23 6 1.23s4.39-.45 6-1.23V17zm0-4.55c-1.3.95-3.58 1.55-6 1.55s-4.7-.6-6-1.55V9.64c1.47.83 3.61 1.36 6 1.36s4.53-.53 6-1.36v2.81zM12 9C8.13 9 6 7.5 6 7s2.13-2 6-2 6 1.5 6 2-2.13 2-6 2z',
};

const SKILL_GROUPS = [
    {
        title: 'Languages',
        items: [
            ['JavaScript', 'siJavascript', '#F7DF1E'],
            ['TypeScript', 'siTypescript', '#3178C6'],
            ['Python',     'siPython',     '#3776AB'],
            ['Go',         'siGo',         '#00ADD8'],
            ['Rust',       'siRust',       '#DEA584'],
            ['Ruby',       'siRuby',       '#CC342D'],
            ['Kotlin',     'siKotlin',     '#7F52FF'],
            ['C',          'siC',          '#A8B9CC'],
            ['Java',       'siOpenjdk',    '#E76F00'],
            ['SQL',        'custom:sql',   '#38BDF8'],
            ['HTML5',      'siHtml5',      '#E34F26'],
            ['CSS',        'siCss',        '#3D8FD1'],
        ],
    },
    {
        title: 'Frontend & Frameworks',
        items: [
            ['Tailwind',  'siTailwindcss', '#06B6D4'],
            ['Sass/SCSS', 'siSass',        '#CC6699'],
            ['Angular',   'siAngular',     '#E23237'],
            ['Ember.js',  'siEmberdotjs',  '#E04E39'],
            ['Alpine.js', 'siAlpinedotjs', '#8BC0D0'],
            ['Vite',      'siVite',        '#9135FF'],
            ['Three.js',  'siThreedotjs',  '#D1D5DB'],
            ['PWA',       'siPwa',         '#8B5CF6'],
        ],
    },
    {
        title: 'Backend, Data & Platform',
        items: [
            ['Node.js',     'siNodedotjs',          '#5FA04E'],
            ['Supabase',    'siSupabase',           '#3FCF8E'],
            ['PostgreSQL',  'siPostgresql',         '#6C8EF5'],
            ['SQLite',      'siSqlite',             '#4FA6D8'],
            ['MySQL',       'siMysql',              '#4479A1'],
            ['Flask',       'siFlask',              '#3BABC3'],
            ['Cloudflare',  'siCloudflare',         '#F38020'],
            ['Workers',     'siCloudflareworkers',  '#F6821F'],
            ['WebAssembly', 'siWebassembly',        '#7C6BF5'],
            ['Netlify',     'siNetlify',            '#00C7B7'],
        ],
    },
    {
        title: 'Libraries, Data & AI',
        items: [
            ['Chart.js',  'siChartdotjs',   '#FF6384'],
            ['Pandas',    'siPandas',       '#A78BFA'],
            ['NumPy',     'siNumpy',        '#4DABCF'],
            ['Selenium',  'siSelenium',     '#43B02A'],
            ['Gemini',    'siGooglegemini', '#8E75B2'],
            ['Claude',    'siAnthropic',    '#D97757'],
        ],
    },
    {
        title: 'Tooling & Ecosystem',
        items: [
            ['Git',          'siGit',         '#F03C2E'],
            ['NPM',          'siNpm',         '#CB3837'],
            ['Google Cloud', 'siGooglecloud', '#4285F4'],
            ['Discourse',    'siDiscourse',   '#D1D5DB'],
            ['Android',      'siAndroid',     '#3DDC84'],
            ['FFmpeg',       'siFfmpeg',      '#4E9A06'],
        ],
    },
];

// Featured open-source repos. `stars` is a fallback used only if the build-time GitHub
// fetch fails or is rate-limited; otherwise the live count replaces it on each deploy.
const OPEN_SOURCE = [
    {
        name: 'JtechTools', repo: 'JTech-Forums/JtechTools', stars: 8,
        lang: 'Ruby', color: '#CC342D', live: 'https://forums.jtechforums.org/',
        note: 'In production for a community of thousands',
        blurb: 'A Discourse plugin bundle powering forums.jtechforums.org — dislikes, custom SMTP, a mini-moderation toolkit and moderator category controls, one install behind six admin tabs.',
    },
    {
        name: 'SK Music', repo: 'Shalom-Karr/SK-Music', stars: 9,
        lang: 'JavaScript', color: '#F7DF1E', live: 'https://skmusic.shalomkarr.workers.dev/',
        blurb: 'A kosher filtered music client on Cloudflare Workers — a build-baked catalog, Hebrew-aware search that runs entirely in the browser, and an installable PWA. No search backend.',
    },
    {
        name: 'JTech Appstore', repo: 'Shalom-Karr/JTech-Appstore', stars: 5,
        lang: 'TypeScript', color: '#3178C6',
        blurb: 'A curated app store for the JTech filtered-phone community — TypeScript over an IndexedDB-backed catalog, with an admin review queue and full-text search.',
    },
    {
        name: 'Otzar Hachochma Filter', repo: 'Shalom-Karr/otzar-hachochma-filter', stars: 1,
        lang: 'PowerShell', color: '#5391FE',
        blurb: 'Turns a Windows 11 Pro PC into a locked Otzar Hachochma kiosk: a passwordless standard user restricted to one app by NTFS execute-deny, a custom launcher bar, and printing preserved — while the admin account stays untouched.',
    },
    {
        name: 'SK-Tools', repo: 'Shalom-Karr/SK-Tools', stars: 3,
        lang: 'JavaScript', color: '#F7DF1E', live: 'https://sk-tools.pages.dev/',
        blurb: 'A privacy-first browser toolbox — PDF editor, video/audio/image converters, VCF splitter and a Claude chat — all running client-side, nothing uploaded.',
    },
    {
        name: 'Shul Widget', repo: 'Shalom-Karr/Shul-Widget-Published-App', stars: 3,
        lang: 'Kotlin', color: '#7F52FF', live: 'https://shalom-karr.github.io/Shul-Widget-Published-App/',
        blurb: 'An Android home-screen widget that pulls live davening times from a shul\'s Luach feed. Built in Kotlin, in use at multiple synagogues.',
    },
    {
        name: 'Torah Anytime Downloader', repo: 'Shalom-Karr/Torah-Anytime-Downloader', stars: 0,
        lang: 'JavaScript', color: '#F7DF1E',
        blurb: 'A Windows desktop app that opens torahanytime.com through a local proxy and adds a one-click downloader — every lecture page gets a button that saves the shiur as a seekable MP4 or MP3 at your chosen resolution. Self-updating tray app that works behind TLS-intercepting filters.',
    },
    {
        name: 'SK Video Downloader', repo: 'Shalom-Karr/SK-Video-Downloader', stars: 0,
        lang: 'JavaScript', color: '#F7DF1E',
        blurb: 'A Manifest V3 extension that detects videos on any page and downloads them as seekable MP4s — remuxing MPEG-TS and fragmented-MP4 HLS locally with a custom transmuxer, plus YouTube via player-stream capture. No servers, no WASM, no re-encoding.',
    },
    {
        name: 'kiosk-exit-guard', repo: 'Shalom-Karr/kiosk-exit-guard', stars: 1,
        lang: 'Go', color: '#00ADD8',
        blurb: 'A single-executable Windows kiosk: a WebView2 window, a low-level keyboard hook with password-gated re-injection, a default-deny allowlist firewall and a SHA-256-verified self-updater.',
    },
    {
        name: 'lockguard', repo: 'Shalom-Karr/lockguard', stars: 0,
        lang: 'C', color: '#A8B9CC',
        blurb: 'A kernel-mode Windows 11 lockdown — a WFP firewall enforced at the driver layer plus registry, process and file callbacks, written to resist a tech-savvy admin user. Driver in C, watchdog in Go.',
    },
];

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

const replaceBlock = (html, name, body) => {
    const start = `<!--${name}:START-->`;
    const end = `<!--${name}:END-->`;
    const re = new RegExp(`${start}[\\s\\S]*?${end}`);
    if (!re.test(html)) throw new Error(`Missing ${start} … ${end} markers in index.html`);
    return html.replace(re, `${start}\n${body}\n${end}`);
};

const buildSprite = () => {
    const symbols = SKILL_GROUPS.flatMap(g => g.items).map(([label, ref]) => {
        let d;
        if (ref.startsWith('custom:')) {
            d = CUSTOM_ICONS[ref.slice(7)];
            if (!d) throw new Error(`No custom icon for "${ref}" (for ${label})`);
        } else {
            const icon = simpleIcons[ref];
            if (!icon) throw new Error(`simple-icons has no export "${ref}" (for ${label})`);
            d = icon.path;
        }
        return `<symbol id="i-${slug(label)}" viewBox="0 0 24 24"><path d="${d}"/></symbol>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${symbols.join('')}</svg>`;
};

const buildSkills = () => SKILL_GROUPS.map(group => {
    const cards = group.items.map(([label, , brand], i) => {
        // Stagger the reveal across the row, then stop — a long tail of delays reads as lag.
        const delay = Math.min(i, 7) * 35;
        const style = `--brand:${brand}${delay ? `;--reveal-delay:${delay}ms` : ''}`;
        return `                    <div data-reveal style="${style}" class="skill-card card flex flex-col items-center justify-center p-5 text-center">
                        <svg class="skill-icon mb-3" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${slug(label)}"/></svg>
                        <span class="skill-name font-bold text-gray-400 tracking-wide text-xs">${label}</span>
                    </div>`;
    }).join('\n');

    return `                <h3 data-reveal class="skills-group-title">${group.title}</h3>
                <div class="skill-grid mb-14">
${cards}
                </div>`;
}).join('\n\n');

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Live star counts, fetched once at build time using 2 bulk requests rather than one
// per repo. The personal-account endpoint returns all repos in a single call; the one
// org repo (JtechTools) gets a separate individual request. Any failure keeps the
// baked fallback — a network blip at build time never ships a zeroed-out count.
const fetchStars = async () => {
    const counts = {};
    for (const p of OPEN_SOURCE) counts[p.repo] = p.stars;

    const hdrs = { 'User-Agent': 'shalomkarr-portfolio-build', Accept: 'application/vnd.github+json' };
    const signal = AbortSignal.timeout(8000);

    const ownerTally = {};
    for (const p of OPEN_SOURCE) {
        const o = p.repo.split('/')[0];
        ownerTally[o] = (ownerTally[o] || 0) + 1;
    }
    const mainOwner = Object.entries(ownerTally).sort((a, b) => b[1] - a[1])[0][0];
    const personal = OPEN_SOURCE.filter(p => p.repo.startsWith(mainOwner + '/'));
    const external = OPEN_SOURCE.filter(p => !p.repo.startsWith(mainOwner + '/'));

    let fetched = 0;

    try {
        const [res1, res2] = await Promise.all([
            fetch(`https://api.github.com/users/${mainOwner}/repos?per_page=100&page=1`, { headers: hdrs, signal }),
            fetch(`https://api.github.com/users/${mainOwner}/repos?per_page=100&page=2`, { headers: hdrs, signal }),
        ]);
        const nameMap = {};
        for (const res of [res1, res2]) {
            if (!res.ok) continue;
            const list = await res.json();
            if (Array.isArray(list)) {
                for (const item of list) nameMap[item.name] = item.stargazers_count;
            }
        }
        for (const p of personal) {
            const name = p.repo.split('/')[1];
            if (typeof nameMap[name] === 'number') { counts[p.repo] = nameMap[name]; fetched++; }
        }
    } catch {}

    await Promise.all(external.map(async (p) => {
        try {
            const res = await fetch(`https://api.github.com/repos/${p.repo}`, { headers: hdrs, signal });
            if (res.ok) {
                const j = await res.json();
                if (typeof j.stargazers_count === 'number') { counts[p.repo] = j.stargazers_count; fetched++; }
            }
        } catch {}
    }));

    return { counts, fetched };
};

const STAR_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>';
const GH_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/></svg>';

const buildOpenSource = (stars) => OPEN_SOURCE.map((p, i) => {
    const delay = Math.min(i, 8) * 40;
    const style = `--brand:${p.color}${delay ? `;--reveal-delay:${delay}ms` : ''}`;
    const note = p.note
        ? `\n                    <p class="text-xs text-blue-400/90 font-medium mb-4">${escapeHtml(p.note)}</p>` : '';
    const live = p.live
        ? `\n                        <a href="${escapeHtml(p.live)}" target="_blank" rel="noopener noreferrer" class="os-link os-link-live">Live <span aria-hidden="true">↗</span></a>` : '';
    return `                <div data-reveal style="${style}" class="os-card card flex flex-col p-6">
                    <div class="flex items-center justify-between mb-3">
                        <span class="inline-flex items-center gap-1.5 text-xs text-gray-400"><span class="w-2.5 h-2.5 rounded-full" style="background:${p.color}"></span>${escapeHtml(p.lang)}</span>
                        <span class="inline-flex items-center gap-1 text-xs font-mono text-gray-400" title="GitHub stars">${STAR_SVG}${stars[p.repo] ?? p.stars}</span>
                    </div>
                    <h3 class="text-lg font-bold text-gray-100 mb-2 font-mono tracking-tight">${escapeHtml(p.name)}</h3>
                    <p class="text-sm text-gray-400 leading-relaxed grow mb-4">${escapeHtml(p.blurb)}</p>${note}
                    <div class="flex flex-wrap gap-2 mt-auto pt-2">
                        <a href="https://github.com/${escapeHtml(p.repo)}" target="_blank" rel="noopener noreferrer" class="os-link os-link-star" title="Star ${escapeHtml(p.name)} on GitHub">${STAR_SVG} Star</a>
                        <a href="https://github.com/${escapeHtml(p.repo)}" target="_blank" rel="noopener noreferrer" class="os-link os-link-src">${GH_SVG} Source</a>${live}
                    </div>
                </div>`;
}).join('\n');

// Must stay byte-identical to projectCardHTML() in script.js, or the client-side
// revalidation will repaint the grid on every load.
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

const supabaseGet = async (query, what) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Supabase responded ${res.status} ${res.statusText}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Supabase returned no ${what}`);
    return rows;
};

// Admin-controlled order: sort_order ascending, unordered rows fall to the back by
// recency. Falls back to created_at if the sort_order column isn't there yet, so the
// build never depends on supabase/add_project_sort_order.sql having been run first.
const fetchProjects = async () => {
    const select = 'profile_websites?select=title,url,description,technologies';
    try {
        return await supabaseGet(`${select}&order=sort_order.asc.nullslast,created_at.desc`, 'projects');
    } catch (err) {
        console.warn(`prerender: sort_order unavailable (${err.message}); ordering by created_at`);
        return supabaseGet(`${select}&order=created_at.desc`, 'projects');
    }
};

const fetchPosts = () => supabaseGet(
    'posts?select=slug,title,excerpt,tags,created_at&is_published=eq.true&order=created_at.desc&limit=3',
    'posts'
);

const POST_ACCENTS = ['#3b82f6', '#a855f7', '#ec4899'];

const postCardHTML = (p, i) => {
    const date = new Date(p.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
    const tags = (p.tags || []).slice(0, 3)
        .map(t => `<span class="tech-pill">${escapeHtml(t)}</span>`).join('');
    const delay = i * 80;

    return `                    <a href="/blog/post/${escapeHtml(p.slug)}" data-reveal style="--brand:${POST_ACCENTS[i % POST_ACCENTS.length]}${delay ? `;--reveal-delay:${delay}ms` : ''}" class="card group flex flex-col p-6 text-left">
                        <time datetime="${escapeHtml(p.created_at)}" class="text-xs font-mono text-gray-500 mb-3">${date}</time>
                        <h3 class="text-lg font-bold text-white mb-2 leading-snug group-hover:text-blue-400 transition-colors">${escapeHtml(p.title)}</h3>
                        <p class="post-excerpt text-sm text-gray-400 leading-relaxed grow">${escapeHtml(p.excerpt || '')}</p>
                        <div class="flex flex-wrap gap-2 mt-4">${tags}</div>
                    </a>`;
};

const main = async () => {
    let html = fs.readFileSync(INDEX, 'utf8');

    const iconCount = SKILL_GROUPS.reduce((n, g) => n + g.items.length, 0);
    html = replaceBlock(html, 'ICONS', buildSprite());
    html = replaceBlock(html, 'SKILLS', buildSkills());
    console.log(`prerender: inlined ${iconCount} SVG icons across ${SKILL_GROUPS.length} skill groups`);

    const { counts: stars, fetched } = await fetchStars();
    html = replaceBlock(html, 'OPENSOURCE', buildOpenSource(stars));
    console.log(`prerender: baked ${OPEN_SOURCE.length} open-source cards (${fetched} live star counts, ${OPEN_SOURCE.length - fetched} fallback)`);

    try {
        const projects = await fetchProjects();
        html = replaceBlock(html, 'PROJECTS', projects.map(projectCardHTML).join('\n'));
        console.log(`prerender: baked ${projects.length} project cards`);
    } catch (err) {
        console.warn(`prerender: WARNING — keeping existing project markup (${err.message})`);
    }

    try {
        const posts = await fetchPosts();
        html = replaceBlock(html, 'POSTS', posts.map(postCardHTML).join('\n'));
        console.log(`prerender: baked ${posts.length} blog posts`);
    } catch (err) {
        console.warn(`prerender: WARNING — keeping existing blog markup (${err.message})`);
    }

    fs.writeFileSync(INDEX, html);
    console.log('prerender: wrote index.html');
};

main().catch(err => {
    console.error('prerender failed:', err);
    process.exit(1);
});
