// ================================================
// تنظیمات اولیه - مقادیر را بر اساس مخزن خود تنظیم کنید
// ================================================
const CONFIG = {
    // نام کاربری گیت‌هاب شما
    owner: 'YOUR_GITHUB_USERNAME',
    // نام مخزن (repository)
    repo: 'YOUR_REPO_NAME',
    // مسیر پوشه ذخیره فایل‌ها در مخزن (مثلاً 'packs/')
    folderPath: 'packs/',
    // شاخه (branch) - معمولاً 'main' یا 'master'
    branch: 'main',
    // توکن را از متغیر محیطی دریافت می‌کنیم (در GitHub Actions تنظیم می‌شود)
    // برای استفاده محلی، می‌توانید آن را در localStorage ذخیره کنید (امن نیست)
    get token() {
        return localStorage.getItem('github_token') || '';
    }
};

// ================================================
// مدیریت وضعیت
// ================================================
const state = {
    fileList: [],  // آرایه‌ای از اطلاعات فایل‌های آپلود شده
    isUploading: false
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