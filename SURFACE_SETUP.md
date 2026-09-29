# Surface Pro setup

This guide turns a Windows Surface Pro into an always-on Kitchen Hub. Complete the steps in order while the tablet is connected to its permanent charger.

## 1. Prepare Windows

1. Run **Settings → Windows Update → Check for updates** until no further updates are offered, then restart.
2. Open **Settings → System → Power & battery**. Set **Power mode** to **Best performance** while plugged in.
3. Keep the tablet on a stable private Wi-Fi network. Set that network to connect automatically.
4. In **Settings → Privacy & security → Microphone**, enable **Microphone access** and **Let desktop apps access your microphone**.
5. Open Microsoft Edge once. Visit `http://127.0.0.1:8787` after installation and allow microphone access when prompted.

## 2. Install prerequisites

Install these official Windows packages:

- Git for Windows
- Node.js 22 LTS or newer
- Python 3.11, with the Python launcher and PATH options enabled

Restart PowerShell after installation, then verify:

```powershell
git --version
node --version
npm --version
py -3.11 --version
```

## 3. Download and install Kitchen Hub

In PowerShell:

```powershell
cd $HOME\Documents
git clone https://github.com/nicholasandrade/kitchen-hub.git kitchen-hub
cd kitchen-hub
powershell -ExecutionPolicy Bypass -File .\scripts\Install-KitchenHub.ps1
```

Open `.env` in Notepad or VS Code and replace the placeholder with your OpenAI API key:

```text
OPENAI_API_KEY=your_key_here
```

Never paste the key into GitHub or commit `.env`. The project ignores this file automatically.

## 4. Keep it awake while plugged in

Open **PowerShell as Administrator**, enter the project folder, and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Set-KitchenHubPower.ps1
```

This sets the plugged-in display, sleep, disk, and hibernation timeouts to **Never**, and prevents a keyboard-cover close from suspending the tablet. Battery behavior remains unchanged.

Keep the Surface ventilated and use a reliable charger. In **Settings → System → Power & battery**, enable any available smart-charging or battery-limit option if your Surface firmware exposes one. That protects the battery during continuous docked use.

## 5. Test the complete system

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-KitchenHub.ps1
```

Edge opens full-screen after the local voice and wake services are ready. Open a recipe, tap the microphone once, then say:

> Kitchen Hub, next step.

Also test from the intended wall or counter location with normal kitchen noise playing.

Press `Alt+F4` to leave kiosk mode.

## 6. Start automatically after sign-in

After the manual test succeeds, register the startup task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Register-KitchenHubStartup.ps1
```

Restart the Surface and confirm that Kitchen Hub opens automatically. Windows may require one final microphone permission approval the first time Edge launches from the startup task.

## Updating later

Exit kiosk mode with `Alt+F4`, open PowerShell in the project folder, and run:

```powershell
git pull
npm ci
npm run build
```

Restart Windows or run `scripts\Start-KitchenHub.ps1` again.

## Troubleshooting

- **The page does not open:** check `logs\voice-server-error.log`.
- **“Kitchen Hub” is not detected:** check `logs\wake-listener-error.log` and confirm desktop microphone access is enabled.
- **Commands fail after wake-up:** confirm `.env` contains the API key and that the OpenAI account has available credit.
- **The old interface appears:** exit Edge, run `npm run build`, then launch again.
