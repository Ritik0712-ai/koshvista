import { Link } from "react-router-dom";
export function Privacy() {
  return (
    <main
      className="panel"
      style={{ maxWidth: 850, margin: "32px auto", padding: 32 }}
    >
      <Link to="/">← KoshVista</Link>
      <h1>Your data in KoshVista</h1>
      <p>
        KoshVista is an open source finance workspace. Your bank documents, cash
        records and investments belong to your signed-in account.
      </p>
      <h2>Where records are saved</h2>
      <p>
        Google sign-in is handled by Neon Auth. Accepted records and saved
        source text are stored in Neon PostgreSQL. When you choose to retain an
        original document, it is uploaded to private Neon storage. Vercel hosts
        the website. Public source code and the sample workspace contain no
        personal financial records.
      </p>
      <h2>Document reading and AI</h2>
      <p>
        PDF reading, screenshot OCR and optional category inference run in your
        browser. The OCR language files and AI model are downloaded from public
        model hosts. Transaction descriptions are processed locally. OCR and AI
        suggestions can be wrong; check them before saving.
      </p>
      <h2>Backups and recovery</h2>
      <p>
        Successful cloud saves remain available after reinstalling your browser
        or signing in on another device. Independent backups are encrypted in
        your browser with your passphrase. Google Drive backup needs separate
        consent to the app’s private backup folder. Passphrases and Drive access
        tokens stay in memory. Original binary documents are excluded from
        exported archives.
      </p>
      <h2>Your controls</h2>
      <p>
        Settings provides exports, encrypted archives, session controls and
        financial data deletion. Deleting records in KoshVista does not remove
        independent copies you saved to Google Drive or your device. Deleting a
        sign-in identity can make its owner-bound archives unrestorable into a
        different account. Sign out on shared devices.
      </p>
      <h2>Limits</h2>
      <p>
        KoshVista tracks records you import or enter. It does not connect to
        bank passwords or perform payments or trades. Market values and
        projections carry dates and are based on supplied evidence. Free hosting
        and storage have quotas. The source repository documents deployment and
        known validation limits.
      </p>
      <p>
        Updated 5 October 2026.{" "}
        <a href="https://github.com/Ritik0712-ai/koshvista">
          View source and report an issue
        </a>
      </p>
    </main>
  );
}
