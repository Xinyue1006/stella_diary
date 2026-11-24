# Sunflower Plush Diary 🌻

A private diary for iPhone and desktop, with six plush pigs to keep you company. Write offline, add photos, and pick up on another device when you reconnect. The diary interface is in Simplified Chinese.

## Open the diary on your iPhone

1. Open your private diary URL in Safari and sign in with the ChatGPT account that owns the site.
2. Tap **Share → Add to Home Screen**. Turn on **Open as Web App** if Safari offers it, then tap **Add**.
3. Open the pig icon once while online. When the diary says it is ready for offline use, you can write with your computer turned off.

On your computer, open the same diary URL and sign in with the same account. Leave the diary open on each device for the first sync. Under **Profile → Private Sync**, the status changes to **Synced** when it finishes. If you used Safari and the Home Screen app separately before, open each one online so both sets of entries can merge.

## Write and revisit entries

- Save several entries on one day or change the event time to write about an earlier day. Use the calendar or search to find an entry again.
- Add up to 12 photos per entry, with a limit of 6 MiB per photo. The editor saves a new entry in progress as a draft.
- On an iPhone diary subpage, use the **Back** control near the bottom or swipe from right to left to return to the previous screen.
- Use the **Dates** tab for countdowns and anniversaries. Give a day a name and date to remember an event or see how long until it happens.
- Choose a companion under **Profile**.

From **Today**, start an anxiety check-in by choosing how intense the feeling is. You can save just that choice or add what is on your mind. Reopen the check-in in **Today** or **Review** to record what happened afterward and which actions helped. Your pig can recall a method you previously marked as helpful.

- Choose **Ask me tomorrow** to revisit a worry when you next open the diary from tomorrow onward. You can compare what happened with what you expected, leave it open, or come back another day.
- Use **A little good today** for a thought or photo you want to share with your diary. Revisit these moments in **Review**.
- Open the **To-do list** to jot something down, edit it, check it off, or reopen it. Items stay on the list until you remove them.

| Companion | Costume |
| --- | --- |
| Han Pipi (憨批批) | Green dinosaur |
| Han Didi (憨弟弟) | Red ladybug |
| Han Meimei (憨妹妹) | Purple butterfly |
| Han Jiejie (憨姐姐) | White cow |
| Han Xuanxuan (憨轩轩) | Yellow bee |
| Han Yueyue (憨悦悦) | Pink bunny |

## Sync and backups

The web app saves your diary in IndexedDB on each device. While the diary is open and online, it syncs entries, good moments, photos, drafts, dates, anxiety check-ins and their follow-ups, to-do items and the selected pig to private cloud storage. Access to the cloud copy is controlled by the owner's ChatGPT sign-in. The service can read the stored data. If two devices change the same entry before reconnecting, the diary keeps both versions.

For a manual copy, use **Profile → Export Full Backup**. On iPhone, choose **Save to Files**, select a folder in iCloud Drive, and tap **Save**. A backup contains your writing and photos in a readable JSON file. The maximum backup size is 40 MiB, including up to 24 MiB of photo data.

To bring an Expo Go diary into the web app, let the web diary finish syncing first and export a backup of any existing entries there. Export a full backup from Expo Go, then select that file under **Profile → Restore from Backup** in the web diary. Restoring replaces the current device's diary. The web app then merges the restored records with the previously synced cloud copy.

## Run the web app locally

From the repository root, serve the web files with Python.

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory offline-diary/dist
```

Open [the local diary](http://localhost:8000) to exercise the interface and local storage. Private sync requires the authenticated Worker and its R2 bucket.

Build the Worker from its project directory.

```sh
cd offline-diary
npm run build
```

The build produces `dist/server/index.js`. Deploy it to an owner-only ChatGPT Site with the R2 binding `BUCKET`. The Worker uses the visitor identity supplied by Sites to scope diary records and photo access to the signed-in account. [Web app source](offline-diary)

## Run the native Expo prototype

1. Install [Expo Go for iPhone](https://apps.apple.com/my/app/expo-go/id982107779) and connect the phone and computer to the same Wi-Fi network.
2. In `mobile`, run `npm ci` and `npx expo login`. Sign in to the same Expo account from the profile icon in Expo Go. [Expo Go login instructions](https://expo.dev/changelog/expo-go-57-login)
3. Run `npm start` in `mobile`, or double-click [Start Diary.cmd](Start%20Diary.cmd) on Windows. Keep the terminal and computer running during the preview.
4. In Expo Go, tap the project under **Development servers**, or scan the QR code in the terminal. If the phone cannot reach the server, check whether the Wi-Fi network allows devices to communicate and Windows allows Node.js on that private network.

The native prototype keeps its own data on the phone and supports full backup export and restore. Export a backup before clearing its data or uninstalling Expo Go. For a separately signed iPhone build, the repository includes an EAS internal distribution profile. An ad hoc iPhone build uses a paid Apple Developer account and a provisioning profile that includes the device. [EAS build configuration](mobile/eas.json) · [Expo internal distribution guide](https://docs.expo.dev/build/internal-distribution/)

## Developer checks and artwork

Run the native checks from `mobile` after installing dependencies.

```sh
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

The web app can be tested in Chrome and WebKit. For offline testing, open it online until offline setup finishes, then disconnect, reopen it, save an entry, and reconnect to check sync. Use a physical iPhone to check the photo picker, keyboard, gestures, and Files share sheet.

The six companion illustrations were generated from reference photos of the owner's plush toys. The design file records each prompt, its numbered references, and its output path. [Artwork prompts](Design/real-plush-prompts.json) · [Transparent PNG assets](mobile/assets/mascots/real-plush)
