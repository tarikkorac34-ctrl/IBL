const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  REST, 
  Routes, 
  AttachmentBuilder 
} = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const mongoose = require('mongoose');

// ==========================================
// 1. HTTP SERVER (Fixes Render Port Check)
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('IBL Bot is operational.\n');
}).listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// ==========================================
// 2. MONGODB DATABASE SETUP
// ==========================================
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

const resultSchema = new mongoose.Schema({
  type: String,
  homeTeam: String,
  awayTeam: String,
  homeScore: Number,
  awayScore: Number,
  date: { type: Date, default: Date.now }
});

const MatchResult = mongoose.model('MatchResult', resultSchema);

// Connect to MongoDB
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB!'))
    .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.warn('Warning: MONGODB_URI environment variable is missing.');
}

// ==========================================
// 3. BOT CONFIGURATION & EMOJIS
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers
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

// Seed MongoDB with initial team records if database is empty
async function initializeDatabase() {
  for (const team of TEAMS) {
    const exists = await Standing.findOne({ name: team.name });
    if (!exists) {
      await Standing.create({ name: team.name });
    }
  }
}

// ==========================================
// 4. SLASH COMMAND BUILDERS
// ==========================================
const commands = [
  new SlashCommandBuilder()
    .setName('signingrequest')
    .setDescription('Request a team signing')
    .addUserOption(opt => opt.setName('player').setDescription('Player being signed').setRequired(true))
    .addStringOption(opt => opt.setName('team').setDescription('Team Name').setRequired(true)),

  new SlashCommandBuilder()
    .setName('signingrelease')
    .setDescription('Request a team release')
    .addUserOption(opt => opt.setName('player').setDescription('Player being released').setRequired(true))
    .addStringOption(opt => opt.setName('team').setDescription('Team Name').setRequired(true)),

  new SlashCommandBuilder()
    .setName('game')
    .setDescription('Schedule a new match')
    .addStringOption(opt => 
      opt.setName('type')
        .setDescription('Match Type')
        .setRequired(true)
        .addChoices(
          { name: 'Division 1', value: 'div1' },
          { name: 'Cup', value: 'cup' }
        ))
    .addStringOption(opt => opt.setName('home_team').setDescription('Home Team').setRequired(true))
    .addStringOption(opt => opt.setName('away_team').setDescription('Away Team').setRequired(true))
    .addStringOption(opt => opt.setName('time').setDescription('Match Time/Date').setRequired(true))
    .addStringOption(opt => 
      opt.setName('stadium')
        .setDescription('Select Stadium')
        .setRequired(true)
        .addChoices(
          { name: STADIUM_NAME, value: STADIUM_NAME }
        )),

  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Post match results and update database')
    .addStringOption(opt => 
      opt.setName('type')
        .setDescription('Match Type')
        .setRequired(true)
        .addChoices(
          { name: 'Division 1', value: 'div1' },
          { name: 'Cup', value: 'cup' }
        ))
    .addStringOption(opt => opt.setName('home_team').setDescription('Home Team').setRequired(true))
    .addStringOption(opt => opt.setName('away_team').setDescription('Away Team').setRequired(true))
    .addIntegerOption(opt => opt.setName('home_score').setDescription('Home Score').setRequired(true))
    .addIntegerOption(opt => opt.setName('away_score').setDescription('Away Score').setRequired(true)),

  new SlashCommandBuilder()
    .setName('standings')
    .setDescription('View live IBL League Standings from MongoDB'),

  new SlashCommandBuilder()
    .setName('teams')
    .setDescription('List all teams and their Discord server links'),

  new SlashCommandBuilder()
    .setName('refereerequest')
    .setDescription('Request a referee for an upcoming match')
    .addStringOption(opt => 
      opt.setName('type')
        .setDescription('Match Type')
        .setRequired(true)
        .addChoices(
          { name: 'Division 1', value: 'div1' },
          { name: 'Cup', value: 'cup' }
        ))
    .addStringOption(opt => opt.setName('home_team').setDescription('Home Team').setRequired(true))
    .addStringOption(opt => opt.setName('away_team').setDescription('Away Team').setRequired(true))
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, user } = interaction;

  // ------------------------------------------------------------------
  // /refereerequest
  // ------------------------------------------------------------------
  if (commandName === 'refereerequest') {
    const type = options.getString('type');
    const home = options.getString('home_team');
    const away = options.getString('away_team');
    const timeStr = options.getString('time');

    const targetChannel = guild.channels.cache.find(c => c.name === CHANNELS.REFEREE_REQUESTS);
    if (!targetChannel) {
      return interaction.reply({ content: `Error: #${CHANNELS.REFEREE_REQUESTS} channel not found.`, ephemeral: true });
    }

    const isCup = type === 'cup';
    const refereeRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'referee');
    const rolePing = refereeRole ? `${refereeRole}` : '@Referee';

    const embed = new EmbedBuilder()
      .setTitle('Referee Request')
      .setColor('#F59E0B')
      .addFields(
        { name: 'Match Type', value: isCup ? 'Irish Lands Cup' : 'Division 1', inline: true },
        { name: 'Time', value: timeStr, inline: true },
        { name: 'Fixture', value: `**${home}** vs **${away}**`, inline: false },
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
  // /signingrequest & /signingrelease
  // ------------------------------------------------------------------
  if (commandName === 'signingrequest' || commandName === 'signingrelease') {
    const player = options.getUser('player');
    const team = options.getString('team');
    const isRequest = commandName === 'signingrequest';

    const targetChannel = guild.channels.cache.find(c => c.name === CHANNELS.SIGNING_RELEASE);
    if (!targetChannel) {
      return interaction.reply({ content: `Error: #${CHANNELS.SIGNING_RELEASE} channel not found.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(isRequest ? 'Signing Request' : 'Release Request')
      .setColor(isRequest ? '#22C55E' : '#EF4444')
      .addFields(
        { name: 'Player', value: `${player}`, inline: true },
        { name: 'Team', value: `${team}`, inline: true },
        { name: 'Status', value: 'Pending Staff Review', inline: false }
      )
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });
    return interaction.reply({ content: `Request submitted to #${CHANNELS.SIGNING_RELEASE}!`, ephemeral: true });
  }

  // ------------------------------------------------------------------
  // /game
  // ------------------------------------------------------------------
  if (commandName === 'game') {
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

    const titleHeader = isCup 
      ? `${EMOJIS.CUP} | Irish Lands Cup`
      : `${EMOJIS.IBL} | Irish Blox League`;

    const homeTeamConfig = TEAMS.find(t => t.name.toLowerCase().includes(home.toLowerCase()));
    const awayTeamConfig = TEAMS.find(t => t.name.toLowerCase().includes(away.toLowerCase()));

    const homeRole = homeTeamConfig ? guild.roles.cache.find(r => r.name.toLowerCase() === homeTeamConfig.roleName.toLowerCase()) : null;
    const awayRole = awayTeamConfig ? guild.roles.cache.find(r => r.name.toLowerCase() === awayTeamConfig.roleName.toLowerCase()) : null;

    const pingHome = homeRole ? `${homeRole}` : `@${home}`;
    const pingAway = awayRole ? `${awayRole}` : `@${away}`;

    const embed = new EmbedBuilder()
      .setTitle(titleHeader)
      .setColor(isCup ? '#10B981' : '#3B82F6')
      .addFields(
        { name: 'Fixture', value: `${home} vs ${away}`, inline: false },
        { name: 'Time', value: timeStr, inline: true },
        { name: 'Stadium', value: `[${stadium}](${STADIUM_LINK})`, inline: true }
      )
      .setTimestamp();

    await targetChannel.send({
      content: `${pingHome} vs ${pingAway}`,
      embeds: [embed]
    });

    return interaction.reply({ content: `Fixture posted to #${targetChannelName}!`, ephemeral: true });
  }

  // ------------------------------------------------------------------
  // /results
  // ------------------------------------------------------------------
  if (commandName === 'results') {
    const type = options.getString('type');
    const home = options.getString('home_team');
    const away = options.getString('away_team');
    const homeScore = options.getInteger('home_score');
    const awayScore = options.getInteger('away_score');

    const isCup = type === 'cup';
    const targetChannelName = isCup ? CHANNELS.CUP_RESULTS : CHANNELS.LEAGUE_RESULTS;
    const targetChannel = guild.channels.cache.find(c => c.name === targetChannelName);

    if (!targetChannel) {
      return interaction.reply({ content: `Error: #${targetChannelName} channel not found.`, ephemeral: true });
    }

    // Save match result to MongoDB history
    await MatchResult.create({
      type,
      homeTeam: home,
      awayTeam: away,
      homeScore,
      awayScore
    });

    const titleHeader = isCup ? `${EMOJIS.CUP} | Match Result` : `${EMOJIS.IBL} | Match Result`;

    const embed = new EmbedBuilder()
      .setTitle(titleHeader)
      .setColor('#22C55E')
      .addFields(
        { name: 'Full Time Scores', value: `**${home}** ${homeScore} - ${awayScore} **${away}**`, inline: false }
      )
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });

    if (!isCup) {
      await updateMongoStandings(home, away, homeScore, awayScore);
    }

    return interaction.reply({ content: `Result saved to database & sent to #${targetChannelName}!`, ephemeral: true });
  }

  // ------------------------------------------------------------------
  // /standings
  // ------------------------------------------------------------------
  if (commandName === 'standings') {
    await interaction.deferReply();

    try {
      // Pull standings from MongoDB sorted by points & goal difference
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

// Update database standings
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
