// ============================================
// مدیریت نمایش و DOM
// ============================================

/**
 * نمایش کارت‌های پروژه در صفحه
 */
export function renderProjects(projects) {
    const container = document.getElementById('results');
    if (!projects || projects.length === 0) {
        container.innerHTML = `<p class="loading">هیچ نتیجه‌ای یافت نشد 😕</p>`;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="project-card" data-id="${project.project_id}">
            <div class="type-badge">${translateType(project.project_type)}</div>
            <h3>${project.title || project.name}</h3>
            <div class="description">${project.description || 'توضیحاتی موجود نیست'}</div>
            <div class="stats">
                <span>⬇️ ${formatNumber(project.downloads || 0)}</span>
                <span>❤️ ${formatNumber(project.follows || 0)}</span>
                <span>📅 ${getRelativeTime(project.date_modified || project.date_created)}</span>
            </div>
            <button class="download-btn" data-id="${project.project_id}" data-slug="${project.slug}">
                ⬇️ دانلود
            </button>
        </div>
    `).join('');

    // اضافه کردن رویداد به دکمه‌های دانلود
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            await handleDownload(id, btn);
        });
    });
}

/**
 * نمایش وضعیت بارگذاری
 */
export function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

/**
 * نمایش دکمه‌های صفحه‌بندی
 */
export function renderPagination(currentOffset, totalHits, limit = 20) {
    const container = document.getElementById('pagination');
    const totalPages = Math.ceil(totalHits / limit);
    const currentPage = Math.floor(currentOffset / limit) + 1;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    // دکمه قبلی
    html += `<button ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">قبلی</button>`;

    // شماره صفحات
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        const page = i;
        html += `<button class="${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`;
    }

    if (totalPages > 5) {
        html += `<span>...</span>`;
        html += `<button data-page="${totalPages}">${totalPages}</button>`;
    }

    // دکمه بعدی
    html += `<button ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">بعدی</button>`;

    container.innerHTML = html;

    // رویداد کلیک برای دکمه‌های صفحه‌بندی
    container.querySelectorAll('button:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page)) {
                const newOffset = (page - 1) * limit;
                // این رویداد در main.js مدیریت می‌شود
                document.dispatchEvent(new CustomEvent('pageChange', { detail: { offset: newOffset } }));
            }
        });
    });
}

/**
 * مدیریت دانلود فایل
 */
async function handleDownload(projectId, button) {
    button.textContent = '⏳ در حال دریافت...';
    button.disabled = true;

    try {
        const { getDownloadUrl } = await import('./api.js');
        const url = await getDownloadUrl(projectId);

        if (url) {
            // باز کردن لینک دانلود در تب جدید
            window.open(url, '_blank');
            button.textContent = '✅ دانلود شروع شد';
        } else {
            button.textContent = '❌ لینک دانلود یافت نشد';
        }
    } catch (error) {
        button.textContent = '❌ خطا در دانلود';
        console.error(error);
    }

    setTimeout(() => {
        button.textContent = '⬇️ دانلود';
        button.disabled = false;
    }, 3000);
}

// ========== توابع کمکی ==========

function translateType(type) {
    const map = {
        'mod': 'مود',
        'plugin': 'پلاگین',
        'shader': 'شیدر',
        'resourcepack': 'ریسورس پک',
        'datapack': 'دیتا پک',
        'modpack': 'مودپک'
    };
    return map[type] || type;
}

function formatNumber(num) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
}

function getRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diff === 0) return 'امروز';
    if (diff === 1) return 'دیروز';
    if (diff < 7) return `${diff} روز پیش`;
    if (diff < 30) return `${Math.floor(diff / 7)} هفته پیش`;
    if (diff < 365) return `${Math.floor(diff / 30)} ماه پیش`;
    return `${Math.floor(diff / 365)} سال پیش`;
}