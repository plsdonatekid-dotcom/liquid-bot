# Auto Advertise Bot - Setup Guide

## To deploy on Render.com:
1. Sign up at https://render.com with GitHub
2. Click New + → Web Service
3. Connect repo: plsdonatekid-dotcom/liquid-bot
4. Name: liquid-bot, Region: closest, Branch: main
5. Build: npm install, Start: npm start
6. Free plan ($0/month), no credit card needed
7. Add env vars (Advanced):
   - DISCORD_BOT_TOKEN = (your new bot token)
   - BOT_PASSWORD = (your admin password)

## To keep it alive:
- UptimeRobot (free) → Add HTTP monitor → paste Render URL every 5 min

## After deploy, in Discord:
- /keycreate <hours> → enter password
- /keyclaim <key>
- /addtoken <name> <token>
- /addchannel <name> <id>
- /deltoken <name> — delete a token
- /delchannel <name> — delete a channel
- /listtokens — view your tokens
- /listchannels — view your channels
- /setmsg (opens modal for ad message)
- /startauto — starts auto-advertise (reads channel slowmode, sends first msg immediately)
- /stopauto — stops auto-advertise
- /help — shows all commands

## Features:
- **Per-user data isolation** — each user has their own tokens, channels, and message. No user can see or modify another's data.
- **Slowmode-aware scheduling** — bot reads each channel's slowmode and calculates the optimal interval (slowmode - 5 seconds).
- **First message sent immediately** on /startauto, subsequent messages respect slowmode.
- **Notifications** — sends "Auto advertise started" / "Auto advertise stopped" to the first channel.

## Bot link (GitHub):
https://github.com/plsdonatekid-dotcom/liquid-bot

## Replit (alternative if needed):
https://replit.com/@plsdonatekid/liquid-bot
