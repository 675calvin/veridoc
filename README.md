# Document verification portal

Static Firebase Hosting site backed by Firestore + Storage. A document is only shown as verified if a matching record exists.

## Backend data (Firebase console)
**`settings/portal`** (one doc): `orgName`, `logoUrl` (https download URL of an image uploaded to Storage `branding/`), `headerText`, `tagline`, `contactUrl`, `compareText`, `accentColor` (e.g. `#0b5fff`), `accentColor2`.

**`documents/{id}`** – use a long random ID (it's the access key; the public can't list documents):
- `status`: `"valid"` or `"revoked"`
- `expiryDate`: timestamp (optional; expired shows a warning instead of success)
- `fileUrl`: https download URL of the PDF uploaded to Storage `documents/`
- `details`: array of maps, e.g. `[{label:"Document Type", value:"..."}, {label:"Holder", value:"..."}]`

Share links as `https://<your-site>/v/<id>` (or put that in a QR code).

## Deploy
```
npm i -g firebase-tools && firebase login
firebase deploy
```
