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
- /keycreate 24 → enter password
- /keyclaim <key>
- /addtoken <name> <token>
- /addchannel <name> <id>
- /setmsg (opens modal for ad message)
- /startauto

## Bot link (GitHub):
https://github.com/plsdonatekid-dotcom/liquid-bot

## Replit (alternative if needed):
https://replit.com/@plsdonatekid/liquid-bot
