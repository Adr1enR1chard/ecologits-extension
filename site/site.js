// Progressive enhancements: the page reads the same without them.

// Set by the inline script in each page's head when the visitor accepts motion.
var motion = document.documentElement.classList.contains("motion");

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
                if (motion) {
                    figure.animate(
                        [
                            { opacity: 0, transform: "translateY(-0.25rem)" },
                            { opacity: 1, transform: "none" },
                        ],
                        { duration: 250, easing: "ease-out" },
                    );
                }
            });
        });
    });
})();

// Plays the hero's chat as a conversation: the question is typed and sent, the assistant thinks,
// its reply streams in word by word, then the badge appears under it with its figures counting up.
// Without motion, the chat shows the finished conversation.
(function () {
    var chat = document.querySelector(".hero .chat");
    if (!motion || !chat) return;

    var prompt = chat.querySelector(".chat-prompt");
    var input = chat.querySelector(".chat-input");
    var replay = document.querySelector(".chat-replay");
    var question = prompt.textContent.trim();
    var blocks = chat.querySelectorAll(".chat-reply p, .chat-reply li");
    var figures = chat.querySelectorAll(".badge > span:not([class]):not([aria-hidden])");
    var timers = [];

    // Time budgets in ms, so the conversation lasts about 5s whatever the language's lengths.
    var typingTime = 1000;
    var streamTime = 1700;
    var pause = 80;

    blocks.forEach(splitWords);
    chat.classList.add("is-ready");

    // Spreads the reply's words over its budget, less the pauses after sentences.
    var words = chat.querySelectorAll(".word");
    var stops = Array.prototype.filter.call(words, function (word) {
        return /[.:]$/.test(word.textContent);
    }).length;
    var wordTime = (streamTime - stops * pause) / words.length;

    // Wraps each word of the block's text in a `.word`, keeping the spaces between them as text.
    function splitWords(block) {
        Array.prototype.slice.call(block.childNodes).forEach(function (node) {
            if (node.nodeType !== Node.TEXT_NODE) return;
            var fragment = document.createDocumentFragment();
            node.textContent.split(/(\s+)/).forEach(function (part) {
                if (!part) return;
                if (/^\s+$/.test(part)) {
                    fragment.appendChild(document.createTextNode(part));
                    return;
                }
                var word = document.createElement("span");
                word.className = "word";
                word.textContent = part;
                fragment.appendChild(word);
            });
            block.replaceChild(fragment, node);
        });
    }

    // Counts a figure such as "4.2 Wh" or "4,2 Wh" up from zero, with its decimals and separator.
    function countUp(figure) {
        var text = figure.textContent;
        var match = /^([\d.,]+)([\s\S]*)$/.exec(text);
        if (!match) return;
        var separator = match[1].indexOf(",") >= 0 ? "," : ".";
        var decimals = (match[1].split(separator)[1] || "").length;
        var value = parseFloat(match[1].replace(",", "."));
        var start = performance.now();
        requestAnimationFrame(function frame(now) {
            var progress = Math.min((now - start) / 700, 1);
            if (progress === 1) {
                figure.textContent = text;
                return;
            }
            var eased = 1 - Math.pow(1 - progress, 3);
            figure.textContent = (value * eased).toFixed(decimals).replace(".", separator) + match[2];
            requestAnimationFrame(frame);
        });
    }

    function at(time, step) {
        timers.push(setTimeout(step, time));
    }

    function play() {
        timers.forEach(clearTimeout);
        timers = [];
        chat.classList.remove("show-prompt", "show-typing", "show-badge", "is-composing", "is-sending");
        chat.querySelectorAll(".is-shown, .is-started").forEach(function (element) {
            element.classList.remove("is-shown", "is-started");
        });
        input.textContent = "";
        if (replay) replay.hidden = true;

        var time = 300;
        at(time, function () {
            chat.classList.add("is-composing");
        });
        question.split("").forEach(function (_, index) {
            time += (typingTime / question.length) * (0.6 + Math.random() * 0.8);
            at(time, function () {
                input.textContent = question.slice(0, index + 1);
                input.scrollLeft = input.scrollWidth;
            });
        });

        time += 250;
        at(time, function () {
            chat.classList.remove("is-composing");
            chat.classList.add("is-sending", "show-prompt");
            input.textContent = "";
        });
        time += 250;
        at(time, function () {
            chat.classList.remove("is-sending");
            chat.classList.add("show-typing");
        });

        time += 600;
        at(time, function () {
            chat.classList.remove("show-typing");
        });
        blocks.forEach(function (block) {
            block.querySelectorAll(".word").forEach(function (word) {
                time += wordTime * (0.6 + Math.random() * 0.8);
                at(time, function () {
                    block.classList.add("is-started");
                    word.classList.add("is-shown");
                });
                if (/[.:]$/.test(word.textContent)) time += pause;
            });
        });

        time += 300;
        at(time, function () {
            chat.classList.add("show-badge");
            figures.forEach(countUp);
        });
        time += 700;
        at(time, function () {
            if (replay) replay.hidden = false;
        });
    }

    if (replay) replay.addEventListener("click", play);

    // Starts once the chat is in view, as it sits below the fold on small screens.
    var observer = new IntersectionObserver(
        function (entries) {
            if (!entries[0].isIntersecting) return;
            observer.disconnect();
            play();
        },
        { threshold: 0.5 },
    );
    observer.observe(chat);
})();

// Reveals the sections' headings, cards and mockups as they scroll into view, the siblings of a
// row one after the other.
(function () {
    if (!motion) return;
    var observer = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        },
        { rootMargin: "0px 0px -10% 0px" },
    );
    document
        .querySelectorAll(".section :is(h2, .lead, .card, .download, .popup-frame, .table-scroll)")
        .forEach(function (element) {
            var index = Array.prototype.indexOf.call(element.parentNode.children, element);
            element.style.transitionDelay = Math.min(index, 4) * 80 + "ms";
            observer.observe(element);
        });
})();
