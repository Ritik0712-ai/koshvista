# Production Google login and Drive setup

KoshVista is live at https://koshvista.vercel.app. Current Google login works using Neon's shared development provider. An own Google OAuth web client is required to finish production configuration and enable the implemented Drive backup integration.

1. In Google Cloud Console, create/select a project and enable Google Drive API.
2. Configure Google Auth Platform branding, audience and contact information. While in testing, add your Google account as a test user. Choose external audience for later public users.
3. Create an OAuth client with application type **Web application**.
4. Add authorised JavaScript origin `https://koshvista.vercel.app`. For local development, optionally add `http://localhost:5173` and `http://127.0.0.1:5173`.
5. Add authorised redirect URI exactly:
   `https://ep-autumn-dawn-b35dheq3.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/callback/google`
6. Save the client ID and secret only in ignored `koshvista/.env.local` as `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...`. Never paste them in chat or commit the secret.
7. Configure the Neon Auth Google provider with those credentials. Set `VITE_GOOGLE_CLIENT_ID` to the same public client ID for the frontend and rebuild/deploy. The browser client ID is public; the client secret must never be a Vite variable.
8. Verify Google login, then in Settings & backup connect Drive and approve its requested app-data access yourself. Confirm an encrypted archive uploads, lists, downloads and restores in a clean workspace under the same identity.

Drive uses only `https://www.googleapis.com/auth/drive.appdata` to store encrypted KoshVista backups in the app's private configuration folder. This is a non-sensitive scope according to [Google's official scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth). Google controls any publishing/verification requirements; configuring a client does not guarantee approval.

Backup passphrases and temporary access tokens stay in browser memory. Reconnect and re-enter the passphrase after closing the browser. Original PDFs/images are not included in encrypted archives; source metadata and extracted text are included. Keep the encryption passphrase securely yourself: the app cannot recover it.
