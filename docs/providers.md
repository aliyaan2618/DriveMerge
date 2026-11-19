# Connecting cloud accounts

Open **Accounts → Add account**, pick a service, and follow the steps. New accounts join your pool automatically; untick **In pool** to keep one separate.

## Services that sign in through your browser
Google Drive, OneDrive, Dropbox, Box, pCloud, Yandex, Zoho and others.

1. Keep or change the account name, then click **Sign in**.
2. Your browser opens the service's own sign-in page. Sign in and click **Allow**.
3. Close the browser tab when it says "Success" and return to CloudMerge.

If the browser doesn't open, click **Open the sign-in page** in the dialog. **Cancel sign-in** stops a sign-in you don't want to finish.

If an account later shows **Needs sign-in**, click the ↻ button next to it to sign in again.

## Services that use a username and password
Mega, SFTP, WebDAV (including Nextcloud and ownCloud), FTP, S3-compatible storage and others.

Fill in the fields marked with \*. Extra settings are under **More options**. Passwords are stored obscured in CloudMerge's settings file on your PC, which only your Windows account can read.

## Notes per service
- **Google Drive:** rclone's shared Google login is being retired during 2026. See [Google Drive: using your own Google login](google-drive.md).
- **Mega:** works, but large transfers can be slower and Mega may limit heavy use.
- **Same-name files:** Google Drive allows two files with the same name in one folder. Rename one of them on the Drive website if CloudMerge acts on the wrong one.
- **Share links** work for services that support public links (Drive, OneDrive, Dropbox, Box, pCloud, Mega). SFTP and WebDAV don't.

## Where things are stored
- Accounts and sign-ins: `%APPDATA%\com.cloudmerge.app\rclone.conf`
- Sync jobs: `%APPDATA%\com.cloudmerge.app\sync-jobs.json`

Back these up to move CloudMerge to another PC.
