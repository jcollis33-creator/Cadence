/* Firebase web config for Cadence sync. Paste the values from
 * Project settings → Your apps → SDK setup and configuration.
 * Leave the PASTE_ placeholders until the Firebase project exists.
 * This file holds no passphrase and no food log. The apiKey is a public
 * web key; Firestore rules and Google sign-in are what close the database.
 */
window.CADENCE_SYNC_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_APP_ID",
  messagingSenderId: "PASTE_SENDER_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app"
};
