import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataDir = join(root, ".data");
const dataFile = join(dataDir, "data.json");
const port = Number(process.env.PORT || 3000);
const sessions = new Map();

const topics = {
  hometown: {
    title: "Hometown & Home",
    questions: [
      "Let's talk about your hometown. Where are you from?",
      "What do you like most about your hometown?",
      "Has your hometown changed much in recent years?",
      "Would you like to live there in the future?"
    ]
  },
  work: {
    title: "Work & Study",
    questions: [
      "Do you work or are you a student?",
      "What do you enjoy most about your work or studies?",
      "What would you like to change about it?",
      "What are your plans for the future?"
    ]
  },
  technology: {
    title: "Technology",
    questions: [
      "How often do you use technology in your daily life?",
      "Which piece of technology is most useful to you?",
      "Do people rely too much on technology today?",
      "How might technology change education in the future?"
    ]
  },
  travel: {
    title: "Travel",
    questions: [
      "Do you enjoy travelling?",
      "Tell me about a memorable place you have visited.",
      "Do you prefer travelling alone or with other people?",
      "Why is tourism important for a country?"
    ]
  }
};

async function loadData() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    await writeFile(dataFile, JSON.stringify({ users: [], practices: [], subscribers: [] }, null, 2));
  }
  return JSON.parse(await readFile(dataFile, "utf8"));
}

let data = await loadData();
let saveQueue = Promise.resolve();
function saveData() {
  saveQueue = saveQueue.then(() => writeFile(dataFile, JSON.stringify(data, null, 2)));
  return saveQueue;
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(v => {
    const index = v.indexOf("=");
    return [v.slice(0, index).trim(), decodeURIComponent(v.slice(index + 1))];
  }));
}

function currentUser(req) {
  const userId = sessions.get(cookies(req).ielts_session);
  const user = data.users.find(item => item.id === userId);
  return user ? publicUser(user) : null;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, plan: user.plan, createdAt: user.createdAt };
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex") };
}

function passwordMatches(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request too large");
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error("Invalid JSON"); }
}

function createSession(res, userId) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, userId);
  return { "Set-Cookie": `ielts_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}` };
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) json(res, 401, { error: "Please log in to continue." });
  return user;
}

function syllables(word) {
  const value = word.toLowerCase().replace(/[^a-z]/g, "").replace(/e$/, "");
  return Math.max(1, (value.match(/[aeiouy]+/g) || []).length);
}

function analyseAnswer(text) {
  const clean = text.trim();
  const words = clean.match(/[A-Za-z']+/g) || [];
  const unique = new Set(words.map(word => word.toLowerCase()));
  const sentences = clean.split(/[.!?]+/).filter(value => value.trim());
  const connectors = (clean.match(/\b(because|however|although|therefore|while|for example|in addition|on the other hand|personally|overall)\b/gi) || []).length;
  const fillerCount = (clean.match(/\b(um+|uh+|like|you know|sort of|kind of)\b/gi) || []).length;
  const averageSentence = words.length / Math.max(1, sentences.length);
  const lexicalRatio = unique.size / Math.max(1, words.length);
  const lengthScore = Math.min(2.2, words.length / 38);
  const fluency = clamp(4.5 + lengthScore + Math.min(1, connectors * .22) - Math.min(1.2, fillerCount * .18), 4, 9);
  const vocabulary = clamp(4.6 + lexicalRatio * 2.1 + Math.min(.8, words.filter(word => syllables(word) >= 3).length * .08), 4, 9);
  const grammar = clamp(4.8 + Math.min(1.3, averageSentence / 13) + Math.min(.7, sentences.length * .12), 4, 9);
  const pronunciation = clamp(5.3 + Math.min(1.6, words.length / 55), 4, 9);
  return { fluency, vocabulary, grammar, pronunciation, wordCount: words.length, connectors, fillerCount };
}

function clamp(value, min, max) { return Math.round(Math.max(min, Math.min(max, value)) * 2) / 2; }

function buildFeedback(answers) {
  const joined = answers.map(item => item.answer || "").join(" ");
  const score = analyseAnswer(joined);
  const band = clamp((score.fluency + score.vocabulary + score.grammar + score.pronunciation) / 4, 4, 9);
  const strengths = [];
  const improvements = [];
  if (score.wordCount >= 70) strengths.push("You developed your ideas with useful detail instead of giving very short answers.");
  if (score.connectors >= 2) strengths.push("You used linking language to organise and connect your ideas.");
  if (score.vocabulary >= 6.5) strengths.push("Your vocabulary showed good range and some precise word choices.");
  if (!strengths.length) strengths.push("You answered the questions directly and maintained a clear topic focus.");
  if (score.wordCount < 70) improvements.push("Extend each answer with a reason, a specific example, and one extra detail.");
  if (score.connectors < 2) improvements.push("Use natural connectors such as ‘because’, ‘for example’, and ‘however’ to shape longer answers.");
  if (score.fillerCount > 2) improvements.push("Replace fillers with a brief pause; this will make your delivery sound more controlled.");
  improvements.push("Record the same answers again and vary sentence openings to demonstrate more grammatical range.");
  return {
    band,
    criteria: {
      "Fluency & Coherence": score.fluency,
      "Lexical Resource": score.vocabulary,
      "Grammatical Range": score.grammar,
      "Pronunciation": score.pronunciation
    },
    strengths,
    improvements,
    summary: `Estimated band ${band}. This practice assessment is formative and is not an official IELTS result.`
  };
}

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/api/topics") return json(res, 200, topics);
  if (req.method === "GET" && url.pathname === "/api/auth/me") return json(res, 200, { user: currentUser(req) });

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    const name = String(input.name || "").trim();
    const password = String(input.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return json(res, 400, { error: "Enter your name, a valid email, and a password of at least 6 characters." });
    if (data.users.some(user => user.email === email)) return json(res, 409, { error: "User with this email already exists." });
    const secured = hashPassword(password);
    const user = { id: randomUUID(), name, email, salt: secured.salt, passwordHash: secured.hash, plan: "free", createdAt: new Date().toISOString() };
    data.users.push(user);
    await saveData();
    return json(res, 201, { user: publicUser(user) }, createSession(res, user.id));
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const input = await body(req);
    const user = data.users.find(item => item.email === String(input.email || "").trim().toLowerCase());
    if (!user || !passwordMatches(String(input.password || ""), user)) return json(res, 401, { error: "Invalid email or password." });
    return json(res, 200, { user: publicUser(user) }, createSession(res, user.id));
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookies(req).ielts_session;
    if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, { "Set-Cookie": "ielts_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (req.method === "GET" && url.pathname === "/api/practices") {
    const user = requireUser(req, res); if (!user) return;
    return json(res, 200, { practices: data.practices.filter(item => item.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const user = requireUser(req, res); if (!user) return;
    const input = await body(req);
    if (!Array.isArray(input.answers) || !input.answers.some(item => String(item.answer || "").trim())) return json(res, 400, { error: "Record or type at least one answer first." });
    const feedback = buildFeedback(input.answers);
    const practice = { id: randomUUID(), userId: user.id, topic: String(input.topic || "Speaking practice"), part: Number(input.part || 1), answers: input.answers, feedback, createdAt: new Date().toISOString() };
    data.practices.push(practice);
    await saveData();
    return json(res, 201, { practice });
  }

  if (req.method === "POST" && url.pathname === "/api/subscribe") {
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: "Enter a valid email address." });
    if (!data.subscribers.some(item => item.email === email)) {
      data.subscribers.push({ email, createdAt: new Date().toISOString() });
      await saveData();
    }
    return json(res, 200, { message: "You’re subscribed. Watch your inbox for IELTS tips." });
  }

  if (req.method === "POST" && url.pathname === "/api/plan") {
    const user = requireUser(req, res); if (!user) return;
    const input = await body(req);
    const plan = ["free", "standard", "premium"].includes(input.plan) ? input.plan : null;
    if (!plan) return json(res, 400, { error: "Unknown plan." });
    const record = data.users.find(item => item.id === user.id);
    record.plan = plan;
    await saveData();
    return json(res, 200, { user: publicUser(record), message: `${plan[0].toUpperCase() + plan.slice(1)} plan activated for this demo.` });
  }

  return json(res, 404, { error: "Not found" });
}

const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json; charset=utf-8" };

async function serve(req, res, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const file = join(publicDir, safePath);
  if (!file.startsWith(publicDir)) { res.writeHead(403); return res.end("Forbidden"); }
  try {
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=3600" });
    res.end(content);
  } catch {
    const content = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": mime[".html"], "Cache-Control": "no-cache" });
    res.end(content);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else await serve(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, error.message === "Invalid JSON" ? 400 : 500, { error: error.message === "Invalid JSON" ? error.message : "Something went wrong. Please try again." });
  }
});

if (process.argv[1] && normalize(fileURLToPath(import.meta.url)) === normalize(process.argv[1])) {
  server.listen(port, () => console.log(`IELTS Fluent AI running at http://localhost:${port}`));
}

export { server, buildFeedback, analyseAnswer };
