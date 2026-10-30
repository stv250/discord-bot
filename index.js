import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, Events } from 'discord.js';
import { commands } from './commands.js';
import { isConfiguredGuild, canCloseTicket } from './policy.js';

const { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, PANEL_URL, BOT_API_SECRET } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !PANEL_URL || !BOT_API_SECRET) {
  console.error('Missing required bot environment variables'); process.exit(1);
}
let settings = null;
let refreshing = false;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
async function loadSettings() {
  if (refreshing) return;
  refreshing = true;
  try {
    const res = await fetch(`${PANEL_URL.replace(/\/$/, '')}/api/public/bot-config`, {
      method: 'POST', headers: { Authorization: `Bearer ${BOT_API_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: client.user?.tag ?? 'bot', ready: client.isReady() }), signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Panel status ${res.status}`);
    settings = await res.json();
  } catch { console.error('Could not refresh settings; check panel URL, publication and shared secret.'); }
  finally { refreshing = false; }
}
const features = () => settings?.features ?? {};
const render = (t, m) => t.replaceAll('{user}', `<@${m.id}>`).replaceAll('{username}', m.user.username).replaceAll('{server}', m.guild.name).replaceAll('{memberCount}', String(m.guild.memberCount));
async function log(guild, text) {
  if (!isConfiguredGuild(guild.id, DISCORD_GUILD_ID) || !features().logs_enabled || !features().log_channel_id) return;
  try {
    const channel = await guild.channels.fetch(features().log_channel_id);
    if (channel?.isTextBased()) await channel.send({ embeds: [new EmbedBuilder().setTitle('Jurnal server').setDescription(text).setTimestamp()], allowedMentions: { parse: [] } });
  } catch { console.error('Could not send server log.'); }
}
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await loadSettings();
  setInterval(loadSettings, 60000);
  try {
    const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
    await guild.commands.set(commands);
    console.log('Guild slash commands registered.');
  } catch { console.error('Could not register slash commands; check server ID and invitation scopes.'); }
});
client.on(Events.GuildMemberAdd, async member => {
  if (!isConfiguredGuild(member.guild.id, DISCORD_GUILD_ID)) return;
  if (!settings) await loadSettings();
  if (!settings) return;
  if (settings.autorole_enabled && settings.autorole_ids?.length) {
    try { await member.roles.add(settings.autorole_ids); } catch { console.error('Auto-role failed; check role hierarchy.'); }
  }
  if (settings.welcome_enabled && settings.welcome_channel_id) {
    try {
      const channel = await member.guild.channels.fetch(settings.welcome_channel_id);
      if (channel?.isTextBased()) {
        const text = render(settings.welcome_message, member);
        await channel.send(settings.welcome_embed ? { content: `<@${member.id}>`, embeds: [new EmbedBuilder().setTitle('👋 Bun venit!').setDescription(text).setColor(settings.welcome_color).setThumbnail(member.user.displayAvatarURL())], allowedMentions: { users: [member.id] } } : { content: text, allowedMentions: { users: [member.id] } });
      }
    } catch { console.error('Welcome message failed.'); }
  }
  await log(member.guild, `Membru nou: <@${member.id}>`);
});
client.on(Events.GuildMemberRemove, m => log(m.guild, `Membru plecat: ${m.user.tag} (${m.id})`));
client.on(Events.MessageDelete, m => { if (m.guild) void log(m.guild, `Mesaj șters în <#${m.channelId}> · ID ${m.id} · autor ${m.author?.tag ?? 'necunoscut'}`); });
const openingTickets = new Set();
client.on(Events.InteractionCreate, async i => {
  if (!i.guild || !isConfiguredGuild(i.guild.id, DISCORD_GUILD_ID)) return;
  try {
    if (i.isButton() && i.customId === 'sidekick:open-ticket') {
      await i.deferReply({ ephemeral: true });
      if (!features().tickets_enabled || !features().ticket_category_id) return void await i.editReply('Tichetele sunt dezactivate sau categoria lipsește.');
      if (openingTickets.has(i.user.id)) return void await i.editReply('Tichetul este deja în curs de creare.');
      openingTickets.add(i.user.id);
      try {
        const channels = await i.guild.channels.fetch();
        const existing = channels.find(c => c?.topic === `sidekick-ticket:${i.user.id}`);
        if (existing) return void await i.editReply(`Ai deja un tichet: <#${existing.id}>`);
        const category = channels.get(features().ticket_category_id);
        if (category?.type !== ChannelType.GuildCategory) throw new Error('Invalid category');
        const overwrites = [
          { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        ];
        if (features().support_role_id && features().support_role_id !== i.guild.id) overwrites.push({ id: features().support_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
        const ch = await i.guild.channels.create({ name: `tichet-${i.user.id}`, type: ChannelType.GuildText, parent: category.id, topic: `sidekick-ticket:${i.user.id}`, permissionOverwrites: overwrites });
        await ch.send({ content: `<@${i.user.id}>`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sidekick:close-ticket').setLabel('Închide și șterge tichetul').setStyle(ButtonStyle.Danger))], allowedMentions: { users: [i.user.id] } });
        await i.editReply(`Tichet creat: <#${ch.id}>`);
        await log(i.guild, `Tichet creat de <@${i.user.id}>: <#${ch.id}>`);
      } finally { openingTickets.delete(i.user.id); }
      return;
    }
    if (i.isButton() && i.customId === 'sidekick:close-ticket') {
      const member = await i.guild.members.fetch(i.user.id);
      if (!canCloseTicket(i.channel?.topic, i.user.id, member.permissions.has(PermissionFlagsBits.ManageChannels))) return void await i.reply({ content: 'Nu poți închide acest canal.', ephemeral: true });
      await i.reply({ content: 'Tichetul se închide și va fi șters.', ephemeral: true });
      await log(i.guild, `Tichet închis de <@${i.user.id}>: ${i.channel.name}`);
      await i.channel.delete('Ticket closed'); return;
    }
    if (!i.isChatInputCommand()) return;
    await i.deferReply({ ephemeral: true });
    if (i.commandName === 'ping') return void await i.editReply(`Online · ${Math.round(client.ws.ping)} ms`);
    if (i.commandName === 'server') return void await i.editReply(`${i.guild.name} · ${i.guild.memberCount} membri`);
    const actor = await i.guild.members.fetch(i.user.id);
    const permissions = { ban: PermissionFlagsBits.BanMembers, timeout: PermissionFlagsBits.ModerateMembers, clear: PermissionFlagsBits.ManageMessages };
    if (!permissions[i.commandName] || !actor.permissions.has(permissions[i.commandName])) return void await i.editReply('Nu ai permisiunea necesară.');
    if (i.commandName === 'clear') {
      if (!i.channel?.bulkDelete) throw new Error('Not a text channel');
      const deleted = await i.channel.bulkDelete(i.options.getInteger('numar', true), true);
      await i.editReply(`${deleted.size} mesaje șterse.`);
    } else {
      const member = await i.guild.members.fetch(i.options.getUser('membru', true).id);
      if (member.id === actor.id || member.id === i.guild.ownerId || (actor.id !== i.guild.ownerId && member.roles.highest.position >= actor.roles.highest.position)) return void await i.editReply('Nu poți modera acest membru.');
      if (i.commandName === 'ban') {
        if (!member.bannable) throw new Error('Role hierarchy');
        await member.ban({ reason: i.options.getString('motiv') ?? `Ban by ${actor.id}` });
      } else {
        if (!member.moderatable) throw new Error('Role hierarchy');
        await member.timeout(i.options.getInteger('minute', true) * 60000, `Timeout by ${actor.id}`);
      }
      await i.editReply('Acțiune aplicată.');
    }
    await log(i.guild, `/${i.commandName} executat de <@${i.user.id}>`);
  } catch {
    console.error('Discord action failed; check permissions and settings.');
    const payload = 'Acțiunea nu a reușit. Verifică permisiunile botului, rolurile și setările.';
    try { if (i.deferred || i.replied) await i.editReply(payload); else await i.reply({ content: payload, ephemeral: true }); } catch { /* interaction expired */ }
  }
});
client.on(Events.Error, () => console.error('Discord connection error.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { client.destroy(); process.exit(0); });
client.login(DISCORD_BOT_TOKEN).catch(() => { console.error('Discord login failed; check bot token.'); process.exit(1); });
