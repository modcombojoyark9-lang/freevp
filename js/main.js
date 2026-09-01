// ============================================
// منطق اصلی برنامه
// ============================================

import { searchProjects, getProject, getDownloadUrl } from './api.js';
import { renderProjects, showLoading, renderPagination } from './ui.js';

// وضعیت جاری
const state = {
    query: '',
    type: '',
    loader: '',
    sort: 'relevance',
    offset: 0,
    limit: 20,
    totalHits: 0
};

// عناصر DOM
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const typeFilter = document.getElementById('typeFilter');
const loaderFilter = document.getElementById('loaderFilter');
const sortFilter = document.getElementById('sortFilter');

// ========== رویدادهای جستجو ==========

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

typeFilter.addEventListener('change', performSearch);
loaderFilter.addEventListener('change', performSearch);
sortFilter.addEventListener('change', performSearch);

// صفحه‌بندی
document.addEventListener('pageChange', (e) => {
    state.offset = e.detail.offset;
    performSearch();
});

// ========== تابع اصلی جستجو ==========

async function performSearch() {
    // خواندن مقادیر از فیلترها
    state.query = searchInput.value.trim();
    state.type = typeFilter.value;
    state.loader = loaderFilter.value;
    state.sort = sortFilter.value;

    showLoading(true);
    document.getElementById('results').innerHTML = '';

    try {
        const result = await searchProjects({
            query: state.query,
            type: state.type,
            loader: state.loader,
            sort: state.sort,
            limit: state.limit,
            offset: state.offset
        });

        state.totalHits = result.total_hits || 0;

        renderProjects(result.hits || []);
        renderPagination(state.offset, state.totalHits, state.limit);

        // به‌روزرسانی URL (برای اشتراک‌گذاری)
        updateURL();

    } catch (error) {
        document.getElementById('results').innerHTML = `
            <p class="loading" style="color:#f85149;">
                ❌ خطا در ارتباط با سرور: ${error.message}
                <br><small>مطمئن شوید اتصال اینترنت دارید</small>
            </p>
        `;
        document.getElementById('pagination').innerHTML = '';
    } finally {
        showLoading(false);
    }
}

// ========== به‌روزرسانی URL ==========

function updateURL() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.type) params.set('type', state.type);
    if (state.loader) params.set('loader', state.loader);
    if (state.sort !== 'relevance') params.set('sort', state.sort);
    if (state.offset > 0) params.set('offset', state.offset);

    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', newUrl);
}

// ========== بارگذاری اولیه از URL ==========

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    searchInput.value = params.get('q') || '';
    typeFilter.value = params.get('type') || '';
    loaderFilter.value = params.get('loader') || '';
    sortFilter.value = params.get('sort') || 'relevance';
    state.offset = parseInt(params.get('offset')) || 0;

    if (searchInput.value || typeFilter.value || loaderFilter.value) {
        performSearch();
    } else {
        // جستجوی پیش‌فرض: نمایش محبوب‌ترین مودها
        searchInput.value = '';
        performSearch();
    }
}

// ========== شروع برنامه ==========

document.addEventListener('DOMContentLoaded', loadFromURL);