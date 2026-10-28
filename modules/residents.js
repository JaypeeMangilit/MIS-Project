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
        // Query database for statistics
        const result = await apiCall('residents.php?limit=10000');
        
        if (result.success !== false && result.data && !result.offline) {
            const residents = result.data;
            const voters = residents.filter(r => r.voter_status === 'Registered').length;
            const seniors = residents.filter(r => {
                const age = r.age || calculateAgeFromBirthDate(r.birth_date);
                return age >= 60;
            }).length;
            const minors = residents.filter(r => {
                const age = r.age || calculateAgeFromBirthDate(r.birth_date);
                return age >= 0 && age <= 17;
            }).length;
            updateStatsCards(voters, seniors, minors);
        } else {
            updateStatsCards(0, 0, 0);
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
        updateStatsCards(0, 0, 0);
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
            editSelectors: ['[data-action="edit"]', '#editFromViewBtn'],
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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">No residents found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = residents.map(resident => {
        const fullName = `${resident.last_name || ''}, ${resident.first_name || ''} ${resident.middle_name ? resident.middle_name.charAt(0) + '.' : ''}`.trim();
        const age = resident.age || calculateAgeFromBirthDate(resident.birth_date);
        
        return `
        <tr>
            <td>
                <div class="resident-info">
                    <div class="resident-avatar">
                        <div class="avatar-placeholder">${(resident.first_name?.charAt(0) || '')}${(resident.last_name?.charAt(0) || '')}</div>
                    </div>
                    <div class="resident-name">${escapeHtml(fullName)}</div>
                </div>
            </div>
            <td>${resident.gender || '—'}, ${age} yrs</div>
            <td>${escapeHtml(resident.purok || '—')}</div>
            <td>${resident.voter_status || 'Not Registered'}</div>
            <td>
                <span class="status-badge ${(resident.resident_status || 'active').toLowerCase()}">
                    ${resident.resident_status || 'Active'}
                </span>
            </div>
            <td>
                <div class="action-buttons-cell">
                    <div class="action-icon" onclick="window.viewResident(${resident.id})">
                        <img src="Images/View_Icon.svg" alt="View" style="width: 16px; height: 16px;">
                    </div>
                    <div class="action-icon" onclick="window.editResident(${resident.id})">
                        <img src="Images/Edit_Icon.svg" alt="Edit" style="width: 16px; height: 16px;">
                    </div>
                    <div class="action-icon archive" onclick="window.showArchiveModal(${resident.id})">
                        <img src="Images/Archives_Icon.svg" alt="Archive" style="width: 16px; height: 16px;">
                    </div>
                </div>
            </div>
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
    if (!moveInDate) return '—';
    const today = new Date();
    const start = new Date(moveInDate);
    if (isNaN(start.getTime()) || start > today) return '—';
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
    if (years < 0 || (years === 0 && months === 0 && days === 0)) return '—';
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
    let resident = residentsData.find(r => r.id === id);
    
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
        document.getElementById('editMoveInDate').value = resident.move_in_date || '';
        document.getElementById('editLengthOfResidence').value = resident.move_in_date ? calculateLengthOfResidence(resident.move_in_date) : '—';
        
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

function showEditConfirmModal(residentId) {
    let resident = residentsData.find(r => r.id === residentId);
    
    if (!resident && !isOfflineMode) {
        resident = SAMPLE_RESIDENTS.find(r => r.id === residentId);
    }
    
    if (resident) {
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
    if (pendingEditId) {
        closeEditConfirmModal();
        showEditResidentView(pendingEditId);
    }
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
    const mobileNumber = sanitizePhoneNumber(document.getElementById('mobile')?.value || '');
    const emergencyContact = sanitizePhoneNumber(document.getElementById('emergencyContact')?.value || '');

    const moveInDate = document.getElementById('moveInDate')?.value || '';
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

    if (!formData.first_name || !formData.last_name || !formData.birth_date || !formData.gender ||
        !formData.civil_status || !formData.purok || !formData.street_name ||
        !formData.house_no || !formData.mobile_number) {
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
    const mobileNumber = sanitizePhoneNumber(document.getElementById('editMobile')?.value || '');
    const emergencyContact = sanitizePhoneNumber(document.getElementById('editEmergencyContact')?.value || '');

    const editMoveInDate = document.getElementById('editMoveInDate')?.value || '';
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
        move_in_date: editMoveInDate || null,
        photo_base64: editResidentPhotoBase64 || '',
        voter_status: document.getElementById('editVoterStatus')?.value || 'Not Registered',
        resident_status: document.getElementById('editResidentStatus')?.value || 'Active'
    };

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
            showNotification('Failed to update resident. Please try again.', 'error');
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
                    showNotification('Failed to archive resident. Please try again.', 'error');
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
window.viewResident = async function(id) {
    let resident = residentsData.find(r => r.id === id);
    
    if (!resident) {
        try {
            const result = await apiCall(`residents.php?id=${id}`);
            if (result && result.id) resident = result;
        } catch (error) {
            console.error('Error fetching resident:', error);
        }
    }
    
    if (resident) {
        currentEditId = id;
        
        const fullName = `${resident.last_name}, ${resident.first_name} ${resident.middle_name ? resident.middle_name.charAt(0) + '.' : ''}`;
        
        document.getElementById('viewFullName').textContent = fullName;
        const viewAvatar = document.getElementById('viewAvatar');
        if (viewAvatar) {
            viewAvatar.src = resident.profile_image || 'https://placehold.co/96x96';
        }
        document.getElementById('viewPurok').textContent = resident.purok || '—';
        document.getElementById('viewFirstName').textContent = resident.first_name || '—';
        document.getElementById('viewMiddleName').textContent = resident.middle_name || '—';
        document.getElementById('viewLastName').textContent = resident.last_name || '—';
        document.getElementById('viewGender').textContent = resident.gender || '—';
        document.getElementById('viewAge').textContent = `${resident.age || calculateAgeFromBirthDate(resident.birth_date)} years old`;
        document.getElementById('viewPurokDetail').textContent = resident.purok || '—';
        document.getElementById('viewVoterStatus').textContent = resident.voter_status || 'Not Registered';
        document.getElementById('viewResidentStatus').textContent = resident.resident_status || 'Active';
        document.getElementById('viewSuffix').textContent = resident.suffix || '—';
        document.getElementById('viewBirthDate').textContent = resident.birth_date ? new Date(resident.birth_date).toLocaleDateString() : '—';
        document.getElementById('viewBirthPlace').textContent = resident.place_of_birth || '—';
        document.getElementById('viewLengthOfResidence').textContent = resident.move_in_date ? calculateLengthOfResidence(resident.move_in_date) : 'Not provided';
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
        
        const statusBadge = document.getElementById('viewStatusBadge');
        const status = resident.resident_status || 'Active';
        statusBadge.textContent = `${status} Resident`;
        statusBadge.className = `status-badge-large ${status.toLowerCase()}`;
        
        showViewResidentView();
    }
};

window.editResident = function(id) {
    showEditConfirmModal(id);
};

window.showArchiveModal = function(id) {
    let resident = residentsData.find(r => r.id === id);
    
    if (!resident) {
        // Try to find in all loaded data or fetch
        resident = { id: id, first_name: 'Unknown', last_name: 'Resident' };
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
            <td><button class="download-again-btn" onclick="window.downloadExportAgain(${exp.id})">Download Again</button></div>
        </tr>
    `).join('');
}

function saveExportRecord(fileName, filters, records, format) {
    const exports = JSON.parse(localStorage.getItem('residentExports') || '[]');
    const now = new Date();
    const newExport = {
        id: Date.now(),
        date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        fileName: fileName,
        filters: filters,
        records: records,
        format: format
    };
    exports.unshift(newExport);
    if (exports.length > 10) exports.pop();
    localStorage.setItem('residentExports', JSON.stringify(exports));
    loadRecentExports();
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
        const params = new URLSearchParams({ limit: 10000, purok, status });
        if (voterStatus) params.append('voterStatus', voterStatus);
        
        const result = await apiCall(`residents.php?${params.toString()}`);
        let residents = (result && result.data) ? result.data : [];
        
        // Apply age range filter client-side (since API doesn't support age ranges)
        if (ageRange) {
            residents = residents.filter(r => {
                const age = r.age || calculateAgeFromBirthDate(r.birth_date);
                if (ageRange === '0-17') return age >= 0 && age <= 17;
                if (ageRange === '18-59') return age >= 18 && age <= 59;
                if (ageRange === '60+') return age >= 60;
                return true;
            });
        }
        
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
            exportToPDF(residents, fileName);
        } else if (format === 'excel') {
            exportToExcel(residents, fileName);
        } else if (format === 'csv') {
            exportToCSV(residents, fileName);
        }
        
        saveExportRecord(fileName, filterText, residents.length, format);
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

function exportToPDF(residents, fileName) {
    const printWindow = window.open('', '_blank');
    
    const now = new Date();
    const dateGenerated = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeGenerated = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    const purokFilter = document.getElementById('exportPurokFilter')?.value || 'All';
    const statusFilter = document.getElementById('exportStatusFilter')?.value || 'All';
    const purokDisplay = purokFilter === 'All' ? 'All' : purokFilter.split(' - ')[0];
    const statusDisplay = statusFilter === 'All' ? 'All' : statusFilter;
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head><title>${fileName}</title><meta charset="UTF-8">
        <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:'Arial',sans-serif;padding:40px;background:white;font-size:12px;}
            .header{text-align:center;margin-bottom:30px;border-bottom:2px solid #16324A;padding-bottom:20px;}
            .header h1{color:#16324A;font-size:22px;margin-bottom:8px;text-transform:uppercase;}
            .header h2{color:#5F7385;font-size:16px;font-weight:normal;}
            .info-section{margin-bottom:25px;padding:15px;background:#F4F8FB;border-radius:5px;}
            .info-row{margin-bottom:8px;}
            .info-label{font-weight:bold;color:#16324A;width:120px;display:inline-block;}
            .info-value{color:#333;}
            .filters-applied{margin-top:10px;padding-top:10px;border-top:1px solid #D6E2EA;}
            .filters-title{font-weight:bold;color:#16324A;margin-bottom:5px;}
            table{width:100%;border-collapse:collapse;margin-top:20px;font-size:11px;}
            th{background:#0F6CBD;color:white;padding:10px 8px;text-align:left;font-weight:bold;border:1px solid #0F6CBD;}
            td{padding:8px;border:1px solid #D6E2EA;color:#16324A;}
            .footer{margin-top:30px;padding-top:20px;border-top:1px solid #D6E2EA;font-size:11px;color:#666;}
            .signatures{margin-top:40px;display:flex;justify-content:space-between;}
            .signature-line{text-align:center;width:45%;}
            .signature-name{font-weight:bold;margin-top:40px;padding-top:10px;border-top:1px solid #333;display:inline-block;width:200px;}
            .signature-title{font-size:11px;color:#666;margin-top:5px;}
            .page-number{text-align:center;font-size:10px;color:#999;margin-top:20px;}
            @media print{body{padding:20px;}th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
        </style>
        </head>
        <body>
            <div class="header"><h1>MASTERLIST OF RESIDENTS</h1><h2>Barangay 49 Akasya, Cavite City</h2></div>
            <div class="info-section">
                <div class="info-row"><span class="info-label">Date Generated:</span><span class="info-value">${dateGenerated}, ${timeGenerated}</span></div>
                <div class="info-row"><span class="info-label">Generated By:</span><span class="info-value">System Administrator (Barangay Secretary)</span></div>
                <div class="filters-applied"><div class="filters-title">Filters Applied:</div>
                <div class="info-row"><span class="info-label">Purok:</span><span class="info-value">${purokDisplay}</span><span class="info-label" style="margin-left:20px;">Status:</span><span class="info-value">${statusDisplay}</span></div></div>
            </div>
            <table><thead><tr><th>NO.</th><th>FULL NAME</th><th>AGE</th><th>GENDER</th><th>PUROK / ADDRESS</th><th>CONTACT NO.</th><th>VOTER STATUS</th></tr></thead><tbody>
    `;
    
    residents.forEach((r, index) => {
        const fullName = `${r.last_name || ''}, ${r.first_name || ''} ${r.middle_name ? r.middle_name.charAt(0) + '.' : ''}`.trim();
        const address = `${r.purok || ''}, ${r.street_name || ''} ${r.house_no ? 'Blk ' + r.house_no : ''}`.trim();
        const contactNo = r.mobile_number || '—';
        const voterStatus = r.voter_status || 'Not Registered';
        
        html += `<tr>
            <td>${index + 1}</div>
            <td>${escapeHtml(fullName)}</div>
            <td>${r.age || '—'}</div>
            <td>${r.gender || '—'}</div>
            <td>${escapeHtml(address)}</div>
            <td>${escapeHtml(contactNo)}</div>
            <td>${voterStatus}</div>
        </tr>`;
    });
    
    html += `</tbody></table><div class="footer"><div class="signatures"><div class="signature-line"><div class="signature-name">JUAN DELA CRUZ</div><div class="signature-title">Barangay Secretary</div></div><div class="signature-line"><div class="signature-name">HON. ROBERTO SANTOS</div><div class="signature-title">Punong Barangay</div></div></div><div class="page-number">Page 1 of 1</div></div></body></html>`;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
    alert(`Exported ${residents.length} residents to PDF successfully!`);
}

window.downloadExportAgain = function(id) {
    alert('Download functionality: The original export file would be downloaded again.');
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
        newSearchInput.addEventListener('input', (e) => {
            currentFilters.search = e.target.value.toLowerCase();
            currentPage = 1;
            loadResidentsTable();
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
    
    const printIdBtn = document.getElementById('printIdBtn');
    if (printIdBtn) {
        const newPrintBtn = printIdBtn.cloneNode(true);
        printIdBtn.parentNode.replaceChild(newPrintBtn, printIdBtn);
        newPrintBtn.addEventListener('click', () => {
            showNotification('Print ID functionality coming soon', 'info');
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
    
    const moveInDateInput = document.getElementById('moveInDate');
    const lengthOfResidenceInput = document.getElementById('lengthOfResidence');
    if (moveInDateInput && lengthOfResidenceInput) {
        const newMoveInDate = moveInDateInput.cloneNode(true);
        moveInDateInput.parentNode.replaceChild(newMoveInDate, moveInDateInput);
        newMoveInDate.addEventListener('change', function() {
            if (this.value) {
                lengthOfResidenceInput.value = calculateLengthOfResidence(this.value);
            } else {
                lengthOfResidenceInput.value = '';
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

    const editMoveInDate = document.getElementById('editMoveInDate');
    const editLengthOfResidence = document.getElementById('editLengthOfResidence');
    if (editMoveInDate && editLengthOfResidence) {
        const newEditMoveInDate = editMoveInDate.cloneNode(true);
        editMoveInDate.parentNode.replaceChild(newEditMoveInDate, editMoveInDate);
        newEditMoveInDate.addEventListener('change', function() {
            if (this.value) {
                editLengthOfResidence.value = calculateLengthOfResidence(this.value);
            } else {
                editLengthOfResidence.value = '';
            }
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
        avatar.src = 'https://placehold.co/88x88';
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

// Listen for module loaded event (optional - for debugging)
document.addEventListener('moduleLoaded', function(e) {
    if (e.detail && e.detail.module === 'residents') {
        console.log('Residents module content loaded, but initialization handled by router.js');
    }
});

console.log('Residents.js loaded, waiting for router.js to call initResidentsModule()');