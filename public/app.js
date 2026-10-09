import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDHHcV4wm6DNg2ygrsdqUuRDBy3NmQ7aJo",
  authDomain: "veridoc-d62d0.firebaseapp.com",
  projectId: "veridoc-d62d0",
  storageBucket: "veridoc-d62d0.firebasestorage.app",
  messagingSenderId: "78313165670",
  appId: "1:78313165670:web:6a9be36cdca3f115d0eea7"
});
const db = getFirestore(app);
const view = document.getElementById("view");

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === "class" ? (e.className = v) : (e[k] = v);
  kids.flat().forEach(c => e.append(c));
  return e;
}
const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
const toDate = v => v?.toDate ? v.toDate() : v ? new Date(v) : null;
const fmt = d => d && !isNaN(d) ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

const getId = () => {
  const m = location.pathname.match(/^\/v\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : new URLSearchParams(location.search).get("id");
};

async function loadSettings() {
  try {
    const s = (await getDoc(doc(db, "settings", "portal"))).data() || {};
    if (s.accentColor) document.documentElement.style.setProperty("--accent", s.accentColor);
    if (s.accentColor2) document.documentElement.style.setProperty("--accent2", s.accentColor2);
    document.title = s.orgName ? `${s.orgName} – Document Verification` : document.title;
    document.getElementById("hdrTitle").textContent = s.headerText || "Results Page";
    const logo = safeUrl(s.logoUrl);
    if (logo) { const i = document.getElementById("hdrLogo"); i.src = logo; i.alt = s.orgName || ""; i.hidden = false; }
    document.getElementById("ftTag").textContent = s.tagline || "";
    document.getElementById("ftCopy").textContent = `© COPYRIGHT | ALL RIGHTS RESERVED, ${s.orgName || ""}`;
    const c = document.getElementById("ftContact");
    if (s.contactUrl) c.append("Have a question? ", el("a", { href: safeUrl(s.contactUrl), textContent: "Contact us" }));
    return s;
  } catch { return {}; }
}

function showSearch(settings, msg) {
  const input = el("input", { placeholder: "Enter document ID", autofocus: true });
  const go = () => input.value.trim() && (location.href = "/v/" + encodeURIComponent(input.value.trim()));
  input.addEventListener("keydown", e => e.key === "Enter" && go());
  view.replaceChildren(el("div", { class: "card" },
    el("h1", { textContent: "Verify a document" }),
    msg ? el("p", { class: "bad", textContent: msg }) : "",
    input, el("br"), el("button", { class: "btn", textContent: "Verify", onclick: go })));
}

function statusOf(rec, settings) {
  if ((rec.status || "valid").toLowerCase() === "revoked") return ["bad", "✕", "This document has been revoked"];
  const exp = toDate(rec.expiryDate);
  if (exp && exp < new Date()) return ["warn", "!", `This document expired on ${fmt(exp)}`];
  return ["ok", "✓", settings.successText || "Record found in our register"];
}

function showResult(settings, rec) {
  const [cls, glyph, text] = statusOf(rec, settings);
  const logo = safeUrl(settings.logoUrl);
  view.replaceChildren(el("div", { class: "card" },
    logo ? el("img", { class: "logo", src: logo, alt: settings.orgName || "" }) : "",
    el("div", { class: "icon " + (cls === "ok" ? "" : cls === "warn" ? "warn" : "bad"), textContent: glyph }),
    el("h1", { class: cls, textContent: text }),
    el("button", { class: "btn", textContent: "Continue", onclick: () => showDetails(settings, rec) })));
}

function showDetails(settings, rec) {
  const rows = (Array.isArray(rec.details) ? rec.details : []).map(d =>
    el("div", { class: "row" }, el("span", { textContent: d.label }), el("span", { textContent: d.value })));
  const file = safeUrl(rec.fileUrl);
  const right = file ? [
    el("div", { class: "viewer" }, el("iframe", { src: file, title: "Document" })),
    el("a", { class: "btn dl", href: file, target: "_blank", rel: "noopener", download: "", textContent: "DOWNLOAD" })
  ] : [el("div", { class: "note", textContent: "No file attached to this record." })];
  view.replaceChildren(el("div", { class: "detail" },
    el("div", {},
      el("div", { class: "note", textContent: settings.compareText ||
        "Please compare the document you have to the original document held by the issuer below. You may download the original for your copy." }),
      el("div", { class: "panel" }, el("h2", { textContent: "Document Details" }), rows)),
    el("div", {}, right)));
}

(async () => {
  const settings = await loadSettings();
  const id = getId();
  if (!id) return showSearch(settings);
  try {
    const snap = await getDoc(doc(db, "documents", id));
    if (!snap.exists()) return showSearch(settings, "Document not found. Please check the ID and try again.");
    showResult(settings, snap.data());
  } catch {
    showSearch(settings, "Unable to look up that document right now.");
  }
})();
