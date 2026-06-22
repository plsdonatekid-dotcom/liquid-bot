const {
  Client, GatewayIntentBits, REST, Routes,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, 'storage.json');
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const PASSWORD = process.env.BOT_PASSWORD;


let data = fs.existsSync(CONFIG)
  ? JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  : { keys: [], users: {} };

// Migrate from old flat format to per-user
if (data.tokens) {
  const ownerId = data.keys.length && data.keys[0].claimedBy ? data.keys[0].claimedBy : 'migrated';
  data.users = {};
  data.users[ownerId] = { tokens: data.tokens, channels: data.channels || [], msg: data.msg || '', running: false };
  delete data.tokens; delete data.channels; delete data.msg; delete data.running;
  save();
}

// Migrate old channel format (single id) to new format (ids array)
for (const uid of Object.keys(data.users)) {
  for (const ch of data.users[uid].channels) {
    if (ch.id && !ch.ids) {
      ch.ids = [ch.id];
      delete ch.id;
      save();
    }
  }
}

let autoIntervals = {};
const pendingKeyHours = new Map();

function save() { fs.writeFileSync(CONFIG, JSON.stringify(data, null, 2)); }

function getUserData(userId) {
  if (!data.users[userId]) { data.users[userId] = { tokens: [], channels: [], msg: '', running: false }; save(); }
  return data.users[userId];
}

function genKey() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let k = '';
  for (let i = 0; i < 16; i++) {
    k += c[Math.floor(Math.random() * c.length)];
    if (i === 3 || i === 7 || i === 11) k += '-';
  }
  return k;
}

function getValidKey(userId) {
  const now = Date.now();
  const expired = [];
  let valid = null;
  for (const k of data.keys) {
    if (!k.claimed || k.claimedBy !== userId) continue;
    if (k.claimedAt && now - k.claimedAt >= k.hours * 3600000) {
      expired.push(k);
    } else {
      valid = k;
    }
  }
  for (const k of expired) {
    k.claimed = false;
    k.claimedBy = undefined;
    k.claimedAt = undefined;
  }
  if (expired.length) save();
  return valid;
}

for (const uid of Object.keys(data.users)) { if (data.users[uid].running) { data.users[uid].running = false; } }
save();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function sendViaToken(token, channelId, content) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function getChannelSlowmode(token, channelId) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    headers: { 'Authorization': token }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ch = await res.json();
  return ch.rate_limit_per_user || 0;
}

async function dmUserViaToken(token, message) {
  const meRes = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { 'Authorization': token }
  });
  if (!meRes.ok) { console.error(`[x] Failed to fetch user for DM: HTTP ${meRes.status}`); return; }
  const me = await meRes.json();
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: me.id })
  });
  if (!dmRes.ok) { console.error(`[x] Failed to create DM for ${me.id}: HTTP ${dmRes.status}`); return; }
  const dm = await dmRes.json();
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
    method: 'POST',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message })
  });
  if (!msgRes.ok) console.error(`[x] Failed to send DM: HTTP ${msgRes.status}`);
}

const commands = [
  { name: 'help', description: 'Show all available commands' },
  { name: 'keyclaim', description: 'Claim a key to use the bot', options: [{ type: 3, name: 'key', description: 'The key to claim', required: true }] },
  { name: 'addtoken', description: 'Add an authorize token', options: [{ type: 3, name: 'name', description: 'Name for the token', required: true }, { type: 3, name: 'token', description: 'The Discord user token', required: true }] },
  { name: 'addchannel', description: 'Add channel(s) — paste multiple IDs separated by newlines/spaces', options: [{ type: 3, name: 'name', description: 'Name for this channel group', required: true }, { type: 3, name: 'ids', description: 'One or more channel IDs (space/newline separated)', required: true }] },
  { name: 'deltoken', description: 'Delete a specified token', options: [{ type: 3, name: 'name', description: 'Name of the token to delete', required: true }] },
  { name: 'delchannel', description: 'Delete a specified channel', options: [{ type: 3, name: 'name', description: 'Name of the channel to delete', required: true }] },
  { name: 'listtokens', description: 'List all added tokens' },
  { name: 'listchannels', description: 'List all added channels' },
  { name: 'setmsg', description: 'Set the advertise message (opens a modal)' },
  { name: 'startauto', description: 'Start the auto advertising' },
  { name: 'stopauto', description: 'Stop the auto advertising' },
  { name: 'keycreate', description: 'Create a new key (password protected)', options: [{ type: 4, name: 'hours', description: 'Key duration in hours', required: true }] },
];

client.once('ready', async () => {
  console.log(`[+] Logged in as ${client.user.tag}`);
  console.log(`[+] Users: ${Object.keys(data.users).length}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  for (const guild of client.guilds.cache.values()) {
    try {
      const cmds = await rest.get(Routes.applicationGuildCommands(client.user.id, guild.id));
      if (cmds.length) {
        for (const cmd of cmds) {
          await rest.delete(Routes.applicationGuildCommand(client.user.id, guild.id, cmd.id));
        }
        console.log(`[+] Cleaned ${cmds.length} old guild commands from ${guild.name}`);
      }
    } catch (e) {
      console.error(`[x] Failed to clean guild commands for ${guild.name}: ${e.message}`);
    }
  }
});

process.on('uncaughtException', (e) => console.error('[!]', e.message));
process.on('unhandledRejection', (e) => console.error('[!]', e.message));

client.on('interactionCreate', async (i) => {
  if (i.isCommand()) {
    const { commandName, options } = i;

    if (commandName !== 'help' && commandName !== 'keyclaim' && commandName !== 'keycreate') {
      if (!getValidKey(i.user.id)) {
        return i.reply({ content: 'You need a valid key. Use `/keyclaim <key>` to claim one, or your key has expired.', flags: MessageFlags.Ephemeral });
      }
    }

    switch (commandName) {

      case 'help': {
        const embed = new EmbedBuilder()
          .setTitle('Auto Advertise Bot - Commands')
          .setDescription(
            '`/keyclaim <key>` - Claim a key\n' +
            '`/addtoken <name> <token>` - Add an authorize token\n' +
            '`/addchannel <name> <ids>` - Add channel group (space/newline separated IDs)\n' +
            '`/deltoken <name>` - Delete a token\n' +
            '`/delchannel <name>` - Delete a channel\n' +
            '`/listtokens` - List all tokens\n' +
            '`/listchannels` - List all channels\n' +
            '`/setmsg` - Set the advertise message\n' +
            '`/startauto` - Start auto advertising\n' +
            '`/stopauto` - Stop auto advertising\n' +
            '`/keycreate <hours>` - Create a key\n' +
            '`/help` - Show this message'
          )
          .setColor(0x5865F2);
        return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      case 'keyclaim': {
        const key = options.getString('key');
        const found = data.keys.find(k => k.code === key && !k.claimed);
        if (!found) return i.reply({ content: 'Invalid or already claimed key.', flags: MessageFlags.Ephemeral });
        found.claimed = true;
        found.claimedBy = i.user.id;
        found.claimedAt = Date.now();
        save();
        return i.reply({ content: `Key claimed. Expires in ${found.hours} hour(s).`, flags: MessageFlags.Ephemeral });
      }

      case 'addtoken': {
        const name = options.getString('name');
        const token = options.getString('token');
        const ud = getUserData(i.user.id);
        if (ud.tokens.find(t => t.name === name))
          return i.reply({ content: 'Token with this name already exists.', flags: MessageFlags.Ephemeral });
        ud.tokens.push({ name, token });
        save();
        return i.reply({ content: `Token "${name}" added. (${ud.tokens.length} total)`, flags: MessageFlags.Ephemeral });
      }

      case 'addchannel': {
        const name = options.getString('name');
        const idsRaw = options.getString('ids') || options.getString('id');
        const ud = getUserData(i.user.id);
        if (ud.channels.find(c => c.name === name))
          return i.reply({ content: 'Channel with this name already exists.', flags: MessageFlags.Ephemeral });
        const ids = idsRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        if (!ids.length) return i.reply({ content: 'No valid IDs provided.', flags: MessageFlags.Ephemeral });
        ud.channels.push({ name, ids });
        save();
        return i.reply({ content: `Channel group "${name}" added with ${ids.length} ID(s). (${ud.channels.length} total)`, flags: MessageFlags.Ephemeral });
      }

      case 'deltoken': {
        const name = options.getString('name');
        const ud = getUserData(i.user.id);
        const idx = ud.tokens.findIndex(t => t.name === name);
        if (idx === -1) return i.reply({ content: 'Token not found.', flags: MessageFlags.Ephemeral });
        ud.tokens.splice(idx, 1);
        save();
        return i.reply({ content: `Token "${name}" deleted.`, flags: MessageFlags.Ephemeral });
      }

      case 'delchannel': {
        const name = options.getString('name');
        const ud = getUserData(i.user.id);
        const idx = ud.channels.findIndex(c => c.name === name);
        if (idx === -1) return i.reply({ content: 'Channel not found.', flags: MessageFlags.Ephemeral });
        ud.channels.splice(idx, 1);
        save();
        return i.reply({ content: `Channel "${name}" deleted.`, flags: MessageFlags.Ephemeral });
      }

      case 'listtokens': {
        const ud = getUserData(i.user.id);
        if (!ud.tokens.length)
          return i.reply({ content: 'You have no tokens added.', flags: MessageFlags.Ephemeral });
        const list = ud.tokens.map((t, i) => `${i + 1}. ${t.name} — \`${t.token}\``).join('\n');
        return i.reply({ content: `**Your Tokens (${ud.tokens.length}):**\n${list}`, flags: MessageFlags.Ephemeral });
      }

      case 'listchannels': {
        const ud = getUserData(i.user.id);
        if (!ud.channels.length)
          return i.reply({ content: 'You have no channels added.', flags: MessageFlags.Ephemeral });
        const list = ud.channels.map((c, idx) => {
          const idList = c.ids.map(id => `\`${id}\``).join(', ');
          return `${idx + 1}. **${c.name}** (${c.ids.length}) — ${idList}`;
        }).join('\n');
        return i.reply({ content: `**Your Channel Groups:**\n${list}`, flags: MessageFlags.Ephemeral });
      }

      case 'setmsg': {
        const ud = getUserData(i.user.id);
        const modal = new ModalBuilder()
          .setCustomId('setmsg_modal')
          .setTitle('Set Advertise Message');
        const input = new TextInputBuilder()
          .setCustomId('msg_input')
          .setLabel('Enter the message to advertise')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setValue(ud.msg || '');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return i.showModal(modal);
      }

      case 'startauto': {
        const ud = getUserData(i.user.id);
        if (!ud.tokens.length) return i.reply({ content: 'No authorize tokens. Use /addtoken first.', flags: MessageFlags.Ephemeral });
        if (!ud.channels.length) return i.reply({ content: 'No channels. Use /addchannel first.', flags: MessageFlags.Ephemeral });
        if (!ud.msg) return i.reply({ content: 'No message. Use /setmsg first.', flags: MessageFlags.Ephemeral });
        if (autoIntervals[i.user.id]) return i.reply({ content: 'Already running. Use /stopauto first.', flags: MessageFlags.Ephemeral });

        ud.running = true;
        save();

        const channelLoops = [];
        for (const ch of ud.channels) {
          for (const channelId of ch.ids) {
            let slowmode = 0;
            try {
              slowmode = await getChannelSlowmode(ud.tokens[0].token, channelId);
            } catch (e) {
              console.error(`[x] Failed to get slowmode for ${ch.name}/${channelId}: ${e.message}`);
            }

            const numTokens = ud.tokens.length;
            const waitMs = (slowmode + 5) * 1000;
            const label = `${ch.name}/${channelId}`;
            const loop = { waitMs, name: label, timeoutId: null };

            let ti = 0;
            async function sendToChannel() {
              if (!ud.running) return;
              const t = ud.tokens[ti];
              if (t) {
                try {
                  await sendViaToken(t.token, channelId, ud.msg);
                  console.log(`[+] ${i.user.id}: Sent via ${t.name} to ${label}`);
                } catch (e) {
                  console.error(`[x] ${i.user.id}: ${t.name} -> ${label}: ${e.message}`);
                }
                ti = (ti + 1) % numTokens;
              }
              loop.timeoutId = setTimeout(sendToChannel, waitMs);
            }
            sendToChannel();
            channelLoops.push(loop);
          }
        }

        autoIntervals[i.user.id] = channelLoops;
        await i.reply({
          content: `Auto advertise started across ${channelLoops.length} channel(s).`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      case 'stopauto': {
        const ud = getUserData(i.user.id);
        if (!autoIntervals[i.user.id]) return i.reply({ content: 'Auto advertise is not running.', flags: MessageFlags.Ephemeral });
        ud.running = false;
        for (const loop of autoIntervals[i.user.id]) {
          if (loop.timeoutId) clearTimeout(loop.timeoutId);
        }
        delete autoIntervals[i.user.id];
        save();
        return i.reply({ content: 'Auto advertise stopped.', flags: MessageFlags.Ephemeral });
      }

      case 'keycreate': {
        const hours = options.getInteger('hours');
        if (!hours || hours < 1) return i.reply({ content: 'Hours must be at least 1.', flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder()
          .setCustomId('keycreate_modal')
          .setTitle('Create Key');
        const input = new TextInputBuilder()
          .setCustomId('keycreate_password')
          .setLabel('Enter the password to create a key')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        pendingKeyHours.set(i.user.id, hours);
        return i.showModal(modal);
      }


    }
  }

  if (i.isModalSubmit()) {
    if (i.customId === 'setmsg_modal') {
      const msg = i.fields.getTextInputValue('msg_input');
      if (!msg) return i.reply({ content: 'Message cannot be empty.', flags: MessageFlags.Ephemeral });
      const ud = getUserData(i.user.id);
      ud.msg = msg;
      save();
      return i.reply({ content: 'Advertise message set.', flags: MessageFlags.Ephemeral });
    }

    if (i.customId === 'keycreate_modal') {
      const password = i.fields.getTextInputValue('keycreate_password');
      const hours = pendingKeyHours.get(i.user.id) || 1;
      pendingKeyHours.delete(i.user.id);
      if (password !== PASSWORD) return i.reply({ content: 'Incorrect password. Operation cancelled.', flags: MessageFlags.Ephemeral });
      const key = genKey();
      data.keys.push({ code: key, hours, claimed: false });
      save();
      return i.reply({ content: `Key created: **${key}** - ${hours} hour(s)`, flags: MessageFlags.Ephemeral });
    }


  }
});

const http = require('http');
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  const runningCount = Object.values(data.users).filter(u => u.running).length;
  res.end(JSON.stringify({ status: 'ok', running: runningCount }));
}).listen(PORT, () => console.log(`[+] Health server on port ${PORT}`));

client.login(TOKEN);
