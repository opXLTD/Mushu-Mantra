/* Shared light/dark theme controller.
   Load in <head> of EVERY page:  <script src="theme.js"></script>  */
(function () {
    var KEY = 'theme';
    var root = document.documentElement;

    function getSaved() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }
    function save(t) {
        try { localStorage.setItem(KEY, t); } catch (e) {}
    }

    function updateButtons(theme) {
        var btns = document.querySelectorAll('.theme-toggle');
        for (var i = 0; i < btns.length; i++) {
            btns[i].textContent = theme === 'light' ? '☀️ Light' : '🌙 Dark';
            btns[i].setAttribute('aria-label',
                theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
        }
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme;
        updateButtons(theme);
    }

    // Apply immediately (runs in <head>, so there is no dark->light flash)
    var saved = getSaved();
    applyTheme(saved === 'light' || saved === 'dark' ? saved : 'dark');

    window.toggleTheme = function () {
        var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        save(next);
        applyTheme(next);
    };

    // Button labels need the DOM, so refresh them once it is ready
    document.addEventListener('DOMContentLoaded', function () {
        updateButtons(root.getAttribute('data-theme'));
        document.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('.theme-toggle') : null;
            if (b) window.toggleTheme();
        });
    });

    // Keep other open tabs/pages in sync
    window.addEventListener('storage', function (e) {
        if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
            applyTheme(e.newValue);
        }
    });
})();
