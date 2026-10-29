// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

// dashboard.js
const API_BASE_URL = 'api/';

async function apiCall(endpoint, method = 'GET', data = null) {
    let url = API_BASE_URL + endpoint;
    if (method === 'GET') {
        const separator = url.includes('?') ? '&' : '?';
        url += separator + '_=' + Date.now();
    }

    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        const raw = await response.text();
        let result;
        try {
            result = raw.length ? JSON.parse(raw) : {};
        } catch (error) {
            console.error('API returned non-JSON from ' + url + ' (HTTP ' + response.status + '):\n' + raw);
            return {
                success: false,
                status: response.status,
                error: 'Server returned invalid JSON (HTTP ' + response.status + '). See the console.',
                raw: raw.slice(0, 500)
            };
        }
        if (!response.ok && result.success === undefined) {
            result.success = false;
        }
        result.status = response.status;
        return result;
    } catch (error) {
        console.error('API network error for ' + url + ':', error);
        return { success: false, error: 'Network error: ' + error.message, offline: true };
    }
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
    if (!value) return 'Never';
    var raw = String(value).replace('T', ' ');
    var datePart = raw.slice(0, 10);
    var timePart = raw.slice(11, 19);
    var bits = datePart.split('-');
    if (bits.length !== 3) return raw;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var monthIndex = parseInt(bits[1], 10) - 1;
    var month = months[monthIndex] || bits[1];
    var hour = parseInt(timePart.slice(0, 2), 10);
    var suffix = hour >= 12 ? 'PM' : 'AM';
    var displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12;
    return month + ' ' + parseInt(bits[2], 10) + ', ' + bits[0] + ' ' +
           displayHour + ':' + timePart.slice(3, 5) + ' ' + suffix;
}

function activityIcon(type) {
    var value = String(type || '');
    if (/logout/i.test(value)) {
        return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">' +
            '<path d="M6 2.5H3.5V13.5H6M10 8H14.5M14.5 8L11.5 5M14.5 8L11.5 11" stroke="#B34B00" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';
    }
    if (/login/i.test(value)) {
        return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">' +
            '<path d="M10 2.5H12.5V13.5H10M6 8H1.5M1.5 8L4.5 5M1.5 8L4.5 11" stroke="#0F6CBD" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';
    }
    if (/archive/i.test(value)) {
        return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">' +
            '<rect x="2" y="2.5" width="12" height="3" stroke="#C94A4A" stroke-width="1.33"/>' +
            '<path d="M3.5 5.5V13.5H12.5V5.5" stroke="#C94A4A" stroke-width="1.33"/>' +
            '</svg>';
    }
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">' +
        '<circle cx="8" cy="8" r="6" stroke="#0F6CBD" stroke-width="1.33"/>' +
        '<path d="M8 5V8L10 9.5" stroke="#0F6CBD" stroke-width="1.33" stroke-linecap="round"/>' +
        '</svg>';
}

function renderActivities(container, activities) {
    if (!container) return;
    if (!activities.length) {
        container.innerHTML = '<div class="activity-empty">No recent activities recorded yet.</div>';
        return;
    }
    container.innerHTML = activities.map(function (activity) {
        return '<div class="activity-item">' +
            '<div class="activity-icon">' + activityIcon(activity.activity_type) + '</div>' +
            '<div class="activity-body">' +
                '<div class="activity-text">' + escapeHtml(activity.activity_description || activity.activity_type || '') + '</div>' +
                '<div class="activity-time">' + escapeHtml(formatDateTime(activity.created_at)) + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

async function loadRecentActivity() {
    var container = document.getElementById('activityList');
    if (!container) return;

    container.innerHTML = '<div class="activity-empty">Loading activities...</div>';

    try {
        var sessionUser = (window.Session && window.Session.user) || null;
        var userId = sessionUser ? sessionUser.id : null;

        if (!userId) {
            container.innerHTML = '<div class="activity-empty">Sign in to see activity.</div>';
            return;
        }

        var result = await apiCall('users.php?activities=1&user_id=' + encodeURIComponent(userId) + '&limit=10');
        if (result && result.success) {
            renderActivities(container, result.data || []);
        } else {
            container.innerHTML = '<div class="activity-empty">Activities could not be loaded.</div>';
        }
    } catch (error) {
        console.error('Error loading recent activity:', error);
        if (container) {
            container.innerHTML = '<div class="activity-empty">Activities could not be loaded.</div>';
        }
    }
}

async function initDashboard() {
    console.log('Initializing Dashboard...');
    
    // Load dashboard data
    await loadDashboardStats();
    await loadRecentActivity();
    
    // Setup quick action buttons
    setupQuickActions();
}

async function loadDashboardStats() {
    try {
        // Fetch total residents
        const residentsResult = await apiCall('residents.php?limit=1');
        if (residentsResult.success !== false) {
            const totalResidentsEl = document.getElementById('totalResidents');
            if (totalResidentsEl) totalResidentsEl.textContent = residentsResult.total || 0;
            const residentsTrend = document.getElementById('residentsTrend');
            if (residentsTrend) residentsTrend.textContent = residentsResult.total > 0 ? 'Live from database' : 'No data';
        }
        
        // Fetch total households (unique address combinations)
        const allResidentsResult = await apiCall('residents.php?limit=10000');
        if (allResidentsResult.success !== false && allResidentsResult.data) {
            const addresses = new Set();
            allResidentsResult.data.forEach(r => {
                const key = [r.purok, r.street_name, r.house_no].filter(Boolean).join('|');
                if (key) addresses.add(key);
            });
            const totalHouseholdsEl = document.getElementById('totalHouseholds');
            if (totalHouseholdsEl) totalHouseholdsEl.textContent = addresses.size || 0;
            const householdsTrend = document.getElementById('householdsTrend');
            if (householdsTrend) householdsTrend.textContent = addresses.size > 0 ? 'Live from database' : 'No data';
        }
        
        // Fetch active blotter cases
        const blotterResult = await apiCall('blotter.php?limit=10000');
        if (blotterResult.success !== false && blotterResult.data) {
            const activeCases = blotterResult.data.filter(c => c.status === 'Ongoing').length;
            const activeBlotterEl = document.getElementById('activeBlotterCases');
            if (activeBlotterEl) activeBlotterEl.textContent = activeCases;
            const blotterSubtext = document.getElementById('blotterSubtext');
            if (blotterSubtext) blotterSubtext.textContent = activeCases > 0 ? `${activeCases} pending resolution` : 'No active cases';
        }
        
        // Fetch certificates issued
        const certificatesResult = await apiCall('certificates.php?limit=1');
        if (certificatesResult.success !== false) {
            const certificatesIssuedEl = document.getElementById('certificatesIssued');
            if (certificatesIssuedEl) certificatesIssuedEl.textContent = certificatesResult.total || 0;
            const certificatesTrend = document.getElementById('certificatesTrend');
            if (certificatesTrend) certificatesTrend.textContent = certificatesResult.total > 0 ? 'Live from database' : 'No data';
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function setupQuickActions() {
    // Issue Certificate -> navigate to certificates module (issue form is the default view)
    const quickActionCertificate = document.querySelector('[data-action="certificate"]');
    if (quickActionCertificate) {
        quickActionCertificate.addEventListener('click', async () => {
            if (typeof window.loadModule === 'function') {
                await window.loadModule('certificates');
            }
        });
    }
    
    // Register Resident -> navigate to residents module and open Add Resident form
    const quickActionResident = document.querySelector('[data-action="resident"]');
    if (quickActionResident) {
        quickActionResident.addEventListener('click', async () => {
            if (typeof window.loadModule === 'function') {
                await window.loadModule('residents');
                if (typeof window.showAddResidentView === 'function') {
                    window.showAddResidentView();
                }
            }
        });
    }
    
    // Record Blotter -> navigate to blotter module and open Add Case form
    const quickActionBlotter = document.querySelector('[data-action="blotter"]');
    if (quickActionBlotter) {
        quickActionBlotter.addEventListener('click', async () => {
            if (typeof window.loadModule === 'function') {
                await window.loadModule('blotter');
                if (typeof window.showAddCaseView === 'function') {
                    window.showAddCaseView();
                }
            }
        });
    }
    
    // Borrow Log -> navigate to inventory module and open Borrow Log view
    const quickActionInventory = document.querySelector('[data-action="inventory"]');
    if (quickActionInventory) {
        quickActionInventory.addEventListener('click', async () => {
            if (typeof window.loadModule === 'function') {
                await window.loadModule('inventory');
                if (typeof window.showBorrowLogView === 'function') {
                    window.showBorrowLogView();
                }
            }
        });
    }
}

window.initDashboard = initDashboard;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initDashboard(); });
} else {
    initDashboard();
}

})();