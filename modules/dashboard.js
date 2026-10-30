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
        const blotterResult = await apiCall('blotter.php?status=Ongoing&limit=1');
        if (blotterResult.success !== false && blotterResult.data) {
            const activeCases = blotterResult.total || 0;
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
    const modal = document.getElementById('quickActionsModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalSubmitBtn = document.getElementById('modalSubmitBtn');
    const forms = {
        certificate: document.getElementById('certificateForm'),
        resident: document.getElementById('residentForm'),
        blotter: document.getElementById('blotterForm'),
        inventory: document.getElementById('inventoryForm'),
    };

    if (!modal) return;

    function showModal(type) {
        Object.keys(forms).forEach(function (key) {
            if (forms[key]) forms[key].style.display = 'none';
        });
        if (forms[type]) {
            forms[type].style.display = 'block';
        }
        if (type === 'certificate') {
            modalTitle.textContent = 'Issue Certificate';
            modalSubmitBtn.textContent = 'Issue Certificate';
        } else if (type === 'resident') {
            modalTitle.textContent = 'Register Resident';
            modalSubmitBtn.textContent = 'Register Resident';
        } else if (type === 'blotter') {
            modalTitle.textContent = 'Record Blotter';
            modalSubmitBtn.textContent = 'Save Blotter';
        } else if (type === 'inventory') {
            modalTitle.textContent = 'Borrow Log';
            modalSubmitBtn.textContent = 'Save Borrow';
            loadInventoryOptions();
        }
        modal.classList.add('active');
        modalSubmitBtn.dataset.action = type;
    }

    function hideModal() {
        modal.classList.remove('active');
        Object.keys(forms).forEach(function (key) {
            if (forms[key]) forms[key].reset();
        });
        var autocomplete = document.getElementById('residentAutocomplete');
        if (autocomplete) autocomplete.innerHTML = '';
        var residentId = document.getElementById('qaResidentId');
        if (residentId) residentId.value = '';
        modalSubmitBtn.disabled = false;
    }

    document.querySelector('[data-action="certificate"]')?.addEventListener('click', function () {
        showModal('certificate');
    });
    document.querySelector('[data-action="resident"]')?.addEventListener('click', function () {
        showModal('resident');
    });
    document.querySelector('[data-action="blotter"]')?.addEventListener('click', function () {
        showModal('blotter');
    });
    document.querySelector('[data-action="inventory"]')?.addEventListener('click', function () {
        showModal('inventory');
    });

    modalCloseBtn?.addEventListener('click', hideModal);
    modalCancelBtn?.addEventListener('click', hideModal);
    modal.addEventListener('click', function (event) {
        if (event.target === modal) hideModal();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
            hideModal();
        }
    });

    modalSubmitBtn?.addEventListener('click', async function () {
        const action = modalSubmitBtn.dataset.action;
        if (!action) return;

        try {
            if (action === 'certificate') {
                await submitCertificate();
            } else if (action === 'resident') {
                await submitResident();
            } else if (action === 'blotter') {
                await submitBlotter();
            } else if (action === 'inventory') {
                await submitInventory();
            }
        } catch (error) {
            console.error('Quick action submit error:', error);
            alert('Something went wrong. Please try again.');
        } finally {
            modalSubmitBtn.disabled = false;
        }
    });

    setupResidentSearch();
}

function setupResidentSearch() {
    const input = document.getElementById('qaResidentSearch');
    const dropdown = document.getElementById('residentAutocomplete');
    if (!input || !dropdown) return;

    let timer = null;
    input.addEventListener('input', function () {
        clearTimeout(timer);
        const term = input.value.trim();
        if (term.length < 2) {
            dropdown.classList.remove('visible');
            dropdown.innerHTML = '';
            return;
        }
        timer = setTimeout(async function () {
            const result = await apiCall('residents.php?search=' + encodeURIComponent(term) + '&limit=8');
            if (!result || result.success === false || !result.data || !result.data.length) {
                dropdown.innerHTML = '<div class="autocomplete-item">No results</div>';
                dropdown.classList.add('visible');
                return;
            }
            dropdown.innerHTML = result.data.map(function (r) {
                const name = escapeHtml([r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '));
                return '<div class="autocomplete-item" data-id="' + r.id + '">' + name + '</div>';
            }).join('');
            dropdown.classList.add('visible');
            dropdown.querySelectorAll('.autocomplete-item').forEach(function (item) {
                item.addEventListener('click', function () {
                    const id = item.getAttribute('data-id');
                    const text = item.textContent;
                    input.value = text;
                    const hidden = document.getElementById('qaResidentId');
                    if (hidden) hidden.value = id;
                    dropdown.classList.remove('visible');
                });
            });
        }, 250);
    });

    document.addEventListener('click', function (event) {
        if (!input.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('visible');
        }
    });
}

async function loadInventoryOptions() {
    const select = document.getElementById('qaItemSelect');
    if (!select || select.options.length > 1) return;

    try {
        const result = await apiCall('inventory.php?limit=1000');
        if (result && result.success && result.data && result.data.length) {
            select.innerHTML = '<option value="">Select item</option>' +
                result.data.map(function (item) {
                    return '<option value="' + item.id + '">' + escapeHtml(item.item_name || 'Item #' + item.id) + '</option>';
                }).join('');
        }
    } catch (error) {
        console.error('Failed to load inventory options:', error);
    }
}

async function submitCertificate() {
    const residentId = document.getElementById('qaResidentId')?.value || '';
    const certType = document.getElementById('qaCertType')?.value || '';
    const purpose = document.getElementById('qaPurpose')?.value.trim() || '';
    const dateIssued = document.getElementById('qaDateIssued')?.value || '';
    const orNumber = document.getElementById('qaOrNumber')?.value.trim() || '';

    if (!residentId) { alert('Please search and select a resident.'); return; }
    if (!certType) { alert('Please select a certificate type.'); return; }
    if (!purpose) { alert('Please enter the purpose.'); return; }
    if (!dateIssued) { alert('Please choose the date issued.'); return; }

    const btn = document.getElementById('modalSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Issuing...';

    const result = await apiCall('certificates.php', 'POST', {
        resident_id: Number(residentId),
        certificate_type: certType,
        purpose: purpose,
        or_number: orNumber,
        amount_paid: '',
        date_issued: dateIssued,
    });

    btn.disabled = false;
    btn.textContent = 'Issue Certificate';

    if (result && result.success) {
        document.getElementById('quickActionsModal')?.classList.remove('active');
        await Promise.all([loadDashboardStats(), loadRecentActivity()]);
        alert('Certificate issued successfully!');
    } else {
        alert((result && result.message) || 'Failed to issue certificate. Please try again.');
    }
}

async function submitResident() {
    const firstName = document.getElementById('qaFirstName')?.value.trim() || '';
    const lastName = document.getElementById('qaLastName')?.value.trim() || '';
    const birthDate = document.getElementById('qaBirthDate')?.value || '';
    const gender = document.getElementById('qaGender')?.value || '';
    const purok = document.getElementById('qaPurok')?.value.trim() || '';
    const street = document.getElementById('qaStreet')?.value.trim() || '';
    const houseNo = document.getElementById('qaHouseNo')?.value.trim() || '';
    const mobile = document.getElementById('qaMobile')?.value.trim() || '';

    if (!firstName || !lastName || !birthDate || !gender || !purok || !street || !houseNo) {
        alert('Please fill in all required fields.');
        return;
    }

    const btn = document.getElementById('modalSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const formData = {
        first_name: firstName,
        middle_name: '',
        last_name: lastName,
        suffix: '',
        birth_date: birthDate,
        age: calculateAgeFromBirthDate ? calculateAgeFromBirthDate(birthDate) : '',
        place_of_birth: '',
        gender: gender,
        civil_status: '',
        nationality: 'Filipino',
        occupation: '',
        purok: purok,
        street_name: street,
        house_no: houseNo,
        mobile_number: mobile,
        email: '',
        emergency_person: '',
        emergency_relation: '',
        emergency_contact: '',
        voter_status: 'Not Registered',
        resident_status: 'Active',
        move_in_date: birthDate || null,
        photo_base64: '',
    };

    const result = await apiCall('residents.php', 'POST', formData);
    btn.disabled = false;
    btn.textContent = 'Register Resident';

    if (result && result.success) {
        document.getElementById('quickActionsModal')?.classList.remove('active');
        await Promise.all([loadDashboardStats(), loadRecentActivity()]);
        alert('Resident registered successfully!');
    } else {
        alert((result && result.message) || 'Failed to register resident. Please try again.');
    }
}

async function submitBlotter() {
    const caseType = document.getElementById('qaCaseType')?.value || '';
    const complainant = document.getElementById('qaComplainant')?.value.trim() || '';
    const respondent = document.getElementById('qaRespondent')?.value.trim() || '';
    const location = document.getElementById('qaLocation')?.value.trim() || '';
    const summary = document.getElementById('qaIncidentSummary')?.value.trim() || '';

    if (!caseType || !complainant || !respondent || !location || !summary) {
        alert('Please fill in all required fields.');
        return;
    }

    const btn = document.getElementById('modalSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const formData = {
        case_type: caseType,
        location: location,
        incident_date: new Date().toISOString().slice(0, 10),
        incident_time: new Date().toTimeString().slice(0, 5),
        complainant_name: complainant,
        complainant_contact: '',
        complainant_address: '',
        complainant_relation: '',
        respondent_name: respondent,
        respondent_contact: '',
        respondent_address: '',
        respondent_status: '',
        incident_summary: summary,
        assigned_officer: '',
        status: 'Ongoing',
        schedule_date: null,
        schedule_time: null,
    };

    const result = await apiCall('blotter.php', 'POST', formData);
    btn.disabled = false;
    btn.textContent = 'Save Blotter';

    if (result && result.success) {
        document.getElementById('quickActionsModal')?.classList.remove('active');
        await Promise.all([loadDashboardStats(), loadRecentActivity()]);
        alert('Blotter case recorded successfully!');
    } else {
        alert((result && result.message) || 'Failed to record blotter case. Please try again.');
    }
}

async function submitInventory() {
    const itemId = document.getElementById('qaItemSelect')?.value || '';
    const qty = parseInt(document.getElementById('qaQty')?.value || '0', 10);
    const borrowDate = document.getElementById('qaBorrowDate')?.value || '';
    const expectedReturn = document.getElementById('qaExpectedReturn')?.value || '';
    const borrower = document.getElementById('qaBorrower')?.value.trim() || '';
    const purpose = document.getElementById('qaBorrowPurpose')?.value.trim() || '';

    if (!itemId || !qty || qty <= 0 || !borrowDate || !expectedReturn || !borrower || !purpose) {
        alert('Please fill in all required fields.');
        return;
    }

    const btn = document.getElementById('modalSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const payload = {
        itemId: Number(itemId),
        quantity: qty,
        borrower: borrower,
        borrowerType: 'Resident',
        borrowerContact: '',
        dateBorrowed: borrowDate,
        expectedReturn: expectedReturn,
        purpose: purpose,
        releasedBy: '',
        remarks: '',
    };

    const result = await apiCall('inventory.php?action=borrow', 'POST', payload);
    btn.disabled = false;
    btn.textContent = 'Save Borrow';

    if (result && result.success) {
        document.getElementById('quickActionsModal')?.classList.remove('active');
        await Promise.all([loadDashboardStats(), loadRecentActivity()]);
        alert('Borrow log recorded successfully!');
    } else {
        alert((result && result.message) || 'Failed to record borrow log. Please try again.');
    }
}

function calculateAgeFromBirthDate(birthDate) {
    var raw = String(birthDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    var parts = raw.split('-').map(Number);
    var birth = new Date(parts[0], parts[1] - 1, parts[2]);
    var today = new Date();
    var age = today.getFullYear() - birth.getFullYear();
    var m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age < 0 ? '' : age;
}

window.initDashboard = initDashboard;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initDashboard(); });
} else {
    initDashboard();
}

})();