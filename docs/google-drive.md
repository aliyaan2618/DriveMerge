# Google Drive: using your own Google login

CloudMerge connects to Google Drive through a Google "client ID". By default it uses rclone's shared one, which Google is retiring during 2026 and which is often slow because thousands of apps share its limits. A client ID of your own is free and takes about 10 minutes.

## For users: create your own client ID
1. Go to <https://console.cloud.google.com/> and sign in.
2. Create a project (any name, e.g. "CloudMerge").
3. **APIs & Services → Library**: search **Google Drive API** and click **Enable**.
4. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**, app name e.g. "CloudMerge", your email as support and developer contact.
   - Under **Audience**, add your own Google address as a **Test user**.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Desktop app**, any name. Copy the **Client ID** and **Client secret**.
6. In CloudMerge: **Accounts → Add account → Google Drive**, open **Advanced: use my own API credentials and options**, paste them into **client id** and **client secret**, then **Sign in**.

While the Google project is in "Testing", sign-ins expire every 7 days; click the ↻ button on the account to sign in again. Publishing the project removes that limit (for personal use, Google doesn't need to review it).

To switch an existing Drive account: remove it in CloudMerge (nothing is deleted in Drive) and add it again with your client ID.

## For maintainers: a client ID built into CloudMerge
Release builds can include CloudMerge's own client ID so users don't need the steps above.

1. Create the client ID as above, under an account for the project.
2. Add repository secrets `GDRIVE_CLIENT_ID` and `GDRIVE_CLIENT_SECRET` (Settings → Secrets and variables → Actions). The release workflow builds them in.
3. For use by the public, submit the consent screen for Google's verification. The full Drive scope is "restricted", so Google requires a security assessment, which costs money. Until then, Google limits the app to 100 users and shows an "unverified app" warning.

A desktop app's client secret can't be kept secret (anyone can read it from the installed app); Google's documentation for installed apps accepts this.
