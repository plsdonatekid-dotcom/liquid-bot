const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1516747796114444338';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

const commands = [
  {
    name: 'help',
    description: 'Show all available commands'
  },
  {
    name: 'keyclaim',
    description: 'Claim a key to use the bot',
    options: [{
      type: 3,
      name: 'key',
      description: 'The key to claim',
      required: true
    }]
  },
  {
    name: 'addtoken',
    description: 'Add an authorize token (max 50)',
    options: [
      { type: 3, name: 'name', description: 'Name for the token', required: true },
      { type: 3, name: 'token', description: 'The Discord user token', required: true }
    ]
  },
  {
    name: 'addchannel',
    description: 'Add channel group — paste multiple IDs separated by spaces/newlines',
    options: [
      { type: 3, name: 'name', description: 'Name for this channel group', required: true },
      { type: 3, name: 'ids', description: 'One or more channel IDs (space/newline separated)', required: true }
    ]
  },
  {
    name: 'deltoken',
    description: 'Delete a specified token',
    options: [{
      type: 3, name: 'name', description: 'Name of the token to delete', required: true
    }]
  },
  {
    name: 'delchannel',
    description: 'Delete a specified channel',
    options: [{
      type: 3, name: 'name', description: 'Name of the channel to delete', required: true
    }]
  },
  {
    name: 'listtokens',
    description: 'List all added tokens'
  },
  {
    name: 'listchannels',
    description: 'List all added channels'
  },
  {
    name: 'setmsg',
    description: 'Set the advertise message (opens a modal)'
  },
  {
    name: 'startauto',
    description: 'Start the auto advertising'
  },
  {
    name: 'stopauto',
    description: 'Stop the auto advertising'
  },
  {
    name: 'keycreate',
    description: 'Create a new key (password protected)',
    options: [{
      type: 4, name: 'hours', description: 'Key duration in hours', required: true
    }]
  },
];

async function deploy() {
  if (!CLIENT_ID) {
    console.error('[!] Set CLIENT_ID in deploy-commands.js first');
    console.error('[!] Get it from Discord Developer Portal -> Bot -> Client ID');
    process.exit(1);
  }
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);
    console.log(`[+] Registering slash commands${GUILD_ID ? ` in guild ${GUILD_ID}` : ' globally'}...`);
    await rest.put(route, { body: commands });
    console.log('[+] Commands registered successfully!');
  } catch (e) {
    console.error('[x] Failed to register commands:', e.message);
  }
}

deploy();
