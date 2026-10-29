// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

// User Profile Module
let userProfile = {
    firstName: "Maria",
    middleName: "Lopez",
    lastName: "Santos",
    suffix: "",
    email: "m.santos@brgy49akasya.gov.ph",
    phone: "+63 917 123 4567",
    address: "Block 4, Lot 12, M. Gregorio Street, Barangay 49 Akasya, Cavite City",
    position: "Barangay Secretary",
    officeStatus: "Assigned for daily front desk and records processing",
    status: "Active",
    avatar: "https://placehold.co/120x120"
};

// Initialize the module
window.initUserProfile = function() {
    console.log("Initializing User Profile Module");
    loadProfileData();
    setupEventListeners();

    if (window.applyModuleReadOnly) {
        window.applyModuleReadOnly({
            addBtnId: 'editProfileBtn',
            saveBtnIds: ['saveProfileBtn'],
        });
    }
};

function loadProfileData() {
    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileRole = document.getElementById('profileRole');
    const profileStatus = document.getElementById('profileStatus');
    const firstName = document.getElementById('firstName');
    const middleName = document.getElementById('middleName');
    const lastName = document.getElementById('lastName');
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const address = document.getElementById('address');
    const position = document.getElementById('position');
    const officeStatus = document.getElementById('officeStatus');
    
    if (profileAvatar) profileAvatar.src = userProfile.avatar;
    if (profileName) profileName.textContent = `${userProfile.firstName} ${userProfile.lastName}`;
    if (profileRole) profileRole.textContent = userProfile.position;
    if (profileStatus) profileStatus.textContent = `${userProfile.status} Account`;
    if (firstName) firstName.textContent = userProfile.firstName;
    if (middleName) middleName.textContent = userProfile.middleName || '—';
    if (lastName) lastName.textContent = userProfile.lastName;
    if (email) email.textContent = userProfile.email;
    if (phone) phone.textContent = userProfile.phone || '—';
    if (address) address.textContent = userProfile.address;
    if (position) position.textContent = userProfile.position;
    if (officeStatus) officeStatus.textContent = userProfile.officeStatus;
}

function setupEventListeners() {
    const editBtn = document.getElementById('editProfileBtn');
    const updatePhotoBtn = document.getElementById('updatePhotoBtn');
    const photoUpload = document.getElementById('photoUploadInput');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    
    if (editBtn) editBtn.addEventListener('click', openEditModal);
    if (updatePhotoBtn && photoUpload) {
        updatePhotoBtn.addEventListener('click', () => photoUpload.click());
        photoUpload.addEventListener('change', handlePhotoUpload);
    }
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEditModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeEditModal);
    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfileChanges);
    
    const modalOverlay = document.getElementById('editProfileModal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeEditModal();
        });
    }
}

function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            userProfile.avatar = e.target.result;
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar) profileAvatar.src = userProfile.avatar;
            showNotification('Profile photo updated successfully!', 'success');
        };
        reader.readAsDataURL(file);
    } else {
        showNotification('Please select a valid JPG or PNG image.', 'error');
    }
}

function openEditModal() {
    document.getElementById('editFirstName').value = userProfile.firstName;
    document.getElementById('editMiddleName').value = userProfile.middleName || '';
    document.getElementById('editLastName').value = userProfile.lastName;
    document.getElementById('editSuffix').value = userProfile.suffix || '';
    document.getElementById('editEmail').value = userProfile.email;
    document.getElementById('editPhone').value = userProfile.phone || '';
    document.getElementById('editAddress').value = userProfile.address;
    document.getElementById('editPosition').value = userProfile.position;
    document.getElementById('editOfficeStatus').value = userProfile.officeStatus;
    
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'none';
}

function saveProfileChanges() {
    userProfile.firstName = document.getElementById('editFirstName').value.trim();
    userProfile.middleName = document.getElementById('editMiddleName').value.trim();
    userProfile.lastName = document.getElementById('editLastName').value.trim();
    userProfile.suffix = document.getElementById('editSuffix').value.trim();
    userProfile.email = document.getElementById('editEmail').value.trim();
    userProfile.phone = document.getElementById('editPhone').value.trim();
    userProfile.address = document.getElementById('editAddress').value.trim();
    userProfile.position = document.getElementById('editPosition').value.trim();
    userProfile.officeStatus = document.getElementById('editOfficeStatus').value.trim();
    
    if (!userProfile.firstName || !userProfile.lastName || !userProfile.email) {
        showNotification('Please fill in all required fields.', 'error');
        return;
    }
    
    loadProfileData();
    closeEditModal();
    showNotification('Profile updated successfully!', 'success');
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#1F8F5F' : '#EF4444'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-family: 'Inter', sans-serif;
        z-index: 1001;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

console.log('User Profile Module loaded');

})();
