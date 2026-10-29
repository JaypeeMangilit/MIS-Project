// sidebar.js - Fixed module loading with proper re-initialization

// Module configuration
const modules = {
    dashboard: {
        title: 'Dashboard',
        breadcrumb: 'Barangay Information System / Dashboard',
        file: 'modules/dashboard.html',
        initFunction: 'initDashboard',
        scriptFile: 'modules/dashboard.js'
    },
    mapping: {
        title: 'Barangay Mapping',
        breadcrumb: 'Barangay Information System / Mapping',
        file: 'modules/mapping.html',
        initFunction: 'initMapping',
        scriptFile: 'modules/mapping.js'
    },
    residents: {
        title: 'Residents Management',
        breadcrumb: 'Barangay Information System / Residents',
        file: 'modules/resisdents.html',
        initFunction: 'initResidentsModule',
        scriptFile: 'modules/resisdents.js'
    },
    blotter: {
        title: 'Blotter Management',
        breadcrumb: 'Barangay Information System / Blotter Cases',
        file: 'modules/blotter.html',
        initFunction: 'initBlotterModule',
        scriptFile: 'modules/blotter.js'
    },
    certificates: {
        title: 'Certificates Management',
        breadcrumb: 'Barangay Information System / Certificates',
        file: 'modules/certificates.html',
        initFunction: 'initCertificates',
        scriptFile: 'modules/certificates.js'
    },
    inventory: {
        title: 'Inventory Management',
        breadcrumb: 'Operations / Inventory Management',
        file: 'modules/inventory.html',
        initFunction: 'initInventoryModule',  
        scriptFile: 'modules/inventory.js'
    },
    officials: {
        title: 'Barangay Officials',
        breadcrumb: 'Administrator / Barangay Officials',
        file: 'modules/officials.html',
        initFunction: 'initOfficialsModule',
        scriptFile: 'modules/officials.js'
    },
    'duty-schedule': {
        title: 'Duty Schedule',
        breadcrumb: 'Administrator / Duty Schedule',
        file: 'modules/duty-schedule.html',
        initFunction: 'initDutySchedule',
        scriptFile: 'modules/duty-schedule.js'
    },
    reports: {
        title: 'Reports & Analytics',
        breadcrumb: 'Reports & Analytics',
        file: 'modules/reports.html',
        initFunction: 'initReports',
        scriptFile: 'modules/reports.js'
    },
    'user-management': {
        title: 'User Management',
        breadcrumb: 'Administration / Access Control',
        file: 'modules/user-management.html',
        initFunction: 'initUserManagementModule',
        scriptFile: 'modules/user-management.js'
    },
    archives: {
        title: 'System Archives',
        breadcrumb: 'Administrator / Archives',
        file: 'modules/archives.html',
        initFunction: 'initArchives',
        scriptFile: 'modules/archives.js'
    },
    'user-profile': {
        title: 'User Profile',
        breadcrumb: 'My Account / Profile',
        file: 'modules/user-profile.html',
        initFunction: 'initUserProfile',
        scriptFile: 'modules/user-profile.js'
    }
};

// Store module data globally
let currentModuleData = null;
let loadedScripts = {};
let isLoadingModule = false;

// DEVELOPMENT MODE - Set to false for production
const DEV_MODE = true;

// Generate cache-busting string
function getCacheBuster() {
    return DEV_MODE ? '?t=' + Date.now() : '';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - Initializing sidebar');

    // Resolve the signed-in user from the server before painting the header.
    if (window.Session) {
        window.Session.load().then(function(user) {
            if (!user) {
                window.location.replace('login.php');
                return;
            }
            window.Session.applyToHeader();
            window.Session.bindSignOut();
            filterNavByRole(user.role);
            window.currentUserRole = user.role;
            window.currentUserCanEdit = NAV_ACCESS[user.role]?.canEdit ?? true;
            document.body.dataset.role = user.role;
            document.body.dataset.canEdit = String(window.currentUserCanEdit);

            loadInitialModule();
        });
    } else {
        loadInitialModule();
    }

    setupSidebarNavigation();

    // Role-based navigation filtering
    const NAV_ACCESS = {
        'Admin':               { modules: null, canEdit: true },
        'Secretary':           { modules: null, canEdit: true },
        'Captain':             { modules: null, canEdit: false },
        'Councilor/Kagawad':   { modules: ['residents', 'mapping', 'inventory', 'officials'], canEdit: true },
        'Kagawad':             { modules: ['residents', 'mapping', 'inventory', 'officials'], canEdit: true },
    };

    function filterNavByRole(role) {
        const access = NAV_ACCESS[role];
        if (!access) return;

        if (access.modules === null) return;

        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            const moduleName = item.getAttribute('data-module');
            if (!access.modules.includes(moduleName)) {
                const section = item.closest('.nav-section');
                if (section && section.querySelectorAll('.nav-item').length <= 1) {
                    section.style.display = 'none';
                }
                item.style.display = 'none';
            }
        });
    }

    window.applyModuleReadOnly = function (config) {
        if (window.currentUserCanEdit !== false) return;
        if (!config) return;

        if (config.addBtnId) {
            const btn = document.getElementById(config.addBtnId);
            if (btn) {
                btn.disabled = true;
                btn.classList.add('edit-restricted');
                btn.title = 'Read-only access';
            }
        }

        if (config.saveBtnIds) {
            config.saveBtnIds.forEach(function (id) {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add('edit-restricted');
                    btn.title = 'Read-only access';
                }
            });
        }

        if (config.editSelectors) {
            config.editSelectors.forEach(function (selector) {
                document.querySelectorAll(selector).forEach(function (el) {
                    const icon = el.closest('.action-icon, .action-btn, [data-action="edit"]');
                    if (icon) {
                        icon.style.display = 'none';
                    } else if (el) {
                        el.style.display = 'none';
                    }
                });
            });
        }
    };
    setupHeaderProfileClick();
    loadInitialModule();
});

// Setup header profile click event
function setupHeaderProfileClick() {
    const userInfo = document.querySelector('.user-info');
    
    if (userInfo) {
        userInfo.style.cursor = 'pointer';
        userInfo.addEventListener('click', function(e) {
            e.stopPropagation();
            console.log('Profile clicked - loading user profile');
            loadUserProfileModule();
        });
    }
}

// Function to load User Profile module
function loadUserProfileModule() {
    console.log('Loading User Profile module from header profile click');
    
    const moduleName = 'user-profile';
    const module = modules[moduleName];
    
    if (!module) {
        console.error('User Profile module not found');
        return;
    }
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    updateHeader(module.title, module.breadcrumb);
    loadModule(moduleName);
    window.location.hash = moduleName;
}

// Setup sidebar click events
function setupSidebarNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            const moduleName = this.getAttribute('data-module');
            console.log('Sidebar item clicked:', moduleName);
            
            if (moduleName && modules[moduleName]) {
                navItems.forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');
                loadModule(moduleName);
                window.location.hash = moduleName;
            } else {
                console.error('Module not found:', moduleName);
            }
        });
    });
}

// Load module content
async function loadModule(moduleName) {
    if (isLoadingModule) {
        console.log('Already loading a module, waiting...');
        return;
    }
    
    const module = modules[moduleName];
    if (!module) {
        console.error('Module not found:', moduleName);
        return;
    }
    
    isLoadingModule = true;
    console.log('Loading module:', moduleName);
    currentModuleData = module;
    updateHeader(module.title, module.breadcrumb);
    showLoading();
    
    try {
        const bust = getCacheBuster();
        const response = await fetch(module.file + bust);
        console.log('Fetch response status:', response.status);
        
        if (response.ok) {
            const html = await response.text();
            displayContent(html);
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // IMPORTANT: Force reload script for every module switch
            await loadModuleScript(moduleName);
            
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // IMPORTANT: Always call the init function
            initializeModuleScripts(moduleName);
        } else {
            console.error('Failed to load HTML:', response.status);
            showPlaceholder(module.title);
        }
    } catch (error) {
        console.error('Error loading module:', error);
        showPlaceholder(module.title);
    } finally {
        isLoadingModule = false;
    }
}

// Expose for quick actions / external callers
window.loadModule = loadModule;

// Load module-specific JavaScript file
async function loadModuleScript(moduleName) {
    const module = modules[moduleName];
    if (!module || !module.scriptFile) {
        console.log('No script file for module:', moduleName);
        return;
    }
    
    // ALWAYS reload the script - remove old one if exists
    const existingScript = document.querySelector(`script[data-module="${moduleName}"]`);
    if (existingScript) {
        console.log(`Removing existing script for ${moduleName}`);
        existingScript.remove();
    }
    
    // Reset loaded flag to force reload
    if (loadedScripts[moduleName]) {
        console.log(`Clearing loaded flag for ${moduleName}`);
        delete loadedScripts[moduleName];
    }
    
    return new Promise((resolve, reject) => {
        console.log('Loading fresh script:', module.scriptFile);
        
        const script = document.createElement('script');
        script.src = module.scriptFile + getCacheBuster();
        script.dataset.module = moduleName;
        script.onload = () => {
            loadedScripts[moduleName] = true;
            console.log(`${moduleName} script loaded and ready`);
            resolve();
        };
        script.onerror = () => {
            console.error(`Failed to load script for ${moduleName}`);
            reject();
        };
        document.body.appendChild(script);
    });
}

// Initialize module-specific scripts
function initializeModuleScripts(moduleName) {
    removeContentScripts();
    
    setTimeout(() => {
        const initFunction = modules[moduleName]?.initFunction;
        
        // Try multiple function name patterns
        const possibleFunctions = [
            initFunction,
            `init${capitalizeFirst(moduleName)}`,
            `init${moduleName.replace(/-/g, '')}Module`,
            `load${capitalizeFirst(moduleName)}`,
            `init${capitalizeFirst(moduleName)}Module`
        ];
        
        let executed = false;
        
        for (const funcName of possibleFunctions) {
            if (funcName && typeof window[funcName] === 'function') {
                console.log(`Calling ${funcName}() for ${moduleName}`);
                try {
                    window[funcName]();
                    executed = true;
                    break;
                } catch (error) {
                    console.error(`Error calling ${funcName}:`, error);
                }
            }
        }
        
        if (!executed) {
            console.warn(`No initialization function found for ${moduleName}`);
            
            // Dispatch event for modules that listen for it
            const event = new CustomEvent('moduleLoaded', { detail: { moduleName: moduleName } });
            document.dispatchEvent(event);
        }
    }, 200);
}

// Remove script tags from dynamic content
function removeContentScripts() {
    const contentArea = document.getElementById('dynamicContent');
    if (contentArea) {
        const scripts = contentArea.querySelectorAll('script');
        scripts.forEach(script => script.remove());
    }
}

// Force reload CSS
function forceReloadCSS(cssPath) {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(link => {
        if (link.href.includes(cssPath)) {
            const newHref = link.href.split('?')[0] + '?v=' + Date.now();
            link.href = newHref;
        }
    });
}

// Capitalize first letter helper
function capitalizeFirst(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1).replace(/-/g, '');
}

// Update header
function updateHeader(title, breadcrumb) {
    const pageTitle = document.getElementById('pageTitle');
    const breadcrumbElement = document.getElementById('breadcrumb');
    
    if (pageTitle) pageTitle.textContent = title;
    if (breadcrumbElement) breadcrumbElement.textContent = breadcrumb;
}

// Show loading spinner
function showLoading() {
    const contentArea = document.getElementById('dynamicContent');
    if (contentArea) {
        contentArea.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>Loading content...</p>
            </div>
        `;
    }
}

// Display loaded content (with CSS reload)
function displayContent(html) {
    const contentArea = document.getElementById('dynamicContent');
    if (contentArea) {
        contentArea.innerHTML = html;
        console.log('Content displayed successfully');
        
        // Force reload CSS for the module
        const moduleName = currentModuleData?.title.toLowerCase().replace(/\s+/g, '-');
        if (moduleName) {
            forceReloadCSS(`modules/${moduleName}.css`);
        }
    } else {
        console.error('dynamicContent element not found!');
    }
}

// Show placeholder for missing modules
function showPlaceholder(moduleName) {
    const contentArea = document.getElementById('dynamicContent');
    if (contentArea) {
        contentArea.innerHTML = `
            <div class="placeholder-module">
                <div class="placeholder-icon">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                        <rect x="20" y="20" width="40" height="40" rx="8" stroke="#0F6CBD" stroke-width="2"/>
                        <path d="M35 40L45 40M40 35L40 45" stroke="#0F6CBD" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <h2>${escapeHtml(moduleName)}</h2>
                <p>This module is currently under development.</p>
                <p>Content will be available soon.</p>
            </div>
        `;
    }
}

// Load initial module
function loadInitialModule() {
    const hash = window.location.hash.substring(1);
    let moduleName = hash || 'dashboard';
    
    console.log('Loading initial module:', moduleName);
    
    if (!modules[moduleName]) {
        console.warn('Module not found:', moduleName, '- loading dashboard');
        moduleName = 'dashboard';
    }
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-module') === moduleName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    loadModule(moduleName);
}

// Handle browser back/forward
window.addEventListener('hashchange', function() {
    const hash = window.location.hash.substring(1);
    console.log('Hash changed to:', hash);
    if (hash && modules[hash]) {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            if (item.getAttribute('data-module') === hash) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        loadModule(hash);
    }
});

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Listen for dynamic content updates
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.target.id === 'dynamicContent') {
            console.log('Dynamic content updated');
        }
    });
});

// Start observing when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const contentArea = document.getElementById('dynamicContent');
    if (contentArea) {
        observer.observe(contentArea, { childList: true, subtree: true });
    }
});

console.log('sidebar.js loaded successfully');