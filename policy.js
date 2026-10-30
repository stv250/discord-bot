export const isConfiguredGuild = (guildId, configuredId) => Boolean(configuredId) && guildId === configuredId;
export const ticketOwner = (topic) => /^sidekick-ticket:(\d+)$/.exec(topic ?? '' )?.[1] ?? null;
export const canCloseTicket = (topic, userId, canManage) => Boolean(ticketOwner(topic)) && (ticketOwner(topic) === userId || canManage);
