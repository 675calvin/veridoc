import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

async function showAdmin(user) {
  signOutBtn.hidden = false;
  const msg = el("p", { class: "msg" });
  const say = (t, bad) => { msg.textContent = t; msg.className = "msg " + (bad ? "bad" : "ok"); };

  const f = {
    holder: el("input", { required: true }),
    type: el("input", { required: true, placeholder: "e.g. Firearms licence, Guard authorisation" }),
    ref: el("input", { required: true }),
    issued: el("input", { type: "date" }),
    expiry: el("input", { type: "date" }),
    file: el("input", { type: "file", accept: "application/pdf" })
  };
  const form = el("form", { class: "card" },
    el("h2", { textContent: "Add a record" }),
    el("div", { class: "warn-note", textContent:
      "Everything below is shown to anyone who has the link or QR code. Do not enter serial numbers, home addresses, ID numbers or other private data here, and do not upload PDFs that contain them." }),
    el("div", { class: "grid" },
      field("Holder name", f.holder), field("Record type", f.type), field("Reference number", f.ref),
      field("Issued", f.issued), field("Expiry", f.expiry), field("Supporting PDF (max 10 MB)", f.file)),
    el("button", { class: "btn", type: "submit", textContent: "Create record" }), msg);

  const tbody = el("tbody");
  const table = el("div", { class: "card" }, el("h2", { textContent: "Records" }),
    el("table", {}, el("thead", {}, el("tr", {}, ["Holder", "Type", "Ref", "Expiry", "Status", ""].map(t => el("th", { textContent: t })))), tbody));

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
          if (!confirm(`${next === "revoked" ? "Revoke" : "Reinstate"} ${detail(r, "Holder")}'s record?`)) return;
          await updateDoc(doc(db, "documents", r.id), { status: next, updatedAt: serverTimestamp(), updatedBy: user.uid });
          refresh();
        } });
      const copy = el("button", { class: "small", textContent: "Copy link",
        onclick: async () => { await navigator.clipboard.writeText(linkFor(r.id)); copy.textContent = "Copied"; } });
      const del = el("button", { class: "small", textContent: "Delete",
        onclick: async () => {
          if (!confirm("Permanently delete this record? Its link will stop working. Prefer Revoke to keep a history.")) return;
          await deleteDoc(doc(db, "documents", r.id)); refresh();
        } });
      return el("tr", {},
        el("td", { textContent: detail(r, "Holder") }), el("td", { textContent: detail(r, "Record Type") }),
        el("td", { textContent: detail(r, "Reference No") }), el("td", { textContent: fmt(exp) }),
        el("td", {}, el("span", { class: "pill " + cls, textContent: label })),
        el("td", {}, toggle, copy, del));
    }));
  }

  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; say("Saving…");
    try {
      const id = newId();
      let fileUrl = "";
      const file = f.file.files[0];
      if (file) {
        const r = ref(storage, `documents/${id}.pdf`);
        await uploadBytes(r, file, { contentType: "application/pdf" });
        fileUrl = await getDownloadURL(r);
      }
      const details = [
        { label: "Holder", value: f.holder.value.trim() },
        { label: "Record Type", value: f.type.value.trim() },
        { label: "Reference No", value: f.ref.value.trim() },
        ...(f.issued.value ? [{ label: "Issued", value: f.issued.value }] : []),
        ...(f.expiry.value ? [{ label: "Expiry Date", value: f.expiry.value }] : [])
      ];
      const rec = { status: "valid", details, createdAt: serverTimestamp(), createdBy: user.uid };
      if (fileUrl) rec.fileUrl = fileUrl;
      if (f.expiry.value) rec.expiryDate = Timestamp.fromDate(new Date(f.expiry.value + "T23:59:59"));
      await setDoc(doc(db, "documents", id), rec);
      form.reset();
      say("Created. Link: " + linkFor(id));
      refresh();
    } catch (err) {
      say("Could not save: " + (err.code || err.message), true);
    } finally { btn.disabled = false; }
  };

  view.replaceChildren(el("div", { class: "admin" }, ...(isSuper(user) ? [staffPanel()] : []), form, table));
  refresh().catch(() => say("Could not load records.", true));
}

onAuthStateChanged(auth, async user => {
  if (!user) return showLogin();
  if (await isAdmin(user)) return showAdmin(user);
  await signOut(auth);
  showLogin("This account is not authorised for staff access.");
});
