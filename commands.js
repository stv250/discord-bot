import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
export const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Verifică dacă botul este online'),
  new SlashCommandBuilder().setName('server').setDescription('Informații despre server'),
  new SlashCommandBuilder().setName('ban').setDescription('Interzice accesul unui membru').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('membru').setDescription('Membru').setRequired(true))
    .addStringOption(o => o.setName('motiv').setDescription('Motiv').setMaxLength(400)),
  new SlashCommandBuilder().setName('timeout').setDescription('Suspendă temporar mesajele unui membru').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('membru').setDescription('Membru').setRequired(true))
    .addIntegerOption(o => o.setName('minute').setDescription('Durata').setRequired(true).setMinValue(1).setMaxValue(40320)),
  new SlashCommandBuilder().setName('clear').setDescription('Șterge mesaje recente').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('numar').setDescription('Număr de mesaje').setRequired(true).setMinValue(1).setMaxValue(100)),
].map(c => c.toJSON());
