// login.js - Sign-in screen logic for the Barangay Management Information System.

(function () {
    'use strict';

    const STORAGE_KEY = 'bmis_session';

    const form = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberMe = document.getElementById('rememberMe');
    const alertBox = document.getElementById('loginAlert');
    const submitButton = document.getElementById('signInButton');
    const submitLabel = submitButton ? submitButton.querySelector('.signin-label') : null;
    const togglePassword = document.getElementById('togglePassword');

    // Already signed in -> go straight to the dashboard.
    if (window.Session && window.Session.isLoggedIn()) {
        window.location.replace('index.php');
        return;
    }

    // Restore the remembered username.
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && saved.username) {
            usernameInput.value = saved.username;
            rememberMe.checked = true;
            passwordInput.focus();
        } else {
            usernameInput.focus();
        }
    } catch (error) {
        usernameInput.focus();
    }

    // Show / hide password.
    if (togglePassword) {
        togglePassword.addEventListener('click', function () {
            const show = passwordInput.type === 'password';
            passwordInput.type = show ? 'text' : 'password';
            togglePassword.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            const eye = togglePassword.querySelector('.icon-eye');
            const eyeOff = togglePassword.querySelector('.icon-eye-off');
            if (eye) eye.hidden = show;
            if (eyeOff) eyeOff.hidden = !show;
        });
    }

    function showAlert(message, type) {
        if (!alertBox) return;
        alertBox.textContent = message;
        alertBox.className = 'alert alert-' + type;
        alertBox.hidden = false;
    }

    function clearAlert() {
        if (!alertBox) return;
        alertBox.textContent = '';
        alertBox.hidden = true;
    }

    function setLoading(loading) {
        if (!submitButton) return;
        submitButton.disabled = loading;
        submitButton.classList.toggle('loading', loading);
        if (submitLabel) submitLabel.textContent = loading ? 'Signing in' : 'Sign In';
    }

    async function handleSubmit(event) {
        event.preventDefault();
        clearAlert();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username) {
            showAlert('Please enter your username.', 'error');
            usernameInput.focus();
            return;
        }
        if (!password) {
            showAlert('Please enter your password.', 'error');
            passwordInput.focus();
            return;
        }

        setLoading(true);

        try {
            const result = await window.LoginAPI.authenticate(username, password);

            if (!result || result.success !== true) {
                const message = (result && result.message) || 'Unable to sign in. Please try again.';
                showAlert(message, 'error');
                setLoading(false);
                passwordInput.select();
                return;
            }

            const user = result.user || {};

            // Persist the session for this browser.
            try {
                const session = {
                    user_id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    login_at: Date.now(),
                };

                if (rememberMe.checked) {
                    session.username_only = username;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({
                        username: username,
                        session: session,
                    }));
                } else {
                    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
                    localStorage.removeItem(STORAGE_KEY);
                }
            } catch (storageError) {
                // Storage may be unavailable (private mode); the server session still works.
                console.warn('Could not persist session locally:', storageError);
            }

            setLoading(true);
            window.location.replace('index.php');
        } catch (error) {
            console.error('Sign-in request failed:', error);
            showAlert('Unable to reach the server. Please check your connection and try again.', 'error');
            setLoading(false);
        }
    }

    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    // Clear the error as soon as the user edits either field.
    [usernameInput, passwordInput].forEach(function (input) {
        if (input) {
            input.addEventListener('input', clearAlert);
        }
    });
})();
