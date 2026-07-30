const http = require('http');

// ==========================================
// 1. HTTP SERVER (Fixes Render Port Scanner)
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('IBL Bot is operational.\n');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Web server listening on port ${PORT}`);
});

// ==========================================
// 2. IMPORTS & MONGODB DATABASE SETUP
// ==========================================
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  REST, 
  Routes, 
  AttachmentBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel
} = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const mongoose = require('mongoose');

// --- Schemas ---
const standingsSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  played: { type: Number, default: 0 },
  won: { type: Number, default: 0 },
  drawn: { type: Number, default: 0 },
  lost: { type: Number, default: 0 },
  gf: { type: Number, default: 0 },
  ga: { type: Number, default: 0 },
  gd: { type: Number, default: 0 },
  points: { type: Number, default: 0 }
});
const Standing = mongoose.model('Standing', standingsSchema);

const playerSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  robloxUsername: { type: String, required: true },
  team: { type: String, default: 'Free Agent' },
  season: { type: Number, default: 1 },
  status: { type: String, default: 'Free Agent' }
});
const Player = mongoose.model('Player', playerSchema);

const scheduledGameSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true },
  type: String,
  homeTeam: String,
  awayTeam: String,
  timeStr: String,
  eventId: String,
  completed: { type: Boolean, default: false }
});
const ScheduledGame = mongoose.model('ScheduledGame', scheduledGameSchema);

const resultSchema = new mongoose.Schema({
  type: String,
  homeTeam: String,
  awayTeam: String,
  homeScore: Number,
  awayScore: Number,
  date: { type: Date, default: Date.now }
});
const MatchResult = mongoose.model('MatchResult', resultSchema);

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB!'))
    .catch(err => console.error('MongoDB connection error:', err));
}

// ==========================================
// 3. CONFIGURATION & CONSTANTS
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents
  ]
});

const EMOJIS = {
  IBL: '<:IBL:1531819571542098001>',
  CUP: '<:IrishLandsCup:1531819472678031431>',
  Limavady: '<:LimavadyUnitedFAC:1531391544907661332>',
  Fanad: '<:FanadUnitedFC:1531286529211633754>',
  Charlton: '<:CharltonRovers:1531276300075929763>',
  Linfield: '<:LinfieldFC:1531263193421185144>',
  Crusaders: '<:Crusadersfc:1531045891765702696>',
  Portstewart: '<:Portstewart_FC:1531036389099966554>'
};

const TEAMS = [
  { name: "Portstewart F.C", roleName: "Portstewart FC", emoji: EMOJIS.Portstewart, server: "https://discord.gg/hzZEYJUYGy" },
  { name: "Crusaders F.C", roleName: "Crusaders FC", emoji: EMOJIS.Crusaders, server: "https://discord.gg/66B9BE2D2N" },
  { name: "Linfield F.C", roleName: "Linfield FC", emoji: EMOJIS.Linfield, server: "https://discord.gg/r8Kvvfawmk" },
  { name: "Charlton Rovers F.C", roleName: "Charlton Rovers", emoji: EMOJIS.Charlton, server: "https://discord.gg/SWBBRZVx4s" },
  { name: "Fanad United F.C", roleName: "Fanad United FC", emoji: EMOJIS.Fanad, server: "https://discord.gg/C4Cb2w8AgV" },
  { name: "Limavady United F.C", roleName: "Limavady United FAC", emoji: EMOJIS.Limavady, server: "N/A" }
];

const TEAM_CHOICES = TEAMS.map(t => ({ name: t.name, value: t.name }));
const SEASON_CHOICES = Array.from({ length: 10 }, (_, i) => ({ name: `Season ${i + 1}`, value: i + 1 }));

const STADIUM_LINK = "https://www.roblox.com/games/74209114246372/Parkside-Stadium-IBL";
const STADIUM_NAME = "Parkside Stadium IBL";

const CHANNELS = {
  SIGNING_RELEASE: 'signing-release-requests',
  LEAGUE_FIXTURES: 'league-fixtures',
  CUP_FIXTURES: 'cup-fixtures',
  LEAGUE_RESULTS: 'league-results',
  CUP_RESULTS: 'cup-results',
  REFEREE_REQUESTS: 'referee-availability'
};

const STAFF_ROLES = ['IBL | REGISTRATION STAFF'];
const MANAGEMENT_ROLES = ['IBL | REGISTRATION STAFF', 'IBL | Team Owner', 'IBL | Team Manager'];

async function initializeDatabase() {
  for (const team of TEAMS) {
    const exists = await Standing.findOne({ name: team.name });
    if (!exists) await Standing.create({ name: team.name });
  }
}

function hasRolePermission(member, allowedRoleNames) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.some(role => 
    allowedRoleNames.some(allowed => allowed.toLowerCase() === role.name.toLowerCase())
  );
}

function getTeamEmoji(teamName) {
  const t = TEAMS.find(x => x.name.toLowerCase() === teamName.toLowerCase());
  return t ? t.emoji : '';
}

// ==========================================
// 4. SLASH COMMAND BUILDERS
// ==========================================
const commands = [
  new SlashCommandBuilder()
    .setName('requestsigning')
    .setDescription('Request a team signing')
    .addUserOption(opt => opt.setName('player').setDescription('Player being signed').setRequired(true))
    .addStringOption(opt => opt.setName('roblox_username').setDescription('Player Roblox Username').setRequired(true))
    .addStringOption(opt => opt.setName('team').setDescription('Team Name').setRequired(true).addChoices(...TEAM_CHOICES))
    .addIntegerOption(opt => opt.setName('season').setDescription('Season number (1-10)').setRequired(true).addChoices(...SEASON_CHOICES)),

  new SlashCommandBuilder()
    .setName('requestrelease')
    .setDescription('Request a team release')
    .addUserOption(opt => opt.setName('player').setDescription('Player being released').setRequired(true))
    .addStringOption(opt => opt.setName('team').setDescription('Team Name').setRequired(true).addChoices(...TEAM_CHOICES)),

  new SlashCommandBuilder()
    .setName('game')
    .setDescription('Schedule a new match and create a server event')
    .addStringOption(opt => 
      opt.setName('type')
        .setDescription('Match Type')
        .setRequired(true)
        .addChoices(
          { name: 'Division 1', value: 'div1' },
          { name: 'Cup', value: 'cup' }
        ))
    .addStringOption(opt => opt.setName('home_team').setDescription('Home Team').setRequired(true).addChoices(...TEAM_CHOICES))
    .addStringOption(opt => opt.setName('away_team').setDescription('Away Team').setRequired(true).addChoices(...TEAM_CHOICES))
    .addStringOption(opt => opt.setName('time').setDescription('Match Time/Date (e.g. Tomorrow at 9:00 PM)').setRequired(true))
    .addStringOption(opt => 
      opt.setName('stadium')
        .setDescription('Select Stadium')
        .setRequired(true)
        .addChoices({ name: STADIUM_NAME, value: STADIUM_NAME })),

  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Post match results from scheduled games and update standings')
    .addStringOption(opt => opt.setName('game').setDescription('Select scheduled game').setRequired(true).setAutocomplete(true))
    .addIntegerOption(opt => opt.setName('home_score').setDescription('Home Score').setRequired(true))
    .addIntegerOption(opt => opt.setName('away_score').setDescription('Away Score').setRequired(true)),

  new SlashCommandBuilder()
    .setName('standings')
    .setDescription('View live IBL League Standings from MongoDB'),

  new SlashCommandBuilder()
    .setName('teams')
    .setDescription('List all teams and their Discord server links'),

  new SlashCommandBuilder()
    .setName('player')
    .setDescription('View a player profile and team status')
    .addUserOption(opt => opt.setName('user').setDescription('Select player').setRequired(true)),

  new SlashCommandBuilder()
    .setName('refereerequest')
    .setDescription('Request a referee for an upcoming match')
    .addStringOption(opt => 
      opt.setName('type')
        .setDescription('Match Type')
        .setRequired(true)
        .addChoices(
          { name: 'Division 1', value: 'div1' },
          { name: 'Cup', value: 'cup' },
          { name: 'Friendly', value: 'friendly' }
        ))
    .addStringOption(opt => opt.setName('home_team').setDescription('Home Team').setRequired(true).addChoices(...TEAM_CHOICES))
    .addStringOption(opt => opt.setName('away_team').setDescription('Away Team').setRequired(true).addChoices(...TEAM_CHOICES))
    .addStringOption(opt => opt.setName('time').setDescription('Match Time/Date').setRequired(true))
];

// ==========================================
// 5. EVENT HANDLERS & LOGIC
// ==========================================
client.once('ready', async () => {
  console.log(`IBL Bot logged in as ${client.user.tag}`);
  await initializeDatabase();

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Commands successfully registered globally.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// Autocomplete handler for /results
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete() && interaction.commandName === 'results') {
    const focusedValue = interaction.options.getFocused();
    const scheduledGames = await ScheduledGame.find({ completed: false });
    const choices = scheduledGames.map(g => ({
      name: `${g.type.toUpperCase()}: ${g.homeTeam} vs ${g.awayTeam} (${g.timeStr})`,
      value: g.gameId
    }));
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered);
  }
});

client.on('interactionCreate', async (interaction) => {
  // Handle Button Clicks for Request Accept/Decline
  if (interaction.isButton()) {
    const { customId, member, guild, user } = interaction;

    if (!customId.startsWith('req_accept_') && !customId.startsWith('req_decline_')) return;

    if (!hasRolePermission(member, STAFF_ROLES)) {
      return interaction.reply({ content: '❌ Only IBL | REGISTRATION STAFF can accept or decline requests.', ephemeral: true });
    }

    const [action, type, targetId, requesterId, seasonVal, ...teamParts] = customId.split('_');
    const isSigning = type === 'signing';
    const isAccept = action === 'req_accept';
    const teamName = teamParts.join('_');

    const targetUser = await client.users.fetch(targetId).catch(() => null);
    const requester = await client.users.fetch(requesterId).catch(() => null);

    // Update Player DB if accepting signing
    if (isAccept && isSigning && targetUser) {
      const origEmbed = interaction.message.embeds[0];
      const robloxField = origEmbed.fields.find(f => f.name === 'Roblox Username');
      const robloxUsername = robloxField ? robloxField.value : targetUser.username;

      await Player.findOneAndUpdate(
        { discordId: targetUser.id },
        { 
          discordId: targetUser.id,
          robloxUsername,
          team: teamName,
          season: parseInt(seasonVal) || 1,
          status: 'Registered'
        },
        { upsert: true, new: true }
      );
    } else if (isAccept && !isSigning && targetUser) {
      await Player.findOneAndUpdate(
        { discordId: targetUser.id },
        { team: 'Free Agent', status: 'Free Agent' }
      );
    }

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(isAccept ? '#22C55E' : '#EF4444')
      .spliceFields(
        interaction.message.embeds[0].fields.findIndex(f => f.name === 'Status'),
        1,
        { name: 'Status', value: isAccept ? `✅ Approved by ${user}` : `❌ Declined by ${user}`, inline: false }
      );

    await interaction.update({ embeds: [updatedEmbed], components: [] });

    // DM Requester Notification
    if (requester) {
      let dmMsg = '';
      if (isSigning) {
        dmMsg = isAccept 
          ? `Player **${targetUser ? targetUser.tag : targetId}** has been **accepted** to play for **${teamName}**!`
          : `Player **${targetUser ? targetUser.tag : targetId}** has been **declined** to play for **${teamName}**.`;
      } else {
        dmMsg = isAccept
          ? `Player **${targetUser ? targetUser.tag : targetId}** has been **released** from **${teamName}**.`
          : `Player **${targetUser ? targetUser.tag : targetId}** has **not been released** from **${teamName}**.`;
      }
      await requester.send(dmMsg).catch(() => console.log('Could not send DM to user.'));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, user, member } = interaction;

  // ------------------------------------------------------------------
  // /player
  // ------------------------------------------------------------------
  if (commandName === 'player') {
    const targetUser = options.getUser('user');
    let playerData = await Player.findOne({ discordId: targetUser.id });

    // Fallback search if player isn't in MongoDB yet
    if (!playerData) {
      const targetMember = guild.members.cache.get(targetUser.id);
      const teamRole = targetMember ? targetMember.roles.cache.find(r => TEAMS.some(t => t.roleName.toLowerCase() === r.name.toLowerCase())) : null;
      
      playerData = {
        robloxUsername: targetUser.username,
        team: teamRole ? teamRole.name : 'Free Agent',
        season: 1,
        status: teamRole ? 'Registered' : 'Free Agent'
      };
    }

    const teamEmoji = getTeamEmoji(playerData.team);
    const teamDisplay = playerData.team === 'Free Agent' ? 'Free Agent' : `${teamEmoji} ${playerData.team}`;

    // Red bar embed style matching SVL format from user reference picture
    const embed = new EmbedBuilder()
      .setColor('#EF4444')
      .setDescription(
        `**Player Profile: ${playerData.robloxUsername}**\n\n` +
        `**Roblox**\n${playerData.robloxUsername}\n` +
        `**Discord**\n<@${targetUser.id}>\n` +
        `**Team**\n${teamDisplay}\n` +
        `**Season**\nSeason ${playerData.season}\n` +
        `**Status**\n${playerData.status}`
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ------------------------------------------------------------------
  // /requestsigning & /requestrelease
  // ------------------------------------------------------------------
  if (commandName === 'requestsigning' || commandName === 'requestrelease') {
    if (!hasRolePermission(member, MANAGEMENT_ROLES)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const player = options.getUser('player');
    const team = options.getString('team');
    const isSigning = commandName === 'requestsigning';
    const robloxUsername = isSigning ? options.getString('roblox_username') : 'N/A';
    const season = isSigning ? options.getInteger('season') : 1;

    const targetChannel = guild.channels.cache.find(c => c.name === CHANNELS.SIGNING_RELEASE);
    if (!targetChannel) {
      return interaction.reply({ content: `Error: #${CHANNELS.SIGNING_RELEASE} channel not found.`, ephemeral: true });
    }

    const teamEmoji = getTeamEmoji(team);

    const embed = new EmbedBuilder()
      .setTitle(isSigning ? 'Signing Request' : 'Release Request')
      .setColor('#F59E0B')
      .addFields(
        { name: 'Player', value: `${player}`, inline: true },
        { name: 'Team', value: `${teamEmoji} ${team}`, inline: true }
      );

    if (isSigning) {
      embed.addFields(
        { name: 'Roblox Username', value: robloxUsername, inline: true },
        { name: 'Season', value: `Season ${season}`, inline: true }
      );
    }

    embed.addFields({ name: 'Status', value: '⏳ Pending Staff Approval', inline: false }).setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`req_accept_${isSigning ? 'signing' : 'release'}_${player.id}_${user.id}_${season}_${team}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`req_decline_${isSigning ? 'signing' : 'release'}_${player.id}_${user.id}_${season}_${team}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
    );

    await targetChannel.send({ embeds: [embed], components: [buttons] });
    return interaction.reply({ content: `Request submitted to #${CHANNELS.SIGNING_RELEASE}!`, ephemeral: true });
  }

  // ------------------------------------------------------------------
  // /game
  // ------------------------------------------------------------------
  if (commandName === 'game') {
    if (!hasRolePermission(member, STAFF_ROLES)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const type = options.getString('type');
    const home = options.getString('home_team');
    const away = options.getString('away_team');
    const timeStr = options.getString('time');
    const stadium = options.getString('stadium');

    const isCup = type === 'cup';
    const targetChannelName = isCup ? CHANNELS.CUP_FIXTURES : CHANNELS.LEAGUE_FIXTURES;
    const targetChannel = guild.channels.cache.find(c => c.name === targetChannelName);

    if (!targetChannel) {
      return interaction.reply({ content: `Error: #${targetChannelName} channel not found.`, ephemeral: true });
    }

    // Create Discord Server Scheduled Event
    let createdEvent = null;
    try {
      const scheduledStartTime = new Date(Date.now() + 3600000); // Set placeholder start time (+1hr)
      createdEvent = await guild.scheduledEvents.create({
        name: `${type.toUpperCase()}: ${home} vs ${away}`,
        scheduledStartTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: STADIUM_LINK },
        description: `${type.toUpperCase()} match — ${home} vs ${away}`
      });
    } catch (err) {
      console.error('Failed to create server event:', err);
    }

    // Save game info in MongoDB
    const gameId = `game_${Date.now()}`;
    await ScheduledGame.create({
      gameId,
      type,
      homeTeam: home,
      awayTeam: away,
      timeStr,
      eventId: createdEvent ? createdEvent.id : null
    });

    const titleHeader = isCup ? `${EMOJIS.CUP} | Irish Lands Cup` : `${EMOJIS.IBL} | Irish Blox League`;
    const homeEmoji = getTeamEmoji(home);
    const awayEmoji = getTeamEmoji(away);

    const embed = new EmbedBuilder()
      .setTitle(titleHeader)
      .setColor(isCup ? '#10B981' : '#3B82F6')
      .addFields(
        { name: 'Fixture', value: `${homeEmoji} **${home}** vs ${awayEmoji} **${away}**`, inline: false },
        { name: 'Time', value: timeStr, inline: true },
        { name: 'Stadium', value: `[${stadium}](${STADIUM_LINK})`, inline: true }
      )
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });
    return interaction.reply({ content: `Fixture and Discord Event posted for **${home} vs ${away}**!`, ephemeral: true });
  }

  // ------------------------------------------------------------------
  // /results
  // ------------------------------------------------------------------
  if (commandName === 'results') {
    if (!hasRolePermission(member, STAFF_ROLES)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const gameId = options.getString('game');
    const homeScore = options.getInteger('home_score');
    const awayScore = options.getInteger('away_score');

    const scheduledGame = await ScheduledGame.findOne({ gameId });
    if (!scheduledGame) {
      return interaction.reply({ content: '❌ Scheduled game not found.', ephemeral: true });
    }

    const { type, homeTeam, awayTeam, eventId } = scheduledGame;
    const isCup = type === 'cup';
    const targetChannelName = isCup ? CHANNELS.CUP_RESULTS : CHANNELS.LEAGUE_RESULTS;
    const targetChannel = guild.channels.cache.find(c => c.name === targetChannelName);

    if (!targetChannel) {
      return interaction.reply({ content: `Error: #${targetChannelName} channel not found.`, ephemeral: true });
    }

    // Mark event complete in Discord
    if (eventId) {
      const event = await guild.scheduledEvents.fetch(eventId).catch(() => null);
      if (event) await event.delete().catch(() => null);
    }

    // Mark scheduled game finished in DB
    scheduledGame.completed = true;
    await scheduledGame.save();

    await MatchResult.create({
      type,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore
    });

    const homeEmoji = getTeamEmoji(homeTeam);
    const awayEmoji = getTeamEmoji(awayTeam);

    const embed = new EmbedBuilder()
      .setTitle(isCup ? `${EMOJIS.CUP} | Match Result` : `${EMOJIS.IBL} | Match Result`)
      .setColor('#22C55E')
      .addFields({
        name: 'Full Time Score',
        value: `${homeEmoji} **${homeTeam}** ${homeScore} - ${awayScore} **${awayTeam}** ${awayEmoji}`,
        inline: false
      })
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });

    if (!isCup) {
      await updateMongoStandings(homeTeam, awayTeam, homeScore, awayScore);
    }

    return interaction.reply({ content: `Result saved to MongoDB & posted to #${targetChannelName}!`, ephemeral: true });
  }

  // ------------------------------------------------------------------
  // /refereerequest
  // ------------------------------------------------------------------
  if (commandName === 'refereerequest') {
    if (!hasRolePermission(member, MANAGEMENT_ROLES)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const type = options.getString('type');
    const home = options.getString('home_team');
    const away = options.getString('away_team');
    const timeStr = options.getString('time');

    const targetChannel = guild.channels.cache.find(c => c.name === CHANNELS.REFEREE_REQUESTS);
    if (!targetChannel) {
      return interaction.reply({ content: `Error: #${CHANNELS.REFEREE_REQUESTS} channel not found.`, ephemeral: true });
    }

    const homeEmoji = getTeamEmoji(home);
    const awayEmoji = getTeamEmoji(away);

    const refereeRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'referee');
    const rolePing = refereeRole ? `${refereeRole}` : '@Referee';

    const embed = new EmbedBuilder()
      .setTitle('Referee Request')
      .setColor('#F59E0B')
      .addFields(
        { name: 'Match Type', value: type.toUpperCase(), inline: true },
        { name: 'Time', value: timeStr, inline: true },
        { name: 'Fixture', value: `${homeEmoji} **${home}** vs ${awayEmoji} **${away}**`, inline: false },
        { name: 'Requested By', value: `${user}`, inline: true }
      )
      .setTimestamp();

    await targetChannel.send({ content: `${rolePing}`, embeds: [embed] });
    return interaction.reply({ content: `Referee request posted to #${CHANNELS.REFEREE_REQUESTS}!`, ephemeral: true });
  }

  // ------------------------------------------------------------------
  // /teams
  // ------------------------------------------------------------------
  if (commandName === 'teams') {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.IBL} | IBL Teams & Servers`)
      .setColor('#3B82F6');

    TEAMS.forEach(team => {
      embed.addFields({
        name: `${team.emoji} ${team.name}`,
        value: team.server !== "N/A" ? `[Join Server](${team.server})` : 'Server: N/A',
        inline: true
      });
    });

    return interaction.reply({ embeds: [embed] });
  }

  // ------------------------------------------------------------------
  // /standings
  // ------------------------------------------------------------------
  if (commandName === 'standings') {
    await interaction.deferReply();

    try {
      const standingsData = await Standing.find().sort({ points: -1, gd: -1 });

      const canvas = createCanvas(1000, 500);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px Sans-Serif';
      ctx.fillText('IRISH BLOX LEAGUE - STANDINGS', 60, 85);

      ctx.font = 'bold 16px Sans-Serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('POS', 60, 130);
      ctx.fillText('TEAM', 130, 130);
      ctx.fillText('P', 550, 130);
      ctx.fillText('W', 610, 130);
      ctx.fillText('D', 670, 130);
      ctx.fillText('L', 730, 130);
      ctx.fillText('GD', 790, 130);
      ctx.fillText('PTS', 860, 130);

      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(60, 145);
      ctx.lineTo(920, 145);
      ctx.stroke();

      let y = 185;
      ctx.font = '16px Sans-Serif';

      standingsData.forEach((team, index) => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${index + 1}`, 60, y);
        ctx.fillText(team.name, 130, y);
        ctx.fillText(`${team.played}`, 550, y);
        ctx.fillText(`${team.won}`, 610, y);
        ctx.fillText(`${team.drawn}`, 670, y);
        ctx.fillText(`${team.lost}`, 730, y);
        ctx.fillText(`${team.gd}`, 790, y);
        
        ctx.fillStyle = '#38BDF8';
        ctx.font = 'bold 16px Sans-Serif';
        ctx.fillText(`${team.points}`, 860, y);
        ctx.font = '16px Sans-Serif';

        y += 45;
      });

      const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'standings.png' });
      return interaction.editReply({ files: [attachment] });

    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: 'Failed to generate standings table image.' });
    }
  }
});

// Update standings following football rules (3 points win, 1 point draw)
async function updateMongoStandings(homeName, awayName, homeScore, awayScore) {
  const home = await Standing.findOne({ name: new RegExp(homeName, 'i') });
  const away = await Standing.findOne({ name: new RegExp(awayName, 'i') });

  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.gf += homeScore;
  home.ga += awayScore;
  away.gf += awayScore;
  away.ga += homeScore;
  home.gd = home.gf - home.ga;
  away.gd = away.gf - away.ga;

  if (homeScore > awayScore) {
    home.won += 1;
    home.points += 3;
    away.lost += 1;
  } else if (awayScore > homeScore) {
    away.won += 1;
    away.points += 3;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }

  await home.save();
  await away.save();
}

client.login(process.env.DISCORD_TOKEN);
