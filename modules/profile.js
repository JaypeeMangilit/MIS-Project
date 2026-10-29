// profile.js - User Profile module
// Wrapped in an IIFE because the app dynamically re-injects module scripts.

(function () {
    'use strict';

    const API_BASE_URL = 'api/';

    async function apiCall(endpoint, method, data) {
        const url = API_BASE_URL + endpoint;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            credentials: 'same-origin',
        };

        if (data !== null && data !== undefined) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const raw = await response.text();
        let result;
        try {
            result = raw.length ? JSON.parse(raw) : {};
        } catch (error) {
            console.error('API returned non-JSON from ' + url + ':', raw);
            return {
                success: false,
                status: response.status,
                message: 'Server returned an invalid response.',
            };
        }

        if (!response.ok && result.success === undefined) {
            result.success = false;
        }
        result.status = response.status;
        return result;
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

    function loadRecentActivities(userId) {
        var container = document.getElementById('activityList');
        if (!container) return Promise.resolve();

        container.innerHTML = '<div class="activity-empty">Loading activities...</div>';

        return apiCall('users.php?activities=1&user_id=' + encodeURIComponent(userId) + '&limit=10', 'GET')
            .then(function (result) {
                if (result && result.success) {
                    renderActivities(container, result.data || []);
                } else {
                    container.innerHTML = '<div class="activity-empty">Activities could not be loaded.</div>';
                }
            })
            .catch(function () {
                if (container) {
                    container.innerHTML = '<div class="activity-empty">Activities could not be loaded.</div>';
                }
            });
    }

    function openModal(modalId) {
        var modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    function closeModal(modalId) {
        var modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    function readPhotoFile(file) {
        return new Promise(function (resolve) {
            if (!file) {
                resolve(null);
                return;
            }

            if (!/^image\/(jpeg|jpg|png)$/.test(file.type)) {
                alert('Only JPG and PNG images are allowed.');
                resolve(null);
                return;
            }

            if (file.size > 2 * 1024 * 1024) {
                alert('The image must be 2MB or smaller.');
                resolve(null);
                return;
            }

            var reader = new FileReader();
            reader.onload = function (event) {
                resolve(event.target.result);
            };
            reader.onerror = function () {
                alert('The image could not be read. Please try another file.');
                resolve(null);
            };
            reader.readAsDataURL(file);
        });
    }

    function populateFormFromUser(user) {
        if (!user) return;
        var firstNameEl = document.getElementById('editFirstName');
        var middleNameEl = document.getElementById('editMiddleName');
        var lastNameEl = document.getElementById('editLastName');
        var positionEl = document.getElementById('editPosition');
        var emailEl = document.getElementById('editEmail');
        var contactEl = document.getElementById('editContact');
        var addressEl = document.getElementById('editAddress');

        if (firstNameEl) firstNameEl.value = user.first_name || '';
        if (middleNameEl) middleNameEl.value = user.middle_name || '';
        if (lastNameEl) lastNameEl.value = user.last_name || '';
        if (positionEl) positionEl.value = user.role || '';
        if (emailEl) emailEl.value = user.email || '';
        if (contactEl) contactEl.value = user.mobile_number || '';
        if (addressEl) addressEl.value = user.address || '';
    }

    function updateProfileDisplay(user) {
        if (!user) return;
        var els = {
            headerName: user.name || (user.first_name + ' ' + user.last_name),
            headerRole: user.role || '',
            profileName: user.name || (user.first_name + ' ' + user.last_name),
            profilePosition: user.role || '',
            firstName: user.first_name || '',
            middleName: user.middle_name || '',
            lastName: user.last_name || '',
            email: user.email || '',
            contact: user.mobile_number || '',
            address: user.address || '',
            position: user.role || '',
            moduleAccess: user.role || '',
        };

        Object.keys(els).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.textContent = els[id] || '';
            }
        });

        var avatarEl = document.getElementById('profileAvatar');
        var headerAvatarEl = document.getElementById('headerAvatar');
        var avatarSrc = user.profile_image || 'Images/Secretary-User.jpg';
        if (avatarEl) avatarEl.src = avatarSrc;
        if (headerAvatarEl) headerAvatarEl.src = avatarSrc;
    }

    async function handleEditProfileSubmit(event) {
        event.preventDefault();

        var sessionUser = (window.Session && window.Session.user) || null;
        if (!sessionUser || !sessionUser.id) {
            alert('Session expired. Please sign in again.');
            window.location.replace('login.php');
            return;
        }

        var payload = {
            first_name: document.getElementById('editFirstName').value.trim(),
            middle_name: document.getElementById('editMiddleName').value.trim(),
            last_name: document.getElementById('editLastName').value.trim(),
            role: document.getElementById('editPosition').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            mobile_number: document.getElementById('editContact').value.trim(),
            address: document.getElementById('editAddress').value.trim(),
        };

        var result = await apiCall('users.php?id=' + encodeURIComponent(sessionUser.id), 'PUT', payload);

        if (result && result.success && result.data) {
            if (window.Session && window.Session.user) {
                window.Session.user = Object.assign({}, window.Session.user, result.data);
            }
            updateProfileDisplay(result.data);
            closeModal('editProfileModal');
            await loadRecentActivities(sessionUser.id);
        } else {
            alert((result && result.message) || 'Unable to save changes. Please try again.');
        }
    }

    async function handleSavePhoto() {
        var sessionUser = (window.Session && window.Session.user) || null;
        if (!sessionUser || !sessionUser.id) {
            alert('Session expired. Please sign in again.');
            window.location.replace('login.php');
            return;
        }

        var fileInput = document.getElementById('photoUpload');
        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
            alert('Please choose a photo first.');
            return;
        }

        var dataUrl = await readPhotoFile(fileInput.files[0]);
        if (!dataUrl) return;

        var preview = document.getElementById('photoPreview');
        if (preview) {
            preview.innerHTML = '<img src="' + dataUrl + '" alt="Preview" style="width:100%;height:100%;object-fit:cover;">';
        }

        var result = await apiCall('users.php?id=' + encodeURIComponent(sessionUser.id), 'PUT', {
            photo_base64: dataUrl,
        });

        if (result && result.success && result.data) {
            if (window.Session && window.Session.user) {
                window.Session.user = Object.assign({}, window.Session.user, result.data);
            }
            updateProfileDisplay(result.data);
            closeModal('photoModal');
            await loadRecentActivities(sessionUser.id);
        } else {
            alert((result && result.message) || 'Unable to update photo. Please try again.');
        }
    }

    function initProfile() {
        if (!window.Session) {
            console.warn('Session.js is not loaded. Profile page cannot initialize.');
            return;
        }

        window.Session.load().then(function (user) {
            if (!user) {
                window.location.replace('login.php');
                return;
            }

            updateProfileDisplay(user);
            loadRecentActivities(user.id);

            var editBtn = document.getElementById('editProfileBtn');
            if (editBtn) {
                editBtn.addEventListener('click', function () {
                    populateFormFromUser(user);
                    openModal('editProfileModal');
                });
            }

            var updatePhotoBtn = document.getElementById('updatePhotoBtn');
            if (updatePhotoBtn) {
                updatePhotoBtn.addEventListener('click', function () {
                    var preview = document.getElementById('photoPreview');
                    if (preview) {
                        preview.innerHTML = '<img src="' + (user.profile_image || 'Images/Secretary-User.jpg') + '" alt="Preview" style="width:100%;height:100%;object-fit:cover;">';
                    }
                    var fileInput = document.getElementById('photoUpload');
                    if (fileInput) fileInput.value = '';
                    openModal('photoModal');
                });
            }

            var savePhotoBtn = document.getElementById('savePhotoBtn');
            if (savePhotoBtn) {
                savePhotoBtn.addEventListener('click', handleSavePhoto);
            }

            var form = document.getElementById('editProfileForm');
            if (form) {
                form.addEventListener('submit', handleEditProfileSubmit);
            }

            document.querySelectorAll('.modal-close, .modal-cancel').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var modal = btn.closest('.modal');
                    if (modal) modal.classList.remove('active');
                });
            });

            document.querySelectorAll('.modal').forEach(function (modal) {
                modal.addEventListener('click', function (event) {
                    if (event.target === modal) {
                        modal.classList.remove('active');
                    }
                });
            });
        });
    }

    window.initProfile = initProfile;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfile);
    } else {
        initProfile();
    }
})();
