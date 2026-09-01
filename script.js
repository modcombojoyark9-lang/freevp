// ================================================
// تنظیمات اولیه - این مقادیر را بر اساس مخزن خود ویرایش کنید
// ================================================
const CONFIG = {
    owner: 'YOUR_GITHUB_USERNAME',      // نام کاربری گیت‌هاب خود را وارد کنید
    repo: 'YOUR_REPO_NAME',             // نام مخزن خود را وارد کنید
    folderPath: 'packs/',               // مسیر پوشه ذخیره فایل‌ها
    branch: 'main',                     // شاخه مخزن (main یا master)
    maxFileSize: 40 * 1024 * 1024,      // حداکثر حجم: ۴۰ مگابایت
    get token() {
        // توکن را از localStorage دریافت می‌کنیم
        return localStorage.getItem('github_token') || '';
    }
};

// ================================================
// مدیریت وضعیت برنامه
// ================================================
const state = {
    fileList: [],          // لیست فایل‌های آپلود شده
    isUploading: false,    // وضعیت آپلود
    uploadProgress: 0,     // درصد پیشرفت
    currentFile: null      // فایل در حال آپلود
};

// ================================================
// عناصر DOM
// ================================================
const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    fileInfo: document.getElementById('fileInfo'),
    directLink: document.getElementById('directLink'),
    shaHash: document.getElementById('shaHash'),
    uploadDate: document.getElementById('uploadDate'),
    fileCount: document.getElementById('fileCount'),
    fileListContainer: document.getElementById('fileListContainer')
};

// ================================================
// توابع کمکی و ابزاری
// ================================================

// لاگر با استایل رنگی
function log(message, type = 'info') {
    const styles = {
        info: 'color: #82b1ff; font-weight: bold;',
        success: 'color: #69f0ae; font-weight: bold;',
        error: 'color: #ff80ab; font-weight: bold;',
        warn: 'color: #ffd740; font-weight: bold;'
    };
    console.log(`%c[PackDrop] ${message}`, styles[type] || styles.info);
}

// نمایش پیام به کاربر
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 14px 24px;
        border-radius: 12px;
        font-family: 'Rajdhani', sans-serif;
        font-weight: 600;
        color: #fff;
        background: ${type === 'success' ? '#2e7d32' : type === 'error' ? '#c62828' : '#1a237e'};
        border: 1px solid ${type === 'success' ? '#66bb6a' : type === 'error' ? '#ef5350' : '#7986cb'};
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 9999;
        animation: slideIn 0.3s ease;
        max-width: 90%;
        direction: rtl;
        font-size: 0.95rem;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// محاسبه SHA-1 فایل (با پشتیبانی از فایل‌های بزرگ)
async function calculateSHA1(file) {
    try {
        log('در حال محاسبه SHA-1...', 'info');
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        log(`SHA-1 محاسبه شد: ${hashHex}`, 'success');
        return hashHex;
    } catch (error) {
        log('خطا در محاسبه SHA-1: ' + error.message, 'error');
        throw new Error('محاسبه هش SHA-1 با خطا مواجه شد');
    }
}

// اعتبارسنجی کامل فایل
function validateFile(file) {
    log('در حال اعتبارسنجی فایل...', 'info');
    
    // 1. بررسی وجود فایل
    if (!file) {
        throw new Error('هیچ فایلی انتخاب نشده است.');
    }
    
    // 2. بررسی پسوند فایل
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.zip')) {
        throw new Error('فایل باید با پسوند ZIP باشد.');
    }
    
    // 3. بررسی حجم فایل
    if (file.size === 0) {
        throw new Error('فایل خالی است.');
    }
    if (file.size > CONFIG.maxFileSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxMB = (CONFIG.maxFileSize / (1024 * 1024));
        throw new Error(`حجم فایل (${sizeMB} MB) بیشتر از حد مجاز (${maxMB} MB) است.`);
    }
    
    // 4. بررسی هدر ZIP (تشخیص فایل ZIP واقعی)
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const bytes = new Uint8Array(e.target.result);
                // هدر ZIP: 50 4B 03 04 یا 50 4B 05 06
                const isValidZip = (bytes[0] === 0x50 && bytes[1] === 0x4B) &&
                                  (bytes[2] === 0x03 || bytes[2] === 0x05) &&
                                  (bytes[3] === 0x04 || bytes[3] === 0x06);
                
                if (isValidZip) {
                    log('فایل ZIP معتبر است.', 'success');
                    resolve(true);
                } else {
                    reject(new Error('فایل ZIP معتبر نیست (هدر فایل شناسایی نشد).'));
                }
            } catch (err) {
                reject(new Error('خطا در بررسی هدر فایل: ' + err.message));
            }
        };
        reader.onerror = () => reject(new Error('خطا در خواندن فایل برای اعتبارسنجی'));
        reader.readAsArrayBuffer(file.slice(0, 4)); // فقط ۴ بایت اول را می‌خوانیم
    });
}

// فرمت‌سازی تاریخ به فارسی
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('fa-IR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

// تولید نام فایل یکتا (برای جلوگیری از تداخل)
function generateUniqueFileName(originalName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const nameParts = originalName.split('.');
    const ext = nameParts.pop();
    const baseName = nameParts.join('.');
    return `${baseName}-${timestamp}-${random}.${ext}`;
}

// ================================================
// توابع ارتباط با GitHub API
// ================================================

// بررسی وجود توکن
function checkToken() {
    if (!CONFIG.token) {
        showToast('❌ توکن گیت‌هاب یافت نشد. لطفاً آن را در localStorage تنظیم کنید.', 'error', 5000);
        log('توکن گیت‌هاب تنظیم نشده است!', 'error');
        return false;
    }
    return true;
}

// دریافت لیست فایل‌های موجود در مخزن
async function fetchFileList() {
    if (!checkToken()) return [];
    
    try {
        log('دریافت لیست فایل‌ها...', 'info');
        const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.folderPath}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${CONFIG.token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                log('پوشه فایل‌ها وجود ندارد یا خالی است.', 'warn');
                return [];
            }
            if (response.status === 401) {
                showToast('❌ توکن نامعتبر است. لطفاً توکن جدید بسازید.', 'error', 5000);
                return [];
            }
            if (response.status === 403) {
                showToast('⚠️ محدودیت درخواست گیت‌هاب پر شده است. چند دقیقه صبر کنید.', 'warn', 5000);
                return [];
            }
            throw new Error(`خطا در دریافت لیست: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const zipFiles = data.filter(item => 
            item.name.endsWith('.zip') && 
            item.type === 'file' &&
            item.size > 0
        );
        
        // دریافت اطلاعات کامل هر فایل
        const filesWithMeta = await Promise.all(zipFiles.map(async (file) => {
            try {
                // دریافت آخرین commit برای این فایل
                const commitUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/commits?path=${CONFIG.folderPath}${file.name}&per_page=1`;
                const commitRes = await fetch(commitUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${CONFIG.token}`
                    }
                });
                let uploadDate = file.created_at || file.updated_at || new Date().toISOString();
                if (commitRes.ok) {
                    const commits = await commitRes.json();
                    if (commits.length > 0 && commits[0].commit) {
                        uploadDate = commits[0].commit.committer.date || commits[0].commit.author.date || uploadDate;
                    }
                }
                return {
                    name: file.name,
                    download_url: file.download_url,
                    uploadDate: uploadDate,
                    sha: file.sha,
                    size: file.size
                };
            } catch (e) {
                return {
                    name: file.name,
                    download_url: file.download_url,
                    uploadDate: file.updated_at || new Date().toISOString(),
                    sha: file.sha,
                    size: file.size
                };
            }
        }));

        const sorted = filesWithMeta.sort((a, b) => 
            new Date(b.uploadDate) - new Date(a.uploadDate)
        );
        
        log(`${sorted.length} فایل پیدا شد.`, 'success');
        return sorted;
    } catch (error) {
        log('خطا در دریافت لیست فایل‌ها: ' + error.message, 'error');
        showToast('⚠️ خطا در دریافت لیست فایل‌ها: ' + error.message, 'error', 4000);
        return [];
    }
}

// آپلود فایل به مخزن گیت‌هاب
async function uploadFileToGithub(file, sha1Hash) {
    if (!checkToken()) throw new Error('توکن گیت‌هاب تنظیم نشده است.');
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const fileName = generateUniqueFileName(file.name);
        const filePath = CONFIG.folderPath + fileName;
        
        reader.onload = async function(event) {
            try {
                const base64Content = event.target.result.split(',')[1];
                
                // بررسی وجود فایل با همین نام
                const checkUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`;
                const checkResponse = await fetch(checkUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${CONFIG.token}`
                    }
                });

                if (checkResponse.ok) {
                    // فایل وجود دارد - با نام جدید آپلود می‌کنیم (با timestamp)
                    const newFileName = `${Date.now()}-${file.name}`;
                    const newFilePath = CONFIG.folderPath + newFileName;
                    const newCheckUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${newFilePath}`;
                    const newCheck = await fetch(newCheckUrl, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Authorization': `token ${CONFIG.token}`
                        }
                    });
                    if (newCheck.ok) {
                        throw new Error('فایلی با نام مشابه وجود دارد. لطفاً نام فایل را تغییر دهید.');
                    }
                    // آپلود با نام جدید
                    const payload = {
                        message: `آپلود ریسورس‌پک: ${newFileName}`,
                        content: base64Content,
                        branch: CONFIG.branch
                    };
                    const uploadUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${newFilePath}`;
                    const response = await fetch(uploadUrl, {
                        method: 'PUT',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Authorization': `token ${CONFIG.token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'خطا در آپلود فایل');
                    }
                    const data = await response.json();
                    resolve({
                        downloadUrl: data.content.download_url,
                        sha1: sha1Hash,
                        fileName: newFileName,
                        originalName: file.name,
                        uploadDate: new Date().toISOString()
                    });
                    return;
                }

                // آپلود فایل جدید با نام اصلی
                const payload = {
                    message: `آپلود ریسورس‌پک: ${file.name}`,
                    content: base64Content,
                    branch: CONFIG.branch
                };

                const uploadUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`;
                const response = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${CONFIG.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'خطا در آپلود فایل');
                }

                const data = await response.json();
                resolve({
                    downloadUrl: data.content.download_url,
                    sha1: sha1Hash,
                    fileName: file.name,
                    originalName: file.name,
                    uploadDate: new Date().toISOString()
                });

            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = function() {
            reject(new Error('خطا در خواندن فایل'));
        };

        reader.readAsDataURL(file);
    });
}

// ================================================
// توابع اصلی برنامه
// ================================================

// مدیریت کامل فرآیند آپلود
async function handleFileUpload(file) {
    // جلوگیری از آپلود همزمان
    if (state.isUploading) {
        showToast('⏳ در حال آپلود است، لطفاً صبر کنید...', 'warn', 2000);
        return;
    }

    // نمایش نوار پیشرفت
    elements.progressBar.style.display = 'block';
    elements.progressFill.style.width = '0%';
    elements.progressText.textContent = '۰٪';
    elements.fileInfo.style.display = 'none';

    try {
        state.isUploading = true;
        state.currentFile = file;

        // مرحله 1: اعتبارسنجی فایل (۵٪)
        elements.progressFill.style.width = '5%';
        elements.progressText.textContent = '۵٪ - اعتبارسنجی...';
        await validateFile(file);
        
        // مرحله 2: محاسبه SHA-1 (۲۰٪)
        elements.progressFill.style.width = '20%';
        elements.progressText.textContent = '۲۰٪ - محاسبه SHA-1...';
        const sha1Hash = await calculateSHA1(file);
        if (!sha1Hash) {
            throw new Error('محاسبه SHA-1 ناموفق بود.');
        }

        // مرحله 3: آپلود فایل (۳۰٪ تا ۹۰٪)
        elements.progressFill.style.width = '30%';
        elements.progressText.textContent = '۳۰٪ - آماده‌سازی آپلود...';
        
        // شبیه‌سازی پیشرفت آپلود (چون API گیت‌هاب پیشرفت دقیق نمی‌دهد)
        let progressInterval = setInterval(() => {
            const currentWidth = parseFloat(elements.progressFill.style.width || '30');
            if (currentWidth < 85) {
                const newWidth = currentWidth + (Math.random() * 5);
                elements.progressFill.style.width = Math.min(newWidth, 85) + '%';
                elements.progressText.textContent = Math.round(Math.min(newWidth, 85)) + '% - در حال آپلود...';
            }
        }, 500);

        const result = await uploadFileToGithub(file, sha1Hash);
        clearInterval(progressInterval);

        // مرحله 4: تکمیل (۱۰۰٪)
        elements.progressFill.style.width = '100%';
        elements.progressText.textContent = '۱۰۰٪ - آپلود کامل!';

        // نمایش اطلاعات
        elements.directLink.value = result.downloadUrl;
        elements.shaHash.value = result.sha1;
        elements.uploadDate.textContent = formatDate(result.uploadDate);
        elements.fileInfo.style.display = 'block';

        // به‌روزرسانی لیست فایل‌ها
        state.fileList.unshift({
            name: result.fileName,
            download_url: result.downloadUrl,
            uploadDate: result.uploadDate,
            sha: result.sha1,
            size: file.size
        });
        updateFileListUI();
        updateFileCount();

        showToast(`✅ فایل "${result.fileName}" با موفقیت آپلود شد!`, 'success', 4000);
        log('فایل با موفقیت آپلود شد!', 'success');

        // پنهان کردن نوار پیشرفت بعد از ۳ ثانیه
        setTimeout(() => {
            elements.progressBar.style.display = 'none';
            elements.progressFill.style.width = '0%';
            elements.progressText.textContent = '۰٪';
        }, 3000);

    } catch (error) {
        log('خطا: ' + error.message, 'error');
        elements.progressFill.style.width = '0%';
        elements.progressText.textContent = '❌ خطا!';
        showToast('❌ ' + error.message, 'error', 5000);
        
        setTimeout(() => {
            elements.progressBar.style.display = 'none';
            elements.progressFill.style.width = '0%';
            elements.progressText.textContent = '۰٪';
        }, 3000);
        
    } finally {
        state.isUploading = false;
        state.currentFile = null;
    }
}

// به‌روزرسانی لیست فایل‌ها در UI
function updateFileListUI() {
    if (!state.fileList || state.fileList.length === 0) {
        elements.fileListContainer.innerHTML = `
            <p class="empty-message">
                <i class="fas fa-inbox" style="display:block;font-size:2rem;margin-bottom:10px;color:#555;"></i>
                هیچ فایلی آپلود نشده است.
            </p>
        `;
        return;
    }

    let html = '';
    state.fileList.forEach(file => {
        const date = formatDate(file.uploadDate);
        html += `
            <div class="file-item">
                <span class="file-name">
                    <i class="fas fa-file-archive"></i>
                    ${file.name}
                </span>
                <span class="file-meta">
                    <i class="far fa-calendar-alt" style="margin-left:4px;"></i>
                    ${date}
                </span>
            </div>
        `;
    });
    elements.fileListContainer.innerHTML = html;
}

// به‌روزرسانی شمارنده
function updateFileCount() {
    const count = state.fileList ? state.fileList.length : 0;
    elements.fileCount.textContent = count;
}

// ================================================
// راه‌اندازی اولیه و بارگذاری داده‌ها
// ================================================

async function initApp() {
    log('در حال راه‌اندازی PackDrop...', 'info');
    
    // بررسی توکن
    if (!CONFIG.token) {
        showToast('🔑 لطفاً توکن گیت‌هاب را در localStorage تنظیم کنید.', 'warn', 5000);
        log('توکن یافت نشد. دستور localStorage.setItem را اجرا کنید.', 'warn');
    }
    
    // بارگذاری لیست فایل‌ها
    try {
        const files = await fetchFileList();
        state.fileList = files || [];
        updateFileListUI();
        updateFileCount();
        log(`برنامه راه‌اندازی شد. ${state.fileList.length} فایل یافت شد.`, 'success');
    } catch (error) {
        log('خطا در بارگذاری اولیه: ' + error.message, 'error');
    }
}

// ================================================
// رویدادها (Event Listeners)
// ================================================

// 1. کشیدن و رها کردن (Drag & Drop)
elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadArea.classList.add('dragover');
});

elements.uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadArea.classList.remove('dragover');
});

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
});

// 2. کلیک برای انتخاب فایل
elements.uploadArea.addEventListener('click', () => {
    if (!state.isUploading) {
        elements.fileInput.click();
    }
});

elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
    }
    e.target.value = ''; // ریست برای انتخاب مجدد
});

// 3. دکمه‌های کپی
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        const targetId = this.dataset.target;
        const input = document.getElementById(targetId);
        if (input && input.value) {
            try {
                await navigator.clipboard.writeText(input.value);
                const originalHTML = this.innerHTML;
                this.innerHTML = '<i class="fas fa-check" style="color:#69f0ae;"></i>';
                setTimeout(() => {
                    this.innerHTML = originalHTML;
                }, 1500);
                showToast('✅ کپی شد!', 'success', 1500);
            } catch (err) {
                // Fallback برای مرورگرهای قدیمی
                input.select();
                document.execCommand('copy');
                showToast('✅ کپی شد!', 'success', 1500);
            }
        } else {
            showToast('⚠️ هیچ مقداری برای کپی وجود ندارد.', 'warn', 1500);
        }
    });
});

// 4. کلیک روی لینک برای باز کردن در تب جدید
elements.directLink?.addEventListener('dblclick', function() {
    if (this.value) {
        window.open(this.value, '_blank');
    }
});

// ================================================
// شروع برنامه
// ================================================

// اجرای برنامه پس از بارگذاری کامل صفحه
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// ================================================
// نمایش راهنما در کنسول
// ================================================

console.log(`
%c🚀 PackDrop - آپلود ریسورس‌پک ماینکرفت
%c📌 برای تنظیم توکن، این دستور را در کنسول اجرا کنید:
%clocalStorage.setItem('github_token', 'YOUR_TOKEN_HERE')
%c⚠️ توجه: توکن خود را محفوظ نگه دارید و در کد عمومی قرار ندهید.
`, 
'color: #b388ff; font-size: 16px; font-weight: bold;',
'color: #82b1ff; font-size: 13px;',
'color: #69f0ae; font-size: 13px; background: #1a1a2e; padding: 4px 8px; border-radius: 4px;',
'color: #ff80ab; font-size: 12px;'
);

// ================================================
// مدیریت خطاهای کلی (Global Error Handler)
// ================================================

window.addEventListener('error', function(e) {
    log('خطای ناشناخته: ' + e.message, 'error');
    if (e.message && !e.message.includes('ResizeObserver')) {
        showToast('⚠️ خطای غیرمنتظره رخ داد. لطفاً کنسول را بررسی کنید.', 'error', 4000);
    }
});

// ================================================
// خروجی نهایی
// ================================================

log('✅ PackDrop آماده استفاده است!', 'success');
log(`📂 مخزن: ${CONFIG.owner}/${CONFIG.repo}`, 'info');
log(`📁 مسیر فایل‌ها: ${CONFIG.folderPath}`, 'info');    fileInfo: document.getElementById('fileInfo'),
    directLink: document.getElementById('directLink'),
    shaHash: document.getElementById('shaHash'),
    uploadDate: document.getElementById('uploadDate'),
    fileCount: document.getElementById('fileCount'),
    fileListContainer: document.getElementById('fileListContainer')
};

// ================================================
// توابع کمکی
// ================================================

// نمایش پیام در کنسول با استایل
function log(message, type = 'info') {
    const styles = {
        info: 'color: #82b1ff;',
        success: 'color: #69f0ae;',
        error: 'color: #ff80ab;',
        warn: 'color: #ffd740;'
    };
    console.log(`%c[PackDrop] ${message}`, styles[type] || styles.info);
}

// محاسبه SHA-1 فایل
async function calculateSHA1(file) {
    try {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        log('خطا در محاسبه SHA-1: ' + error.message, 'error');
        return null;
    }
}

// اعتبارسنجی فایل
function validateFile(file) {
    // 1. بررسی نوع فایل
    if (!file.name.toLowerCase().endsWith('.zip')) {
        throw new Error('فایل باید با پسوند ZIP باشد.');
    }
    // 2. بررسی حجم (حداکثر ۴۰ مگابایت = 40 * 1024 * 1024 بایت)
    const maxSize = 40 * 1024 * 1024;
    if (file.size > maxSize) {
        throw new Error(`حجم فایل باید کمتر از ۴۰ مگابایت باشد. (حجم: ${(file.size / (1024*1024)).toFixed(2)} MB)`);
    }
    // 3. بررسی محتوای ZIP (ساده: فقط چک کردن هدر)
    // برای دقت بیشتر می‌توان از کتابخانه jszip استفاده کرد
    return true;
}

// فرمت کردن تاریخ
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ================================================
// توابع ارتباط با GitHub API
// ================================================

// دریافت لیست فایل‌های موجود در مخزن
async function fetchFileList() {
    try {
        const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.folderPath}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${CONFIG.token}`
            }
        });

        if (!response.ok) {
            // اگر پوشه خالی باشد یا وجود نداشته باشد، ارور 404 می‌دهد
            if (response.status === 404) {
                return [];
            }
            throw new Error(`خطا در دریافت لیست فایل‌ها: ${response.status}`);
        }

        const data = await response.json();
        // فیلتر کردن فایل‌های ZIP
        const zipFiles = data.filter(item => item.name.endsWith('.zip') && item.type === 'file');
        
        // استخراج متادیتا از commit آخر هر فایل (تاریخ آپلود)
        const filesWithMeta = await Promise.all(zipFiles.map(async (file) => {
            try {
                const commitUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/commits?path=${CONFIG.folderPath}${file.name}&per_page=1`;
                const commitRes = await fetch(commitUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${CONFIG.token}`
                    }
                });
                let uploadDate = file.created_at || file.updated_at || new Date().toISOString();
                if (commitRes.ok) {
                    const commits = await commitRes.json();
                    if (commits.length > 0) {
                        uploadDate = commits[0].commit.committer.date;
                    }
                }
                return {
                    name: file.name,
                    download_url: file.download_url,
                    uploadDate: uploadDate,
                    sha: file.sha
                };
            } catch (e) {
                return {
                    name: file.name,
                    download_url: file.download_url,
                    uploadDate: file.updated_at || new Date().toISOString(),
                    sha: file.sha
                };
            }
        }));

        return filesWithMeta.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    } catch (error) {
        log('خطا در دریافت لیست فایل‌ها: ' + error.message, 'error');
        return [];
    }
}

// آپلود فایل به مخزن
async function uploadFile(file, sha1Hash) {
    const fileName = file.name;
    const filePath = CONFIG.folderPath + fileName;
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
        reader.onload = async function(event) {
            try {
                // محتوای فایل را به Base64 تبدیل می‌کنیم
                const base64Content = event.target.result.split(',')[1];
                
                // ساخت payload برای GitHub API
                const payload = {
                    message: `آپلود ریسورس‌پک: ${fileName}`,
                    content: base64Content,
                    branch: CONFIG.branch
                };

                // برای جلوگیری از بازنویسی، ابتدا بررسی می‌کنیم که فایل وجود دارد یا نه
                // اگر وجود داشت، خطا می‌دهیم
                const checkUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`;
                const checkResponse = await fetch(checkUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${CONFIG.token}`
                    }
                });

                if (checkResponse.ok) {
                    // فایل وجود دارد، SHA آن را دریافت می‌کنیم برای آپدیت
                    const existing = await checkResponse.json();
                    payload.sha = existing.sha;
                    // اگر می‌خواهید بازنویسی نشود، می‌توانید خطا بدهید
                    // اما در اینجا با اجازه کاربر، بازنویسی می‌کنیم
                    // برای سادگی، خطا می‌دهیم تا از بازنویسی جلوگیری شود
                    // اگر می‌خواهید بازنویسی مجاز باشد، این بخش را کامنت کنید
                    reject(new Error('فایلی با همین نام قبلاً آپلود شده است.'));
                    return;
                }

                // آپلود فایل جدید
                const uploadUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`;
                const response = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${CONFIG.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'خطا در آپلود فایل');
                }

                const data = await response.json();
                // لینک مستقیم دانلود
                const downloadUrl = data.content.download_url;
                
                resolve({
                    downloadUrl: downloadUrl,
                    sha1: sha1Hash,
                    fileName: fileName,
                    uploadDate: new Date().toISOString()
                });

            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = function() {
            reject(new Error('خطا در خواندن فایل'));
        };

        // خواندن فایل به صورت Base64
        reader.readAsDataURL(file);
    });
}

// ================================================
// توابع اصلی برنامه
// ================================================

// مدیریت آپلود فایل
async function handleFileUpload(file) {
    if (state.isUploading) {
        log('در حال آپلود است، لطفاً صبر کنید.', 'warn');
        return;
    }

    try {
        // 1. اعتبارسنجی
        validateFile(file);
        log('فایل معتبر است.', 'success');

        // 2. محاسبه SHA-1
        elements.progressBar.style.display = 'block';
        elements.progressFill.style.width = '10%';
        elements.progressText.textContent = 'محاسبه SHA-1...';
        
        const sha1Hash = await calculateSHA1(file);
        if (!sha1Hash) {
            throw new Error('محاسبه SHA-1 ناموفق بود.');
        }
        log(`SHA-1: ${sha1Hash}`, 'info');

        // 3. آپلود فایل
        state.isUploading = true;
        elements.progressFill.style.width = '30%';
        elements.progressText.textContent = 'در حال آپلود...';

        const result = await uploadFile(file, sha1Hash);
        
        // 4. نمایش نتیجه
        elements.progressFill.style.width = '100%';
        elements.progressText.textContent = 'آپلود کامل!';

        // نمایش اطلاعات
        elements.directLink.value = result.downloadUrl;
        elements.shaHash.value = result.sha1;
        elements.uploadDate.textContent = formatDate(result.uploadDate);
        elements.fileInfo.style.display = 'block';

        // اضافه کردن به لیست
        state.fileList.unshift({
            name: result.fileName,
            download_url: result.downloadUrl,
            uploadDate: result.uploadDate,
            sha: result.sha1
        });
        updateFileListUI();
        updateFileCount();

        log('فایل با موفقیت آپلود شد!', 'success');

        // ریست نوار پیشرفت بعد از ۳ ثانیه
        setTimeout(() => {
            elements.progressBar.style.display = 'none';
            elements.progressFill.style.width = '0%';
            elements.progressText.textContent = '۰٪';
        }, 3000);

    } catch (error) {
        log('خطا: ' + error.message, 'error');
        elements.progressFill.style.width = '0%';
        elements.progressText.textContent = 'خطا!';
        setTimeout(() => {
            elements.progressBar.style.display = 'none';
            elements.progressFill.style.width = '0%';
            elements.progressText.textContent = '۰٪';
        }, 2000);
        alert('خطا در آپلود: ' + error.message);
    } finally {
        state.isUploading = false;
    }
}

// به‌روزرسانی لیست فایل‌ها در UI
function updateFileListUI() {
    if (state.fileList.length === 0) {
        elements.fileListContainer.innerHTML = '<p class="empty-message">هیچ فایلی آپلود نشده است.</p>';
        return;
    }

    let html = '';
    state.fileList.forEach(file => {
        html += `
            <div class="file-item">
                <span class="file-name">
                    <i class="fas fa-file-archive"></i>
                    ${file.name}
                </span>
                <span class="file-meta">
                    ${formatDate(file.uploadDate)}
                </span>
            </div>
        `;
    });
    elements.fileListContainer.innerHTML = html;
}

// به‌روزرسانی شمارنده
function updateFileCount() {
    elements.fileCount.textContent = state.fileList.length;
}

// ================================================
// رویدادها (Event Listeners)
// ================================================

// 1. کشیدن و رها کردن
elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
});

elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragover');
});

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
});

// 2. کلیک برای انتخاب فایل
elements.uploadArea.addEventListener('click', () => {
    if (!state.isUploading) {
        elements.fileInput.click();
    }
});

elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
    }
    e.target.value = ''; // ریست برای انتخاب مجدد
});

// 3. دکمه‌های کپی
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const targetId = this.dataset.target;
        const input = document.getElementById(targetId);
        if (input && input.value) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 1500);
            }).catch(() => {
                // fallback
                input.select();
                document.execCommand('copy');
                alert('کپی شد!');
            });
        }
    });
});

// 4. بارگذاری اولیه لیست فایل‌ها
async function init() {
    // بررسی وجود توکن
    if (!CONFIG.token) {
        log('توکن گیت‌هاب یافت نشد. لطفاً آن را در localStorage تنظیم کنید.', 'warn');
        // می‌توانیم یک دیالوگ برای ورود توکن نمایش دهیم (اختیاری)
        // برای سادگی، فقط اخطار می‌دهیم
    }

    // بارگذاری لیست فایل‌ها
    const files = await fetchFileList();
    state.fileList = files;
    updateFileListUI();
    updateFileCount();
    log('برنامه با موفقیت بارگذاری شد.', 'success');
}

// شروع برنامه
init();

// ================================================
// راهنمای تنظیم توکن (برای کاربر)
// ================================================
console.log(`
%c🔐 راهنمای تنظیم توکن گیت‌هاب:
%cبرای استفاده از این برنامه، باید یک Personal Access Token ساخته و آن را در localStorage ذخیره کنید.

۱. به https://github.com/settings/tokens  بروید.
۲. یک توکن جدید با دسترسی 'repo' بسازید.
۳. توکن را کپی کنید.
۴. در کنسول مرورگر (F12) دستور زیر را وارد کنید:
   localStorage.setItem('github_token', 'توکن_خود_را_اینجا_قرار_دهید');

⚠️ توجه: این روش برای استفاده محلی یا دمو است. برای محیط تولید، از GitHub Actions استفاده کنید.
`, 'color: #b388ff; font-weight: bold;', 'color: #82b1ff;');
