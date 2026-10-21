// router.js - Handles all navigation and content loading

// Module configuration
const modules = {
    dashboard: {
        title: 'Dashboard',
        breadcrumb: 'Barangay Information System / Dashboard',
        file: 'modules/dashboard.html',
        initFunction: 'initDashboard',
        jsFile: 'modules/dashboard.js'
    },
    mapping: {
        title: 'Barangay Mapping',
        breadcrumb: 'Barangay Information System / Mapping',
        file: 'modules/mapping.html',
        initFunction: 'initMapping',
        jsFile: 'modules/mapping.js'
    },
    residents: {
        title: 'Residents Management',
        breadcrumb: 'Barangay Information System / Residents',
        file: 'modules/resisdents.html',
        initFunction: 'initResidentsModule',
        jsFile: 'modules/residents.js'
    },
    blotter: {
        title: 'Blotter Management',
        breadcrumb: 'Barangay Information System / Blotter Cases',
        file: 'modules/blotter.html',
        initFunction: 'initBlotterModule',
        jsFile: 'modules/blotter.js'
    },
    certificates: {
        title: 'Certificates Management',
        breadcrumb: 'Barangay Information System / Certificates',
        file: 'modules/certificates.html',
        initFunction: 'initCertificates',
        jsFile: 'modules/certificates.js'
    },
    inventory: {
        title: 'Inventory Management',
        breadcrumb: 'Operations / Inventory Management',
        file: 'modules/inventory.html',
        initFunction: 'initInventoryModule',
        jsFile: 'modules/inventory.js'
    },
    officials: {
        title: 'Barangay Officials',
        breadcrumb: 'Administrator / Barangay Officials',
        file: 'modules/officials.html',
        initFunction: 'initOfficialsModule',
        jsFile: 'modules/officials.js'
    },
    dutySchedule: {
        title: 'Duty Schedule',
        breadcrumb: 'Administrator / Duty Schedule',
        file: 'modules/duty-schedule.html',
        initFunction: 'initDutySchedule',
        jsFile: 'modules/duty-schedule.js'
    },
    reports: {
        title: 'Reports & Analytics',
        breadcrumb: 'Reports & Analytics',
        file: 'modules/reports.html',
        initFunction: 'initReports',
        jsFile: 'modules/reports.js'
    },
    userManagement: {
        title: 'User Management',
        breadcrumb: 'Administration / Access Control',
        file: 'modules/user-management.html',
        initFunction: 'initUserManagementModule',
        jsFile: 'modules/user-management.js'
    },
    archives: {
        title: 'System Archives',
        breadcrumb: 'Administrator / Archives',
        file: 'modules/archives.html',
        initFunction: 'initArchives',
        jsFile: 'modules/archives.js'
    }
};

let currentModule = 'dashboard';
let loadedModules = {};

// Load sidebar HTML
async function loadSidebar() {
    try {
        const response = await fetch('sidebar.html');
        const sidebarHtml = await response.text();
        document.getElementById('sidebar-container').innerHTML = sidebarHtml;
        
        // Add click handlers to sidebar items
        attachSidebarHandlers();
        
        // Highlight active module
        highlightActiveModule();
    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

// Attach click handlers to sidebar items
function attachSidebarHandlers() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const moduleId = this.getAttribute('data-module');
            if (moduleId && modules[moduleId]) {
                navigateTo(moduleId);
            }
        });
    });
}

// Highlight active module in sidebar
function highlightActiveModule() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const moduleId = item.getAttribute('data-module');
        if (moduleId === currentModule) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// Navigate to a module
async function navigateTo(moduleId) {
    if (!modules[moduleId]) return;
    
    // Don't reload if it's the same module
    if (currentModule === moduleId) {
        console.log(`Already on ${moduleId}, reinitializing...`);
        await reinitializeCurrentModule(moduleId);
        return;
    }
    
    currentModule = moduleId;
    
    // Update URL hash
    window.location.hash = moduleId;
    
    // Update header
    updateHeader(modules[moduleId].title, modules[moduleId].breadcrumb);
    
    // Load module content
    await loadModuleContent(modules[moduleId].file);
    
    // Initialize module
    await initializeModule(moduleId);
    
    // Highlight active module
    highlightActiveModule();
}

// Reinitialize current module without reloading HTML
async function reinitializeCurrentModule(moduleId) {
    const module = modules[moduleId];
    if (!module) return;
    
    console.log(`Reinitializing ${moduleId} module...`);
    
    // Call the init function directly without reloading HTML
    if (module.initFunction && typeof window[module.initFunction] === 'function') {
        console.log(`Calling ${module.initFunction}() for refresh`);
        window[module.initFunction]();
    } else {
        console.warn(`Init function ${module.initFunction} not found`);
        // Try alternative function names
        const altNames = [`init${moduleId.charAt(0).toUpperCase() + moduleId.slice(1)}`, `init${moduleId}Module`];
        for (const name of altNames) {
            if (typeof window[name] === 'function') {
                console.log(`Calling alternative ${name}()`);
                window[name]();
                break;
            }
        }
    }
}

// Update header title and breadcrumb
function updateHeader(title, breadcrumb) {
    const pageTitle = document.getElementById('pageTitle');
    const breadcrumbElement = document.getElementById('breadcrumb');
    
    if (pageTitle) pageTitle.textContent = title;
    if (breadcrumbElement) breadcrumbElement.textContent = breadcrumb;
}

// Load module HTML content - FIXED: changed 'dynamic-content' to 'dynamicContent'
async function loadModuleContent(filePath) {
    const contentArea = document.getElementById('dynamicContent');  // FIXED HERE
    if (!contentArea) {
        console.error('dynamicContent element not found!');
        return;
    }
    
    console.log(`Loading module content from: ${filePath}`);
    
    // Show loading state
    contentArea.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>Loading ${filePath.split('/').pop().replace('.html', '')}...</p>
        </div>
    `;
    
    try {
        const response = await fetch(filePath + '?t=' + Date.now());
        if (response.ok) {
            const html = await response.text();
            contentArea.innerHTML = html;
            
            console.log(`Module content loaded successfully from ${filePath}`);
            
            // CRITICAL: Force a small delay to let DOM render
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Dispatch event that module content is loaded
            const event = new CustomEvent('moduleLoaded', { 
                detail: { module: currentModule, timestamp: Date.now() } 
            });
            window.dispatchEvent(event);
            
        } else {
            console.error(`Failed to load ${filePath}: ${response.status}`);
            contentArea.innerHTML = `
                <div class="error-container">
                    <h2>Error Loading Module</h2>
                    <p>Could not load the requested module. Please try again.</p>
                    <p>Error: ${response.status}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading module content:', error);
        contentArea.innerHTML = `
            <div class="error-container">
                <h2>Error Loading Module</h2>
                <p>Network error. Please check your connection.</p>
                <p>Error: ${error.message}</p>
            </div>
        `;
    }
}

// Initialize module (load JS and call init function)
async function initializeModule(moduleId) {
    const module = modules[moduleId];
    if (!module) return;
    
    // ALWAYS reload the JavaScript file to ensure fresh data fetching
    const scriptPath = module.jsFile || `modules/${moduleId}.js`;
    
    try {
        // Force reload the script
        await loadScript(scriptPath);
        loadedModules[moduleId] = true;
        
        // Give a small delay to ensure DOM is ready
        setTimeout(() => {
            if (module.initFunction && typeof window[module.initFunction] === 'function') {
                console.log(`Calling ${module.initFunction}()`);
                window[module.initFunction]();
            } else {
                console.warn(`Init function ${module.initFunction} not found for ${moduleId}`);
                // Try alternative function names
                const altNames = [`init${moduleId.charAt(0).toUpperCase() + moduleId.slice(1)}`, `init${moduleId}Module`];
                for (const name of altNames) {
                    if (typeof window[name] === 'function') {
                        console.log(`Calling alternative ${name}()`);
                        window[name]();
                        break;
                    }
                }
            }
        }, 150);
        
    } catch (error) {
        console.error(`Failed to load script for ${moduleId}:`, error);
    }
}

// Load JavaScript dynamically with cache busting
function loadScript(scriptPath) {
    return new Promise((resolve, reject) => {
        // Remove old script if exists
        const oldScript = document.querySelector(`script[data-module="${currentModule}"]`);
        if (oldScript) {
            console.log(`Removing old script for ${currentModule}`);
            oldScript.remove();
        }
        
        // Create new script with cache-busting parameter
        const script = document.createElement('script');
        script.src = scriptPath + '?v=' + Date.now();
        script.setAttribute('data-module', currentModule);
        
        script.onload = () => {
            console.log(`Script loaded: ${scriptPath}`);
            resolve();
        };
        
        script.onerror = () => {
            console.error(`Failed to load script: ${scriptPath}`);
            reject(new Error(`Failed to load script: ${scriptPath}`));
        };
        
        document.body.appendChild(script);
    });
}

// Handle browser back/forward buttons
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    if (hash && modules[hash]) {
        navigateTo(hash);
    }
});

// Listen for module loaded event to trigger additional initialization
window.addEventListener('moduleLoaded', (event) => {
    console.log(`Module loaded event received for: ${event.detail.module}`);
});

// Initialize the application
async function init() {
    // Load sidebar is not needed since sidebar is already in index.php
    // Just attach handlers to existing sidebar items
    attachSidebarHandlers();
    
    // Check URL hash for initial module
    const hash = window.location.hash.substring(1);
    const initialModule = hash && modules[hash] ? hash : 'dashboard';
    
    await navigateTo(initialModule);
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Expose navigateTo globally for any external calls
window.navigateTo = navigateTo;