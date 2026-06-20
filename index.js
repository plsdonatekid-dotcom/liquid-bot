const {
  Client, GatewayIntentBits, REST, Routes,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, 'storage.json');
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const PASSWORD = process.env.BOT_PASSWORD;


let data = fs.existsSync(CONFIG)
  ? JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  : { keys: [], tokens: [], channels: [], msg: '', running: false };
let autoInterval = null;
const pendingKeyHours = new Map();

function save() { fs.writeFileSync(CONFIG, JSON.stringify(data, null, 2)); }

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

if (data.running) { data.running = false; save(); }

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
  { name: 'addchannel', description: 'Add a channel ID', options: [{ type: 3, name: 'name', description: 'Name for the channel', required: true }, { type: 3, name: 'id', description: 'The channel ID', required: true }] },
  { name: 'deltoken', description: 'Delete a specified token', options: [{ type: 3, name: 'name', description: 'Name of the token to delete', required: true }] },
  { name: 'delchannel', description: 'Delete a specified channel', options: [{ type: 3, name: 'name', description: 'Name of the channel to delete', required: true }] },
  { name: 'listtokens', description: 'List all added tokens' },
  { name: 'listchannels', description: 'List all added channels' },
  { name: 'setmsg', description: 'Set the advertise message (opens a modal)' },
  { name: 'startauto', description: 'Start the auto advertising' },
  { name: 'stopauto', description: 'Stop the auto advertising' },
  { name: 'keycreate', description: 'Create a new key (password protected)', options: [{ type: 4, name: 'hours', description: 'Key duration in hours', required: true }] },
  { name: 'setupautoadv', description: 'Setup the bot (password protected)' }
];

client.once('ready', async () => {
  console.log(`[+] Logged in as ${client.user.tag}`);
  console.log(`[+] Tokens: ${data.tokens.length} | Channels: ${data.channels.length}`);
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

    if (commandName !== 'help' && commandName !== 'keyclaim' && commandName !== 'keycreate' && commandName !== 'setupautoadv') {
      if (!getValidKey(i.user.id)) {
        return i.reply({ content: 'You need a valid key. Use `/keyclaim <key>` to claim one, or your key has expired.', ephemeral: true });
      }
    }

    switch (commandName) {

      case 'help': {
        const embed = new EmbedBuilder()
          .setTitle('Auto Advertise Bot - Commands')
          .setDescription(
            '`/keyclaim <key>` - Claim a key\n' +
            '`/addtoken <name> <token>` - Add an authorize token\n' +
            '`/addchannel <name> <id>` - Add a channel\n' +
            '`/deltoken <name>` - Delete a token\n' +
            '`/delchannel <name>` - Delete a channel\n' +
            '`/listtokens` - List all tokens\n' +
            '`/listchannels` - List all channels\n' +
            '`/setmsg` - Set the advertise message\n' +
            '`/startauto` - Start auto advertising\n' +
            '`/stopauto` - Stop auto advertising\n' +
            '`/keycreate <hours>` - Create a key\n' +
            '`/setupautoadv` - Setup the bot\n' +
            '`/help` - Show this message'
          )
          .setColor(0x5865F2);
        return i.reply({ embeds: [embed], ephemeral: true });
      }

      case 'keyclaim': {
        const key = options.getString('key');
        const found = data.keys.find(k => k.code === key && !k.claimed);
        if (!found) return i.reply({ content: 'Invalid or already claimed key.', ephemeral: true });
        found.claimed = true;
        found.claimedBy = i.user.id;
        found.claimedAt = Date.now();
        save();
        return i.reply({ content: `Key claimed. Expires in ${found.hours} hour(s).`, ephemeral: true });
      }

      case 'addtoken': {
        const name = options.getString('name');
        const token = options.getString('token');
        if (data.tokens.find(t => t.name === name))
          return i.reply({ content: 'Token with this name already exists.', ephemeral: true });
        data.tokens.push({ name, token });
        save();
        return i.reply({ content: `Token "${name}" added. (${data.tokens.length} total)`, ephemeral: true });
      }

      case 'addchannel': {
        const name = options.getString('name');
        const id = options.getString('id');
        if (data.channels.find(c => c.name === name))
          return i.reply({ content: 'Channel with this name already exists.', ephemeral: true });
        data.channels.push({ name, id });
        save();
        return i.reply({ content: `Channel "${name}" added. (${data.channels.length} total)`, ephemeral: true });
      }

      case 'deltoken': {
        const name = options.getString('name');
        const idx = data.tokens.findIndex(t => t.name === name);
        if (idx === -1) return i.reply({ content: 'Token not found.', ephemeral: true });
        data.tokens.splice(idx, 1);
        save();
        return i.reply({ content: `Token "${name}" deleted.`, ephemeral: true });
      }

      case 'delchannel': {
        const name = options.getString('name');
        const idx = data.channels.findIndex(c => c.name === name);
        if (idx === -1) return i.reply({ content: 'Channel not found.', ephemeral: true });
        data.channels.splice(idx, 1);
        save();
        return i.reply({ content: `Channel "${name}" deleted.`, ephemeral: true });
      }

      case 'listtokens': {
        if (!data.tokens.length)
          return i.reply({ content: 'No tokens added.', ephemeral: true });
        const list = data.tokens.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
        return i.reply({ content: `**Tokens (${data.tokens.length}):**\n${list}`, ephemeral: true });
      }

      case 'listchannels': {
        if (!data.channels.length)
          return i.reply({ content: 'No channels added.', ephemeral: true });
        const list = data.channels.map((c, i) => `${i + 1}. ${c.name} - ${c.id}`).join('\n');
        return i.reply({ content: `**Channels (${data.channels.length}):**\n${list}`, ephemeral: true });
      }

      case 'setmsg': {
        const modal = new ModalBuilder()
          .setCustomId('setmsg_modal')
          .setTitle('Set Advertise Message');
        const input = new TextInputBuilder()
          .setCustomId('msg_input')
          .setLabel('Enter the message to advertise')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setValue(data.msg || '');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return i.showModal(modal);
      }

      case 'startauto': {
        if (!data.tokens.length) return i.reply({ content: 'No authorize tokens. Use /addtoken first.', ephemeral: true });
        if (!data.channels.length) return i.reply({ content: 'No channels. Use /addchannel first.', ephemeral: true });
        if (!data.msg) return i.reply({ content: 'No message. Use /setmsg first.', ephemeral: true });
        if (autoInterval) return i.reply({ content: 'Already running. Use /stopauto first.', ephemeral: true });

        data.running = true;
        save();
        await i.reply({ content: 'Starting auto advertise...', ephemeral: true });

        for (const t of data.tokens) {
          try { await dmUserViaToken(t.token, 'Auto advertise has started.'); }
          catch (e) { console.error(`[x] Failed to notify ${t.name}: ${e.message}`); }
        }

        let ti = 0, ci = 0;
        autoInterval = setInterval(async () => {
          if (!data.running) {
            if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
            return;
          }
          const t = data.tokens[ti];
          const ch = data.channels[ci];
          if (!t || !ch) { ti = 0; ci = 0; return; }
          try {
            await sendViaToken(t.token, ch.id, data.msg);
            console.log(`[+] Sent via ${t.name} to ${ch.name}`);
          } catch (e) {
            console.error(`[x] ${t.name} -> ${ch.name}: ${e.message}`);
          }
          ti = (ti + 1) % data.tokens.length;
          if (ti === 0) ci = (ci + 1) % data.channels.length;
        }, 30000);
        return;
      }

      case 'stopauto': {
        if (!autoInterval) return i.reply({ content: 'Auto advertise is not running.', ephemeral: true });
        data.running = false;
        if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
        save();
        await i.reply({ content: 'Stopping auto advertise...', ephemeral: true });
        for (const t of data.tokens) {
          try { await dmUserViaToken(t.token, 'Auto advertise has stopped.'); }
          catch (e) { console.error(`[x] Failed to notify ${t.name}: ${e.message}`); }
        }
        return;
      }

      case 'keycreate': {
        const hours = options.getInteger('hours');
        if (!hours || hours < 1) return i.reply({ content: 'Hours must be at least 1.', ephemeral: true });
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

      case 'setupautoadv': {
        const modal = new ModalBuilder()
          .setCustomId('setup_modal')
          .setTitle('Setup Auto Advertise');
        const input = new TextInputBuilder()
          .setCustomId('setup_password')
          .setLabel('Enter the setup password')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return i.showModal(modal);
      }
    }
  }

  if (i.isModalSubmit()) {
    if (i.customId === 'setmsg_modal') {
      const msg = i.fields.getTextInputValue('msg_input');
      if (!msg) return i.reply({ content: 'Message cannot be empty.', ephemeral: true });
      data.msg = msg;
      save();
      return i.reply({ content: 'Advertise message set.', ephemeral: true });
    }

    if (i.customId === 'keycreate_modal') {
      const password = i.fields.getTextInputValue('keycreate_password');
      const hours = pendingKeyHours.get(i.user.id) || 1;
      pendingKeyHours.delete(i.user.id);
      if (password !== PASSWORD) return i.reply({ content: 'Incorrect password. Operation cancelled.', ephemeral: true });
      const key = genKey();
      data.keys.push({ code: key, hours, claimed: false });
      save();
      return i.reply({ content: `Key created: **${key}** - ${hours} hour(s)`, ephemeral: true });
    }

    if (i.customId === 'setup_modal') {
      const password = i.fields.getTextInputValue('setup_password');
      if (password !== PASSWORD) return i.reply({ content: 'Incorrect password. Operation cancelled.', ephemeral: true });
      let status = '**Setup Summary**\n';
      status += `Tokens: ${data.tokens.length}\n`;
      status += `Channels: ${data.channels.length}\n`;
      status += `Message: ${data.msg ? 'Set' : 'Not set'}\n`;
      if (data.tokens.length && data.channels.length && data.msg) {
        status += '\nAll configured. Use /startauto to begin.';
      } else {
        status += '\nSome items are missing. Use /addtoken, /addchannel, /setmsg to configure.';
      }
      return i.reply({ content: status, ephemeral: true });
    }
  }
});

const http = require('http');
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', running: data.running }));
}).listen(PORT, () => console.log(`[+] Health server on port ${PORT}`));

client.login(TOKEN);
