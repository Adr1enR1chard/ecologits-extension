// Progressive enhancements: the page reads the same without them.

// Highlights the download for the visitor's browser.
(function () {
    var ua = navigator.userAgent;
    var browser = /Firefox\//.test(ua) ? "firefox" : /Chrome\/|Chromium\//.test(ua) ? "chrome" : null;
    if (!browser) return;
    var download = document.querySelector('[data-browser="' + browser + '"]');
    if (download) download.classList.add("is-current");
})();

// Switches the popup mockup's sample figures between periods. Each figure lists its value for
// every period in `data-values`, separated by `|`, in the order of the period buttons.
(function () {
    var buttons = document.querySelectorAll("[data-period]");
    buttons.forEach(function (button, index) {
        button.addEventListener("click", function () {
            buttons.forEach(function (other) {
                other.setAttribute("aria-pressed", String(other === button));
            });
            document.querySelectorAll("[data-values]").forEach(function (figure) {
                figure.textContent = figure.getAttribute("data-values").split("|")[index];
            });
        });
    });
})();
