// dashboard.js
async function initDashboard() {
    console.log('Initializing Dashboard...');
    
    // Load dashboard data
    await loadDashboardStats();
    
    // Setup quick action buttons
    setupQuickActions();
}

async function loadDashboardStats() {
    try {
        // Fetch residents count
        const residentsResult = await apiCall('residents.php?limit=1');
        if (residentsResult.success !== false) {
            const totalResidentsEl = document.getElementById('totalResidents');
            if (totalResidentsEl) totalResidentsEl.textContent = residentsResult.total || 0;
        }
        
        // Fetch blotter active cases
        const blotterResult = await apiCall('blotter.php?limit=10000');
        if (blotterResult.success !== false && blotterResult.data) {
            const activeCases = blotterResult.data.filter(c => c.status === 'Ongoing').length;
            const activeBlotterEl = document.getElementById('activeBlotterCases');
            if (activeBlotterEl) activeBlotterEl.textContent = activeCases;
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function setupQuickActions() {
    const quickActionResident = document.getElementById('quickActionResident');
    if (quickActionResident) {
        quickActionResident.addEventListener('click', () => {
            window.navigateTo('residents');
        });
    }
    
    const quickActionBlotter = document.getElementById('quickActionBlotter');
    if (quickActionBlotter) {
        quickActionBlotter.addEventListener('click', () => {
            window.navigateTo('blotter');
        });
    }
    
    const quickActionCertificate = document.getElementById('quickActionCertificate');
    if (quickActionCertificate) {
        quickActionCertificate.addEventListener('click', () => {
            window.navigateTo('certificates');
        });
    }
    
    const quickActionInventory = document.getElementById('quickActionInventory');
    if (quickActionInventory) {
        quickActionInventory.addEventListener('click', () => {
            window.navigateTo('inventory');
        });
    }
}

window.initDashboard = initDashboard;