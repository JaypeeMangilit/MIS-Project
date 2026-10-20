// User Management Module
// ============================================

// Global state for this module
let usersData = [];
let activityData = [];
let currentFilters = {
    search: '',
    role: ''
};
let currentView = 'list';
let nextId = 5;

// Initialize the module - THIS IS THE KEY FUNCTION THAT SIDEBAR.JS EXPECTS
window.initUserManagementModule = function() {
    console.log('Initializing User Management Module');
    
    // Initialize data
    initData();
    
    // Setup event listeners
    setupEventListeners();
    setupFormEventListeners();
    
    // Load initial data
    loadUsersTable();
    loadActivityList();
    
    // Show list view by default
    showListView();
};

// Initialize mock data
function initData() {
    usersData = [
        { id: 1, name: "Maria Alvarez", email: "m.alvarez@bmis.local", username: "malvarez", role: "Administrator", status: "Active", lastLogin: "Today, 8:42 AM", avatar: "Images/UserAvatar.jpg" },
        { id: 2, name: "Ramon Dela Cruz", email: "r.delacruz@bmis.local", username: "rdelacruz", role: "Secretary", status: "Active", lastLogin: "Today, 7:58 AM", avatar: "Images/UserAvatar.jpg" },
        { id: 3, name: "Jenica Flores", email: "j.flores@bmis.local", username: "jflores", role: "Encoder", status: "Pending", lastLogin: "Never", avatar: "Images/UserAvatar.jpg" },
        { id: 4, name: "Eduardo Santos", email: "e.santos@bmis.local", username: "esantos", role: "Encoder", status: "Inactive", lastLogin: "Nov 28, 2025", avatar: "Images/UserAvatar.jpg" }
    ];
    
    activityData = [
        { title: "Maria Alvarez updated inventory access permissions for encoders.", time: "10 minutes ago", category: "Administration Log" },
        { title: "Jenica Flores account created and pending approval.", time: "Today", category: "User Registration" },
        { title: "Eduardo Santos was disabled after role review.", time: "Yesterday", category: "Account Status Update" },
        { title: "Ramon Dela Cruz completed password reset confirmation.", time: "Yesterday", category: "Security Event" }
    ];
}

// Setup main event listeners
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentFilters.search = e.target.value.toLowerCase();
            loadUsersTable();
        });
    }
    
    // Role filter
    const roleFilter = document.getElementById('roleFilter');
    if (roleFilter) {
        roleFilter.addEventListener('change', (e) => {
            currentFilters.role = e.target.value;
            loadUsersTable();
        });
    }
    
    // Add user button
    const addBtn = document.getElementById('addUserBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => showAddUserView());
    }
}

// Setup form event listeners
function setupFormEventListeners() {
    // Cancel button
    const cancelBtn = document.getElementById('cancelAddBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => showListView());
    }
    
    // Save button
    const saveBtn = document.getElementById('saveUserBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveUser());
    }
    
    // Status chip buttons
    const statusChips = document.querySelectorAll('.status-chip');
    statusChips.forEach(chip => {
        chip.addEventListener('click', function() {
            statusChips.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            const status = this.getAttribute('data-status');
            const statusInput = document.getElementById('accountStatus');
            if (statusInput) statusInput.value = status;
        });
    });
    
    // Photo upload
    const uploadBtn = document.getElementById('uploadPhotoBtn');
    const photoUpload = document.getElementById('photoUpload');
    const photoPreview = document.getElementById('photoPlaceholder');
    
    if (uploadBtn && photoUpload) {
        uploadBtn.addEventListener('click', () => photoUpload.click());
        
        photoUpload.addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    if (photoPreview) {
                        photoPreview.innerHTML = `<img src="${event.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
                    }
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }
}

// Show list view
function showListView() {
    currentView = 'list';
    const listView = document.getElementById('userListView');
    const addView = document.getElementById('addUserView');
    
    if (listView) listView.classList.add('active');
    if (addView) addView.classList.remove('active');
    
    loadUsersTable();
}

// Show add user view
function showAddUserView() {
    currentView = 'add';
    const listView = document.getElementById('userListView');
    const addView = document.getElementById('addUserView');
    
    if (listView) listView.classList.remove('active');
    if (addView) addView.classList.add('active');
    
    resetForm();
}

// Reset form fields
function resetForm() {
    // Clear all form inputs
    const formInputs = document.querySelectorAll('#addUserView input, #addUserView select');
    formInputs.forEach(input => {
        if (input.type !== 'file') {
            input.value = '';
        }
    });
    
    // Reset status to Active
    const statusChips = document.querySelectorAll('.status-chip');
    statusChips.forEach(chip => {
        chip.classList.remove('active');
        if (chip.getAttribute('data-status') === 'Active') {
            chip.classList.add('active');
        }
    });
    const statusInput = document.getElementById('accountStatus');
    if (statusInput) statusInput.value = 'Active';
    
    // Reset photo placeholder
    const photoPreview = document.getElementById('photoPlaceholder');
    if (photoPreview) {
        photoPreview.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="#5F7385" stroke-width="2"/>
                <path d="M16 10V22M10 16H22" stroke="#5F7385" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }
    
    // Reset file input
    const photoUpload = document.getElementById('photoUpload');
    if (photoUpload) photoUpload.value = '';
}

// Save new user
function saveUser() {
    // Collect form data
    const firstName = document.getElementById('firstName')?.value || '';
    const middleName = document.getElementById('middleName')?.value || '';
    const lastName = document.getElementById('lastName')?.value || '';
    const email = document.getElementById('email')?.value || '';
    const phone = document.getElementById('phone')?.value || '';
    const username = document.getElementById('username')?.value || '';
    const password = document.getElementById('password')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';
    const role = document.getElementById('userRole')?.value || '';
    const status = document.getElementById('accountStatus')?.value || 'Active';
    
    // Validate required fields
    if (!firstName || !lastName || !email || !username || !password || !role) {
        alert('Please fill in all required fields marked with *');
        return;
    }
    
    // Validate password match
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    // Validate password strength
    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    // Format full name
    let fullName = `${firstName} ${lastName}`;
    if (middleName) fullName += ` ${middleName}`;
    
    // Create new user object
    const newUser = {
        id: nextId++,
        name: fullName,
        email: email,
        username: username,
        role: role,
        status: status,
        lastLogin: 'Never',
        avatar: 'Images/UserAvatar.jpg'
    };
    
    // Add to users data
    usersData.unshift(newUser);
    
    // Show success message
    alert('User account created successfully!');
    
    // Go back to user list
    showListView();
    loadUsersTable();
}

// Load and filter users table
function loadUsersTable() {
    let filteredUsers = usersData.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(currentFilters.search) ||
                              user.email.toLowerCase().includes(currentFilters.search) ||
                              user.username.toLowerCase().includes(currentFilters.search);
        const matchesRole = !currentFilters.role || user.role === currentFilters.role;
        return matchesSearch && matchesRole;
    });
    
    renderUsersTable(filteredUsers);
}

// Render users table
function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>
                <div class="user-cell">
                    <div class="user-avatar-small">
                        <img src="${user.avatar}" alt="${user.name}" onerror="this.src='https://placehold.co/36x36'">
                    </div>
                    <div class="user-info-cell">
                        <div class="user-name-cell">${escapeHtml(user.name)}</div>
                        <div class="user-email-cell">${escapeHtml(user.email)}</div>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(user.username)}</td>
            <td><span class="role-badge">${escapeHtml(user.role)}</span></td>
            <td><span class="status-badge ${user.status.toLowerCase()}">${user.status}</span></td>
            <td>${user.lastLogin}</td>
            <td>
                <div class="action-buttons">
                    <div class="action-icon" onclick="window.viewUserDetails(${user.id})">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" stroke="#5F7385" stroke-width="1.33"/>
                            <circle cx="8" cy="8" r="2" fill="#5F7385"/>
                        </svg>
                    </div>
                    <div class="action-icon" onclick="window.editUserDetails(${user.id})">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M2 14L3.5 9.5L10.5 2.5L13.5 5.5L6.5 12.5L2 14Z" stroke="#5F7385" stroke-width="1.33"/>
                        </svg>
                    </div>
                    <div class="action-icon delete" onclick="window.deleteUserAccount(${user.id})">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="3" y="5" width="10" height="9" stroke="#EF4444" stroke-width="1.33"/>
                            <path d="M5 2H11L12 5H4L5 2Z" stroke="#EF4444" stroke-width="1.33"/>
                        </svg>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

// Load activity list (placeholder for future use)
function loadActivityList() {
    // Can be implemented later for activity feed
}

// User action functions (exposed globally)
window.viewUserDetails = function(id) {
    const user = usersData.find(u => u.id === id);
    if (user) {
        alert(`Viewing details for ${user.name}`);
    }
};

window.editUserDetails = function(id) {
    const user = usersData.find(u => u.id === id);
    if (user) {
        alert(`Editing ${user.name}`);
    }
};

window.deleteUserAccount = function(id) {
    if (confirm('Are you sure you want to delete this user?')) {
        const index = usersData.findIndex(u => u.id === id);
        if (index !== -1) {
            usersData.splice(index, 1);
            loadUsersTable();
            alert('User deleted successfully!');
        }
    }
};

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

console.log('User Management Module loaded. Use initUserManagementModule() to initialize.');