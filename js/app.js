// ============================================
// ارتباط با API مودرینث
// ============================================

const API_BASE = 'https://api.modrinth.com/v3';

// تنظیم User-Agent (الزامی!)
const HEADERS = {
    'User-Agent': 'ModrinthSite/1.0.0 (my-email@example.com)'
};

/**
 * جستجوی پروژه‌ها با فیلترهای مختلف
 */
export async function searchProjects({ query = '', type = '', loader = '', sort = 'relevance', limit = 20, offset = 0 }) {
    // ساخت پارامترهای جستجو
    const facets = [];
    if (type) facets.push([`project_type:${type}`]);
    if (loader) facets.push([`categories:${loader}`]);

    const params = new URLSearchParams({
        query: query || '',
        limit: limit,
        offset: offset,
        index: sort
    });

    if (facets.length > 0) {
        params.append('facets', JSON.stringify(facets));
    }

    const url = `${API_BASE}/search?${params}`;

    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('خطا در جستجو:', error);
        throw error;
    }
}

/**
 * دریافت اطلاعات کامل یک پروژه با شناسه
 */
export async function getProject(id) {
    const url = `${API_BASE}/project/${id}`;
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('خطا در دریافت پروژه:', error);
        throw error;
    }
}

/**
 * دریافت لیست ورژن‌های یک پروژه
 */
export async function getVersions(projectId, gameVersion = null, loader = null) {
    const params = new URLSearchParams();
    if (gameVersion) params.append('game_versions', JSON.stringify([gameVersion]));
    if (loader) params.append('loaders', JSON.stringify([loader]));

    const url = `${API_BASE}/project/${projectId}/version?${params}`;
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('خطا در دریافت ورژن‌ها:', error);
        throw error;
    }
}

/**
 * دریافت لینک دانلود مستقیم برای یک پروژه
 * اولین ورژن سازگار را پیدا کرده و URL آن را برمی‌گرداند
 */
export async function getDownloadUrl(projectId, gameVersion = null, loader = null) {
    try {
        const versions = await getVersions(projectId, gameVersion, loader);
        if (!versions || versions.length === 0) return null;

        // پیدا کردن اولین ورژنی که فایل primary دارد
        const version = versions.find(v => v.files.some(f => f.primary === true)) || versions[0];
        const primaryFile = version.files.find(f => f.primary === true) || version.files[0];
        
        return primaryFile ? primaryFile.url : null;
    } catch (error) {
        console.error('خطا در دریافت لینک دانلود:', error);
        return null;
    }
}
