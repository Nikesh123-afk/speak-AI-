const app = document.querySelector("#app");
const toastElement = document.querySelector("#toast");

const state = {
  user: null,
  view: "landing",
  authMode: "login",
  topics: {},
  practice: null,
  history: [],
  recognition: null,
  recording: false,
  config: { feedbackAvailable: false, billingAvailable: false }
};

const icons = {
  mic: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/></svg>`,
  play: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>`,
  user: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", "X-App-Request": "1", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function toast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastElement.classList.remove("show"), 3300);
}

function brand() {
  return `<a href="#home" class="brand"><span class="brand-mark">${icons.mic}</span><span>IELTS Fluent AI</span></a>`;
}

function renderLanding() {
  state.view = "landing";
  app.innerHTML = `
    <header class="site-header">
      <nav class="nav container" aria-label="Main navigation">
        ${brand()}
        <div class="nav-links" id="nav-links">
          <a href="#home">Home</a><a href="#practice">Practice</a><a href="#progress">Progress</a><a href="#resources">Resources</a>
          <button class="btn btn-primary" data-action="${state.user ? "dashboard" : "auth"}">${state.user ? `${icons.user}${escapeHtml(state.user.name)}` : "Login"}</button>
        </div>
        <button class="menu-btn" data-action="menu" aria-label="Open menu">☰</button>
      </nav>
    </header>
    <main>
      <section class="hero" id="home">
        <div class="container hero-inner">
          <span class="eyebrow">⚡ AI-Powered IELTS Speaking Coach</span>
          <h1>Master IELTS Speaking<br><span class="gradient-text">with AI</span></h1>
          <p class="hero-copy">Get instant band scores, personalized feedback, and practice with an AI examiner 24/7. Achieve your target score faster!</p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-wide" data-action="start-practice">${icons.mic} Start Free Practice</button>
            <a class="btn btn-secondary btn-wide" href="#how">${icons.play} See How It Works</a>
          </div>
          <p class="trust-line"><span>●</span> No credit card required <span>✓</span> 3 free practice sessions <span>✓</span> Instant feedback</p>
          <div class="stats" id="progress">
            <div class="stat"><strong>10,000+</strong><span>Active learners</span></div>
            <div class="stat"><strong>50,000+</strong><span>Practice sessions</span></div>
            <div class="stat"><strong>4.8/5</strong><span>Average learner rating</span></div>
          </div>
        </div>
      </section>

      <section class="section features" id="practice">
        <div class="container">
          <div class="section-head"><h2>Why Choose IELTS Fluent AI?</h2><p>Practice like you're in the real exam with our advanced AI examiner</p></div>
          <div class="feature-grid">
            <article class="feature-card"><div class="feature-icon">🎙</div><h3>Realistic AI Examiner</h3><p>Practice natural voice conversations with an examiner that follows the real IELTS speaking format.</p><div class="check-list"><span>Parts 1, 2 & 3</span><span>Natural follow-up questions</span><span>British voice guidance</span></div></article>
            <article class="feature-card"><div class="feature-icon">📊</div><h3>Instant Feedback</h3><p>Get detailed band scores and personalized feedback immediately after each practice session.</p><div class="check-list"><span>Band score breakdown</span><span>Grammar analysis</span><span>Vocabulary suggestions</span></div></article>
            <article class="feature-card"><div class="feature-icon">🏆</div><h3>Track Your Progress</h3><p>Save every assessment and see how your confidence, range, and overall score develop over time.</p><div class="check-list"><span>Session history</span><span>Performance trends</span><span>Actionable next steps</span></div></article>
          </div>
        </div>
      </section>

      <section class="section how" id="how">
        <div class="container">
          <div class="section-head"><h2>How It Works</h2><p>Get started in 3 simple steps</p></div>
          <div class="steps">
            <article class="step"><div class="step-number">1</div><h3>Select Mode</h3><p>Choose a curated IELTS topic or import your own questions.</p></article>
            <article class="step"><div class="step-number">2</div><h3>Speak Naturally</h3><p>Answer the AI examiner by voice or type when speech recognition is unavailable.</p></article>
            <article class="step"><div class="step-number">3</div><h3>Improve Faster</h3><p>Review your criteria scores, strengths, and targeted improvement advice.</p></article>
          </div>
        </div>
      </section>

      <section class="section demo">
        <div class="container">
          <div class="section-head"><h2>Try a Sample Question</h2><p>Experience how natural IELTS practice can feel</p></div>
          <div class="demo-card">
            <div class="demo-top"><h3>AI Speaking Examiner</h3><span class="live-pill">● Ready to practice</span></div>
            <div class="demo-body">
              <div class="question"><span class="examiner-avatar">AI</span><div class="speech-bubble"><small>Sample Part 1 Question</small><p>“Let's talk about your hometown. Where are you from?”</p></div></div>
              <div class="demo-actions"><button class="btn btn-primary" data-action="start-practice">${icons.mic} Record Your Answer</button><button class="btn btn-secondary" data-action="sample-feedback">View Sample Feedback</button></div>
              <p class="trust-line" style="text-align:center">Click “Record” to practice with full voice interaction and get instant AI feedback!</p>
            </div>
          </div>
        </div>
      </section>

      <section class="section stories">
        <div class="container">
          <div class="section-head"><h2>Success Stories</h2><p>Join thousands who improved their IELTS speaking scores</p></div>
          <div class="story-grid">
            ${story("R", "Ramesh Kumar", "Nepal", "I improved from 5.5 to 7.0 in just 2 months! The AI feedback helped me identify exactly where I was making mistakes.", "5.5 → 7.0")}
            ${story("L", "Li Wei", "China", "The 24/7 availability is perfect for my schedule. I could practice anytime and track my progress clearly.", "6.0 → 7.5", "★★★★☆")}
            ${story("M", "Maria Garcia", "Spain", "The instant feedback is incredibly detailed. It's like having a personal IELTS tutor available all the time!", "6.5 → 8.0")}
          </div>
        </div>
      </section>

      <section class="section pricing" id="pricing">
        <div class="container">
          <div class="section-head"><h2>Simple, Transparent Pricing</h2><p>Choose the plan that works best for you</p></div>
          <div class="pricing-grid">
            ${priceCard("Free", "$0", "/forever", ["3 practice sessions", "Basic feedback", "Part 1 practice"], "Start Free", "free")}
            ${priceCard("Standard", "$15", "/month", ["Unlimited practice", "All Parts 1, 2, 3", "Detailed feedback", "Progress tracking", "Email support"], "Get Started", "standard", true)}
            ${priceCard("Premium", "$35", "/3 months", ["Everything in Standard", "Mock test suite", "Vocabulary builder", "Priority support", "Certificate"], "Get Premium", "premium")}
          </div>
          <p class="trust-line" style="text-align:center">All plans include access to the AI examiner, instant feedback, and responsive mobile experience.</p>
        </div>
      </section>

      <section class="cta"><div class="container"><h2>Ready to Boost Your IELTS Speaking Score?</h2><p>Join 10,000+ students building confidence with our AI examiner</p><button class="btn" data-action="start-practice">⚡ Get Started Free</button><p class="trust-line">No credit card required • 3 free sessions • Cancel anytime</p></div></section>
    </main>
    ${footer()}
  `;
}

function story(initial, name, country, quote, score, stars = "★★★★★") {
  return `<article class="story"><div class="story-person"><span class="avatar">${initial}</span><div><h4>${name}</h4><small>${country}</small></div></div><div class="stars">${stars}</div><blockquote>“${quote}”</blockquote><span class="score-pill">${score}</span></article>`;
}

function priceCard(name, price, suffix, items, label, plan, popular = false) {
  return `<article class="price-card ${popular ? "popular" : ""}">${popular ? '<span class="popular-label">MOST POPULAR</span>' : ""}<h3>${name}</h3><div class="price">${price}<small>${suffix}</small></div><ul class="price-list">${items.map(item => `<li>${item}</li>`).join("")}</ul><button class="btn ${popular ? "btn-secondary" : "btn-outline"}" data-action="choose-plan" data-plan="${plan}">${label}</button></article>`;
}

function footer() {
  return `<footer class="site-footer" id="resources"><div class="container"><div class="footer-grid"><div>${brand()}<p class="footer-copy">Master IELTS Speaking with AI-powered practice and instant feedback.</p></div><div><div class="footer-title">Product</div><div class="footer-links"><a href="#practice">Features</a><a href="#pricing">Pricing</a><a href="#practice">Practice</a><a href="#resources">Resources</a></div></div><div><div class="footer-title">Company</div><div class="footer-links"><a href="#home">About</a><a href="#resources">Blog</a><a href="mailto:hello@example.com">Contact</a><a href="#resources">Careers</a></div></div><div><div class="footer-title">Stay Updated</div><p class="footer-copy">Get tips and updates delivered to your inbox</p><form class="subscribe" id="subscribe-form"><input type="email" name="email" required aria-label="Email for updates" placeholder="Your email"><button>Subscribe</button></form></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} IELTS Fluent AI. All rights reserved.</span><span>Privacy Policy · Terms of Service · Cookie Policy</span></div></div></footer>`;
}

function openAuth(mode = "login") {
  state.authMode = mode;
  const existing = document.querySelector(".modal-backdrop");
  if (existing) existing.remove();
  const signup = mode === "signup";
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" data-modal="auth"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button class="modal-close" data-action="close-modal" aria-label="Close">×</button><div class="auth-mark">${icons.mic}</div><h2 id="auth-title">${signup ? "Create Account" : "Welcome Back"}</h2><p class="modal-subtitle">${signup ? "Start your IELTS speaking journey" : "Login to continue your IELTS practice"}</p><div id="auth-error"></div><form id="auth-form">${signup ? '<div class="form-group"><label for="name">Full Name</label><input class="form-control" id="name" name="name" required placeholder="John Doe"></div>' : ""}<div class="form-group"><label for="email">Email Address</label><input class="form-control" id="email" name="email" type="email" required placeholder="you@example.com"></div><div class="form-group"><label for="password">Password</label><input class="form-control" id="password" name="password" type="password" minlength="${signup ? 12 : 1}" maxlength="128" required autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "At least 12 characters" : "••••••••"}"></div><button class="btn btn-primary" style="width:100%" type="submit">${signup ? "Sign Up" : "Login"}</button></form><p class="auth-switch">${signup ? "Already have an account?" : "Don’t have an account?"} <button class="link-btn" data-action="switch-auth">${signup ? "Login" : "Sign Up"}</button></p></div></div>`);
  setTimeout(() => document.querySelector(signup ? "#name" : "#email")?.focus(), 0);
}

async function submitAuth(form) {
  const button = form.querySelector("button[type=submit]");
  const input = Object.fromEntries(new FormData(form));
  button.disabled = true;
  button.textContent = "Please wait...";
  try {
    const payload = await request(`/api/auth/${state.authMode === "signup" ? "signup" : "login"}`, { method: "POST", body: JSON.stringify(input) });
    state.user = payload.user;
    document.querySelector(".modal-backdrop")?.remove();
    toast(`Welcome${state.authMode === "signup" ? "" : " back"}, ${state.user.name}!`);
    if (state.pendingPlan) {
      const plan = state.pendingPlan;
      state.pendingPlan = null;
      await choosePlan(plan);
      return;
    }
    if (state.view === "practice") renderPracticeWelcome(); else renderLanding();
  } catch (error) {
    document.querySelector("#auth-error").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    button.disabled = false;
    button.textContent = state.authMode === "signup" ? "Sign Up" : "Login";
  }
}

async function openDashboard() {
  try { state.history = (await request("/api/practices")).practices; } catch { state.history = []; }
  const scores = state.history.map(item => averageScore(item.feedback)).filter(value => value !== null);
  const best = scores.length ? Math.max(...scores).toFixed(1) : "—";
  const last = scores.length ? scores[0].toFixed(1) : "—";
  const history = state.history.length ? state.history.slice(0, 6).map(item => `<div class="history-item"><div><strong>${escapeHtml(item.topic)}</strong><small>${new Date(item.createdAt).toLocaleDateString()} · Part ${item.part}</small></div><span class="band">${averageScore(item.feedback)?.toFixed(1) ?? "—"}</span></div>`).join("") : `<p class="footer-copy">No practice results yet. Complete your first session to start tracking progress.</p>`;
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><div class="modal large" role="dialog" aria-modal="true"><button class="modal-close" data-action="close-modal" aria-label="Close" style="color:white">×</button><div class="dashboard-head"><span class="dashboard-avatar">${escapeHtml(state.user.name[0].toUpperCase())}</span><div><h2>${escapeHtml(state.user.name)}</h2><p>${escapeHtml(state.user.email)}</p><span class="plan-pill">${escapeHtml(state.user.plan[0].toUpperCase() + state.user.plan.slice(1))} Plan</span></div></div><div class="dashboard-body"><div class="metric-grid"><div class="metric"><span>Practice Sessions</span><strong>${state.history.length}</strong></div><div class="metric"><span>Latest Score</span><strong>${last}</strong></div><div class="metric"><span>Best Score</span><strong>${best}</strong></div></div><div class="history"><h3>Recent Progress</h3>${history}</div><div class="dashboard-actions"><button class="btn btn-primary" data-action="start-practice">${icons.mic} Start New Practice</button>${state.user.plan !== "free" && state.config.billingAvailable ? '<button class="btn btn-secondary" data-action="billing-portal">Manage billing</button>' : ""}<button class="btn btn-secondary" data-action="logout">Sign out of your account</button></div></div></div></div>`);
}

async function choosePlan(plan) {
  if (!state.user) { state.pendingPlan = plan; return openAuth("signup"); }
  if (plan === "free") return beginPractice();
  if (!state.config.billingAvailable) return toast("Paid plans are not available yet.");
  if (state.user.plan !== "free") return openBillingPortal();
  try {
    const payload = await request("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
    window.location.assign(payload.url);
  } catch (error) { toast(error.message); }
}

async function openBillingPortal() {
  try {
    const payload = await request("/api/billing/portal", { method: "POST", body: "{}" });
    window.location.assign(payload.url);
  } catch (error) { toast(error.message); }
}

function averageScore(feedback) {
  const values = Object.values(feedback?.criteria || {}).filter(value => typeof value === "number");
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 2) / 2 : null;
}

async function beginPractice() {
  document.querySelector(".modal-backdrop")?.remove();
  if (!state.user) { state.view = "practice"; return openAuth("signup"); }
  renderPracticeWelcome();
}

function renderPracticeWelcome() {
  state.view = "practice";
  app.innerHTML = `<main class="practice-page"><div class="container"><header class="practice-header"><div><h1>🎤 IELTS Speaking Practice</h1><p>Interactive AI Examiner · Real-time voice conversation</p></div><button class="btn btn-secondary" data-action="home">← Back to home</button></header><section class="practice-stage"><div class="welcome"><div class="welcome-emoji">🎯</div><h2>Welcome to IELTS Speaking Practice</h2><p>Practice with an AI examiner that speaks to you and listens to your responses. Get instant feedback on your performance!</p><h3>Choose a topic</h3><div class="topic-grid">${Object.entries(state.topics).map(([id, topic]) => `<button class="topic" data-action="topic" data-topic="${id}">${topic.title}<small style="display:block;color:#6b7280;margin-top:4px">${topic.questions.length} examiner questions</small></button>`).join("")}</div><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary btn-wide" data-action="launch-practice" disabled>Start Speaking Test</button><button class="btn btn-secondary btn-wide" data-action="custom-topic">Import Your Questions</button></div></div></section></div></main>`;
  state.practice = { topicId: null, questionIndex: 0, answers: [], messages: [], requestKey: crypto.randomUUID() };
}

function selectTopic(id) {
  state.practice.topicId = id;
  document.querySelectorAll(".topic").forEach(node => node.classList.toggle("selected", node.dataset.topic === id));
  document.querySelector('[data-action="launch-practice"]').disabled = false;
}

function customTopic() {
  const input = window.prompt("Paste 2–6 questions, one per line:");
  if (!input) return;
  const questions = input.split(/\n+/).map(value => value.trim()).filter(Boolean).slice(0, 6);
  if (questions.length < 2) return toast("Please provide at least two questions.");
  state.topics.custom = { title: "Imported Questions", questions };
  renderPracticeWelcome();
  selectTopic("custom");
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = .92;
  speechSynthesis.speak(utterance);
}

function launchPractice() {
  const topic = state.topics[state.practice.topicId];
  if (!topic) return;
  state.practice.messages = [{ role: "examiner", text: topic.questions[0] }];
  renderActivePractice();
  speak(topic.questions[0]);
}

function renderActivePractice() {
  const topic = state.topics[state.practice.topicId];
  const messages = state.practice.messages.map(message => `<div class="message ${message.role}"><small>${message.role === "examiner" ? "AI Examiner" : "You"}</small><p>${escapeHtml(message.text)}</p></div>`).join("");
  app.innerHTML = `<main class="practice-page"><div class="container"><header class="practice-header"><div><h1>🎤 IELTS Speaking Practice</h1><p>${escapeHtml(topic.title)} · Question ${Math.min(state.practice.questionIndex + 1, topic.questions.length)} of ${topic.questions.length}</p></div><div><strong style="color:#2563eb">Part 1</strong><button class="btn btn-secondary" data-action="home" style="margin-left:12px">Exit</button></div></header><section class="practice-stage"><div class="practice-layout"><div class="conversation" id="conversation">${messages}</div><aside class="answer-panel"><h2 style="margin-top:0">Your Answer</h2><p style="color:#6b7280">Speak naturally or type your response below.</p><textarea class="form-control" id="answer" placeholder="Your answer will appear here..."></textarea><button class="btn btn-primary" data-action="record" style="width:100%">${icons.mic} <span>Start Recording</span></button><button class="btn btn-secondary" data-action="submit-answer" style="width:100%;margin-top:10px">Submit Answer →</button><p id="record-status" style="text-align:center;font-size:.85rem;color:#6b7280"></p></aside></div></section></div></main>`;
  const conversation = document.querySelector("#conversation");
  conversation.scrollTop = conversation.scrollHeight;
}

function toggleRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return toast("Voice recognition is unavailable in this browser. You can type your answer instead.");
  if (state.recording) { state.recognition?.stop(); return; }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-GB";
  recognition.continuous = true;
  recognition.interimResults = true;
  state.recognition = recognition;
  const textarea = document.querySelector("#answer");
  const startingText = textarea.value;
  recognition.onstart = () => { state.recording = true; updateRecordUI(); };
  recognition.onresult = event => {
    let transcript = "";
    for (let index = 0; index < event.results.length; index++) transcript += `${event.results[index][0].transcript} `;
    textarea.value = `${startingText} ${transcript}`.trim();
  };
  recognition.onerror = event => toast(event.error === "not-allowed" ? "Allow microphone access to record your answer." : "Speech recognition stopped. You can continue by typing.");
  recognition.onend = () => { state.recording = false; updateRecordUI(); };
  recognition.start();
}

function updateRecordUI() {
  const button = document.querySelector('[data-action="record"]');
  if (!button) return;
  button.querySelector("span").textContent = state.recording ? "Stop Recording" : "Start Recording";
  button.classList.toggle("recording", state.recording);
  document.querySelector("#record-status").textContent = state.recording ? "● Listening… speak clearly and naturally" : "";
}

async function submitAnswer() {
  const answer = document.querySelector("#answer").value.trim();
  if (!answer) return toast("Record or type an answer first.");
  if (state.recording) state.recognition?.stop();
  const topic = state.topics[state.practice.topicId];
  const question = topic.questions[state.practice.questionIndex];
  state.practice.answers.push({ question, answer });
  state.practice.messages.push({ role: "candidate", text: answer });
  state.practice.questionIndex++;
  if (state.practice.questionIndex < topic.questions.length) {
    const next = topic.questions[state.practice.questionIndex];
    state.practice.messages.push({ role: "examiner", text: next });
    renderActivePractice();
    speak(next);
  } else {
    await requestAssessment();
  }
}

async function requestAssessment() {
  const topic = state.topics[state.practice.topicId];
  renderAssessing();
  try {
    // The same key is reused on retry so the server never assesses an attempt twice.
    const payload = await request("/api/feedback", { method: "POST", headers: { "Idempotency-Key": state.practice.requestKey }, body: JSON.stringify({ topic: topic.title, part: 1, answers: state.practice.answers }) });
    state.practice.result = payload.practice;
    renderFeedback();
  } catch (error) {
    document.querySelector(".practice-stage").innerHTML = `<div class="welcome"><div class="welcome-emoji">⚠️</div><h2>We couldn't assess your answers</h2><p>${escapeHtml(error.message)}</p><p>Your answers are kept on this screen.</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary" data-action="retry-assessment">Try again</button><button class="btn btn-secondary" data-action="home">Back to home</button></div></div>`;
  }
}

function renderAssessing() {
  document.querySelector(".practice-stage").innerHTML = `<div class="welcome"><div class="welcome-emoji">✨</div><h2>Analysing your speaking</h2><p>Reviewing coherence, vocabulary and grammatical range in your transcript…</p></div>`;
}

function renderFeedback() {
  const result = state.practice.result;
  const criteria = Object.entries(result.feedback.criteria).map(([name, value]) => `<div class="criterion"><span>${escapeHtml(name)}</span><strong>${typeof value === "number" ? value : "Not scored"}</strong><div class="progress-bar"><i style="width:${typeof value === "number" ? value / 9 * 100 : 0}%"></i></div></div>`).join("");
  const average = averageScore(result.feedback);
  app.innerHTML = `<main class="practice-page"><div class="container"><header class="practice-header"><div><h1>Your Speaking Feedback</h1><p>${escapeHtml(result.topic)} · Saved to your progress</p></div><button class="btn btn-secondary" data-action="home">Back to home</button></header><section class="practice-stage feedback"><div class="score-orb"><div><strong>${average ?? "—"}</strong><span>Transcript score</span></div></div><div class="criteria">${criteria}</div><div class="feedback-columns"><div class="feedback-box good"><h3>What you did well</h3><ul>${result.feedback.strengths.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="feedback-box improve"><h3>How to improve</h3><ul>${result.feedback.improvements.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></div><p class="trust-line" style="text-align:center">${escapeHtml(result.feedback.summary)}</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px"><button class="btn btn-primary" data-action="retry">Practice Another Topic</button><button class="btn btn-secondary" data-action="dashboard">View Progress</button></div></section></div></main>`;
}

function showSampleFeedback() {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><div class="modal"><button class="modal-close" data-action="close-modal">×</button><div class="score-orb"><div><strong>7.0</strong><span>Sample band</span></div></div><h2>Clear, well-developed answer</h2><p class="modal-subtitle">You give a direct answer, explain why, and support it with a relevant example. To reach a higher band, use a wider range of complex sentences and more precise topic vocabulary.</p><button class="btn btn-primary" data-action="start-practice" style="width:100%">Try It Yourself</button></div></div>`);
}

async function logout() {
  await request("/api/auth/logout", { method: "POST", body: "{}" });
  state.user = null;
  document.querySelector(".modal-backdrop")?.remove();
  toast("You’re signed out.");
  renderLanding();
}

document.addEventListener("click", async event => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "menu") document.querySelector("#nav-links")?.classList.toggle("open");
  if (action === "auth") openAuth("login");
  if (action === "switch-auth") openAuth(state.authMode === "login" ? "signup" : "login");
  if (action === "close-modal") target.closest(".modal-backdrop")?.remove();
  if (action === "dashboard") { document.querySelector(".modal-backdrop")?.remove(); await openDashboard(); }
  if (action === "logout") await logout();
  if (action === "start-practice") await beginPractice();
  if (action === "home") { window.speechSynthesis?.cancel(); renderLanding(); window.scrollTo({ top: 0 }); }
  if (action === "topic") selectTopic(target.dataset.topic);
  if (action === "custom-topic") customTopic();
  if (action === "launch-practice") launchPractice();
  if (action === "record") toggleRecording();
  if (action === "submit-answer") await submitAnswer();
  if (action === "retry") renderPracticeWelcome();
  if (action === "sample-feedback") showSampleFeedback();
  if (action === "choose-plan") await choosePlan(target.dataset.plan);
  if (action === "billing-portal") await openBillingPortal();
  if (action === "retry-assessment") await requestAssessment();
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  if (event.target.id === "auth-form") await submitAuth(event.target);
  if (event.target.id === "subscribe-form") {
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const payload = await request("/api/subscribe", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
      toast(payload.message); event.target.reset();
    } catch (error) { toast(error.message); }
    button.disabled = false;
  }
});

async function init() {
  try {
    const [auth, topics, config] = await Promise.all([request("/api/auth/me"), request("/api/topics"), request("/api/config")]);
    state.user = auth.user;
    state.topics = topics;
    state.config = config;
  } catch (error) { console.error(error); }
  renderLanding();
  if (new URLSearchParams(window.location.search).get("checkout") === "success") {
    // The plan is granted by the Stripe webhook, which can arrive shortly after this redirect.
    toast("Payment received. Your plan will be active in a moment.");
    history.replaceState(null, "", window.location.pathname);
  }
}

init();
