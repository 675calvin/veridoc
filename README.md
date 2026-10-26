# Weapons & credential verification hub

Static Firebase Hosting site backed by Firestore + Storage. A document is only shown as verified if a matching record exists.

## Backend data (Firebase console)
**`settings/portal`** (one doc): `orgName`, `logoUrl` (https download URL of an image uploaded to Storage `branding/`), `headerText`, `tagline`, `contactUrl`, `compareText`, `successText` (headline on a valid record), `accentColor` (e.g. `#0b5fff`), `accentColor2`.

**`documents/{id}`** – use a long random ID (it's the access key; the public can't list documents):
- `status`: `"valid"` or `"revoked"`
- `expiryDate`: timestamp (optional; expired shows a warning instead of success)
- `fileUrl`: https download URL of the PDF uploaded to Storage `documents/`
- `details`: array of maps, e.g. `[{label:"Record Type", value:"..."}, {label:"Holder", value:"..."}]` (the admin page writes Holder, Record Type, Reference No, Issued, Expiry Date)

Share links as `https://<your-site>/v/<id>` (or put that in a QR code).

## Staff admin (`/admin`)
Staff sign in with Firebase Auth (email/password) and can create, revoke/reinstate, delete records and copy share links. IDs are 128-bit random.

**Super admin:** `check@veri.com` is hard-coded in `firestore.rules`, `storage.rules` and `public/admin.js`. It gets a "Staff users" panel on `/admin` to add staff (creates their login and the `admins/<uid>` doc), remove access, or send password resets. Setup, once:
1. Firebase console → Authentication → enable **Email/Password**, then add the user `check@veri.com` with a strong password. **Do this before deploying the rules**: there is no email verification, so whoever registers that address first owns super admin.
2. `firebase deploy` (publishes rules too), then sign in at `/admin`.

Tip: to stop anyone self-registering accounts, Authentication → Settings → User actions → disable "Enable create (sign-up)". The staff panel creates users via the client, so keep sign-up enabled if you want to add staff from `/admin`; self-registered accounts have no access anyway.

**Privacy:** record pages are public to anyone with the link. Only put what a verifier needs (holder, type, reference, dates). Never serial numbers, addresses or ID numbers, in fields or in PDFs.

## Deploy
```
npm i -g firebase-tools && firebase login
firebase deploy
```

## Samples
`samples/` holds placeholder JSON to copy into the console: `settings-portal.json` → doc `settings/portal`; `documents-SAMPLE-0001.json` → doc `documents/SAMPLE-0001` (then open `/v/SAMPLE-0001`). Replace the placeholder values and delete the sample record before going live. In the console, `expiryDate` should be entered as a *timestamp* field.
