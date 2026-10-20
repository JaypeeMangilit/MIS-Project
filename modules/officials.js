// officials.js - Updated with new Add Official view

// Officials Data
let officialsData = [
    { id: 1, name: "Hon. Roberto Santos", position: "Punong Barangay", term: "2023 - 2026", contact: "0917-123-4567", email: "rsantos@brgy49.gov.ph", status: "Active", avatar: "RS" },
    { id: 2, name: "Hon. Maria Cruz", position: "Barangay Kagawad", term: "2023 - 2026", contact: "0918-234-5678", email: "mcruz@brgy49.gov.ph", status: "Active", avatar: "MC" },
    { id: 3, name: "Hon. Jose Reyes", position: "Barangay Kagawad", term: "2023 - 2026", contact: "0919-345-6789", email: "jreyes@brgy49.gov.ph", status: "Active", avatar: "JR" },
    { id: 4, name: "Hon. Anna Bautista", position: "Barangay Kagawad", term: "2023 - 2026", contact: "0920-456-7890", email: "abautista@brgy49.gov.ph", status: "Active", avatar: "AB" },
    { id: 5, name: "Hon. Mark Villanueva", position: "SK Chairman", term: "2023 - 2026", contact: "0921-567-8901", email: "mvillanueva@brgy49.gov.ph", status: "Active", avatar: "MV" },
    { id: 6, name: "Elena Valdez", position: "Barangay Secretary", term: "Appointed: 2023", contact: "0922-678-9012", email: "sec.valdez@brgy49.gov.ph", status: "Active", avatar: "EV" },
    { id: 7, name: "Ricardo Gomez", position: "Barangay Treasurer", term: "Appointed: 2023", contact: "0923-789-0123", email: "treas.gomez@brgy49.gov.ph", status: "Active", avatar: "RG" }
];

let currentFilters = {
    search: '',
    term: ''
};

let currentView = 'list'; // 'list' or 'add'
let nextId = 8;

// Main initialization function
function initOfficialsModule() {
    console.log('Initializing Officials Module...');
    
    currentView = 'list';
    currentFilters = {
        search: '',
        term: ''
    };
    
    loadOfficialsGrid();
    setupEventListeners();
    setupFormEventListeners();
}

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        newSearchInput.addEventListener('input', (e) => {
            currentFilters.search = e.target.value.toLowerCase();
            loadOfficialsGrid();
        });
    }
    
    // Filter button
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        const newFilterBtn = filterBtn.cloneNode(true);
        filterBtn.parentNode.replaceChild(newFilterBtn, filterBtn);
        newFilterBtn.addEventListener('click', () => {
            showNotification('Filter functionality will be implemented', 'info');
        });
    }
    
    // Add official button - shows the add official view
    const addBtn = document.getElementById('addOfficialBtn');
    if (addBtn) {
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', () => showAddOfficialView());
    }
}

function setupFormEventListeners() {
    // Back button
    const backBtn = document.getElementById('backToListBtn');
    if (backBtn) {
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.addEventListener('click', () => showListView());
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('cancelAddBtn');
    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', () => showListView());
    }
    
    // Save button
    const saveBtn = document.getElementById('saveOfficialBtn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', () => saveOfficial());
    }
    
    // Status option buttons (new design uses .status-option-new)
    const statusOptions = document.querySelectorAll('.status-option-new');
    if (statusOptions.length > 0) {
        statusOptions.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                statusOptions.forEach(b => b.classList.remove('active'));
                newBtn.classList.add('active');
                const status = newBtn.getAttribute('data-status');
                document.getElementById('officialStatus').value = status;
            });
        });
    } else {
        // Fallback to old class
        const oldStatusOptions = document.querySelectorAll('.status-option');
        oldStatusOptions.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                oldStatusOptions.forEach(b => b.classList.remove('active'));
                newBtn.classList.add('active');
                const status = newBtn.getAttribute('data-status');
                document.getElementById('officialStatus').value = status;
            });
        });
    }
    
    // Photo upload
    const uploadBtn = document.getElementById('uploadPhotoBtn');
    const photoUpload = document.getElementById('photoUpload');
    const photoPlaceholder = document.getElementById('photoPlaceholder');
    
    if (uploadBtn && photoUpload) {
        const newUploadBtn = uploadBtn.cloneNode(true);
        uploadBtn.parentNode.replaceChild(newUploadBtn, uploadBtn);
        
        newUploadBtn.addEventListener('click', () => {
            const uploadInput = document.getElementById('photoUpload');
            if (uploadInput) uploadInput.click();
        });
        
        const newPhotoUpload = photoUpload.cloneNode(true);
        photoUpload.parentNode.replaceChild(newPhotoUpload, photoUpload);
        
        newPhotoUpload.addEventListener('change', function(e) {
            const photoPlaceholderDiv = document.getElementById('photoPlaceholder');
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    if (photoPlaceholderDiv) {
                        photoPlaceholderDiv.innerHTML = `<img src="${event.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    }
                };
                reader.readAsDataURL(this.files[0]);
            } else {
                if (photoPlaceholderDiv) {
                    photoPlaceholderDiv.innerHTML = `
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                            <circle cx="16" cy="16" r="12" stroke="#5F7385" stroke-width="2"/>
                            <path d="M16 12V20M12 16H20" stroke="#5F7385" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    `;
                }
            }
        });
    }
}

function showListView() {
    currentView = 'list';
    const listView = document.getElementById('officialsListView');
    const addView = document.getElementById('addOfficialView');
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    
    if (listView) listView.classList.add('active');
    if (addView) addView.classList.remove('active');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Officials';
    if (pageTitle) pageTitle.textContent = 'Barangay Officials';
    
    loadOfficialsGrid();
}

function showAddOfficialView() {
    currentView = 'add';
    const listView = document.getElementById('officialsListView');
    const addView = document.getElementById('addOfficialView');
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    
    if (listView) listView.classList.remove('active');
    if (addView) addView.classList.add('active');
    if (breadcrumb) breadcrumb.innerHTML = 'Barangay Officials / Add New Official';
    if (pageTitle) pageTitle.textContent = 'Add New Official';
    
    resetForm();
}

function resetForm() {
    // Clear all form inputs
    const formInputs = document.querySelectorAll('#addOfficialView input, #addOfficialView select');
    formInputs.forEach(input => {
        if (input.type !== 'file') {
            input.value = '';
        }
    });
    
    // Reset status to Active
    const statusOptions = document.querySelectorAll('.status-option-new');
    if (statusOptions.length > 0) {
        statusOptions.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-status') === 'Active') {
                btn.classList.add('active');
            }
        });
    } else {
        const oldStatusOptions = document.querySelectorAll('.status-option');
        oldStatusOptions.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-status') === 'Active') {
                btn.classList.add('active');
            }
        });
    }
    document.getElementById('officialStatus').value = 'Active';
    
    // Reset photo placeholder
    const photoPlaceholder = document.getElementById('photoPlaceholder');
    if (photoPlaceholder) {
        photoPlaceholder.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="#5F7385" stroke-width="2"/>
                <path d="M16 12V20M12 16H20" stroke="#5F7385" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }
    
    // Reset file input
    const photoUpload = document.getElementById('photoUpload');
    if (photoUpload) photoUpload.value = '';
    
    // Remove any error states
    document.querySelectorAll('.form-group-new, .form-group').forEach(group => {
        group.classList.remove('error');
        const errorMsg = group.querySelector('.error-message');
        if (errorMsg) errorMsg.remove();
    });
}

function saveOfficial() {
    // Collect form data
    const firstName = document.getElementById('firstName')?.value || '';
    const middleName = document.getElementById('middleName')?.value || '';
    const lastName = document.getElementById('lastName')?.value || '';
    const suffix = document.getElementById('suffix')?.value || '';
    const gender = document.getElementById('gender')?.value || '';
    const birthdate = document.getElementById('birthdate')?.value || '';
    const position = document.getElementById('position')?.value || '';
    const committee = document.getElementById('committee')?.value || '';
    const termStart = document.getElementById('termStart')?.value || '';
    const termEnd = document.getElementById('termEnd')?.value || '';
    const mobile = document.getElementById('mobile')?.value || '';
    const email = document.getElementById('email')?.value || '';
    const address = document.getElementById('address')?.value || '';
    const status = document.getElementById('officialStatus')?.value || 'Active';
    
    // Validate required fields
    if (!firstName || !lastName || !position || !termStart || !termEnd || !mobile) {
        alert('Please fill in all required fields marked with *');
        return;
    }
    
    // Validate mobile number format
    const mobileRegex = /^(09|\+639)\d{9}$/;
    if (!mobileRegex.test(mobile.replace(/\s/g, ''))) {
        alert('Please enter a valid mobile number (e.g., 09171234567)');
        return;
    }
    
    // Validate email if provided
    if (email && email !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Please enter a valid email address');
            return;
        }
    }
    
    // Format full name
    let fullName = `Hon. ${firstName} ${lastName}`;
    if (suffix) fullName += ` ${suffix}`;
    
    // Format term
    const startYear = new Date(termStart).getFullYear();
    const endYear = new Date(termEnd).getFullYear();
    const termDisplay = `${startYear} - ${endYear}`;
    
    // Create new official object
    const newOfficial = {
        id: nextId++,
        name: fullName,
        position: position,
        term: termDisplay,
        contact: mobile,
        email: email || 'N/A',
        status: status,
        avatar: getInitials(firstName, lastName)
    };
    
    // Add to officials data
    officialsData.unshift(newOfficial);
    
    // Show success message
    alert('Official added successfully!');
    
    // Go back to officials list
    showListView();
}

function getInitials(firstName, lastName) {
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
}

function loadOfficialsGrid() {
    let filteredOfficials = officialsData.filter(official => {
        const matchesSearch = official.name.toLowerCase().includes(currentFilters.search) ||
                              official.position.toLowerCase().includes(currentFilters.search);
        return matchesSearch;
    });
    
    renderOfficialsGrid(filteredOfficials);
}

function renderOfficialsGrid(officials) {
    const grid = document.getElementById('officialsGrid');
    if (!grid) return;
    
    if (officials.length === 0) {
        grid.innerHTML = '<div class="no-results">No officials found</div>';
        return;
    }
    
    grid.innerHTML = officials.map(official => `
        <div class="official-card">
            <div class="status-badge ${official.status.toLowerCase()}">${official.status}</div>
            <div class="avatar-container">
                <div class="official-avatar">${getOfficialInitials(official.name)}</div>
            </div>
            <div class="official-name">${official.name}</div>
            <div class="official-position">${official.position}</div>
            <div class="official-term">
                <img src="Images/Term_Icon.svg" alt="Calendar" class="term-icon-img">
                <span class="term-label">Term:</span>
                <span class="term-text">${official.term}</span>
            </div>
            <div class="official-contact">
                <div class="contact-item">
                    <img src="Images/Contact_Icon.svg" alt="Phone" class="contact-icon-img">
                    <span class="contact-text">${official.contact}</span>
                </div>
                <div class="contact-item">
                    <img src="Images/Email_Icon.svg" alt="Email" class="contact-icon-img">
                    <span class="contact-text">${official.email}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn view" onclick="window.viewOfficial(${official.id})">View</button>
                <button class="action-btn edit" onclick="window.editOfficial(${official.id})">Edit</button>
                <button class="action-btn delete" onclick="window.deleteOfficial(${official.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

function getOfficialInitials(name) {
    const parts = name.replace('Hon. ', '').split(' ');
    if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Global functions for onclick handlers
window.viewOfficial = function(id) {
    const official = officialsData.find(o => o.id === id);
    if (official) {
        const modal = document.getElementById('viewOfficialModal');
        const content = document.getElementById('viewOfficialContent');
        
        content.innerHTML = `
            <div class="detail-avatar">
                <div class="official-avatar" style="width: 100px; height: 100px; font-size: 48px;">${getOfficialInitials(official.name)}</div>
            </div>
            <div class="official-detail-section">
                <h4>Personal Information</h4>
                <div class="detail-row">
                    <div class="detail-label">Full Name:</div>
                    <div class="detail-value">${escapeHtml(official.name)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Position:</div>
                    <div class="detail-value">${escapeHtml(official.position)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Term:</div>
                    <div class="detail-value">${escapeHtml(official.term)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Status:</div>
                    <div class="detail-value">
                        <span class="status-badge ${official.status.toLowerCase()}" style="position: relative; top: 0; right: 0; display: inline-block;">${official.status}</span>
                    </div>
                </div>
            </div>
            <div class="official-detail-section">
                <h4>Contact Information</h4>
                <div class="detail-row">
                    <div class="detail-label">Contact Number:</div>
                    <div class="detail-value">${escapeHtml(official.contact)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Email Address:</div>
                    <div class="detail-value">${escapeHtml(official.email)}</div>
                </div>
            </div>
        `;
        
        modal.classList.add('active');
    }
};

window.editOfficial = function(id) {
    const official = officialsData.find(o => o.id === id);
    if (official) {
        showNotification(`Editing ${official.name}`, 'info');
    }
};

window.deleteOfficial = function(id) {
    if (confirm('Are you sure you want to delete this official?')) {
        const index = officialsData.findIndex(o => o.id === id);
        if (index !== -1) {
            officialsData.splice(index, 1);
            loadOfficialsGrid();
            showNotification('Official deleted successfully!', 'success');
        }
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showNotification(message, type) {
    alert(message);
}

// Modal close functionality
function setupModalClose() {
    const modalCloses = document.querySelectorAll('.modal-close');
    modalCloses.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
        });
    });
}

// Auto-initialize when script loads (for dynamic loading)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initOfficialsModule();
        setupModalClose();
    });
} else {
    initOfficialsModule();
    setupModalClose();
}