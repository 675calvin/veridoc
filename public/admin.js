import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, Timestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FONTS, DEFAULT_FOOTER } from "/shared.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHHcV4wm6DNg2ygrsdqUuRDBy3NmQ7aJo",
  authDomain: "veridoc-d62d0.firebaseapp.com",
  projectId: "veridoc-d62d0",
  storageBucket: "veridoc-d62d0.firebasestorage.app",
  messagingSenderId: "78313165670",
  appId: "1:78313165670:web:6a9be36cdca3f115d0eea7"
};
const app = initializeApp(firebaseConfig);
const SUPER_EMAIL = "check@veri.com";   // must match firestore.rules / storage.rules
const isSuper = u => u.email?.toLowerCase() === SUPER_EMAIL;
const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);
const view = document.getElementById("view");
const signOutBtn = document.getElementById("signOut");
signOutBtn.onclick = () => signOut(auth);

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === "class" ? (e.className = v) : (e[k] = v);
  kids.flat().forEach(c => e.append(c));
  return e;
}
const field = (label, input) => el("label", {}, label, input);
const toDate = v => v?.toDate ? v.toDate() : v ? new Date(v) : null;
const fmt = d => d && !isNaN(d) ? d.toISOString().slice(0, 10) : "";
const detail = (rec, label) => (rec.details || []).find(d => d.label === label)?.value || "";
const holderOf = r => [detail(r, "First Name"), detail(r, "Last Name")].filter(Boolean).join(" ") || "(unnamed)";
const linkFor = id => `${location.origin}/v/${encodeURIComponent(id)}`;
const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");   // 128-bit random
};

function showLogin(msg) {
  signOutBtn.hidden = true;
  const email = el("input", { type: "email", autocomplete: "username", required: true });
  const pass = el("input", { type: "password", autocomplete: "current-password", required: true });
  const err = el("p", { class: "msg bad", textContent: msg || "" });
  const form = el("form", { class: "card", style: "max-width:420px" },
    el("h2", { textContent: "Staff sign in" }), field("Email", email), field("Password", pass), err,
    el("button", { class: "btn", type: "submit", textContent: "Sign in" }));
  form.onsubmit = async e => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email.value, pass.value); }
    catch { err.textContent = "Sign-in failed."; }
  };
  view.replaceChildren(form);
}

async function isAdmin(user) {
  if (isSuper(user)) return true;
  try { return (await getDoc(doc(db, "admins", user.uid))).exists(); } catch { return false; }
}

function staffPanel() {
  const msg = el("p", { class: "msg" });
  const say = (t, bad) => { msg.textContent = t; msg.className = "msg " + (bad ? "bad" : "ok"); };
  const email = el("input", { type: "email", required: true });
  const pass = el("input", { type: "password", minLength: 8, required: true, autocomplete: "new-password" });
  const tbody = el("tbody");
  async function load() {
    const snaps = await getDocs(collection(db, "admins"));
    tbody.replaceChildren(...snaps.docs.map(s => el("tr", {},
      el("td", { textContent: s.data().email || s.id }),
      el("td", {}, el("button", { class: "small", textContent: "Remove access", onclick: async () => {
        if (!confirm(`Remove staff access for ${s.data().email || s.id}?`)) return;
        await deleteDoc(doc(db, "admins", s.id)); load();
      } }),
      el("button", { class: "small", textContent: "Send password reset", onclick: async () => {
        if (s.data().email) { await sendPasswordResetEmail(auth, s.data().email); say("Reset email sent."); }
      } })))));
  }
  const form = el("form", {}, el("div", { class: "grid" },
    field("Staff email", email), field("Temporary password (min 8)", pass)),
    el("button", { class: "btn", type: "submit", textContent: "Add staff user" }), msg);
  form.onsubmit = async e => {
    e.preventDefault(); say("Adding…");
    // A second app instance so creating the account doesn't sign the super admin out.
    const second = initializeApp(firebaseConfig, "staff-create-" + Date.now());
    try {
      const a2 = getAuth(second);
      const cred = await createUserWithEmailAndPassword(a2, email.value.trim(), pass.value);
      await setDoc(doc(db, "admins", cred.user.uid),
        { email: email.value.trim().toLowerCase(), addedBy: auth.currentUser.uid, createdAt: serverTimestamp() });
      await signOut(a2);
      form.reset(); say("Staff user added. Share the temporary password securely."); load();
    } catch (err) {
      say("Could not add user: " + (err.code || err.message), true);
    } finally { deleteApp(second); }
  };
  load().catch(() => say("Could not load staff list.", true));
  return el("div", { class: "card" }, el("h2", { textContent: "Staff users (super admin)" }), form,
    el("table", {}, el("thead", {}, el("tr", {}, el("th", { textContent: "Email" }), el("th"))), tbody));
}

function settingsPanel() {
  const msg = el("p", { class: "msg" });
  const say = (t, bad) => { msg.textContent = t; msg.className = "msg " + (bad ? "bad" : "ok"); };
  const logoFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/svg+xml,image/webp" });
  const preview = el("img", { alt: "Current logo", style: "max-height:56px;display:block;margin-top:6px", hidden: true });
  const i = {
    orgName: el("input"), headerText: el("input"), contactUrl: el("input", { type: "url", placeholder: "https://" }),
    footerTagline: el("input"),
    footerText: el("textarea", { rows: 3 }),
    footerFont: el("select", {}, Object.entries(FONTS).map(([k, [name]]) => el("option", { value: k, textContent: name }))),
    footerFontSize: el("input", { type: "number", min: 10, max: 40 }),
    footerColor: el("input", { type: "color" }),
    accentColor: el("input", { type: "color", value: "#058141" }),
    accentColor2: el("input", { type: "color", value: "#75b943" })
  };
  let logoUrl = "";
  getDoc(doc(db, "settings", "portal")).then(snap => {
    const d = { ...DEFAULT_FOOTER, ...(snap.data() || {}) };
    logoUrl = d.logoUrl || "";
    if (logoUrl) { preview.src = logoUrl; preview.hidden = false; }
    i.orgName.value = d.orgName || ""; i.headerText.value = d.headerText || ""; i.contactUrl.value = d.contactUrl || "";
    i.footerTagline.value = d.footerTagline ?? d.tagline ?? "";
    i.footerText.value = d.footerText ?? (d.orgName ? `© COPYRIGHT | ALL RIGHTS RESERVED, ${d.orgName}` : "");
    i.footerFont.value = FONTS[d.footerFont] ? d.footerFont : "system";
    i.footerFontSize.value = d.footerFontSize; i.footerColor.value = d.footerColor;
    if (d.accentColor) i.accentColor.value = d.accentColor;
    if (d.accentColor2) i.accentColor2.value = d.accentColor2;
  }).catch(() => say("Could not load settings.", true));
  const form = el("form", { class: "card" }, el("h2", { textContent: "Branding & footer" }),
    el("div", { class: "grid" },
      field("Company name", i.orgName), field("Header title", i.headerText),
      el("label", {}, "Logo (top left, PNG/JPG/SVG/WebP, max 2 MB)", logoFile, preview),
      field("Contact link (shown in footer)", i.contactUrl),
      field("Theme colour – start (buttons & headings)", i.accentColor), field("Theme colour – end", i.accentColor2)),
    el("h2", { textContent: "Footer", style: "margin-top:16px" }),
    el("div", { class: "grid" }, field("Footer heading", i.footerTagline), field("Font", i.footerFont),
      field("Font size (px, 10–40)", i.footerFontSize), field("Text colour", i.footerColor)),
    field("Footer text", i.footerText),
    el("button", { class: "btn", type: "submit", textContent: "Save branding" }), msg);
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; say("Saving…");
    try {
      const f = logoFile.files[0];
      if (f) {
        if (f.size > 2 * 1024 * 1024) throw new Error("Logo is over 2 MB");
        const r = ref(storage, `branding/logo-${Date.now()}`);
        await uploadBytes(r, f, { contentType: f.type });
        logoUrl = await getDownloadURL(r);
        preview.src = logoUrl; preview.hidden = false;
      }
      const size = Math.min(40, Math.max(10, Number(i.footerFontSize.value) || DEFAULT_FOOTER.footerFontSize));
      await setDoc(doc(db, "settings", "portal"), {
        orgName: i.orgName.value.trim(), headerText: i.headerText.value.trim(), contactUrl: i.contactUrl.value.trim(),
        logoUrl, footerTagline: i.footerTagline.value.trim(), footerText: i.footerText.value,
        footerFont: i.footerFont.value, footerFontSize: size, footerColor: i.footerColor.value,
        accentColor: i.accentColor.value, accentColor2: i.accentColor2.value
      }, { merge: true });
      logoFile.value = ""; say("Saved.");
    } catch (err) { say("Could not save: " + (err.code || err.message), true); }
    finally { btn.disabled = false; }
  };
  return form;
}

async function showAdmin(user) {
  signOutBtn.hidden = false;
  const msg = el("p", { class: "msg" });
  const say = (t, bad) => { msg.textContent = t; msg.className = "msg " + (bad ? "bad" : "ok"); };

  const TEXT = ["Document Type", "Lic No", "First Name", "Last Name", "Address", "Make", "Type", "Calibre", "Purpose"];
  const TAIL = ["SN", "Transaction Id", "Hash"];
  const inputs = {};
  [...TEXT, "Expiry Date", ...TAIL].forEach(l => {
    inputs[l] = el("input", { type: l === "Expiry Date" ? "date" : "text", required: l === "Document Type" || l === "Lic No" });
  });
  const pdf = el("input", { type: "file", accept: "application/pdf" });
  let editing = null;   // the record being edited, or null when adding
  const heading = el("h2", { textContent: "Add a record" });
  const submitBtn = el("button", { class: "btn", type: "submit", textContent: "Create record" });
  const cancelBtn = el("button", { class: "small", type: "button", textContent: "Cancel edit", hidden: true, style: "margin-left:12px" });
  const form = el("form", { class: "card" },
    heading,
    el("div", { class: "warn-note", textContent:
      "Every field below is shown publicly to anyone who has this record's link or QR code. Only enter what you are happy for a verifier to see." }),
    el("div", { class: "grid" }, Object.entries(inputs).map(([l, i]) => field(l, i)),
      field("Attached PDF (optional, max 10 MB)", pdf)),
    submitBtn, cancelBtn, msg);

  function setMode(rec) {
    editing = rec;
    heading.textContent = rec ? `Edit record – ${holderOf(rec)}` : "Add a record";
    submitBtn.textContent = rec ? "Save changes" : "Create record";
    cancelBtn.hidden = !rec;
    for (const [label, i] of Object.entries(inputs)) i.value = rec ? detail(rec, label) : "";
    pdf.value = "";
    if (rec) { say(rec.fileUrl ? "A PDF is attached; choose a file only to replace it." : ""); form.scrollIntoView({ behavior: "smooth" }); }
    else say("");
  }
  cancelBtn.onclick = () => setMode(null);

  const tbody = el("tbody");
  const table = el("div", { class: "card" }, el("h2", { textContent: "Records" }),
    el("table", {}, el("thead", {}, el("tr", {}, ["Name", "Document Type", "Lic No", "Expiry", "Status", ""].map(t => el("th", { textContent: t })))), tbody));

  async function refresh() {
    const snaps = await getDocs(collection(db, "documents"));
    const rows = snaps.docs.map(s => ({ id: s.id, ...s.data() }))
      .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
    tbody.replaceChildren(...rows.map(r => {
      const exp = toDate(r.expiryDate);
      const [cls, label] = r.status === "revoked" ? ["bad", "Revoked"]
        : exp && exp < new Date() ? ["warn", "Expired"] : ["ok", "Valid"];
      const toggle = el("button", { class: "small", textContent: r.status === "revoked" ? "Reinstate" : "Revoke",
        onclick: async () => {
          const next = r.status === "revoked" ? "valid" : "revoked";
          if (!confirm(`${next === "revoked" ? "Revoke" : "Reinstate"} ${holderOf(r)}'s record?`)) return;
          await updateDoc(doc(db, "documents", r.id), { status: next, updatedAt: serverTimestamp(), updatedBy: user.uid });
          refresh();
        } });
      const edit = el("button", { class: "small", textContent: "Edit", onclick: () => setMode(r) });
      const copy = el("button", { class: "small", textContent: "Copy link",
        onclick: async () => { await navigator.clipboard.writeText(linkFor(r.id)); copy.textContent = "Copied"; } });
      const del = el("button", { class: "small", textContent: "Delete",
        onclick: async () => {
          if (!confirm("Permanently delete this record? Its link will stop working. Prefer Revoke to keep a history.")) return;
          await deleteDoc(doc(db, "documents", r.id)); refresh();
        } });
      return el("tr", {},
        el("td", { textContent: holderOf(r) }), el("td", { textContent: detail(r, "Document Type") }),
        el("td", { textContent: detail(r, "Lic No") }), el("td", { textContent: fmt(exp) }),
        el("td", {}, el("span", { class: "pill " + cls, textContent: label })),
        el("td", {}, edit, toggle, copy, del));
    }));
  }

  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; say("Saving…");
    try {
      const id = editing ? editing.id : newId();
      let fileUrl = "";
      const file = pdf.files[0];
      if (file) {
        const r = ref(storage, `documents/${id}.pdf`);
        await uploadBytes(r, file, { contentType: "application/pdf" });
        fileUrl = await getDownloadURL(r);
      }
      const details = Object.entries(inputs)
        .map(([label, i]) => ({ label, value: i.value.trim() })).filter(d => d.value);
      const expiry = inputs["Expiry Date"].value;
      if (editing) {
        const upd = { details, expiryDate: expiry ? Timestamp.fromDate(new Date(expiry + "T23:59:59")) : deleteField(),
          updatedAt: serverTimestamp(), updatedBy: user.uid };
        if (fileUrl) upd.fileUrl = fileUrl;
        await updateDoc(doc(db, "documents", id), upd);
        setMode(null); say("Changes saved. The existing link is unchanged.");
        refresh();
        return;
      }
      const rec = { status: "valid", details, createdAt: serverTimestamp(), createdBy: user.uid };
      if (fileUrl) rec.fileUrl = fileUrl;
      if (expiry) rec.expiryDate = Timestamp.fromDate(new Date(expiry + "T23:59:59"));
      await setDoc(doc(db, "documents", id), rec);
      form.reset();
      say("Created. Link: " + linkFor(id));
      refresh();
    } catch (err) {
      say("Could not save: " + (err.code || err.message), true);
    } finally { btn.disabled = false; }
  };

  view.replaceChildren(el("div", { class: "admin" }, ...(isSuper(user) ? [staffPanel()] : []), form, table, settingsPanel()));
  refresh().catch(() => say("Could not load records.", true));
}

onAuthStateChanged(auth, async user => {
  if (!user) return showLogin();
  if (await isAdmin(user)) return showAdmin(user);
  await signOut(auth);
  showLogin("This account is not authorised for staff access.");
});
