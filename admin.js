// admin.js
import { supabase } from './supabase-client.js';

// --- DOM Elements ---
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutButton = document.getElementById('logout-button');

// Tab Elements
const tabLogs = document.getElementById('tab-logs');
const tabProjects = document.getElementById('tab-projects');
const tabAnalytics = document.getElementById('tab-analytics');
const contentLogs = document.getElementById('content-logs');
const contentProjects = document.getElementById('content-projects');
const contentAnalytics = document.getElementById('content-analytics');
const tabClicks = document.getElementById('tab-clicks');
const contentClicks = document.getElementById('content-clicks');

// Projects Elements
const projectsList = document.getElementById('projects-list');
const addProjectButton = document.getElementById('add-project-button');
const projectModal = document.getElementById('project-modal');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const projectForm = document.getElementById('project-form');
const projectIdInput = document.getElementById('project-id');
const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const descriptionInput = document.getElementById('description');
const selectedTagsContainer = document.getElementById('selected-tags');
const techDropdown = document.getElementById('tech-dropdown');
const newTechInput = document.getElementById('new-tech-input');

// Visitor Logs Elements
const visitorLogsBody = document.getElementById('visitor-logs-body');
const refreshLogsButton = document.getElementById('refresh-logs-button');

// Analytics Elements
const totalViewsEl = document.getElementById('total-views');
const totalClicksEl = document.getElementById('total-clicks');
const avgEngagementEl = document.getElementById('avg-engagement');
const dailyAnalyticsBody = document.getElementById('daily-analytics-body');
const postAnalyticsBody = document.getElementById('post-analytics-body');
const refreshAnalyticsButton = document.getElementById('refresh-analytics-button');


// --- State ---
let allTechnologies = [];
let selectedTechnologies = [];


// --- Authentication ---

const verifyAdmin = async (user) => {
    if (!user) return false;

    const { data, error } = await supabase
        .from('admin_users')
        .select('email')
        .eq('email', user.email)
        .single();

    if (error || !data) {
        console.error('Authorization failed:', error);
        await supabase.auth.signOut();
        loginError.textContent = 'Access Denied: You are not an authorized admin.';
        return false;
    }

    return true;
};

const handleLogin = async (event) => {
    event.preventDefault();
    loginError.textContent = '';
    const email = loginForm.email.value;
    const password = loginForm.password.value;

    const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        loginError.textContent = error.message;
        return;
    }

    if (await verifyAdmin(user)) {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        await loadInitialData();
    }
};

const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
};

// Check user session on page load
const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && await verifyAdmin(session.user)) {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        await loadInitialData();
    }
};


// --- Data Loading ---
const loadInitialData = async () => {
    await Promise.all([
        loadTechnologies(),
        loadProjects(),
        loadVisitorLogs()
    ]);
};

const loadTechnologies = async () => {
    const { data, error } = await supabase.from('technologies').select('name');
    if (error) {
        console.error('Error fetching technologies:', error);
        return;
    }
    allTechnologies = data.map(t => t.name);
    renderTechDropdown();
};

// Current projects in display order, and whether the order has unsaved edits.
let projectOrder = [];
let orderDirty = false;

const loadProjects = async () => {
    // Prefer sort_order; fall back if the column isn't there yet (migration not run).
    let { data, error } = await supabase.from('profile_websites').select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (error && error.code === '42703') {
        ({ data, error } = await supabase.from('profile_websites').select('*')
            .order('created_at', { ascending: false }));
    }
    if (error) {
        console.error('Error fetching projects:', error);
        projectsList.innerHTML = `<p class="text-red-400 text-center py-4">Error loading projects: ${error.message}</p>`;
        return;
    }

    projectOrder = data || [];
    orderDirty = false;
    renderProjects();
    updateOrderBar();
};

// --- Reorder ----------------------------------------------------------------
const moveProject = (id, delta) => {
    const i = projectOrder.findIndex(p => String(p.id) === String(id));
    const j = i + delta;
    if (i < 0 || j < 0 || j >= projectOrder.length) return;
    [projectOrder[i], projectOrder[j]] = [projectOrder[j], projectOrder[i]];
    orderDirty = true;
    renderProjects();
    updateOrderBar();
};

const moveProjectTo = (id, edge) => {
    const i = projectOrder.findIndex(p => String(p.id) === String(id));
    if (i < 0) return;
    const [item] = projectOrder.splice(i, 1);
    if (edge === 'top') projectOrder.unshift(item);
    else projectOrder.push(item);
    orderDirty = true;
    renderProjects();
    updateOrderBar();
};

const updateOrderBar = () => {
    const bar = document.getElementById('order-bar');
    if (bar) bar.classList.toggle('hidden', !orderDirty);
};

const saveProjectOrder = async () => {
    const saveBtn = document.getElementById('save-order-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    // Only write rows whose position actually changed.
    const updates = projectOrder
        .map((p, idx) => ({ p, idx }))
        .filter(({ p, idx }) => p.sort_order !== idx)
        .map(({ p, idx }) => supabase.from('profile_websites').update({ sort_order: idx }).eq('id', p.id));

    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save order'; }

    if (failed) {
        alert('Error saving order: ' + failed.error.message +
              (failed.error.code === '42703' ? '\n\nRun supabase/add_project_sort_order.sql first — the sort_order column is missing.' : ''));
        return;
    }
    await loadProjects();
};

const loadVisitorLogs = async () => {
    visitorLogsBody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">Loading...</td></tr>';
    
    // page_visits carries two timestamps: visited_at (schema.sql, DEFAULT NOW()) and a
    // later-added created_at. tracker.js sets neither, so only visited_at is guaranteed
    // populated on every row — order and display by that one.
    const { data, error } = await supabase
        .from('page_visits')
        .select('*')
        .order('visited_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error("Error loading logs:", error);
        if (error.code === "42703") {
            // Specific error for missing column
            visitorLogsBody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-red-400">Database Error: Missing "visited_at" column in "page_visits" table. Please update Supabase.</td></tr>';
        } else {
            visitorLogsBody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
        }
        return;
    }

    renderVisitorLogs(data);
};

const loadBlogAnalytics = async () => {
    // Load summary stats and post analytics
    const { data: postAnalytics, error: postError } = await supabase
        .from('blog_post_analytics')
        .select('*')
        .order('total_views', { ascending: false });

    if (postError) {
        console.error('Error loading post analytics:', postError);
        postAnalyticsBody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-red-500">Error: ${postError.message}</td></tr>`;
    } else {
        renderPostAnalytics(postAnalytics || []);

        // Calculate and display summary stats
        const totalViews = postAnalytics?.reduce((sum, p) => sum + (p.total_views || 0), 0) || 0;
        const totalClicks = postAnalytics?.reduce((sum, p) => sum + (p.total_clicks || 0), 0) || 0;
        const avgEngagement = totalViews > 0 ? (totalClicks / totalViews * 100).toFixed(1) : 0;

        totalViewsEl.textContent = totalViews.toLocaleString();
        totalClicksEl.textContent = totalClicks.toLocaleString();
        avgEngagementEl.textContent = `${avgEngagement}%`;
    }

    // Load daily analytics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyData, error: dailyError } = await supabase
        .from('blog_post_analytics_by_date')
        .select('*')
        .gte('view_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('view_date', { ascending: false });

    if (dailyError) {
        console.error('Error loading daily analytics:', dailyError);
        dailyAnalyticsBody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-red-500">Error: ${dailyError.message}</td></tr>`;
    } else {
        // Aggregate by date
        const dailyTotals = {};
        (dailyData || []).forEach(row => {
            const date = row.view_date;
            if (!dailyTotals[date]) {
                dailyTotals[date] = {
                    views: 0,
                    uniqueVisitors: 0,
                    clicks: 0,
                    avgDuration: []
                };
            }
            dailyTotals[date].views += row.views_count || 0;
            dailyTotals[date].uniqueVisitors += row.unique_visitors_count || 0;
            dailyTotals[date].clicks += row.clicks_count || 0;
            if (row.avg_duration_seconds) {
                dailyTotals[date].avgDuration.push(row.avg_duration_seconds);
            }
        });

        renderDailyAnalytics(dailyTotals);
    }
};

let dailyViewsChartInstance = null;

const renderDailyAnalytics = (dailyTotals) => {
    dailyAnalyticsBody.innerHTML = '';

    const dates = Object.keys(dailyTotals).sort().reverse();

    if (dates.length === 0) {
        dailyAnalyticsBody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">No data available yet.</td></tr>';
        return;
    }

    // Arrays for Chart.js
    const chartLabels = [];
    const chartViewsData = [];
    const chartUniqueData = [];

    // We want the chart to display left-to-right (oldest to newest), 
    // so we iterate the sorted 'dates' array in reverse for the chart
    const chartDates = [...dates].reverse();

    chartDates.forEach(date => {
        const data = dailyTotals[date];
        chartLabels.push(new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        chartViewsData.push(data.views);
        chartUniqueData.push(data.uniqueVisitors);
    });

    dates.forEach(date => {
        const data = dailyTotals[date];
        const avgDuration = data.avgDuration.length > 0
            ? Math.round(data.avgDuration.reduce((a, b) => a + b, 0) / data.avgDuration.length)
            : 0;

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-700 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3 text-gray-300">${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
            <td class="px-4 py-3 text-right text-blue-400 font-semibold">${data.views.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-purple-400">${data.uniqueVisitors.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-green-400">${data.clicks.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-gray-300">${avgDuration}</td>
        `;
        dailyAnalyticsBody.appendChild(row);
    });

    // Render Chart.js
    const ctx = document.getElementById('dailyViewsChart');
    if (ctx) {
        if (dailyViewsChartInstance) {
            dailyViewsChartInstance.destroy();
        }
        
        dailyViewsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Total Views',
                        data: chartViewsData,
                        borderColor: '#60a5fa', // text-blue-400
                        backgroundColor: 'rgba(96, 165, 250, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Unique Visitors',
                        data: chartUniqueData,
                        borderColor: '#c084fc', // text-purple-400
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.3,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        labels: { color: '#d1d5db' } // text-gray-300
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#374151' }, // border-gray-700
                        ticks: { color: '#9ca3af' } // text-gray-400
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#374151' },
                        ticks: { color: '#9ca3af', precision: 0 }
                    }
                }
            }
        });
    }
};

const renderPostAnalytics = (posts) => {
    postAnalyticsBody.innerHTML = '';

    if (posts.length === 0) {
        postAnalyticsBody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-gray-500">No blog posts found or no analytics data available yet.</td></tr>';
        return;
    }

    posts.forEach(post => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-700 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3 text-gray-300">
                <div class="font-semibold">${post.title}</div>
                <div class="text-xs text-gray-500">${post.slug}</div>
            </td>
            <td class="px-4 py-3 text-right text-blue-400 font-semibold">${(post.total_views || 0).toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-purple-400">${(post.unique_visitors || 0).toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-green-400">${(post.total_clicks || 0).toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-pink-400">${(post.likes_count || 0).toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-gray-300">${post.avg_duration_seconds || 0}</td>
        `;
        postAnalyticsBody.appendChild(row);
    });
};


// --- Image Manager Logic ---

const loadImages = async () => {
    imageGallery.innerHTML = '<div class="col-span-full text-gray-400 text-center py-4">Loading images...</div>';
    
    const { data, error } = await supabase
        .storage
        .from('blog-images')
        .list('', {
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'desc' },
        });

    if (error) {
        console.error('Error loading images:', error);
        imageGallery.innerHTML = `<div class="col-span-full text-red-500 text-center py-4">Error loading images: ${error.message}</div>`;
        return;
    }

    renderImages(data);
};

const renderImages = (images) => {
    imageGallery.innerHTML = '';
    
    // Filter out potential system files like .emptyFolderPlaceholder
    const validImages = images.filter(img => img.name !== '.emptyFolderPlaceholder' && img.id);

    if (validImages.length === 0) {
        imageGallery.innerHTML = '<div class="col-span-full text-gray-500 text-center py-4">No images uploaded yet.</div>';
        return;
    }

    validImages.forEach(img => {
        const { data: { publicUrl } } = supabase.storage.from('blog-images').getPublicUrl(img.name);
        
        const imgContainer = document.createElement('div');
        imgContainer.className = 'bg-gray-700 rounded-lg overflow-hidden border border-gray-600 relative group flex flex-col';
        
        imgContainer.innerHTML = `
            <div class="h-32 w-full bg-gray-800 flex items-center justify-center overflow-hidden">
                <img src="${publicUrl}" alt="${img.name}" class="object-contain w-full h-full" loading="lazy">
            </div>
            <div class="p-2 flex flex-col flex-grow">
                <p class="text-xs text-gray-300 truncate mb-2" title="${img.name}">${img.name}</p>
                <div class="mt-auto flex justify-between items-center">
                    <button class="copy-url-btn text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors" data-url="${publicUrl}">Copy URL</button>
                    <button class="delete-img-btn text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity" data-name="${img.name}">Delete</button>
                </div>
            </div>
        `;
        imageGallery.appendChild(imgContainer);
    });
};

const handleImageUpload = async (e) => {
    e.preventDefault();
    const file = imageFileInput.files[0];
    if (!file) return;

    uploadButtonLoading(true);

    // Create unique filename while preserving extension
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

    const { error } = await supabase.storage
        .from('blog-images')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });

    uploadButtonLoading(false);

    if (error) {
        showUploadStatus(`Upload failed: ${error.message}`, 'error');
    } else {
        showUploadStatus('Upload successful!', 'success');
        imageUploadForm.reset();
        await loadImages();
    }
};

const handleDeleteImage = async (fileName) => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    const { error } = await supabase.storage
        .from('blog-images')
        .remove([fileName]);

    if (error) {
        alert('Error deleting image: ' + error.message);
    } else {
        await loadImages();
    }
};

const uploadButtonLoading = (isLoading) => {
    if (isLoading) {
        uploadImageButton.disabled = true;
        uploadImageButton.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Uploading...`;
    } else {
        uploadImageButton.disabled = false;
        uploadImageButton.innerHTML = 'Upload';
    }
};

const showUploadStatus = (message, type) => {
    uploadStatus.textContent = message;
    uploadStatus.classList.remove('hidden', 'bg-red-500/20', 'text-red-400', 'bg-green-500/20', 'text-green-400');
    if (type === 'error') {
        uploadStatus.classList.add('bg-red-500/20', 'text-red-400');
    } else {
        uploadStatus.classList.add('bg-green-500/20', 'text-green-400');
    }
    setTimeout(() => {
        uploadStatus.classList.add('hidden');
    }, 5000);
};


// --- Rendering ---

const renderVisitorLogs = (logs) => {
    visitorLogsBody.innerHTML = '';
    if (logs.length === 0) {
        visitorLogsBody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">No logs found.</td></tr>';
        return;
    }

    logs.forEach(log => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-700 transition-colors';
        
        const ts = log.visited_at || log.created_at;
        const date = ts ? new Date(ts).toLocaleString() : 'N/A';
        // Safe access to meta in case it's null
        const browser = log.meta?.browser || 'Unknown';
        const os = log.meta?.os || 'Unknown';
        const duration = log.duration_seconds ? `${log.duration_seconds}s` : 'Active/Unfinished';

        row.innerHTML = `
            <td class="px-4 py-3 text-gray-300">${date}</td>
            <td class="px-4 py-3 text-blue-300 font-mono text-xs">${log.ip_address}</td>
            <td class="px-4 py-3 text-gray-400 text-xs">${browser} on ${os}</td>
            <td class="px-4 py-3 text-right text-gray-300">${duration}</td>
        `;
        visitorLogsBody.appendChild(row);
    });
};

const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderProjects = () => {
    projectsList.innerHTML = '';
    if (!projectOrder.length) {
        projectsList.innerHTML = '<p class="text-gray-500 text-center py-4">No projects found. Add one to get started!</p>';
        return;
    }

    projectOrder.forEach((project, idx) => {
        const last = idx === projectOrder.length - 1;
        const techs = (project.technologies || [])
            .map(t => `<span class="text-xs bg-gray-600/80 px-2 py-0.5 rounded text-gray-300">${escHtml(t)}</span>`).join('');
        const desc = project.description
            ? `<p class="text-sm text-gray-400 mt-1.5 line-clamp-2">${escHtml(project.description)}</p>` : '';

        const row = document.createElement('div');
        row.className = 'project-row group bg-gray-700/60 hover:bg-gray-700 p-4 rounded-lg flex items-start gap-3 border border-gray-600 hover:border-blue-500/50 transition-colors';
        row.draggable = true;
        row.dataset.id = project.id;
        row.innerHTML = `
            <div class="flex flex-col items-center pt-0.5 select-none">
                <span class="drag-handle cursor-grab text-gray-500 group-hover:text-gray-300 leading-none" title="Drag to reorder" aria-hidden="true">⠿</span>
                <span class="mt-1 text-xs font-mono text-gray-500 tabular-nums">${idx + 1}</span>
            </div>

            <div class="flex flex-col gap-0.5 mr-1">
                <button class="order-btn move-up ${idx === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-blue-400'} text-gray-400 leading-none text-sm" data-id="${project.id}" ${idx === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">▲</button>
                <button class="order-btn move-down ${last ? 'opacity-30 cursor-not-allowed' : 'hover:text-blue-400'} text-gray-400 leading-none text-sm" data-id="${project.id}" ${last ? 'disabled' : ''} title="Move down" aria-label="Move down">▼</button>
            </div>

            <div class="flex-1 min-w-0">
                <h3 class="text-lg font-bold text-gray-100 truncate">${escHtml(project.title)}</h3>
                <a href="${escAttr(project.url)}" target="_blank" rel="noopener" class="text-sm text-blue-400 hover:underline break-all">${escHtml(project.url)}</a>
                ${desc}
                <div class="mt-2 flex gap-1 flex-wrap">${techs}</div>
            </div>

            <div class="flex flex-col gap-2 shrink-0">
                <button class="edit-btn bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-1.5 px-3 rounded text-sm transition-colors" data-id="${project.id}">Edit</button>
                <button class="delete-btn bg-red-600 hover:bg-red-700 text-white font-semibold py-1.5 px-3 rounded text-sm transition-colors" data-id="${project.id}">Delete</button>
                <button class="top-btn text-xs text-gray-400 hover:text-blue-400 ${idx === 0 ? 'invisible' : ''}" data-id="${project.id}" title="Move to top">⤒ Top</button>
            </div>
        `;
        projectsList.appendChild(row);
    });

    bindProjectDrag();
};

// HTML5 drag-and-drop reordering (desktop). Arrow buttons cover touch/keyboard.
let dragId = null;
const bindProjectDrag = () => {
    projectsList.querySelectorAll('.project-row').forEach(row => {
        row.addEventListener('dragstart', (e) => {
            dragId = row.dataset.id;
            row.classList.add('opacity-40');
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => { dragId = null; row.classList.remove('opacity-40'); });
        row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetId = row.dataset.id;
            if (!dragId || dragId === targetId) return;
            const from = projectOrder.findIndex(p => String(p.id) === String(dragId));
            const to = projectOrder.findIndex(p => String(p.id) === String(targetId));
            if (from < 0 || to < 0) return;
            const [item] = projectOrder.splice(from, 1);
            projectOrder.splice(to, 0, item);
            orderDirty = true;
            renderProjects();
            updateOrderBar();
        });
    });
};

const renderTechDropdown = () => {
    techDropdown.innerHTML = '';
    const unselected = allTechnologies.filter(tech => !selectedTechnologies.includes(tech));
    unselected.forEach(tech => {
        const option = document.createElement('div');
        option.className = 'multi-select-option text-sm text-gray-200';
        option.textContent = tech;
        option.addEventListener('click', () => addTag(tech));
        techDropdown.appendChild(option);
    });
};

const renderSelectedTags = () => {
    selectedTagsContainer.innerHTML = '';
    selectedTechnologies.forEach(tech => {
        const tag = document.createElement('div');
        tag.className = 'tag text-xs';
        tag.innerHTML = `
            <span>${tech}</span>
            <span class="tag-remove text-gray-400 hover:text-white" data-tech="${tech}">&#10005;</span>
        `;
        selectedTagsContainer.appendChild(tag);
    });
};


// --- Modal & Form Logic ---
const openModal = (project = null) => {
    projectForm.reset();
    projectIdInput.value = '';
    selectedTechnologies = [];

    if (project) {
        modalTitle.textContent = 'Edit Project';
        projectIdInput.value = project.id;
        titleInput.value = project.title;
        urlInput.value = project.url;
        descriptionInput.value = project.description;
        selectedTechnologies = project.technologies ? [...project.technologies] : [];
    } else {
        modalTitle.textContent = 'Add Project';
    }

    renderSelectedTags();
    renderTechDropdown();
    projectModal.classList.remove('hidden');
};

const closeModal = () => {
    projectModal.classList.add('hidden');
};

const handleFormSubmit = async (event) => {
    event.preventDefault();

    const projectData = {
        title: titleInput.value,
        url: urlInput.value,
        description: descriptionInput.value,
        technologies: selectedTechnologies
    };

    const id = projectIdInput.value;
    let error;

    if (id) {
        // Update existing project
        const { error: updateError } = await supabase.from('profile_websites').update(projectData).eq('id', id);
        error = updateError;
    } else {
        // New projects append to the end of the order. Retry without sort_order if the
        // column isn't there yet (migration not run).
        let { error: insertError } = await supabase.from('profile_websites')
            .insert([{ ...projectData, sort_order: projectOrder.length }]);
        if (insertError && insertError.code === '42703') {
            ({ error: insertError } = await supabase.from('profile_websites').insert([projectData]));
        }
        error = insertError;
    }

    if (error) {
        alert('Error saving project: ' + error.message);
    } else {
        closeModal();
        await loadProjects();
    }
};

const handleDeleteProject = async (id) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    const { error } = await supabase.from('profile_websites').delete().eq('id', id);

    if (error) {
        alert('Error deleting project: ' + error.message);
    } else {
        await loadProjects();
    }
};

const handleEditProject = async (id) => {
    const { data, error } = await supabase.from('profile_websites').select('*').eq('id', id).single();
    if (error) {
        alert('Error fetching project details: ' + error.message);
        return;
    }
    openModal(data);
};


// --- Technologies Multi-Select Logic ---
const addTag = (tech) => {
    if (!selectedTechnologies.includes(tech)) {
        selectedTechnologies.push(tech);
        renderSelectedTags();
        renderTechDropdown();
        techDropdown.classList.add('hidden');
    }
};

const removeTag = (tech) => {
    selectedTechnologies = selectedTechnologies.filter(t => t !== tech);
    renderSelectedTags();
    renderTechDropdown();
};

const handleAddNewTech = async (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        const newTech = newTechInput.value.trim();
        if (newTech && !allTechnologies.includes(newTech)) {
            const { error } = await supabase.from('technologies').insert([{ name: newTech }]);
            if (error) {
                alert('Error adding new technology: ' + error.message);
                return;
            }
            allTechnologies.push(newTech);
            addTag(newTech);
            newTechInput.value = '';
        } else if (newTech) {
            // If tech already exists, just add it
            addTag(newTech);
            newTechInput.value = '';
        }
    }
};


// --- Tab Switching ---
const switchTab = (tab) => {
    // Update tab buttons
    const allTabButtons = document.querySelectorAll('.tab-button');
    allTabButtons.forEach(btn => {
        btn.classList.remove('text-blue-400', 'border-b-2', 'border-blue-400');
        btn.classList.add('text-gray-400');
    });

    // Update content
    const allTabContent = document.querySelectorAll('.tab-content');
    allTabContent.forEach(content => content.classList.add('hidden'));

    if (tab === 'logs') {
        tabLogs.classList.remove('text-gray-400');
        tabLogs.classList.add('text-blue-400', 'border-b-2', 'border-blue-400');
        contentLogs.classList.remove('hidden');
    } else if (tab === 'projects') {
        tabProjects.classList.remove('text-gray-400');
        tabProjects.classList.add('text-blue-400', 'border-b-2', 'border-blue-400');
        contentProjects.classList.remove('hidden');
    } else if (tab === 'analytics') {
        tabAnalytics.classList.remove('text-gray-400');
        tabAnalytics.classList.add('text-blue-400', 'border-b-2', 'border-blue-400');
        contentAnalytics.classList.remove('hidden');
        // Load analytics when tab is shown
        loadBlogAnalytics();
    } else if (tab === 'images') {
        tabImages.classList.remove('text-gray-400');
        tabImages.classList.add('text-blue-400', 'border-b-2', 'border-blue-400');
        contentImages.classList.remove('hidden');
        // Load images when tab is shown
        loadImages();
    } else if (tab === 'clicks') {
        tabClicks.classList.remove('text-gray-400');
        tabClicks.classList.add('text-blue-400', 'border-b-2', 'border-blue-400');
        contentClicks.classList.remove('hidden');
        loadClicks();
    }
};

// The whole dashboard arrives from one RPC. Aggregating in Postgres beats
// pulling every row into the browser and grouping it here, and it stays fast
// as the table grows.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const loadClicks = async () => {
    const host = document.getElementById('clicks-panels');
    host.innerHTML = '<p class="text-gray-500 py-8 text-center">Loading…</p>';

    const days = Number(document.getElementById('clicksRange')?.value || 30);
    const { data, error } = await supabase.rpc('site_dashboard_summary', {
        p_days: days, p_limit: 15,
    });

    if (error) {
        const hint = error.code === '42883' || error.code === '42P01'
            ? '<br><span class="text-gray-400">Run supabase/site_events.sql — the table and function do not exist yet.</span>'
            : '';
        host.innerHTML = `<p class="text-red-500 py-8 text-center">Error: ${esc(error.message)}${hint}</p>`;
        return;
    }

    const d = data || {};
    const t = d.totals || {};
    const r = d.rates || {};

    const stat = (label, value, sub = '') => `
        <div class="bg-gray-900 rounded p-4">
            <p class="text-xs uppercase text-gray-500">${label}</p>
            <p class="text-2xl font-semibold text-blue-400">${value}</p>
            ${sub ? `<p class="text-xs text-gray-500 mt-1">${sub}</p>` : ''}
        </div>`;

    const n = (v) => Number(v || 0).toLocaleString();

    const bars = (title, rows, fmt = (k) => k) => {
        const list = rows || [];
        const max = Math.max(1, ...list.map((x) => Number(x.n)));
        return `
        <div class="bg-gray-900 rounded p-4">
            <h3 class="text-sm font-semibold text-gray-300 mb-3">${title}</h3>
            ${list.length ? list.map((x) => `
                <div class="mb-2">
                    <div class="flex justify-between text-xs mb-0.5">
                        <span class="text-gray-300 truncate pr-2">${esc(fmt(x.key))}</span>
                        <span class="text-gray-500 tabular-nums">${n(x.n)}</span>
                    </div>
                    <div class="h-1.5 bg-gray-800 rounded overflow-hidden">
                        <div class="h-full bg-blue-500" style="width:${(x.n / max) * 100}%"></div>
                    </div>
                </div>`).join('') : '<p class="text-xs text-gray-600">No data</p>'}
        </div>`;
    };

    // day-of-week x hour grid. Colour is relative to the busiest cell, so the
    // pattern reads regardless of overall traffic volume.
    const heat = (() => {
        const cells = d.heatmap || [];
        if (!cells.length) return '';
        const max = Math.max(...cells.map((c) => Number(c.n)));
        const at = (dow, h) => Number(cells.find((c) => c.dow === dow && c.hour === h)?.n || 0);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `
        <div class="bg-gray-900 rounded p-4 col-span-2">
            <h3 class="text-sm font-semibold text-gray-300 mb-3">When people visit</h3>
            <div class="overflow-x-auto"><table class="text-[10px]"><tbody>
            ${dayNames.map((name, dow) => `<tr>
                <td class="pr-2 text-gray-500 text-right">${name}</td>
                ${Array.from({ length: 24 }, (_, h) => {
                    const v = at(dow, h);
                    const o = max ? v / max : 0;
                    return `<td title="${name} ${h}:00 — ${v}"
                        style="background:rgba(59,130,246,${o.toFixed(3)})"
                        class="w-3 h-3 border border-gray-800"></td>`;
                }).join('')}
            </tr>`).join('')}
            <tr><td></td>${Array.from({ length: 24 }, (_, h) =>
                `<td class="text-gray-600 text-center">${h % 6 === 0 ? h : ''}</td>`).join('')}</tr>
            </tbody></table></div>
        </div>`;
    })();

    const recent = (d.recent || []).slice(0, 40).map((e) => `
        <tr class="border-b border-gray-800">
            <td class="px-3 py-1.5 text-gray-400 whitespace-nowrap">${new Date(e.created_at).toLocaleString()}</td>
            <td class="px-3 py-1.5"><span class="px-1.5 py-0.5 rounded text-[10px] ${
                e.event === 'outbound' ? 'bg-amber-900 text-amber-300'
                : e.event === 'click' ? 'bg-blue-900 text-blue-300'
                : e.event === 'exit' ? 'bg-gray-700 text-gray-400'
                : 'bg-green-900 text-green-300'}">${esc(e.event)}</span></td>
            <td class="px-3 py-1.5 text-gray-300 truncate max-w-[10rem]">${esc(e.path || '')}</td>
            <td class="px-3 py-1.5 text-gray-400 truncate max-w-[12rem]">${esc(e.label || '')}</td>
            <td class="px-3 py-1.5 text-gray-500 whitespace-nowrap">${esc([e.city, e.country].filter(Boolean).join(', '))}</td>
            <td class="px-3 py-1.5 text-gray-500 whitespace-nowrap">${esc(e.browser)} · ${esc(e.device)}</td>
        </tr>`).join('');

    host.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            ${stat('Visitors', n(t.visitors), `${n(t.returning)} returning`)}
            ${stat('Sessions', n(t.sessions), `${r.events_per_session || 0} events each`)}
            ${stat('Page views', n(t.pageviews), `${n(t.today)} events today`)}
            ${stat('Clicks', n(t.clicks), `${n(t.outbound)} outbound`)}
            ${stat('Bounce rate', `${r.bounce_pct || 0}%`, 'single-event sessions')}
            ${stat('Avg session', `${r.avg_session_min || 0} min`)}
            ${stat('Unique IPs', n(t.visitors_ip))}
            ${stat('Total events', n(t.events), `last ${d.range_days} days`)}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            ${bars('Top pages', d.by_path)}
            ${bars('Most clicked', d.by_click, (k) => k)}
            ${bars('Referrers', d.by_referrer, (k) => { try { return new URL(k).hostname; } catch { return k; } })}
            ${bars('Countries', d.by_country)}
            ${bars('Browsers', d.by_browser)}
            ${bars('Devices', d.by_device)}
            ${bars('Operating systems', d.by_os)}
            ${bars('Screen sizes', d.by_screen)}
            ${heat}
        </div>
        <div class="bg-gray-900 rounded p-4">
            <h3 class="text-sm font-semibold text-gray-300 mb-3">Recent activity</h3>
            <div class="overflow-x-auto custom-scroll">
                <table class="min-w-full text-xs text-left">
                    <thead class="text-gray-500 uppercase">
                        <tr><th class="px-3 py-2">Time</th><th class="px-3 py-2">Event</th>
                        <th class="px-3 py-2">Path</th><th class="px-3 py-2">Label</th>
                        <th class="px-3 py-2">Location</th><th class="px-3 py-2">Client</th></tr>
                    </thead>
                    <tbody>${recent || '<tr><td colspan="6" class="px-3 py-6 text-center text-gray-600">No events yet.</td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
};


// --- Event Listeners ---
loginForm.addEventListener('submit', handleLogin);
logoutButton.addEventListener('click', handleLogout);
addProjectButton.addEventListener('click', () => openModal());
document.getElementById('save-order-btn')?.addEventListener('click', saveProjectOrder);
document.getElementById('cancel-order-btn')?.addEventListener('click', loadProjects);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
projectForm.addEventListener('submit', handleFormSubmit);
refreshLogsButton.addEventListener('click', loadVisitorLogs);
refreshAnalyticsButton.addEventListener('click', loadBlogAnalytics);

// Tab switching
tabLogs.addEventListener('click', () => switchTab('logs'));
tabProjects.addEventListener('click', () => switchTab('projects'));
tabAnalytics.addEventListener('click', () => switchTab('analytics'));
tabClicks?.addEventListener('click', () => switchTab('clicks'));
document.getElementById('clicksRange')?.addEventListener('change', loadClicks);
document.getElementById('refresh-clicks-button')?.addEventListener('click', loadClicks);

projectsList.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !projectsList.contains(btn)) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-btn')) handleDeleteProject(id);
    else if (btn.classList.contains('edit-btn')) handleEditProject(id);
    else if (btn.classList.contains('move-up')) moveProject(id, -1);
    else if (btn.classList.contains('move-down')) moveProject(id, 1);
    else if (btn.classList.contains('top-btn')) moveProjectTo(id, 'top');
});

// For the multi-select dropdown
selectedTagsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) {
        removeTag(e.target.dataset.tech);
    } else {
        techDropdown.classList.toggle('hidden');
    }
});

newTechInput.addEventListener('keydown', handleAddNewTech);

// Close dropdown if clicking outside
document.addEventListener('click', (e) => {
    if (!selectedTagsContainer.contains(e.target) && !techDropdown.contains(e.target)) {
        techDropdown.classList.add('hidden');
    }
});


// --- Initial Load ---
checkSession();