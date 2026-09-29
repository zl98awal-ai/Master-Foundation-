/* Self-check practice engine.
   Each page defines window.QUIZ = { listen: bool, items: [{ q, options: [...], answer: "A", why: "..." }] } */
(function () {
  var cfg = window.QUIZ;
  var root = document.getElementById("quiz");
  if (!cfg || !root) return;

  var LETTERS = ["A", "B", "C", "D"];
  var mode = "read"; // "read" | "listen"
  var answered = 0, correct = 0;
  var canSpeak = "speechSynthesis" in window;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function speak(parts) {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    var voice = (window.speechSynthesis.getVoices() || []).filter(function (v) {
      return /^en(-|_)(US|GB)/i.test(v.lang);
    })[0];
    parts.forEach(function (text) {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = voice ? voice.lang : "en-US";
      if (voice) u.voice = voice;
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    });
  }

  // Top bar: mode toggle + score
  var bar = el("div", "quiz-bar");
  var scoreEl = el("div", "score");
  scoreEl.setAttribute("aria-live", "polite");
  if (cfg.listen && canSpeak) {
    var toggle = el("div", "toggle");
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", "Practice mode");
    [["read", "Read mode"], ["listen", "Listening mode"]].forEach(function (m) {
      var b = el("button", null, m[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", m[0] === mode ? "true" : "false");
      b.addEventListener("click", function () {
        mode = m[0];
        Array.prototype.forEach.call(toggle.children, function (c) { c.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        render();
      });
      toggle.appendChild(b);
    });
    bar.appendChild(toggle);
  }
  bar.appendChild(scoreEl);
  root.appendChild(bar);

  var list = el("div");
  root.appendChild(list);
  var resultBox = el("div");
  root.appendChild(resultBox);

  function updateScore() {
    scoreEl.textContent = "Score: " + correct + " / " + cfg.items.length;
    resultBox.innerHTML = "";
    if (answered === cfg.items.length) {
      var card = el("div", "card result");
      card.appendChild(el("div", null, "You finished!"));
      card.appendChild(el("div", "big", correct + " / " + cfg.items.length));
      var pct = correct / cfg.items.length;
      card.appendChild(el("p", null,
        pct === 1 ? "Perfect score. Great listening!" :
        pct >= 0.75 ? "Good work. Read the feedback on the items you missed." :
        "Keep practising. Check the trap type for each item you missed, then try again."));
      var again = el("button", "btn", "Try again");
      again.type = "button";
      again.addEventListener("click", function () { render(); window.scrollTo({ top: root.offsetTop - 16, behavior: "smooth" }); });
      card.appendChild(again);
      resultBox.appendChild(card);
    }
  }

  function render() {
    if (canSpeak) window.speechSynthesis.cancel();
    answered = 0; correct = 0;
    list.innerHTML = "";
    cfg.items.forEach(function (item, i) {
      var box = el("div", "q");
      var head = el("div", "q-head");
      head.appendChild(el("span", "q-num", (i + 1) + "."));
      var qText = el("span", "q-text", mode === "listen" ? "Press Play and listen." : item.q);
      if (mode === "listen") qText.classList.add("hidden-text");
      head.appendChild(qText);
      if (mode === "listen") {
        var play = el("button", "play", "▶ Play");
        play.type = "button";
        play.setAttribute("aria-label", "Play item " + (i + 1));
        play.addEventListener("click", function () {
          var parts = [item.q];
          item.options.forEach(function (o, k) { parts.push(LETTERS[k] + ". " + o); });
          speak(parts);
        });
        head.appendChild(play);
      }
      box.appendChild(head);

      var opts = el("div", "opts");
      var fb = el("div", "feedback");
      fb.setAttribute("aria-live", "polite");
      var buttons = [];
      item.options.forEach(function (o, k) {
        var b = el("button", "opt");
        b.type = "button";
        b.appendChild(el("span", "letter", LETTERS[k]));
        b.appendChild(el("span", null, mode === "listen" ? "" : o));
        b.addEventListener("click", function () {
          var isRight = LETTERS[k] === item.answer;
          buttons.forEach(function (bb, kk) {
            bb.disabled = true;
            bb.lastChild.textContent = item.options[kk]; // reveal text after answering
            if (LETTERS[kk] === item.answer) bb.classList.add("correct");
          });
          if (!isRight) b.classList.add("wrong");
          if (mode === "listen") { qText.textContent = item.q; qText.classList.remove("hidden-text"); }
          fb.innerHTML = "";
          fb.appendChild(el("strong", null, isRight ? "Correct." : "Not quite. The answer is " + item.answer + "."));
          fb.appendChild(el("span", null, item.why));
          fb.className = "feedback show " + (isRight ? "ok" : "no");
          answered++; if (isRight) correct++;
          updateScore();
        });
        buttons.push(b);
        opts.appendChild(b);
      });
      box.appendChild(opts);
      box.appendChild(fb);
      list.appendChild(box);
    });
    updateScore();
  }

  if (canSpeak && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = function () {};
  }
  render();
})();
