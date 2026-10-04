# Surface Pro setup

Kitchen Hub now installs as a self-contained per-user Windows application. A fresh Surface does not need Git, Node, Python, npm, a repository checkout, or a manual wake-model download.

## Install

1. Run Windows Update and restart until no further updates are offered.
2. In **Settings → Privacy & security → Microphone**, enable **Microphone access** and **Let desktop apps access your microphone**.
3. Download `KitchenHub-Setup-x.y.z.exe` from the latest GitHub Release.
4. Run the installer. Leave **Start Kitchen Hub automatically after I sign in** selected for a dedicated kitchen tablet.
5. Launch Kitchen Hub from the installer or Start menu.
6. When Edge asks, allow microphone access for `http://127.0.0.1:8787`.
7. Select the gear, open **Connections**, enter the OpenAI API key, and choose **Connect OpenAI**.
8. To show the current day on Home, choose **Sign in with Google**, select your account, and approve read-only Calendar access.
9. Say “Kitchen Hub, next step” to verify the complete voice path.

The unsigned test installer may display a Microsoft Defender SmartScreen warning. Use **More info → Run anyway** for an installer downloaded from this repository’s Releases page.

## Dedicated-tablet power settings

Connect the Surface to its permanent charger. Open **Start → Kitchen Hub → Configure always-on power** and approve the administrator prompt. This changes plugged-in display, sleep, disk, hibernation, and lid behavior to keep the Hub available; battery behavior remains unchanged.

In **Settings → System → Power & battery**, select **Best performance** while plugged in and enable any available smart-charging or battery-limit option. Keep the Surface ventilated.

## Data and upgrades

Program files are installed in `%LOCALAPPDATA%\Programs\KitchenHub`. Mutable data is stored separately in `%LOCALAPPDATA%\KitchenHub\data`, including:

- the local `.env` containing the OpenAI API key
- the local Google Calendar refresh token
- wake phrase state
- service logs
- the dedicated Edge profile and microphone permission
- process records used by the launcher

Installing a newer version replaces program files and preserves the data directory. Browser-backed recipe/session state also remains tied to the unchanged `http://127.0.0.1:8787` origin.

Uninstalling Kitchen Hub intentionally leaves the data directory in place so reinstalling does not discard credentials or state. It can be removed manually after uninstall if a complete reset is desired.

## Real-kitchen test

Use [REAL_WORLD_TESTING.md](./REAL_WORLD_TESTING.md) during complete cooking sessions. Test wake detection, command latency, state recovery, readability, and API usage under normal kitchen noise before adding more product scope.

## Troubleshooting

- **The page does not open:** use **Start → Kitchen Hub → Stop Kitchen Hub**, launch it again, then inspect `%LOCALAPPDATA%\KitchenHub\data\logs`.
- **The wake phrase is not detected:** confirm Edge and desktop microphone access, then inspect the newest `wake-*-error.log`.
- **Voice commands fail after wake-up:** open **Settings → Connections** and confirm OpenAI shows **Connected** and the account has credit.
- **A new version still looks old:** exit kiosk mode with `Alt+F4`, use **Stop Kitchen Hub**, and launch it again.
- **Kitchen Hub does not start after sign-in:** rerun the installer and keep the automatic-start option selected.
