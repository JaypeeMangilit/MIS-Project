// User Management Module
// ============================================
//
// Wrapped in an IIFE on purpose: sidebar.js removes and re-appends this script on
// every visit to the module, and a second execution of a top-level const/let
// throws ("Identifier 'currentFilters' has already been declared"), leaving the
// PREVIOUS load's state serving a freshly injected DOM. Nothing outside this file
// references its internals - the entry point is assigned to window below and the
// table rows are wired through event delegation, so no global handler names are
// written into the markup.

(function () {
    'use strict';

    var API_BASE_URL = 'api/users.php';
    var DEFAULT_AVATAR = 'Images/UserAvatar.jpg';

    // The roles the form offers. Must stay in step with userManagementRoles()
    // in api/users.php. Admin and Kagawad accounts already exist in the
    // database and stay valid for login; they are simply no longer offered here.
    var ROLES = ['Secretary', 'Captain', 'Councilor'];

    var usersData = [];
    var currentFilters = { search: '', role: '' };
    var currentPage = 1;
    var rowsPerPage = 10;
    var totalPages = 1;
    var currentView = 'list';
    var currentViewUserId = null;
    var currentEditId = null;
    var currentEditUserId = null;
    var pendingPhoto = null;
    var pendingEditPhoto = null;
    var searchTimer = null;

    // ---------------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------------

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Age in whole years for a "YYYY-MM-DD" birth date, or null when the date is
     * empty, impossible, or still in the future.
     *
     * Completed years only: the year is dropped by one when this year's birthday has
     * not happened yet. Mirrors residentAgeFromBirthDate() in api/residents.php.
     */
    function calculateAgeFromBirthDate(birthDate) {
        var raw = String(birthDate || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

        var parts = raw.split('-').map(Number);
        var birth = new Date(parts[0], parts[1] - 1, parts[2]);
        // Reject impossible dates such as 2001-02-30, which Date would roll over.
        if (birth.getFullYear() !== parts[0] || birth.getMonth() !== parts[1] - 1 || birth.getDate() !== parts[2]) {
            return null;
        }

        var today = new Date();
        if (birth.getTime() > today.getTime()) return null;

        var age = today.getFullYear() - birth.getFullYear();
        var monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    }

    /** Age as a display string: the number, or an em dash when there is no birth date. */
    function ageText(birthDate) {
        var age = calculateAgeFromBirthDate(birthDate);
        return age === null ? '—' : String(age);
    }

    function toDateInput(value) {
        if (!value) return '';
        return String(value).substring(0, 10);
    }

    function calculateLengthOfResidence(moveInDate) {
        if (!moveInDate) return '—';
        var raw = String(moveInDate).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';

        var parts = raw.split('-').map(Number);
        var start = new Date(parts[0], parts[1] - 1, parts[2]);
        if (start.getFullYear() !== parts[0] || start.getMonth() !== parts[1] - 1 || start.getDate() !== parts[2]) {
            return '—';
        }

        var today = new Date();
        if (start.getTime() > today.getTime()) return '—';

        var years = today.getFullYear() - start.getFullYear();
        var months = today.getMonth() - start.getMonth();
        var days = today.getDate() - start.getDate();
        if (days < 0) {
            months--;
            var prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }
        if (years < 0) return '—';
        if (years === 0 && months === 0 && days === 0) return 'Today';
        var parts = [];
        if (years > 0) parts.push(years + ' year' + (years !== 1 ? 's' : ''));
        if (months > 0) parts.push(months + ' month' + (months !== 1 ? 's' : ''));
        if (days > 0) parts.push(days + ' day' + (days !== 1 ? 's' : ''));
        return parts.join(' and ') || '—';
    }

    /** Recompute a read-only Age box from its Birthdate box. */
    function syncUserAge(birthdateId, ageId) {
        var ageField = document.getElementById(ageId);
        if (!ageField) return;
        var birthField = document.getElementById(birthdateId);
        var age = birthField ? calculateAgeFromBirthDate(birthField.value) : null;
        ageField.value = age === null ? '' : String(age);
    }

    function syncLengthOfResidence(moveInDateId, lengthId) {
        var lengthField = document.getElementById(lengthId);
        if (!lengthField) return;
        var moveInField = document.getElementById(moveInDateId);
        var value = moveInField ? calculateLengthOfResidence(moveInField.value) : '—';
        lengthField.value = value;
    }

    function fullName(user) {
        var parts = [
            user.first_name,
            user.middle_name,
            user.last_name,
            user.suffix
        ].filter(function (part) {
            return part !== null && part !== undefined && String(part).trim() !== '';
        });
        return parts.join(' ');
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) {
            return '?';
        }
        if (parts.length === 1) {
            return parts[0].charAt(0).toUpperCase();
        }
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    /** "2026-10-24 23:44:26.1700000" -> "Oct 24, 2026 11:44 PM" */
    function formatDateTime(value) {
        if (!value) {
            return 'Never';
        }
        var raw = String(value).replace('T', ' ');
        var datePart = raw.slice(0, 10);
        var timePart = raw.slice(11, 19);

        var bits = datePart.split('-');
        if (bits.length !== 3) {
            return raw;
        }

        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var monthIndex = parseInt(bits[1], 10) - 1;
        var month = months[monthIndex] || bits[1];

        var hour = parseInt(timePart.slice(0, 2), 10);
        var suffix = hour >= 12 ? 'PM' : 'AM';
        var displayHour = hour % 12;
        if (displayHour === 0) {
            displayHour = 12;
        }

        return month + ' ' + parseInt(bits[2], 10) + ', ' + bits[0] + ' ' +
               displayHour + ':' + timePart.slice(3, 5) + ' ' + suffix;
    }

    function formatDateOnly(value) {
        if (!value) {
            return '—';
        }
        var raw = String(value).replace('T', ' ');
        var bits = raw.slice(0, 10).split('-');
        if (bits.length !== 3) {
            return raw;
        }
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var monthIndex = parseInt(bits[1], 10) - 1;
        return (months[monthIndex] || bits[1]) + ' ' + parseInt(bits[2], 10) + ', ' + bits[0];
    }

    function avatarSrc(user) {
        if (user && user.profile_image) {
            return user.profile_image;
        }
        return DEFAULT_AVATAR;
    }

    function statusLabel(status) {
        var value = String(status || 'Active');
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }

    function notify(message) {
        window.alert(message);
    }

    function apiRequest(method, queryString, body) {
        var url = API_BASE_URL + (queryString ? '?' + queryString : '');
        var options = {
            method: method,
            headers: { 'Accept': 'application/json' }
        };

        if (body !== undefined && body !== null) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        return fetch(url, options)
            .then(function (response) {
                return response.json().catch(function () {
                    return { success: false, message: 'Unexpected server response' };
                });
            })
            .then(function (payload) {
                if (!payload || payload.success === false) {
                    throw new Error((payload && payload.message) || 'Request failed');
                }
                return payload;
            });
    }

    function readPhotoFile(file, previewElement) {
        return new Promise(function (resolve) {
            if (!file) {
                resolve(null);
                return;
            }

            var isImage = /^image\/(jpeg|png)$/.test(file.type);
            if (!isImage) {
                notify('Only JPG and PNG images are allowed.');
                resolve(null);
                return;
            }

            if (file.size > 2 * 1024 * 1024) {
                notify('The image must be 2MB or smaller.');
                resolve(null);
                return;
            }

            var reader = new FileReader();
            reader.onload = function (event) {
                var dataUrl = event.target.result;
                if (previewElement) {
                    previewElement.innerHTML =
                        '<img src="' + dataUrl + '" alt="Selected photo" style="width:100%;height:100%;object-fit:cover;">';
                }
                resolve(dataUrl);
            };
            reader.onerror = function () {
                notify('The image could not be read. Please try another file.');
                resolve(null);
            };
            reader.readAsDataURL(file);
        });
    }

    // ---------------------------------------------------------------------------
    // View switching
    // ---------------------------------------------------------------------------

    function showView(viewName) {
        var views = {
            list: 'userListView',
            add: 'addUserView',
            view: 'viewUserView',
            edit: 'editUserView'
        };

        Object.keys(views).forEach(function (key) {
            var element = document.getElementById(views[key]);
            if (!element) {
                return;
            }
            if (key === viewName) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        });

        currentView = viewName;

        var pageTitle = document.getElementById('pageTitle');
        var breadcrumb = document.getElementById('breadcrumb');
        var titles = {
            list: 'User Management',
            add: 'Add New User',
            view: 'User Details',
            edit: 'Edit User Account'
        };
        if (pageTitle && titles[viewName]) {
            pageTitle.textContent = titles[viewName];
        }
        if (breadcrumb) {
            breadcrumb.textContent = 'Barangay Information System / Administration / ' +
                (titles[viewName] || 'User Management');
        }
    }

    function showListView() {
        showView('list');
        loadUsers();
    }

    function showAddUserView() {
        resetAddForm();
        showView('add');
    }

    // ---------------------------------------------------------------------------
    // List
    // ---------------------------------------------------------------------------

    function loadUsers() {
        var query = 'page=' + currentPage + '&limit=' + rowsPerPage;
        if (currentFilters.search) {
            query += '&search=' + encodeURIComponent(currentFilters.search);
        }
        if (currentFilters.role) {
            query += '&role=' + encodeURIComponent(currentFilters.role);
        }

        return apiRequest('GET', query)
            .then(function (payload) {
                usersData = payload.data || [];
                totalPages = payload.totalPages || 1;
                if (currentPage > totalPages) {
                    currentPage = totalPages;
                }
                renderUsersTable(usersData);
                renderPagination(payload.total || 0);
            })
            .catch(function (error) {
                renderUsersTable([]);
                renderPagination(0);
                notify(error.message);
            });
    }

    /**
     * Row actions. The three icons are the project's shared SVG files, exactly as
     * the Residents table renders them (Images/View_Icon.svg, Edit_Icon.svg,
     * Archives_Icon.svg), so every module's action column looks the same.
     * Archive keeps the red Archive treatment; hover styling comes from the CSS.
     */
    function actionButtons(user) {
        var id = escapeHtml(user.id);
        return '' +
            '<div class="action-buttons">' +
                '<div class="action-icon" data-action="view" data-id="' + id + '" ' +
                     'title="View" aria-label="View">' +
                    '<img src="Images/View_Icon.svg" alt="View">' +
                '</div>' +
                '<div class="action-icon" data-action="edit" data-id="' + id + '" ' +
                     'title="Edit" aria-label="Edit">' +
                    '<img src="Images/Edit_Icon.svg" alt="Edit">' +
                '</div>' +
                '<div class="action-icon delete" data-action="archive" data-id="' + id + '" ' +
                     'title="Archive" aria-label="Archive">' +
                    '<img src="Images/Archives_Icon.svg" alt="Archive">' +
                '</div>' +
            '</div>';
    }

    function renderUsersTable(users) {
        var tbody = document.getElementById('usersTableBody');
        if (!tbody) {
            return;
        }

        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(function (user) {
            var name = fullName(user);
            var status = statusLabel(user.status);
            return '<tr>' +
                '<td>' +
                    '<div class="user-cell">' +
                        '<div class="user-avatar-small">' +
                            '<img src="' + escapeHtml(avatarSrc(user)) + '" alt="' + escapeHtml(name) + '" ' +
                                 'onerror="this.onerror=null;this.src=\'' + DEFAULT_AVATAR + '\'">' +
                        '</div>' +
                        '<div class="user-info-cell">' +
                            '<div class="user-name-cell">' + escapeHtml(name) + '</div>' +
                            '<div class="user-email-cell">' + escapeHtml(user.email || '') + '</div>' +
                        '</div>' +
                    '</div>' +
                '</td>' +
                '<td>' + escapeHtml(user.username || '') + '</td>' +
                '<td><span class="role-badge">' + escapeHtml(user.role || '—') + '</span></td>' +
                '<td><span class="status-badge ' + escapeHtml(String(user.status || '').toLowerCase()) + '">' + escapeHtml(status) + '</span></td>' +
                '<td>' + escapeHtml(formatDateTime(user.last_login)) + '</td>' +
                '<td>' + actionButtons(user) + '</td>' +
            '</tr>';
        }).join('');
    }

    function renderPagination(total) {
        var info = document.getElementById('paginationInfo');
        var controls = document.getElementById('paginationControls');
        if (!info || !controls) {
            return;
        }

        var start = total === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
        var end = Math.min(currentPage * rowsPerPage, total);
        info.textContent = 'Showing ' + start + ' to ' + end + ' of ' + total + ' users';

        if (totalPages <= 1) {
            controls.innerHTML = '';
            return;
        }

        var buttons = [];

        buttons.push('<button type="button" class="page-btn" data-page="' + (currentPage - 1) + '" ' +
            (currentPage === 1 ? 'disabled' : '') + '>Prev</button>');

        for (var page = 1; page <= totalPages; page++) {
            buttons.push('<button type="button" class="page-btn' + (page === currentPage ? ' active' : '') + '" ' +
                'data-page="' + page + '">' + page + '</button>');
        }

        buttons.push('<button type="button" class="page-btn" data-page="' + (currentPage + 1) + '" ' +
            (currentPage === totalPages ? 'disabled' : '') + '>Next</button>');

        controls.innerHTML = buttons.join('');
    }

    // ---------------------------------------------------------------------------
    // View (read-only)
    // ---------------------------------------------------------------------------

    function openViewUser(id) {
        return apiRequest('GET', 'id=' + encodeURIComponent(id))
            .then(function (payload) {
                if (!payload.data) {
                    throw new Error('User not found');
                }
                populateViewUser(payload.data);
                currentViewUserId = payload.data.id;
                showView('view');
                loadUserActivities(payload.data.id);
            })
            .catch(function (error) {
                notify(error.message);
            });
    }

    /**
     * Recent Activities for the user being viewed. The id comes from the record we
     * just loaded, never from the request, so one user's history can never be
     * shown on another's page.
     */
    function loadUserActivities(id) {
        var container = document.getElementById('viewActivities');
        if (!container) {
            return Promise.resolve();
        }
        container.innerHTML = '<div class="activity-empty">Loading activities...</div>';

        return apiRequest('GET', 'activities=1&user_id=' + encodeURIComponent(id) + '&limit=10')
            .then(function (payload) {
                renderActivities(payload.data || []);
            })
            .catch(function () {
                // A failed read must not break the View page itself.
                if (container) {
                    container.innerHTML = '<div class="activity-empty">Activities could not be loaded.</div>';
                }
            });
    }

    /**
     * One icon per activity type, newest first, with the real stored timestamp.
     */
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

    function renderActivities(activities) {
        var container = document.getElementById('viewActivities');
        if (!container) {
            return;
        }

        if (!activities.length) {
            container.innerHTML = '<div class="activity-empty">No recent activities recorded for this account yet.</div>';
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

    function populateViewUser(user) {
        var fields = {
            viewFullName: fullName(user),
            viewUserId: user.user_id || '—',
            viewUsername: user.username || '—',
            viewRole: user.role || '—',
            viewStatus: statusLabel(user.status),
            viewLastLogin: formatDateTime(user.last_login),
            viewCreatedAt: formatDateOnly(user.created_at),
            viewFirstName: user.first_name || '—',
            viewMiddleName: user.middle_name || '—',
            viewLastName: user.last_name || '—',
            viewSuffix: user.suffix || '—',
            viewEmail: user.email || '—',
            viewMobile: user.mobile_number || '—',
            viewAddress: user.address || '—',
            viewBirthdate: user.birth_date ? String(user.birth_date).substring(0, 10) : '—',
            // Derived here, never read from a stored age column.
            viewAge: ageText(user.birth_date),
            viewLengthOfResidence: calculateLengthOfResidence(toDateInput(user.move_in_date))
        };

        Object.keys(fields).forEach(function (id) {
            var element = document.getElementById(id);
            if (element) {
                element.textContent = fields[id];
            }
        });

        var avatar = document.getElementById('viewAvatar');
        if (avatar) {
            avatar.src = avatarSrc(user);
            avatar.onerror = function () {
                avatar.onerror = null;
                avatar.src = DEFAULT_AVATAR;
            };
        }

        var badge = document.getElementById('viewStatusBadge');
        if (badge) {
            badge.textContent = statusLabel(user.status);
            badge.className = 'status-badge-large ' +
                (String(user.status || '').toLowerCase() === 'active' ? 'active' : 'inactive');
        }

        var roleBadge = document.getElementById('viewRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = user.role || '—';
        }
    }

    // ---------------------------------------------------------------------------
    // Edit
    // ---------------------------------------------------------------------------

    function openEditUser(id) {
        return apiRequest('GET', 'id=' + encodeURIComponent(id))
            .then(function (payload) {
                if (!payload.data) {
                    throw new Error('User not found');
                }
                populateEditUser(payload.data);
                currentEditId = payload.data.id;
                showView('edit');
            })
            .catch(function (error) {
                notify(error.message);
            });
    }

    function populateEditUser(user) {
        var values = {
            editFirstName: user.first_name || '',
            editMiddleName: user.middle_name || '',
            editLastName: user.last_name || '',
            editSuffix: user.suffix || '',
            editEmail: user.email || '',
            editPhone: user.mobile_number || '',
            editAddress: user.address || '',
            editBirthdate: user.birth_date ? String(user.birth_date).substring(0, 10) : '',
            editMoveInDate: user.move_in_date ? String(user.move_in_date).substring(0, 10) : '',
            editUsername: user.username || ''
        };

        Object.keys(values).forEach(function (id) {
            var element = document.getElementById(id);
            if (element) {
                element.value = values[id];
            }
        });

        // The Birthdate and Move-in Date were set programmatically, so the change
        // listeners will not have fired - recompute the read-only boxes by hand.
        syncUserAge('editBirthdate', 'editAge');
        syncLengthOfResidence('editMoveInDate', 'editLengthOfResidence');

        var roleSelect = document.getElementById('editUserRole');
        if (roleSelect) {
            var current = user.role || '';
            var hasOption = Array.prototype.some.call(roleSelect.options, function (option) {
                return option.value === current;
            });
            // An account whose role is no longer offered (Kagawad, for example)
            // must still display its real stored value rather than a blank.
            if (current && !hasOption) {
                var option = document.createElement('option');
                option.value = current;
                option.textContent = current + ' (current)';
                roleSelect.appendChild(option);
            }
            roleSelect.value = current;
        }

        var image = document.getElementById('editPhotoImage');
        if (image) {
            image.src = avatarSrc(user);
            image.onerror = function () {
                image.onerror = null;
                image.src = DEFAULT_AVATAR;
            };
        }

        var passwordField = document.getElementById('editPassword');
        if (passwordField) {
            passwordField.value = '';
        }

        setStatusChips(document.getElementById('editStatusGroup'), user.status || 'Active');
        pendingEditPhoto = null;
        // Remembered so the success message only mentions a new User ID when the
        // role actually changed and the backend regenerated it.
        currentEditUserId = user.user_id || null;

        var fileInput = document.getElementById('editPhotoUpload');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    function setStatusChips(group, status) {
        if (!group) {
            return;
        }
        var wanted = String(status || 'Active');
        Array.prototype.forEach.call(group.querySelectorAll('.status-chip'), function (chip) {
            var isActive = chip.getAttribute('data-status') === wanted;
            chip.classList.toggle('active', isActive);
        });
        var hidden = document.getElementById('editAccountStatus');
        if (hidden) {
            hidden.value = wanted;
        }
        var addHidden = document.getElementById('accountStatus');
        if (addHidden) {
            addHidden.value = wanted;
        }
    }

    function saveEditUser() {
        if (currentEditId === null) {
            notify('No user is being edited.');
            return;
        }

        var payload = {
            id: currentEditId,
            first_name: document.getElementById('editFirstName').value.trim(),
            middle_name: document.getElementById('editMiddleName').value.trim(),
            last_name: document.getElementById('editLastName').value.trim(),
            suffix: document.getElementById('editSuffix').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            mobile_number: document.getElementById('editPhone').value.trim(),
            address: document.getElementById('editAddress').value.trim(),
            birth_date: document.getElementById('editBirthdate').value || '',
            move_in_date: document.getElementById('editMoveInDate').value || '',
            username: document.getElementById('editUsername').value.trim(),
            role: document.getElementById('editUserRole').value,
            status: document.getElementById('editAccountStatus').value || 'Active'
        };

        var password = document.getElementById('editPassword').value;
        if (password) {
            payload.password = password;
        }

        if (pendingEditPhoto) {
            payload.photo_base64 = pendingEditPhoto;
        }

        if (!payload.first_name || !payload.last_name || !payload.username ||
            !payload.email || !payload.role) {
            notify('Please fill in all required fields marked with *');
            return;
        }

        if (payload.move_in_date && new Date(payload.move_in_date) > new Date()) {
            notify('Move-in Date cannot be in the future.');
            return;
        }

        apiRequest('PUT', '', payload)
            .then(function (result) {
                var message = (result.user_id && currentEditUserId &&
                               result.user_id !== String(currentEditUserId))
                    ? 'User updated successfully. New User ID: ' + result.user_id
                    : 'User updated successfully.';
                notify(message);
                currentEditId = null;
                pendingEditPhoto = null;
                showListView();
            })
            .catch(function (error) {
                notify(error.message);
            });
    }

    // ---------------------------------------------------------------------------
    // Add
    // ---------------------------------------------------------------------------

    function resetAddForm() {
        var ids = ['firstName', 'middleName', 'lastName', 'suffix', 'email', 'phone',
                   'address', 'birthdate', 'moveInDate', 'username', 'password', 'confirmPassword'];
        ids.forEach(function (id) {
            var element = document.getElementById(id);
            if (element) {
                element.value = '';
            }
        });

        var lengthField = document.getElementById('lengthOfResidence');
        if (lengthField) lengthField.value = '';

        var role = document.getElementById('userRole');
        if (role) {
            role.value = '';
        }

        setStatusChips(null, 'Active');

        var placeholder = document.getElementById('photoPlaceholder');
        if (placeholder) {
            placeholder.innerHTML =
                '<svg width="32" height="32" viewBox="0 0 32 32" fill="none">' +
                    '<circle cx="16" cy="16" r="12" stroke="#5F7385" stroke-width="2"/>' +
                    '<path d="M16 10V22M10 16H22" stroke="#5F7385" stroke-width="2" stroke-linecap="round"/>' +
                '</svg>';
        }

        var fileInput = document.getElementById('photoUpload');
        if (fileInput) {
            fileInput.value = '';
        }

        pendingPhoto = null;
    }

    function saveUser() {
        var payload = {
            first_name: document.getElementById('firstName').value.trim(),
            middle_name: document.getElementById('middleName').value.trim(),
            last_name: document.getElementById('lastName').value.trim(),
            suffix: document.getElementById('suffix').value.trim(),
            email: document.getElementById('email').value.trim(),
            mobile_number: document.getElementById('phone').value.trim(),
            address: document.getElementById('address').value.trim(),
            birth_date: document.getElementById('birthdate').value || '',
            move_in_date: document.getElementById('moveInDate').value || '',
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value,
            role: document.getElementById('userRole').value,
            status: document.getElementById('accountStatus').value || 'Active'
        };

        var confirmPassword = document.getElementById('confirmPassword').value;

        if (!payload.first_name || !payload.last_name || !payload.username ||
            !payload.password || !payload.email || !payload.role) {
            notify('Please fill in all required fields marked with *');
            return;
        }

        if (payload.password !== confirmPassword) {
            notify('Passwords do not match');
            return;
        }

        if (payload.password.length < 6) {
            notify('Password must be at least 6 characters long');
            return;
        }

        if (payload.move_in_date && new Date(payload.move_in_date) > new Date()) {
            notify('Move-in Date cannot be in the future.');
            return;
        }

        if (pendingPhoto) {
            payload.photo_base64 = pendingPhoto;
        }

        apiRequest('POST', '', payload)
            .then(function (result) {
                notify('User account created successfully. User ID: ' + result.user_id);
                showListView();
            })
            .catch(function (error) {
                notify(error.message);
            });
    }

    // ---------------------------------------------------------------------------
    // Archive / restore
    // ---------------------------------------------------------------------------

    function archiveUser(id) {
        var user = usersData.filter(function (item) {
            return String(item.id) === String(id);
        })[0];
        var name = user ? fullName(user) : 'this account';

        if (!window.confirm('Archive ' + name + '? The account will leave the active list and can be restored later.')) {
            return;
        }

        apiRequest('DELETE', 'id=' + encodeURIComponent(id))
            .then(function () {
                notify('User archived successfully.');
                loadUsers();
            })
            .catch(function (error) {
                notify(error.message);
            });
    }

    // ---------------------------------------------------------------------------
    // Event wiring
    // ---------------------------------------------------------------------------

    function bindEvents() {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                if (searchTimer) {
                    clearTimeout(searchTimer);
                }
                searchTimer = setTimeout(function () {
                    currentFilters.search = searchInput.value.trim().toLowerCase();
                    currentPage = 1;
                    loadUsers();
                }, 250);
            });
        }

        var roleFilter = document.getElementById('roleFilter');
        if (roleFilter) {
            roleFilter.addEventListener('change', function () {
                currentFilters.role = roleFilter.value;
                currentPage = 1;
                loadUsers();
            });
        }

        var addBtn = document.getElementById('addUserBtn');
        if (addBtn) {
            addBtn.addEventListener('click', showAddUserView);
        }

        ['backToListBtn', 'cancelAddBtn',
         'backToListFromViewBtn', 'backToListFromEditBtn', 'cancelEditBtn'].forEach(function (id) {
            var element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', showListView);
            }
        });

        // Age follows Birthdate on both the Add and the Edit form.
        ['birthdate', 'editBirthdate'].forEach(function (birthdateId) {
            var field = document.getElementById(birthdateId);
            if (!field) return;
            var ageId = birthdateId === 'editBirthdate' ? 'editAge' : 'age';
            field.addEventListener('change', function () {
                syncUserAge(birthdateId, ageId);
            });
            field.addEventListener('input', function () {
                syncUserAge(birthdateId, ageId);
            });
        });

        // Length of Residence follows Move-in Date on both the Add and the Edit form.
        ['moveInDate', 'editMoveInDate'].forEach(function (moveInDateId) {
            var field = document.getElementById(moveInDateId);
            if (!field) return;
            var lengthId = moveInDateId === 'editMoveInDate' ? 'editLengthOfResidence' : 'lengthOfResidence';
            var freshField = field.cloneNode(true);
            field.parentNode.replaceChild(freshField, field);
            freshField.addEventListener('change', function () {
                var lengthField = document.getElementById(lengthId);
                if (lengthField) lengthField.value = calculateLengthOfResidence(this.value);
            });
        });

        var saveBtn = document.getElementById('saveUserBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveUser);
        }

        var saveEditBtn = document.getElementById('saveEditBtn');
        if (saveEditBtn) {
            saveEditBtn.addEventListener('click', saveEditUser);
        }

        var editFromView = document.getElementById('editFromViewBtn');
        if (editFromView) {
            editFromView.addEventListener('click', function () {
                if (currentViewUserId !== null) {
                    openEditUser(currentViewUserId);
                }
            });
        }

        var archiveFromView = document.getElementById('archiveFromViewBtn');
        if (archiveFromView) {
            archiveFromView.addEventListener('click', function () {
                if (currentViewUserId !== null) {
                    archiveUser(currentViewUserId);
                }
            });
        }

        // Status chips - both the Add form and the Edit form use the same class.
        Array.prototype.forEach.call(document.querySelectorAll('.status-chip'), function (chip) {
            chip.addEventListener('click', function () {
                var group = chip.closest('.status-toggle-group');
                if (group) {
                    Array.prototype.forEach.call(group.querySelectorAll('.status-chip'), function (other) {
                        other.classList.remove('active');
                    });
                }
                chip.classList.add('active');
                var status = chip.getAttribute('data-status');
                var addHidden = document.getElementById('accountStatus');
                if (addHidden) {
                    addHidden.value = status;
                }
                var editHidden = document.getElementById('editAccountStatus');
                if (editHidden) {
                    editHidden.value = status;
                }
            });
        });

        // Photo inputs
        var uploadBtn = document.getElementById('uploadPhotoBtn');
        var photoInput = document.getElementById('photoUpload');
        var photoPreview = document.getElementById('photoPlaceholder');
        if (uploadBtn && photoInput) {
            uploadBtn.addEventListener('click', function () {
                photoInput.click();
            });
            photoInput.addEventListener('change', function () {
                readPhotoFile(photoInput.files[0], photoPreview).then(function (dataUrl) {
                    pendingPhoto = dataUrl;
                });
            });
        }

        var editUploadBtn = document.getElementById('editUploadPhotoBtn');
        var editPhotoInput = document.getElementById('editPhotoUpload');
        var editPhotoPreview = document.getElementById('editPhotoPreview');
        if (editUploadBtn && editPhotoInput) {
            editUploadBtn.addEventListener('click', function () {
                editPhotoInput.click();
            });
            editPhotoInput.addEventListener('change', function () {
                readPhotoFile(editPhotoInput.files[0], editPhotoPreview).then(function (dataUrl) {
                    pendingEditPhoto = dataUrl;
                });
            });
        }

        // Table actions, by delegation so re-rendered rows need no rebinding.
        var usersBody = document.getElementById('usersTableBody');
        if (usersBody) {
            usersBody.addEventListener('click', function (event) {
                var target = event.target.closest('[data-action]');
                if (!target) {
                    return;
                }
                var id = target.getAttribute('data-id');
                var action = target.getAttribute('data-action');
                if (action === 'view') {
                    openViewUser(id);
                } else if (action === 'edit') {
                    openEditUser(id);
                } else if (action === 'archive') {
                    archiveUser(id);
                }
            });
        }

        var pagination = document.getElementById('paginationControls');
        if (pagination) {
            pagination.addEventListener('click', function (event) {
                var target = event.target.closest('.page-btn');
                if (!target || target.disabled) {
                    return;
                }
                currentPage = parseInt(target.getAttribute('data-page'), 10);
                loadUsers();
            });
        }
    }

    // ---------------------------------------------------------------------------
    // Entry point
    // ---------------------------------------------------------------------------

    window.initUserManagementModule = function () {
        bindEvents();
        currentFilters = { search: '', role: '' };
        currentPage = 1;
        currentEditId = null;
        currentViewUserId = null;
        showListView();
    };
})();
