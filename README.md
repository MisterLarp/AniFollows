# 📱 AniFollows Manager

A nifty tool that lets you manage your AniList network. Identify non-followers, engage the global feed, and bulk-follow networks effortlessly.  
<u>Browser-based and requires no downloads or installations!</u>

## ⚠️ WARNING

This tool utilizes the AniList GraphQL API for optimal performance. Please use responsibly to avoid rate-limiting.

## 🖥️ Desktop Usage

**Where to get the code:**
- The JavaScript code is available in this repository's `dist/dist.js` file: [dist/dist.js](https://github.com/MisterLarp/AniFollows/blob/main/dist/dist.js)

**Steps to run:**
1. Go to the [AniList website](https://anilist.co) and log in to your account.

2. Open the developer console:
   - **Chrome/Edge**: `Ctrl + Shift + J` (Windows) or `⌘ + ⌥ + J` (Mac)
   - **Firefox**: `Ctrl + Shift + K` (Windows) or `⌘ + ⌥ + K` (Mac)
   - **Safari**: Enable Developer Tools in Preferences, then `⌘ + ⌥ + C`

3. Copy the entire JavaScript code snippet from `dist/dist.js` (starts with `(()=>{"use strict"`).

4. Paste the code into the console and press `Enter`.

5. The AniFollows interface will appear directly on the page.

6. **Authentication**: 
   - Click "Authorize on AniList".
   - Copy the PIN provided by AniList.
   - Paste it into the token input to connect your account.

7. Choose your desired action:
   - **Scan Followers**: Scan your network to see who doesn't follow you back, and utilize the auto-unfollow queue.
   - **Engage Global Feed**: Automatically like posts from the global feed and follow active users to build your network.
   - **Follow from Network**: Target a specific user and bulk-follow their network (either their followers or who they are following).

8. 🤍 Whitelist users by clicking their profile image (star icon) to prevent accidental unfollows.

9. 💾 Manage your whitelist and settings via the Settings menu:
   - Customize timings between actions to stay safe from rate limits.
   - Export/Import whitelist JSON backups.

## ⚡ Performance Notes

- The tool employs automatic session guards and randomized jitter between API calls to reduce the risk of AniList rate-limiting.
- Data such as tokens and whitelists are stored securely and locally in your browser (`localStorage`).

## ✨ Features

- 🔍 **Scan Network**: Identify mutuals, followers, and non-followers.
- ⚡ **Auto-Unfollow Queue**: Track follow dates locally and automatically queue users who don't follow back after 24 or 48 hours.
- 💬 **Global Engagement**: Like feed activities and build your audience hands-free.
- 🕸️ **Network Expansion**: Rapidly follow users from other AniList profiles.
- 🤍 **Whitelist System**: Protect specific accounts from unfollowing.
- 💾 **Export/Import**: Backup whitelists and follow history.

## 🛠️ Development

- Node version: 16.14.0 (If using nvm, run `nvm use`)
- After modifying `main.tsx` or any components, run `npm run build` to compile the bundle into `dist/dist.js`.

## ⚖️ Legal & License

**Disclaimer:** This tool is not affiliated, associated, authorized, endorsed by, or officially connected with AniList.

⚠️ Use at your own risk!

📜 Licensed under the [MIT License](LICENSE)
- ✅ Free to use, copy, and modify
- 🤝 Open source and community-friendly
- 📋 See [LICENSE](LICENSE) file for full terms
