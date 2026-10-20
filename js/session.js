// session.js - Client-side session state for the Barangay Management Information System.

(function () {
    'use strict';

    const SESSION_URL = 'api/session.php';

    const Session = {
        user: null,
        ready: null,

        /**
         * Fetch (once) the current session state from the server.
         * @returns {Promise<Object|null>} the user object, or null when signed out
         */
        load: function () {
            if (this.ready) {
                return this.ready;
            }

            this.ready = fetch(SESSION_URL, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
            })
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    Session.user = data && data.authenticated ? (data.user || null) : null;
                    return Session.user;
                })
                .catch(function (error) {
                    console.error('Session check failed:', error);
                    Session.user = null;
                    return null;
                });

            return this.ready;
        },

        /** Is there a signed-in user? */
        isLoggedIn: function () {
            return !!this.user;
        },

        /** Get the current user's role (from server data). */
        getRole: function () {
            return (this.user && this.user.role) || '';
        },

        /** Check if the current user has a specific role. */
        hasRole: function (role) {
            return this.getRole() === role;
        },

        /** Clear cached state (used after signing out). */
        clear: function () {
            this.user = null;
            this.ready = null;
        },

        /**
         * Require a signed-in user or redirect to the sign-in screen.
         * @returns {Promise<Object>} the user object
         */
        requireUser: function () {
            return this.load().then(function (user) {
                if (!user) {
                    window.location.replace('login.php');
                    return null;
                }
                return user;
            });
        },

        /** Apply the signed-in user's identity to the dashboard header. */
        applyToHeader: function () {
            const user = this.user;
            if (!user) {
                return;
            }

            const nameEl = document.querySelector('.user-name');
            const roleEl = document.querySelector('.user-role');

            if (nameEl) nameEl.textContent = user.name || user.username || 'User';
            if (roleEl) roleEl.textContent = user.role || '';
        },

        /** Wire up the sign-out control, if one is present. */
        bindSignOut: function () {
            const signOutBtn = document.getElementById('signOutButton');

            if (!signOutBtn) {
                return;
            }

            signOutBtn.addEventListener('click', function (event) {
                event.preventDefault();

                // Best effort: tell the server to destroy its session too.
                fetch('logout.php', {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                }).catch(function () { /* ignore */ });

                Session.clear();

                try {
                    sessionStorage.removeItem('bmis_session');
                    localStorage.removeItem('bmis_session');
                } catch (error) { /* ignore */ }

                window.location.replace('login.php');
            });
        },
    };

    // Expose globally.
    window.Session = Session;
})();
