// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

// residents.js - Complete with Database Integration via PHP API

// API Configuration
const API_BASE_URL = 'api/';

// No hardcoded sample data - all data comes from the database via API

let isOfflineMode = false;
let residentsData = [];
let currentPage = 1;
let itemsPerPage = 10;
let currentFilters = {
    search: '',
    purok: '',
    gender: '',
    status: ''
};
let currentView = 'list';
let currentEditId = null;
let currentArchiveId = null;
let pendingEditId = null;
let totalPages = 1;
let totalResidents = 0;

// ============================================
// API CALL FUNCTION (with offline fallback)
// ============================================
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
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const result = await response.json();
        isOfflineMode = false;
        return result;
    } catch (error) {
        console.warn('API Error, using offline mode:', error);
        isOfflineMode = true;
        return { success: false, offline: true, error: error.message };
    }
}

// ============================================
// OFFLINE DATA HELPERS
// ============================================
function getOfflineResidents(filters = {}) {
    // No offline data - return empty array
    return [];
}

function getOfflineStats() {
    return { total: 0, voters: 0, seniors: 0, minors: 0 };
}

// ============================================
// STATS CARDS FUNCTIONS
// ============================================

async function loadResidentStatistics() {
    try {
        const result = await apiCall('residents.php?action=stats');
        if (result.success && result.data) {
            const votersEl = document.getElementById('registeredVoters');
            const seniorsEl = document.getElementById('seniorCitizens');
            const minorsEl = document.getElementById('minorsCount');
            if (votersEl) votersEl.textContent = (result.data.registeredVoters || 0).toLocaleString();
            if (seniorsEl) seniorsEl.textContent = (result.data.seniorCitizens || 0).toLocaleString();
            if (minorsEl) minorsEl.textContent = (result.data.minors || 0).toLocaleString();
        }
    } catch (error) {
        console.error('Failed to load statistics:', error);
    }
}

function updateStatsCards(voters, seniors, minors) {
    const votersEl = document.getElementById('registeredVoters');
    const seniorsEl = document.getElementById('seniorCitizens');
    const minorsEl = document.getElementById('minorsCount');
    
    if (votersEl) votersEl.textContent = formatNumber(voters);
    if (seniorsEl) seniorsEl.textContent = formatNumber(seniors);
    if (minorsEl) minorsEl.textContent = formatNumber(minors);
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ============================================
// INITIALIZATION (MODIFIED - REMOVED AUTO-INIT)
// ============================================
async function initResidentsModule() {
    console.log('Initializing Residents Module...');
    
    // Reset all state variables
    currentView = 'list';
    currentPage = 1;
    currentFilters = {
        search: '',
        purok: '',
        gender: '',
        status: ''
    };
    currentEditId = null;
    currentArchiveId = null;
    pendingEditId = null;
    
    await loadResidentsTable();
    await loadResidentStatistics();
    setupEventListeners();
    setupFormEventListeners();
    setupModalEventListeners();
    await loadPurokOptions();
    setupExportEventListeners();

    if (window.applyModuleReadOnly) {
        window.applyModuleReadOnly({
            addBtnId: 'addResidentBtn',
            saveBtnIds: ['saveResidentBtn', 'saveEditBtn'],
            editSelectors: ['.action-icon[onclick*="editResident"]', '#editFromViewBtn'],
        });
    }
}

// ============================================
// LOAD DATA
// ============================================
async function loadResidentsTable() {
    showLoading();
    
    const params = new URLSearchParams({
        page: currentPage,
        limit: itemsPerPage,
        search: currentFilters.search,
        purok: currentFilters.purok,
        gender: currentFilters.gender,
        status: currentFilters.status
    });
    
    const result = await apiCall(`residents.php?${params.toString()}`);
    
    if (result.success !== false && result.data && !result.offline) {
        residentsData = result.data || [];
        totalResidents = result.total || 0;
        totalPages = result.totalPages || 1;
        renderTable(residentsData);
    } else {
        residentsData = [];
        totalResidents = 0;
        totalPages = 1;
        renderTable([]);
    }
    
    await loadResidentStatistics();
    
    const startItem = totalResidents === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalResidents);
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startItem} to ${endItem} of ${totalResidents} residents`;
    }
    
    renderPagination(totalPages, currentPage);
    hideLoading();
}

async function loadPurokOptions() {
    try {
        const result = await apiCall('purok_options.php');
        const purokOptions = Array.isArray(result) ? result : [];
        
        const purokFilter = document.getElementById('purokFilter');
        const editPurok = document.getElementById('editPurok');
        const addPurok = document.getElementById('purok');
        
        if (purokFilter) {
            purokFilter.innerHTML = '<option value="">All Puroks</option>' + 
                purokOptions.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
        }
        
        if (editPurok) {
            editPurok.innerHTML = purokOptions.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
        }
        
        if (addPurok) {
            addPurok.innerHTML = '<option value="">Select Purok</option>' + 
                purokOptions.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading purok options:', error);
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderTable(residents) {
    const tbody = document.getElementById('residentsTableBody');
    if (!tbody) {
        console.warn('residentsTableBody not found');
        return;
    }
    
    if (!residents || residents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No residents found. Try adjusting your search or filters.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = residents.map(resident => {
        const fullName = `${resident.last_name || ''}, ${resident.first_name || ''}${resident.middle_name ? ' ' + resident.middle_name.charAt(0) + '.' : ''}`.trim();
        const age = resident.age || calculateAgeFromBirthDate(resident.birth_date);
        const location = [resident.purok, resident.street_name].filter(Boolean).join(' - ') || '—';
        const initials = `${resident.first_name?.charAt(0) || ''}${resident.last_name?.charAt(0) || ''}`;
        const statusClass = (resident.resident_status || 'Active').toLowerCase();
        
        return `
        <tr>
            <td>
                <div class="resident-info">
                    <div class="resident-avatar">
                        <div class="avatar-placeholder">${initials}</div>
                    </div>
                    <div class="resident-name">${escapeHtml(fullName)}</div>
                </div>
            </td>
            <td class="sex-age">${resident.gender || '—'}, ${age} yrs</td>
            <td class="purok-street">${escapeHtml(location)}</td>
            <td class="voter-status">${resident.voter_status || 'Not Registered'}</td>
            <td>
                <span class="status-badge ${statusClass}">${resident.resident_status || 'Active'}</span>
            </td>
            <td>
                <div class="action-buttons-cell">
                    <div class="action-icon" onclick="window.viewResident(${resident.id})" title="View">
                        <img src="Images/View_Icon.svg" alt="View">
                    </div>
                    <div class="action-icon" onclick="window.editResident(${resident.id})" title="Edit">
                        <img src="Images/Edit_Icon.svg" alt="Edit">
                    </div>
                    <div class="action-icon delete" onclick="window.showArchiveModal(${resident.id})" title="Archive">
                        <img src="Images/Archives_Icon.svg" alt="Archive">
                    </div>
                </div>
            </td>
        </tr>
    `}).join('');
}

function renderPagination(totalPages, currentPage) {
    const paginationControls = document.getElementById('paginationControls');
    if (!paginationControls) return;
    
    if (totalPages <= 1) {
        paginationControls.innerHTML = '';
        return;
    }
    
    let html = `<button class="pagination-btn" onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
    
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`;
    }
    
    html += `<button class="pagination-btn" onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
    
    paginationControls.innerHTML = html;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function calculateAgeFromBirthDate(birthDate) {
    if (!birthDate) return '—';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function calculateAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function calculateLengthOfResidence(moveInDate) {
    if (!moveInDate) return 'Not provided';
    const today = new Date();
    const start = new Date(moveInDate);
    if (isNaN(start.getTime()) || start > today) return 'Not provided';
    let years = today.getFullYear() - start.getFullYear();
    let months = today.getMonth() - start.getMonth();
    let days = today.getDate() - start.getDate();
    if (days < 0) {
        months--;
        const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    if (years < 0) return 'Not provided';
    if (years === 0 && months === 0 && days === 0) return 'Today';
    const parts = [];
    if (years > 0) parts.push(years + ' year' + (years !== 1 ? 's' : ''));
    if (months > 0) parts.push(months + ' month' + (months !== 1 ? 's' : ''));
    if (days > 0) parts.push(days + ' day' + (days !== 1 ? 's' : ''));
    return parts.join(' and ');
}

function showLoading() {
    const tbody = document.getElementById('residentsTableBody');
    if (tbody && (!residentsData || residentsData.length === 0)) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;"><div class="loading-spinner"></div><p>Loading residents...</p></td></tr>`;
    }
}

function hideLoading() {}

function showNotification(message, type) {
    console.log(`[${type}] ${message}`);
    alert(message);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============================================
// VIEW NAVIGATION
// ============================================
function showResidentsListView() {
    currentView = 'list';
    const listView = document.getElementById('residentsListView');
    const addView = document.getElementById('addResidentView');
    const viewView = document.getElementById('viewResidentView');
    const editView = document.getElementById('editResidentView');
    const exportView = document.getElementById('exportResidentsView');
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    
    if (listView) listView.classList.add('active');
    if (addView) addView.classList.remove('active');
    if (viewView) viewView.classList.remove('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.remove('active');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Information System / Residents';
    if (pageTitle) pageTitle.textContent = 'Residents Management';
    
    currentEditId = null;
    loadResidentsTable();
}

function showAddResidentView() {
    currentView = 'add';
    const listView = document.getElementById('residentsListView');
    const addView = document.getElementById('addResidentView');
    const viewView = document.getElementById('viewResidentView');
    const editView = document.getElementById('editResidentView');
    const exportView = document.getElementById('exportResidentsView');
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    
    if (listView) listView.classList.remove('active');
    if (addView) addView.classList.add('active');
    if (viewView) viewView.classList.remove('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.remove('active');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Information System / Residents / Add New Resident';
    if (pageTitle) pageTitle.textContent = 'Register New Resident';
    
    resetForm();
}

function showViewResidentView() {
    const listView = document.getElementById('residentsListView');
    const addView = document.getElementById('addResidentView');
    const viewView = document.getElementById('viewResidentView');
    const editView = document.getElementById('editResidentView');
    const exportView = document.getElementById('exportResidentsView');
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    
    if (listView) listView.classList.remove('active');
    if (addView) addView.classList.remove('active');
    if (viewView) viewView.classList.add('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.remove('active');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Information System / Residents / View Resident';
    if (pageTitle) pageTitle.textContent = 'Resident Details';
}

function showEditResidentView(id) {
    currentEditId = id;
    
    const listView = document.getElementById('residentsListView');
    const addView = document.getElementById('addResidentView');
    const viewView = document.getElementById('viewResidentView');
    const editView = document.getElementById('editResidentView');
    const exportView = document.getElementById('exportResidentsView');
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    
    if (listView) listView.classList.remove('active');
    if (addView) addView.classList.remove('active');
    if (viewView) viewView.classList.remove('active');
    if (editView) editView.classList.add('active');
    if (exportView) exportView.classList.remove('active');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Information System / Residents / Edit Resident';
    if (pageTitle) pageTitle.textContent = 'Edit Resident Information';
    
    loadResidentForEdit(id);
}

async function loadResidentForEdit(id) {
    // The id arrives from the row's onclick handler as a number while the API
    // returns it as a string, so compare as text (the rule viewResident() uses).
    let resident = residentsData.find(r => String(r.id) === String(id));
    
    if (!resident && !isOfflineMode) {
        const result = await apiCall(`residents.php?id=${id}`);
        if (result && result.id) resident = result;
    }
    
    if (resident) {
        document.getElementById('editFullName').textContent = `${resident.last_name}, ${resident.first_name}`;
        document.getElementById('editResidentId').textContent = `Resident ID: ${resident.resident_id || 'N/A'}`;
        document.getElementById('editPurokTag').textContent = resident.purok ? resident.purok.split(' - ')[0] : '';
        document.getElementById('editVoterTag').textContent = resident.voter_status || 'Not Registered';
        
        document.getElementById('editFirstName').value = resident.first_name || '';
        document.getElementById('editMiddleName').value = resident.middle_name || '';
        document.getElementById('editLastName').value = resident.last_name || '';
        document.getElementById('editSuffix').value = resident.suffix || '';
        document.getElementById('editCivilStatus').value = resident.civil_status || '';
        document.getElementById('editGender').value = resident.gender || '';
        document.getElementById('editBirthDate').value = resident.birth_date || '';
        document.getElementById('editAge').value = `${resident.age || calculateAgeFromBirthDate(resident.birth_date)} years old`;
        document.getElementById('editBirthPlace').value = resident.place_of_birth || '';
        document.getElementById('editNationality').value = resident.nationality || 'Filipino';
        document.getElementById('editOccupation').value = resident.occupation || '';
        document.getElementById('editVoterStatus').value = resident.voter_status || 'Not Registered';
        document.getElementById('editResidentStatus').value = resident.resident_status || 'Active';
        
        if (document.getElementById('editMoveInDate')) {
            document.getElementById('editMoveInDate').value = resident.move_in_date || '';
            const lengthText = calculateLengthOfResidence(resident.move_in_date);
            if (document.getElementById('editLengthOfResidence')) {
                document.getElementById('editLengthOfResidence').value = lengthText;
            }
        }
        
        if (document.getElementById('editPurok')) {
            for (let i = 0; i < document.getElementById('editPurok').options.length; i++) {
                if (document.getElementById('editPurok').options[i].value === resident.purok) {
                    document.getElementById('editPurok').selectedIndex = i;
                    break;
                }
            }
        }
        
        document.getElementById('editStreet').value = resident.street_name || '';
        document.getElementById('editHouseNo').value = resident.house_no || '';
        document.getElementById('editMobile').value = resident.mobile_number || '';
        document.getElementById('editEmail').value = resident.email || '';
        document.getElementById('editEmergencyPerson').value = resident.emergency_person || '';
        document.getElementById('editEmergencyRelation').value = resident.emergency_relation || '';
        document.getElementById('editEmergencyContact').value = resident.emergency_contact || '';

        // Photo state is per-edit: show the stored photo but do not treat it as a
        // newly chosen file, so an untouched photo is left alone on save.
        editResidentPhotoBase64 = null;
        renderEditResidentPhotoPreview(resident.profile_image || null);
    }
}

// ============================================
// EDIT CONFIRMATION MODAL FUNCTIONS
// ============================================

/**
 * Open the Edit confirmation modal for a resident.
 *
 * `resident` is passed in by window.editResident(), which resolves it from the
 * loaded page or the API. The id is compared as text there because the row's
 * onclick handler passes a number while the API returns a string.
 */
function showEditConfirmModal(residentId, resident) {
    pendingEditId = residentId;

    const fullName = `${resident.first_name} ${resident.last_name}`;
    const residentNameSpan = document.getElementById('editConfirmResidentName');
    if (residentNameSpan) {
        residentNameSpan.textContent = fullName;
    }
    
    const modal = document.getElementById('editConfirmModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeEditConfirmModal() {
    const modal = document.getElementById('editConfirmModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    pendingEditId = null;
}

function proceedWithEdit() {
    // Capture the id first: closeEditConfirmModal() clears pendingEditId, so
    // reading it after the close would pass null on to the editor.
    const id = pendingEditId;

    if (!id) return;

    closeEditConfirmModal();
    showEditResidentView(id);
}

// ============================================
// CRUD OPERATIONS
// ============================================
// ============================================
// REGISTER FORM - photo + phone helpers
// ============================================

// Base64 of the photo chosen in the Register form (null when none selected).
let newResidentPhotoBase64 = null;

// Base64 of the photo chosen in the Edit form (null when none selected).
let editResidentPhotoBase64 = null;

/**
 * Normalise a phone field: digits only, capped at 11 characters.
 * Keeps leading zeros because the value is handled as text.
 */
function sanitizePhoneNumber(value) {
    if (!value) return '';
    return String(value).replace(/\D/g, '').slice(0, 11);
}

/**
 * Required fields shared by Register New Resident and Edit Resident.
 *
 * Registration is the reference implementation, so the list is kept in one
 * place: before this, an edit that blanked a required field was saved even
 * though the same input is refused at registration.
 *
 * Declared as a function rather than a top-level const on purpose: sidebar.js
 * re-appends this file every time the module is opened, and an extra
 * top-level lexical binding only adds to the "already been declared" failure
 * that already affects this file's top-level let/const declarations.
 *
 * @param {Object} formData
 * @returns {string[]} Names of the required fields that are empty.
 */
function missingResidentRequiredFields(formData) {
    var required = [
        'first_name', 'last_name', 'birth_date', 'gender', 'civil_status',
        'purok', 'street_name', 'house_no', 'mobile_number'
    ];

    return required.filter(function (field) {
        return !formData[field];
    });
}

/**
 * Read the chosen photo as a base64 data URL after validating type and size.
 * Returns null when the file is not a supported image or exceeds 2MB.
 */
function readResidentPhoto(file) {
    if (!file) return Promise.resolve(null);

    // Only JPG and PNG are accepted, up to 2MB.
    var allowed = ['image/jpeg', 'image/png'];
    if (allowed.indexOf(file.type) === -1) {
        showNotification('Invalid photo. Accepted formats: JPG, PNG. Max size: 2MB.', 'error');
        return Promise.resolve(null);
    }

    if (file.size > 2 * 1024 * 1024) {
        showNotification('Invalid photo. Accepted formats: JPG, PNG. Max size: 2MB.', 'error');
        return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (event) {
            resolve(event.target.result);
        };
        reader.onerror = function () {
            showNotification('Unable to read the selected photo.', 'error');
            resolve(null);
        };
        reader.readAsDataURL(file);
    });
}

async function saveNewResident() {
    const birthDate = document.getElementById('birthDate')?.value || '';
    const moveInDate = document.getElementById('moveInDate')?.value || '';
    const mobileNumber = sanitizePhoneNumber(document.getElementById('mobile')?.value || '');
    const emergencyContact = sanitizePhoneNumber(document.getElementById('emergencyContact')?.value || '');

    const formData = {
        first_name: document.getElementById('firstName')?.value || '',
        middle_name: document.getElementById('middleName')?.value || '',
        last_name: document.getElementById('lastName')?.value || '',
        suffix: document.getElementById('suffix')?.value || '',
        birth_date: birthDate,
        age: birthDate ? calculateAgeFromBirthDate(birthDate) : '',
        place_of_birth: document.getElementById('birthPlace')?.value || '',
        gender: document.getElementById('gender')?.value || '',
        civil_status: document.getElementById('civilStatus')?.value || '',
        nationality: document.getElementById('citizenship')?.value || 'Filipino',
        occupation: document.getElementById('occupation')?.value || '',
        purok: document.getElementById('purok')?.value || '',
        street_name: document.getElementById('street')?.value || '',
        house_no: document.getElementById('houseNo')?.value || '',
        mobile_number: mobileNumber,
        email: document.getElementById('email')?.value || '',
        emergency_person: document.getElementById('emergencyPerson')?.value || '',
        emergency_relation: document.getElementById('emergencyRelation')?.value || '',
        emergency_contact: emergencyContact,
        voter_status: document.getElementById('voterStatus')?.value || 'Not Registered',
        resident_status: document.getElementById('residentStatusSelect')?.value || 'Active',
        move_in_date: moveInDate || null,
        photo_base64: newResidentPhotoBase64 || ''
    };

    if (missingResidentRequiredFields(formData).length > 0) {
        showNotification('Please fill in all required fields marked with *', 'error');
        return;
    }

    if (moveInDate && new Date(moveInDate) > new Date()) {
        showNotification('Move-in Date cannot be in the future.', 'error');
        return;
    }

    // Phone numbers must be exactly 11 digits; the emergency number is optional.
    if (!/^\d{11}$/.test(mobileNumber)) {
        showNotification('Mobile Number must be exactly 11 digits (numbers only).', 'error');
        return;
    }
    if (emergencyContact && !/^\d{11}$/.test(emergencyContact)) {
        showNotification('Emergency Contact Number must be exactly 11 digits (numbers only).', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('saveResidentBtn');
    if (!saveBtn) return;
    
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        const result = await apiCall('residents.php', 'POST', formData);
        if (result && result.success) {
            showNotification('Resident registered successfully!', 'success');
            await loadResidentsTable();
            await loadResidentStatistics();
            showResidentsListView();
        } else {
            showNotification('Failed to register resident. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error saving resident:', error);
        showNotification('Failed to register resident. Please try again.', 'error');
    }
    
    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;
}

async function saveEditResident() {
    if (!currentEditId) return;

    const birthDate = document.getElementById('editBirthDate')?.value || '';
    const moveInDate = document.getElementById('editMoveInDate')?.value || '';
    const mobileNumber = sanitizePhoneNumber(document.getElementById('editMobile')?.value || '');
    const emergencyContact = sanitizePhoneNumber(document.getElementById('editEmergencyContact')?.value || '');

    const formData = {
        id: currentEditId,
        first_name: document.getElementById('editFirstName')?.value || '',
        middle_name: document.getElementById('editMiddleName')?.value || '',
        last_name: document.getElementById('editLastName')?.value || '',
        suffix: document.getElementById('editSuffix')?.value || '',
        birth_date: document.getElementById('editBirthDate')?.value || '',
        place_of_birth: document.getElementById('editBirthPlace')?.value || '',
        gender: document.getElementById('editGender')?.value || '',
        civil_status: document.getElementById('editCivilStatus')?.value || '',
        nationality: document.getElementById('editNationality')?.value || 'Filipino',
        occupation: document.getElementById('editOccupation')?.value || '',
        purok: document.getElementById('editPurok')?.value || '',
        street_name: document.getElementById('editStreet')?.value || '',
        house_no: document.getElementById('editHouseNo')?.value || '',
        mobile_number: mobileNumber,
        email: document.getElementById('editEmail')?.value || '',
        emergency_person: document.getElementById('editEmergencyPerson')?.value || '',
        emergency_relation: document.getElementById('editEmergencyRelation')?.value || '',
        emergency_contact: emergencyContact,
        age: birthDate ? calculateAgeFromBirthDate(birthDate) : null,
        move_in_date: moveInDate || null,
        photo_base64: editResidentPhotoBase64 || '',
        voter_status: document.getElementById('editVoterStatus')?.value || 'Not Registered',
        resident_status: document.getElementById('editResidentStatus')?.value || 'Active'
    };

    // Same required-field rule as Register New Resident: an edit must not be
    // able to blank a field that registration insists on.
    if (missingResidentRequiredFields(formData).length > 0) {
        showNotification('Please fill in all required fields marked with *', 'error');
        return;
    }

    if (moveInDate && new Date(moveInDate) > new Date()) {
        showNotification('Move-in Date cannot be in the future.', 'error');
        return;
    }

    // Phone numbers must be exactly 11 digits; the emergency number is optional.
    if (!/^\d{11}$/.test(mobileNumber)) {
        showNotification('Mobile Number must be exactly 11 digits (numbers only).', 'error');
        return;
    }
    if (emergencyContact && !/^\d{11}$/.test(emergencyContact)) {
        showNotification('Emergency Contact Number must be exactly 11 digits (numbers only).', 'error');
        return;
    }

    const saveBtn = document.getElementById('saveEditBtn');
    if (!saveBtn) return;
    
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        const result = await apiCall('residents.php', 'PUT', formData);
        if (result && result.success) {
            showNotification('Resident updated successfully!', 'success');
            await loadResidentsTable();
            await loadResidentStatistics();
            showResidentsListView();
        } else {
            // Surface the API's own message (e.g. "Resident not found") instead
            // of hiding every failure behind one generic sentence.
            showNotification((result && typeof result.message === 'string' && result.message)
                ? result.message
                : 'Failed to update resident. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error updating resident:', error);
        showNotification('Failed to update resident. Please try again.', 'error');
    }
    
    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;
}

async function confirmArchive() {
    if (currentArchiveId) {
        const confirmBtn = document.getElementById('confirmArchiveBtn');
        if (confirmBtn) {
            const originalText = confirmBtn.innerHTML;
            confirmBtn.innerHTML = 'Archiving...';
            confirmBtn.disabled = true;
            
            try {
                const result = await apiCall(`residents.php?id=${currentArchiveId}`, 'DELETE');
                if (result && result.success) {
                    showNotification('Resident archived successfully!', 'success');
                    await loadResidentsTable();
                    await loadResidentStatistics();
                } else {
                    // Surface the API's own message (e.g. the SQL error behind a
                    // failed archive) instead of hiding every failure.
                    showNotification((result && typeof result.message === 'string' && result.message)
                        ? result.message
                        : 'Failed to archive resident. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Error archiving resident:', error);
                showNotification('Failed to archive resident. Please try again.', 'error');
            }
            
            confirmBtn.innerHTML = originalText;
            confirmBtn.disabled = false;
        }
        closeArchiveModal();
    }
}

function closeArchiveModal() {
    const modal = document.getElementById('archiveModal');
    if (modal) modal.classList.remove('active');
    currentArchiveId = null;
}

function resetForm() {
    const formInputs = document.querySelectorAll('#addResidentView input, #addResidentView select');
    formInputs.forEach(input => {
        if (input.type !== 'file' && input.id !== 'citizenship') {
            input.value = '';
        }
    });
    
    const citizenship = document.getElementById('citizenship');
    if (citizenship) citizenship.value = 'Filipino';
    
    const ageInput = document.getElementById('age');
    if (ageInput) ageInput.value = '';
    
    const photoUpload = document.getElementById('photoUpload');
    const fileName = document.getElementById('fileName');
    const photoPlaceholder = document.getElementById('photoPlaceholder');
    
    if (photoUpload) photoUpload.value = '';
    newResidentPhotoBase64 = null;
    renderNewResidentPhotoPreview(null);
    if (fileName) fileName.textContent = 'No file chosen';
    if (photoPlaceholder) {
        photoPlaceholder.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 4H20V20H4V4Z" stroke="#5F7385" stroke-width="2"/>
                <circle cx="12" cy="12" r="3" stroke="#5F7385" stroke-width="2"/>
                <path d="M16 8L18 10" stroke="#5F7385" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>Upload Photo</span>
        `;
    }
}

// ============================================
// VIEW, EDIT, ARCHIVE GLOBAL FUNCTIONS
// ============================================
// Default avatar shown when the resident has no stored photo.
const DEFAULT_RESIDENT_AVATAR = 'Images/Anoymous.jpg';

// Inline silhouette used if the default avatar file itself cannot be loaded.
const FALLBACK_AVATAR_DATA_URI =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
        '<rect width="96" height="96" fill="#E8EEF3"/>' +
        '<circle cx="48" cy="34" r="16" fill="#B8C6D2"/>' +
        '<path d="M16 96c4-22 18-32 32-32s28 10 32 32z" fill="#B8C6D2"/>' +
        '</svg>'
    );

/**
 * Point the View Resident avatar at the stored photo.
 *
 * The photo is a web-relative path in profile_image (see storeResidentPhoto()
 * in api/residents.php). Residents saved before photos existed, or whose file
 * has since gone missing, fall back to the default avatar.
 */
function renderViewResidentAvatar(resident) {
    const avatar = document.getElementById('viewAvatar');
    if (!avatar) return;

    avatar.onerror = function () {
        avatar.onerror = null;
        avatar.src = FALLBACK_AVATAR_DATA_URI;
    };
    avatar.src = resident.profile_image || DEFAULT_RESIDENT_AVATAR;
}

/**
 * Show the age, preferring the value the API derived from the birth date and
 * falling back to the local calculation when the record has none.
 */
function formatResidentAge(resident) {
    const stored = resident.age;
    const age = (stored !== null && stored !== undefined && stored !== '')
        ? stored
        : calculateAgeFromBirthDate(resident.birth_date);

    return (typeof age === 'number' && !Number.isNaN(age)) ? `${age} years old` : '—';
}

window.viewResident = async function(id) {
    // Show the page straight away so the user sees a loading state instead of
    // whichever record was open before.
    showViewResidentView();

    const fullNameEl = document.getElementById('viewFullName');
    const editBtn = document.getElementById('editFromViewBtn');
    if (fullNameEl) fullNameEl.textContent = 'Loading...';
    if (editBtn) editBtn.disabled = true;

    // The list passes a number while the API returns the id as a string, so
    // compare as text to reuse the already-loaded row when it is available.
    let resident = residentsData.find(r => String(r.id) === String(id));

    if (!resident) {
        try {
            const result = await apiCall(`residents.php?id=${id}`);
            if (result && result.id) resident = result;
        } catch (error) {
            console.error('Error fetching resident:', error);
        }
    }

    if (!resident) {
        if (fullNameEl) fullNameEl.textContent = 'Resident not found';
        showNotification('Unable to load this resident. Please try again.', 'error');
        return;
    }

    currentEditId = id;

    const fullName = `${resident.last_name}, ${resident.first_name} ${resident.middle_name ? resident.middle_name.charAt(0) + '.' : ''}`;
    const addressSummary = [resident.purok, resident.street_name].filter(Boolean).join(' • ') || '—';

    if (fullNameEl) fullNameEl.textContent = fullName;
    document.getElementById('viewPurok').textContent = addressSummary;
    document.getElementById('viewResidentId').textContent = resident.resident_id || '—';
    document.getElementById('viewFirstName').textContent = resident.first_name || '—';
    document.getElementById('viewMiddleName').textContent = resident.middle_name || '—';
    document.getElementById('viewLastName').textContent = resident.last_name || '—';
    document.getElementById('viewGender').textContent = resident.gender || '—';
    document.getElementById('viewAge').textContent = formatResidentAge(resident);
    document.getElementById('viewPurokDetail').textContent = resident.purok || '—';
    document.getElementById('viewVoterStatus').textContent = resident.voter_status || 'Not Registered';
    document.getElementById('viewResidentStatus').textContent = resident.resident_status || 'Active';
    document.getElementById('viewSuffix').textContent = resident.suffix || '—';
    document.getElementById('viewBirthDate').textContent = resident.birth_date ? new Date(resident.birth_date).toLocaleDateString() : '—';
    document.getElementById('viewBirthPlace').textContent = resident.place_of_birth || '—';
    document.getElementById('viewCivilStatus').textContent = resident.civil_status || '—';
    document.getElementById('viewOccupation').textContent = resident.occupation || '—';
    document.getElementById('viewNationality').textContent = resident.nationality || 'Filipino';
    document.getElementById('viewHouseNo').textContent = resident.house_no || '—';
    document.getElementById('viewStreet').textContent = resident.street_name || '—';
    document.getElementById('viewMobile').textContent = resident.mobile_number || '—';
    document.getElementById('viewEmail').textContent = resident.email || '—';
    document.getElementById('viewEmergencyPerson').textContent = resident.emergency_person || '—';
    document.getElementById('viewEmergencyRelation').textContent = resident.emergency_relation || '—';
    document.getElementById('viewEmergencyContact').textContent = resident.emergency_contact || '—';
    
    if (document.getElementById('viewMoveInDate')) {
        document.getElementById('viewMoveInDate').textContent = resident.move_in_date ? new Date(resident.move_in_date).toLocaleDateString() : '—';
    }
    if (document.getElementById('viewLengthOfResidence')) {
        document.getElementById('viewLengthOfResidence').textContent = calculateLengthOfResidence(resident.move_in_date);
    }

    renderViewResidentAvatar(resident);

    const statusBadge = document.getElementById('viewStatusBadge');
    const status = resident.resident_status || 'Active';
    statusBadge.textContent = `${status} Resident`;
    statusBadge.className = `status-badge-large ${status.toLowerCase()}`;

    if (editBtn) editBtn.disabled = false;
};

window.editResident = async function(id) {
    // The row's onclick handler passes a number while the API returns the id as
    // a string, so compare as text. A resident on another page is fetched from
    // the same endpoint the editor itself uses.
    let resident = residentsData.find(r => String(r.id) === String(id));

    if (!resident && !isOfflineMode) {
        try {
            const result = await apiCall(`residents.php?id=${id}`);
            if (result && result.id) resident = result;
        } catch (error) {
            console.error('Error fetching resident for edit:', error);
        }
    }

    if (!resident) {
        showNotification('Unable to load this resident. Please try again.', 'error');
        return;
    }

    showEditConfirmModal(id, resident);
};

window.showArchiveModal = async function(id) {
    // Same id rule as editResident(): compare as text, and fetch the record
    // when it is not on the loaded page so the dialog names the right resident.
    let resident = residentsData.find(r => String(r.id) === String(id));

    if (!resident && !isOfflineMode) {
        try {
            const result = await apiCall(`residents.php?id=${id}`);
            if (result && result.id) resident = result;
        } catch (error) {
            console.error('Error fetching resident:', error);
        }
    }

    if (!resident) {
        showNotification('Unable to load this resident. Please try again.', 'error');
        return;
    }

    if (resident) {
        currentArchiveId = id;
        
        const fullName = `${resident.last_name}, ${resident.first_name}`;
        const archiveName = document.getElementById('archiveResidentName');
        const archiveDetails = document.getElementById('archiveResidentDetails');
        const statusBadge = document.getElementById('archiveResidentStatus');
        
        if (archiveName) archiveName.textContent = fullName;
        if (archiveDetails) archiveDetails.textContent = `${resident.purok || ''} • ${resident.gender || ''} • ${resident.age || ''} yrs`;
        if (statusBadge) {
            statusBadge.textContent = resident.resident_status || 'Active';
            statusBadge.style.background = resident.resident_status === 'Active' ? '#1F8F5F' : 
                                           resident.resident_status === 'Moved' ? '#E3A008' : '#5F7385';
        }
        
        const modal = document.getElementById('archiveModal');
        if (modal) modal.classList.add('active');
    }
};

window.changePage = function(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadResidentsTable();
};

// ============================================
// EXPORT FUNCTIONS
// ============================================

function showExportResidentsView() {
    console.log('Showing Export View');
    
    const listView = document.getElementById('residentsListView');
    const addView = document.getElementById('addResidentView');
    const viewView = document.getElementById('viewResidentView');
    const editView = document.getElementById('editResidentView');
    const exportView = document.getElementById('exportResidentsView');
    
    if (listView) listView.classList.remove('active');
    if (addView) addView.classList.remove('active');
    if (viewView) viewView.classList.remove('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.add('active');
    
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Information System / Residents / Export Data';
    if (pageTitle) pageTitle.textContent = 'Export Residents Data';
    
    loadExportPurokOptions();
    loadRecentExports();
}

function loadExportPurokOptions() {
    const purokSelect = document.getElementById('exportPurokFilter');
    if (!purokSelect) return;
    
    const purokOptions = [
        "Purok 1 - M. Gregorio St.",
        "Purok 2 - F. Javier St.",
        "Purok 3 - G. Santos St.",
        "Purok 4 - Mariano St.",
        "Purok 5 - Crescini Ext."
    ];
    
    purokSelect.innerHTML = '<option value="">All Puroks</option>' + 
        purokOptions.map(p => `<option value="${p}">${p}</option>`).join('');
}

function loadRecentExports() {
    const exports = JSON.parse(localStorage.getItem('residentExports') || '[]');
    const tbody = document.getElementById('recentExportsTableBody');
    if (!tbody) return;
    
    if (exports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">No exports yet. Generate your first export above.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = exports.map(exp => `
        <tr>
            <td><div>${exp.date}</div><div style="font-size: 12px; color: #5F7385;">${exp.time}</div></div>
            <td>${exp.fileName}</div>
            <td>${exp.filters}</div>
            <td>${exp.records}</div>
            <td><span class="format-badge-small ${exp.format}">${exp.format.toUpperCase()}</span></div>
            <td><button class="download-again-btn" onclick="window.downloadExportAgain(${exp.id}, this)">Download Again</button></div>
        </tr>
    `).join('');
}

function saveExportRecord(fileName, filters, records, format, params) {
    const exports = JSON.parse(localStorage.getItem('residentExports') || '[]');
    const now = new Date();
    const newExport = {
        id: Date.now(),
        date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        fileName: fileName,
        filters: filters,
        records: records,
        format: format,
        // Filter values, so "Download Again" can rebuild the same record set.
        params: params || parseExportFilters(filters)
    };
    exports.unshift(newExport);
    if (exports.length > 10) exports.pop();
    localStorage.setItem('residentExports', JSON.stringify(exports));
    loadRecentExports();
}

/**
 * Read filter values back out of an export's display text.
 *
 * Records written before the filter values were stored only carry the text
 * ("Purok: Purok 2 | Status: Active"), so "Download Again" parses it back into
 * values. The format is fixed and produced by generateExport().
 *
 * @param {string} filterText
 * @returns {{purok: string, status: string, voterStatus: string, ageRange: string}}
 */
function parseExportFilters(filterText) {
    const filters = { purok: '', status: '', voterStatus: '', ageRange: '' };

    if (!filterText || filterText === 'All Residents') {
        return filters;
    }

    filterText.split('|').forEach((part) => {
        const match = part.trim().match(/^(Purok|Status|Voter|Age):\s*(.+)$/);

        if (!match) {
            return;
        }

        const value = match[2].trim();

        if (match[1] === 'Purok') filters.purok = value;
        else if (match[1] === 'Status') filters.status = value;
        else if (match[1] === 'Voter') filters.voterStatus = value;
        else filters.ageRange = value;
    });

    return filters;
}

/**
 * Fetch the residents an export covers: same query and same client-side age
 * range rule as the original export, so a re-run returns the same records.
 *
 * @param {{purok?: string, status?: string, voterStatus?: string, ageRange?: string}} filters
 * @returns {Promise<Array>}
 */
async function fetchExportResidents(filters) {
    const params = new URLSearchParams({
        limit: 10000,
        purok: filters.purok || '',
        status: filters.status || ''
    });

    if (filters.voterStatus) {
        params.append('voterStatus', filters.voterStatus);
    }

    const result = await apiCall(`residents.php?${params.toString()}`);
    let residents = (result && result.data) ? result.data : [];

    // Apply age range filter client-side (since API doesn't support age ranges)
    if (filters.ageRange) {
        residents = residents.filter((r) => {
            const age = r.age || calculateAgeFromBirthDate(r.birth_date);

            if (filters.ageRange === '0-17') return age >= 0 && age <= 17;
            if (filters.ageRange === '18-59') return age >= 18 && age <= 59;
            if (filters.ageRange === '60+') return age >= 60;
            return true;
        });
    }

    return residents;
}

async function generateExport() {
    const purok = document.getElementById('exportPurokFilter')?.value || '';
    const status = document.getElementById('exportStatusFilter')?.value || '';
    const voterStatus = document.getElementById('exportVoterFilter')?.value || '';
    const ageRange = document.getElementById('exportAgeFilter')?.value || '';
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'pdf';
    
    const generateBtn = document.getElementById('generateExportBtn');
    if (!generateBtn) return;
    
    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = 'Generating...';
    generateBtn.disabled = true;
    
    try {
        // Fetch all matching residents from the database
        const residents = await fetchExportResidents({ purok, status, voterStatus, ageRange });
        
        if (residents.length === 0) {
            alert('No residents found matching the selected filters.');
            generateBtn.innerHTML = originalText;
            generateBtn.disabled = false;
            return;
        }
        
        const filters = [];
        if (purok) filters.push(`Purok: ${purok.split(' - ')[0]}`);
        if (status) filters.push(`Status: ${status}`);
        if (voterStatus) filters.push(`Voter: ${voterStatus === 'Registered' ? 'Registered' : 'Not Registered'}`);
        if (ageRange) filters.push(`Age: ${ageRange}`);
        const filterText = filters.length ? filters.join(' | ') : 'All Residents';
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const fileName = `Residents_Export_${timestamp}`;
        
        if (format === 'pdf') {
            exportToPDF(residents, fileName, filterText);
        } else if (format === 'excel') {
            exportToExcel(residents, fileName);
        } else if (format === 'csv') {
            exportToCSV(residents, fileName);
        }
        
        saveExportRecord(fileName, filterText, residents.length, format, { purok, status, voterStatus, ageRange });
    } catch (error) {
        console.error('Error generating export:', error);
        alert('Failed to generate export. Please try again.');
    }
    
    generateBtn.innerHTML = originalText;
    generateBtn.disabled = false;
}

function exportToCSV(residents, fileName) {
    const headers = ['Last Name', 'First Name', 'Middle Name', 'Gender', 'Age', 'Purok', 'Street', 'House No', 'Mobile', 'Voter Status', 'Resident Status'];
    const rows = residents.map(r => [
        r.last_name || '',
        r.first_name || '',
        r.middle_name || '',
        r.gender || '',
        r.age || '',
        r.purok || '',
        r.street_name || '',
        r.house_no || '',
        r.mobile_number || '',
        r.voter_status || '',
        r.resident_status || ''
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert(`Exported ${residents.length} residents to CSV successfully!`);
}

function exportToExcel(residents, fileName) {
    let html = `
        <html>
        <head><meta charset="UTF-8"><title>Residents Export</title>
        <style>th{background:#0F6CBD;color:white;padding:8px;}td{padding:6px;border:1px solid #ccc;}table{border-collapse:collapse;width:100%;}</style>
        </head>
        <body>
            <h2>Barangay 49 Akasya - Residents Masterlist</h2>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <p>Total Records: ${residents.length}</p>
            <table border="1">
                <thead><tr><th>Last Name</th><th>First Name</th><th>Middle Name</th><th>Gender</th><th>Age</th><th>Purok</th><th>Street</th><th>House No</th><th>Mobile</th><th>Voter Status</th><th>Resident Status</th></tr></thead>
                <tbody>
    `;
    residents.forEach(r => {
        html += `<tr>
            <td>${escapeHtml(r.last_name || '')}</td>
            <td>${escapeHtml(r.first_name || '')}</td>
            <td>${escapeHtml(r.middle_name || '')}</td>
            <td>${escapeHtml(r.gender || '')}</td>
            <td>${r.age || ''}</td>
            <td>${escapeHtml(r.purok || '')}</td>
            <td>${escapeHtml(r.street_name || '')}</td>
            <td>${escapeHtml(r.house_no || '')}</td>
            <td>${escapeHtml(r.mobile_number || '')}</td>
            <td>${escapeHtml(r.voter_status || '')}</td>
            <td>${escapeHtml(r.resident_status || '')}</td>
        </tr>`;
    });
    html += `</tbody></table></body></html>`;
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `${fileName}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert(`Exported ${residents.length} residents to Excel successfully!`);
}

function exportToPDF(residents, fileName, filterText) {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
        alert('Please allow pop-ups for this page so the masterlist can be printed.');
        return;
    }

    const now = new Date();
    const dateGenerated = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeGenerated = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Applied filters: reuse the text generateExport() already built so the printed
    // report and the Recent Exports entry can never disagree.
    let filtersDisplay = (typeof filterText === 'string' && filterText.trim()) ? filterText.trim() : '';

    if (!filtersDisplay) {
        const purokFilter = document.getElementById('exportPurokFilter')?.value || '';
        const statusFilter = document.getElementById('exportStatusFilter')?.value || '';
        const voterFilter = document.getElementById('exportVoterFilter')?.value || '';
        const ageFilter = document.getElementById('exportAgeFilter')?.value || '';
        const parts = [];

        if (purokFilter) parts.push(`Purok: ${purokFilter.split(' - ')[0]}`);
        if (statusFilter) parts.push(`Status: ${statusFilter}`);
        if (voterFilter) parts.push(`Voter: ${voterFilter}`);
        if (ageFilter) parts.push(`Age: ${ageFilter}`);

        filtersDisplay = parts.length ? parts.join(' | ') : 'All Residents';
    }

    // Name of the signed-in user, from the existing session endpoint (js/session.js).
    const sessionUser = (window.Session && window.Session.user) || null;
    const generatedBy = sessionUser
        ? `${sessionUser.name || sessionUser.username || 'User'}${sessionUser.role ? ` (${sessionUser.role})` : ''}`
        : 'System Administrator (Barangay Secretary)';

    // The barangay seal lives in the project's Images folder; resolve it absolutely
    // because the print window is a blank document.
    const logoUrl = new URL('Images/Brgy.png', window.location.href).href;

    // Row values are built exactly as before (same fields, same fallbacks) so the
    // printed records keep matching the database and the rest of the module.
    const rows = residents.map((r, index) => {
        const fullName = `${r.last_name || ''}, ${r.first_name || ''} ${r.middle_name ? r.middle_name.charAt(0) + '.' : ''}`.trim();
        const address = `${r.purok || ''}, ${r.street_name || ''} ${r.house_no ? 'Blk ' + r.house_no : ''}`.trim();

        return {
            no: index + 1,
            name: escapeHtml(fullName),
            age: escapeHtml(String(r.age || '—')),
            gender: escapeHtml(r.gender || '—'),
            address: escapeHtml(address),
            contact: escapeHtml(r.mobile_number || '—'),
            voter: escapeHtml(r.voter_status || 'Not Registered')
        };
    });

    const styles = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4 portrait; margin: 12mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; font-size: 11px; }
        .page { width: 180mm; margin: 0 auto; page-break-after: always; break-after: page; }
        .page:last-child { page-break-after: auto; break-after: auto; }

        /* ---- Barangay letterhead ---- */
        .letterhead { display: flex; align-items: center; gap: 5mm; }
        .letterhead img.seal { width: 22mm; height: 22mm; object-fit: contain; flex: 0 0 22mm; }
        .letterhead-text { flex: 1; text-align: center; line-height: 1.35; }
        .letterhead-text .line { font-size: 11px; }
        .letterhead-text .barangay { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; margin: 1mm 0; }
        .letterhead-rule { border-top: 2px solid #000; margin-top: 3mm; }

        /* ---- Report title ---- */
        .report-title { text-align: center; font-size: 14px; font-weight: bold; text-decoration: underline;
                        text-transform: uppercase; letter-spacing: 1px; margin: 5mm 0 3mm 0; }

        /* ---- Generated date / user / applied filters ---- */
        .report-meta { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm;
                       font-size: 10px; margin-bottom: 3mm; }
        .report-meta .row { margin-bottom: 1mm; }
        .report-meta .meta-right { text-align: right; max-width: 55%; }
        .meta-label { font-weight: bold; }

        /* ---- Residents table ---- */
        table.masterlist { width: 100%; border-collapse: collapse; table-layout: fixed; }
        table.masterlist th, table.masterlist td { border: 1px solid #000; padding: 3px 4px; font-size: 10px;
                                                   vertical-align: middle; }
        table.masterlist th { background: #E9EDF1; font-weight: bold; text-align: center;
                              text-transform: uppercase; font-size: 9.5px; }
        table.masterlist thead { display: table-header-group; }
        table.masterlist tr { page-break-inside: avoid; break-inside: avoid; }
        td.c-no { text-align: center; }
        td.c-age { text-align: center; }
        td.c-gender { text-align: center; }
        td.c-voter { text-align: center; }
        td.c-contact { white-space: nowrap; }
        td.c-name, td.c-address { overflow-wrap: anywhere; word-wrap: break-word; }

        /* ---- Signatures and page number ---- */
        .signatures { display: flex; justify-content: space-between; gap: 10mm; margin-top: 10mm;
                      page-break-inside: avoid; break-inside: avoid; }
        .signature-block { width: 45%; text-align: center; }
        .signature-space { height: 12mm; }
        .signature-name { border-top: 1px solid #000; padding-top: 1mm; font-weight: bold;
                          text-transform: uppercase; font-size: 11px; }
        .signature-title { font-size: 10px; margin-top: 1mm; }
        .page-number { text-align: right; font-size: 9.5px; margin-top: 5mm; }
    `;

    const letterhead = `
        <div class="letterhead">
            <img class="seal" src="${logoUrl}" alt="Barangay 49 Akasya seal">
            <div class="letterhead-text">
                <div class="line">Republic of the Philippines</div>
                <div class="line">Province of Cavite</div>
                <div class="line">City of Cavite</div>
                <div class="barangay">BARANGAY 49 AKASYA</div>
                <div class="line">Office of the Punong Barangay</div>
            </div>
        </div>
        <div class="letterhead-rule"></div>
    `;

    const reportTitle = `<h1 class="report-title">Masterlist of Residents</h1>`;

    const metaBlock = `
        <div class="report-meta">
            <div class="meta-left">
                <div class="row"><span class="meta-label">Date Generated:</span> ${dateGenerated}, ${timeGenerated}</div>
                <div class="row"><span class="meta-label">Generated By:</span> ${escapeHtml(generatedBy)}</div>
            </div>
            <div class="meta-right">
                <div class="row"><span class="meta-label">Filters Applied:</span> ${escapeHtml(filtersDisplay)}</div>
            </div>
        </div>
    `;

    const columnGroup = `
        <colgroup>
            <col style="width: 6%">
            <col style="width: 24%">
            <col style="width: 6%">
            <col style="width: 10%">
            <col style="width: 28%">
            <col style="width: 13%">
            <col style="width: 13%">
        </colgroup>
    `;

    const tableHead = `
        <thead>
            <tr>
                <th>No.</th>
                <th>Full Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Purok / Address</th>
                <th>Contact No.</th>
                <th>Voter Status</th>
            </tr>
        </thead>
    `;

    const rowHtml = (row) => `
            <tr>
                <td class="c-no">${row.no}</td>
                <td class="c-name">${row.name}</td>
                <td class="c-age">${row.age}</td>
                <td class="c-gender">${row.gender}</td>
                <td class="c-address">${row.address}</td>
                <td class="c-contact">${row.contact}</td>
                <td class="c-voter">${row.voter}</td>
            </tr>`;

    const signatures = `
        <div class="signatures">
            <div class="signature-block">
                <div class="signature-space"></div>
                <div class="signature-name">JUAN DELA CRUZ</div>
                <div class="signature-title">Barangay Secretary</div>
            </div>
            <div class="signature-block">
                <div class="signature-space"></div>
                <div class="signature-name">HON. ROBERTO SANTOS</div>
                <div class="signature-title">Punong Barangay</div>
            </div>
        </div>
    `;

    const pageFooter = (pageNumber, totalPages) => `<div class="page-number">Page ${pageNumber} of ${totalPages}</div>`;

    const buildDocument = (bodyHtml) => `
        <!DOCTYPE html>
        <html>
        <head><title>${escapeHtml(fileName)}</title><meta charset="UTF-8">
        <style>${styles}</style>
        </head>
        <body>${bodyHtml}</body>
        </html>
    `;

    const mmToPx = (mm) => mm * (96 / 25.4);
    const PAGE_CAPACITY = mmToPx(268) * 0.97; // A4 height minus 2 x 12mm margins, with slack

    const waitFor = (predicate, timeoutMs) => new Promise((resolve) => {
        const started = Date.now();

        const tick = () => {
            let done = false;

            try {
                done = !!predicate();
            } catch (error) {
                done = false;
            }

            if (done || Date.now() - started > timeoutMs) {
                resolve(done);
                return;
            }

            setTimeout(tick, 50);
        };

        tick();
    });

    // Pass 2: the rows have been measured, so they can be packed into whole pages.
    const renderPages = () => {
        const doc = printWindow.document;

        const heightOf = (selector) => {
            const el = doc.querySelector(selector);
            return el ? el.getBoundingClientRect().height : 0;
        };

        // Everything a page carries besides its data rows. Reserved on every page so
        // all pages share one capacity and the signature block always has room.
        const fixedHeight = heightOf('.letterhead')
            + heightOf('.letterhead-rule')
            + heightOf('.report-title')
            + heightOf('.report-meta')
            + heightOf('.masterlist thead tr')
            + heightOf('.signatures')
            + heightOf('.page-number');

        const rowHeights = Array.prototype.map.call(
            doc.querySelectorAll('.masterlist tbody tr'),
            (tr) => tr.getBoundingClientRect().height
        );

        const pages = [];
        let cursor = 0;

        do {
            let used = 0;
            const pageRows = [];

            while (cursor < rowHeights.length) {
                const rowHeight = rowHeights[cursor];

                // At least one row per page, and never overflow the capacity.
                if (pageRows.length && used + rowHeight > PAGE_CAPACITY - fixedHeight) {
                    break;
                }

                pageRows.push(rows[cursor]);
                used += rowHeight;
                cursor += 1;
            }

            pages.push(pageRows);
        } while (cursor < rowHeights.length);

        const totalPages = pages.length;

        const body = pages.map((pageRows, index) => `
            <div class="page">
                ${letterhead}
                ${reportTitle}
                ${index === 0 ? metaBlock : ''}
                <table class="masterlist">
                    ${columnGroup}
                    ${tableHead}
                    <tbody>${pageRows.map(rowHtml).join('')}</tbody>
                </table>
                ${index === totalPages - 1 ? signatures : ''}
                ${pageFooter(index + 1, totalPages)}
            </div>
        `).join('');

        doc.open();
        doc.write(buildDocument(body));
        doc.close();

        // Print only once the seal has been fetched, or it would be missing on paper.
        const seal = doc.querySelector('.letterhead img.seal');
        const sealReady = (!seal || seal.complete)
            ? Promise.resolve()
            : new Promise((resolve) => {
                seal.addEventListener('load', resolve);
                seal.addEventListener('error', resolve);
            });

        sealReady.then(() => {
            printWindow.focus();
            printWindow.print();
            alert(`Exported ${residents.length} residents to PDF successfully!`);
        });
    };

    // Pass 1: render every row once, at the printed width, so real row heights can be
    // measured (a name or address that wraps to two lines takes two lines of the page).
    printWindow.document.open();
    printWindow.document.write(buildDocument(`
        <div class="page">
            ${letterhead}
            ${reportTitle}
            ${metaBlock}
            <table class="masterlist" id="measureTable">
                ${columnGroup}
                ${tableHead}
                <tbody>${rows.map(rowHtml).join('')}</tbody>
            </table>
            ${signatures}
            ${pageFooter(1, 1)}
        </div>
    `));
    printWindow.document.close();

    waitFor(() => {
        const doc = printWindow.document;
        const table = doc.getElementById('measureTable');

        return doc.readyState === 'complete'
            && !!table
            && table.tBodies[0].rows.length === rows.length;
    }, 4000).then((measured) => {
        if (!measured) {
            console.error('Masterlist print: the measuring pass did not complete, printing a single page.');
        }

        renderPages();
    });
}

/**
 * Rebuild an export that is already in the Recent Exports list.
 *
 * The generated file is not stored (a PDF is produced through the print window,
 * CSV/Excel through a Blob), so the export is recreated from the filter values
 * saved with the record and handed to the same export function that produced it.
 *
 * @param {number|string} id Record id (the timestamp shown in the list).
 * @param {HTMLElement} [button] The button that was clicked, for a busy state.
 */
window.downloadExportAgain = async function(id, button) {
    const exports = JSON.parse(localStorage.getItem('residentExports') || '[]');
    const record = exports.find((exp) => String(exp.id) === String(id));

    if (!record) {
        showNotification('That export is no longer in the list. Generate a new export instead.', 'error');
        return;
    }

    const originalText = button ? button.textContent : null;

    if (button) {
        button.textContent = 'Preparing...';
        button.disabled = true;
    }

    try {
        const filters = record.params || parseExportFilters(record.filters);
        const residents = await fetchExportResidents(filters);

        if (!residents.length) {
            showNotification('No residents match that export\'s filters any more.', 'error');
            return;
        }

        const format = record.format || 'pdf';
        const fileName = record.fileName || 'Residents_Export';
        const filterText = record.filters || 'All Residents';

        if (format === 'csv') {
            exportToCSV(residents, fileName);
        } else if (format === 'excel') {
            exportToExcel(residents, fileName);
        } else {
            exportToPDF(residents, fileName, filterText);
        }
    } catch (error) {
        console.error('Error preparing export again:', error);
        showNotification('Failed to prepare the export again. Please try again.', 'error');
    } finally {
        if (button) {
            button.textContent = originalText;
            button.disabled = false;
        }
    }
};

// ============================================
// EXPORT EVENT LISTENERS
// ============================================

function setupExportEventListeners() {
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        const newExportBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
        newExportBtn.addEventListener('click', () => showExportResidentsView());
    }
    
    const backFromExportBtn = document.getElementById('backToListFromExportBtn');
    if (backFromExportBtn) {
        const newBackBtn = backFromExportBtn.cloneNode(true);
        backFromExportBtn.parentNode.replaceChild(newBackBtn, backFromExportBtn);
        newBackBtn.addEventListener('click', () => showResidentsListView());
    }
    
    const generateBtn = document.getElementById('generateExportBtn');
    if (generateBtn) {
        const newGenerateBtn = generateBtn.cloneNode(true);
        generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);
        newGenerateBtn.addEventListener('click', () => generateExport());
    }
}

// ============================================
// EVENT LISTENERS SETUP
// ============================================
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        let searchTimeout;
        newSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentFilters.search = e.target.value.toLowerCase();
                currentPage = 1;
                loadResidentsTable();
            }, 300);
        });
    }
    
    const purokFilter = document.getElementById('purokFilter');
    if (purokFilter) {
        const newPurokFilter = purokFilter.cloneNode(true);
        purokFilter.parentNode.replaceChild(newPurokFilter, purokFilter);
        newPurokFilter.addEventListener('change', (e) => {
            currentFilters.purok = e.target.value;
            currentPage = 1;
            loadResidentsTable();
        });
    }
    
    const genderFilter = document.getElementById('genderFilter');
    if (genderFilter) {
        const newGenderFilter = genderFilter.cloneNode(true);
        genderFilter.parentNode.replaceChild(newGenderFilter, genderFilter);
        newGenderFilter.addEventListener('change', (e) => {
            currentFilters.gender = e.target.value;
            currentPage = 1;
            loadResidentsTable();
        });
    }
    
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        const newStatusFilter = statusFilter.cloneNode(true);
        statusFilter.parentNode.replaceChild(newStatusFilter, statusFilter);
        newStatusFilter.addEventListener('change', (e) => {
            currentFilters.status = e.target.value;
            currentPage = 1;
            loadResidentsTable();
        });
    }
    
    const addBtn = document.getElementById('addResidentBtn');
    if (addBtn) {
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', () => showAddResidentView());
    }
}

function setupFormEventListeners() {
    const backBtn = document.getElementById('backToListBtn');
    if (backBtn) {
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.addEventListener('click', () => showResidentsListView());
    }
    
    const cancelBtn = document.getElementById('cancelAddBtn');
    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', () => showResidentsListView());
    }
    
    const saveBtn = document.getElementById('saveResidentBtn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', () => saveNewResident());
    }
    
    const backToListFromViewBtn = document.getElementById('backToListFromViewBtn');
    if (backToListFromViewBtn) {
        const newBackBtn = backToListFromViewBtn.cloneNode(true);
        backToListFromViewBtn.parentNode.replaceChild(newBackBtn, backToListFromViewBtn);
        newBackBtn.addEventListener('click', () => showResidentsListView());
    }
    
    const editFromViewBtn = document.getElementById('editFromViewBtn');
    if (editFromViewBtn) {
        const newEditBtn = editFromViewBtn.cloneNode(true);
        editFromViewBtn.parentNode.replaceChild(newEditBtn, editFromViewBtn);
        newEditBtn.addEventListener('click', () => {
            if (currentEditId) {
                showEditResidentView(currentEditId);
            }
        });
    }
    
    const backToListFromEditBtn = document.getElementById('backToListFromEditBtn');
    if (backToListFromEditBtn) {
        const newBackBtn = backToListFromEditBtn.cloneNode(true);
        backToListFromEditBtn.parentNode.replaceChild(newBackBtn, backToListFromEditBtn);
        newBackBtn.addEventListener('click', () => showResidentsListView());
    }
    
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        const newCancelBtn = cancelEditBtn.cloneNode(true);
        cancelEditBtn.parentNode.replaceChild(newCancelBtn, cancelEditBtn);
        newCancelBtn.addEventListener('click', () => showResidentsListView());
    }
    
    const saveEditBtn = document.getElementById('saveEditBtn');
    if (saveEditBtn) {
        const newSaveBtn = saveEditBtn.cloneNode(true);
        saveEditBtn.parentNode.replaceChild(newSaveBtn, saveEditBtn);
        newSaveBtn.addEventListener('click', () => saveEditResident());
    }
    
    const birthDateInput = document.getElementById('birthDate');
    const ageInput = document.getElementById('age');
    if (birthDateInput && ageInput) {
        const newBirthDate = birthDateInput.cloneNode(true);
        birthDateInput.parentNode.replaceChild(newBirthDate, birthDateInput);
        newBirthDate.addEventListener('change', function() {
            if (this.value) {
                const age = calculateAge(this.value);
                ageInput.value = age;
            } else {
                ageInput.value = '';
            }
        });
    }
    
    const editBirthDate = document.getElementById('editBirthDate');
    const editAge = document.getElementById('editAge');
    if (editBirthDate && editAge) {
        const newEditBirthDate = editBirthDate.cloneNode(true);
        editBirthDate.parentNode.replaceChild(newEditBirthDate, editBirthDate);
        newEditBirthDate.addEventListener('change', function() {
            if (this.value) {
                const age = calculateAge(this.value);
                editAge.value = `${age} years old`;
            } else {
                editAge.value = '';
            }
        });
    }
    
    const moveInDateInput = document.getElementById('moveInDate');
    const lengthOfResidenceInput = document.getElementById('lengthOfResidence');
    if (moveInDateInput && lengthOfResidenceInput) {
        const newMoveInDate = moveInDateInput.cloneNode(true);
        moveInDateInput.parentNode.replaceChild(newMoveInDate, moveInDateInput);
        newMoveInDate.addEventListener('change', function() {
            lengthOfResidenceInput.value = calculateLengthOfResidence(this.value);
        });
    }
    
    const editMoveInDate = document.getElementById('editMoveInDate');
    const editLengthOfResidence = document.getElementById('editLengthOfResidence');
    if (editMoveInDate && editLengthOfResidence) {
        const newEditMoveInDate = editMoveInDate.cloneNode(true);
        editMoveInDate.parentNode.replaceChild(newEditMoveInDate, editMoveInDate);
        newEditMoveInDate.addEventListener('change', function() {
            editLengthOfResidence.value = calculateLengthOfResidence(this.value);
        });
    }

    const chooseFileBtn = document.getElementById('chooseFileBtn');
    const photoUpload = document.getElementById('photoUpload');
    if (chooseFileBtn && photoUpload) {
        const newChooseFileBtn = chooseFileBtn.cloneNode(true);
        chooseFileBtn.parentNode.replaceChild(newChooseFileBtn, chooseFileBtn);

        const newPhotoUpload = photoUpload.cloneNode(true);
        photoUpload.parentNode.replaceChild(newPhotoUpload, photoUpload);

        // The button has to open the input that is actually in the DOM. photoUpload
        // is detached by the replaceChild above, and clicking a detached file
        // input never opens the picker.
        newChooseFileBtn.addEventListener('click', () => newPhotoUpload.click());

        newPhotoUpload.addEventListener('change', function(e) {
            const fileNameSpan = document.getElementById('fileName');
            const file = this.files && this.files[0];

            if (!file) {
                newResidentPhotoBase64 = null;
                if (fileNameSpan) fileNameSpan.textContent = 'No file chosen';
                renderNewResidentPhotoPreview(null);
                return;
            }

            readResidentPhoto(file).then(function (dataUrl) {
                if (!dataUrl) {
                    // Rejected: clear the control so an invalid file cannot be submitted.
                    newResidentPhotoBase64 = null;
                    e.target.value = '';
                    if (fileNameSpan) fileNameSpan.textContent = 'No file chosen';
                    renderNewResidentPhotoPreview(null);
                    return;
                }

                if (fileNameSpan) fileNameSpan.textContent = file.name;
                newResidentPhotoBase64 = dataUrl;
                renderNewResidentPhotoPreview(dataUrl);
            });
        });
    }
    
    const replacePhotoBtn = document.getElementById('replacePhotoBtn');
    const editPhotoUpload = document.getElementById('editPhotoUpload');
    if (replacePhotoBtn && editPhotoUpload) {
        const newReplaceBtn = replacePhotoBtn.cloneNode(true);
        replacePhotoBtn.parentNode.replaceChild(newReplaceBtn, replacePhotoBtn);

        // The file input is a sibling of the button. Re-bind it so an inline
        // handler added elsewhere cannot be lost when the markup is re-rendered.
        const newEditPhotoUpload = editPhotoUpload.cloneNode(true);
        editPhotoUpload.parentNode.replaceChild(newEditPhotoUpload, editPhotoUpload);

        // Open the input that is actually in the DOM, not the detached original.
        newReplaceBtn.addEventListener('click', () => newEditPhotoUpload.click());

        newEditPhotoUpload.addEventListener('change', function (e) {
            const file = this.files && this.files[0];

            if (!file) {
                editResidentPhotoBase64 = null;
                renderEditResidentPhotoPreview(null);
                return;
            }

            readResidentPhoto(file).then(function (dataUrl) {
                if (!dataUrl) {
                    // Rejected: clear the control so an invalid file cannot be submitted.
                    editResidentPhotoBase64 = null;
                    e.target.value = '';
                    renderEditResidentPhotoPreview(null);
                    return;
                }

                editResidentPhotoBase64 = dataUrl;
                renderEditResidentPhotoPreview(dataUrl);
            });
        });
    }

    // Phone fields: digits only, capped at 11, applied as the user types.
    ['mobile', 'emergencyContact', 'editMobile', 'editEmergencyContact'].forEach(function (fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        const newField = field.cloneNode(true);
        field.parentNode.replaceChild(newField, field);

        newField.addEventListener('input', function () {
            const sanitised = sanitizePhoneNumber(this.value);
            if (sanitised !== this.value) {
                this.value = sanitised;
            }
        });

        newField.addEventListener('paste', function (e) {
            const pasted = (e.clipboardData || window.clipboardData).getData('text');
            const sanitised = sanitizePhoneNumber(pasted);
            if (sanitised !== pasted) {
                e.preventDefault();
                const start = this.selectionStart || 0;
                this.value = sanitizePhoneNumber(this.value.slice(0, start) + sanitised + this.value.slice(this.selectionEnd || start));
            }
        });
    });
}

/**
 * Show the chosen photo inside the Register form placeholder.
 */
function renderNewResidentPhotoPreview(dataUrl) {
    const placeholder = document.getElementById('photoPlaceholder');
    if (!placeholder) return;

    if (!dataUrl) {
        placeholder.innerHTML = '\n' +
            '            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">\n' +
            '                <path d="M4 4H20V20H4V4Z" stroke="#5F7385" stroke-width="2"/>\n' +
            '                <circle cx="12" cy="12" r="3" stroke="#5F7385" stroke-width="2"/>\n' +
            '                <path d="M16 8L18 10" stroke="#5F7385" stroke-width="2" stroke-linecap="round"/>\n' +
            '            </svg>\n' +
            '            <span>Upload Photo</span>\n';
        return;
    }

    placeholder.innerHTML = '<img src="' + dataUrl + '" alt="Resident photo preview" ' +
        'style="width:100%;height:100%;object-fit:cover;border-radius:6px;">';
}

/**
 * Show the chosen (or stored) photo as the avatar on the Edit Resident form.
 * Passing null restores the placeholder image.
 */
function renderEditResidentPhotoPreview(dataUrl) {
    const avatar = document.getElementById('editAvatar');
    if (!avatar) return;

    if (!dataUrl) {
        // Local asset: the system runs on localhost only, so an external
        // placeholder service would render as a broken image when offline.
        avatar.src = DEFAULT_RESIDENT_AVATAR;
        return;
    }

    avatar.src = dataUrl;
}

function setupModalEventListeners() {
    // Archive modal listeners
    const cancelBtn = document.getElementById('cancelArchiveBtn');
    const confirmBtn = document.getElementById('confirmArchiveBtn');
    const modal = document.getElementById('archiveModal');
    
    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', closeArchiveModal);
    }
    
    if (confirmBtn) {
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', confirmArchive);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeArchiveModal();
        });
    }
    
    // ========== EDIT CONFIRMATION MODAL LISTENERS ==========
    const cancelEditConfirmBtn = document.getElementById('cancelEditConfirmBtn');
    const confirmEditBtn = document.getElementById('confirmEditBtn');
    const editConfirmModal = document.getElementById('editConfirmModal');
    
    if (cancelEditConfirmBtn) {
        const newCancelBtn = cancelEditConfirmBtn.cloneNode(true);
        cancelEditConfirmBtn.parentNode.replaceChild(newCancelBtn, cancelEditConfirmBtn);
        newCancelBtn.addEventListener('click', closeEditConfirmModal);
    }
    
    if (confirmEditBtn) {
        const newConfirmBtn = confirmEditBtn.cloneNode(true);
        confirmEditBtn.parentNode.replaceChild(newConfirmBtn, confirmEditBtn);
        newConfirmBtn.addEventListener('click', proceedWithEdit);
    }
    
    if (editConfirmModal) {
        editConfirmModal.addEventListener('click', (e) => {
            if (e.target === editConfirmModal) closeEditConfirmModal();
        });
    }
}

// ============================================
// EXPORT MODULE INITIALIZATION (REMOVED AUTO-INIT)
// ============================================

// Make init function globally available
window.initResidentsModule = initResidentsModule;
window.showAddResidentView = showAddResidentView;

// Listen for module loaded event (optional - for debugging)
document.addEventListener('moduleLoaded', function(e) {
    if (e.detail && e.detail.module === 'residents') {
        console.log('Residents module content loaded, but initialization handled by router.js');
    }
});

console.log('Residents.js loaded, waiting for router.js to call initResidentsModule()');

})();
