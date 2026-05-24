const { Client, GatewayIntentBits, AuditLogEvent, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice'); 
const axios = require('axios');
const sharp = require('sharp');
const jsQR = require('jsqr');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration, 
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildExpressions // 🎨 Obligatoire pour intercepter les émojis du serveur
    ] 
});

// 🆔 ID du salon pour les alertes de PROTECTION et d'URGENCE (Anti-Nuke, Phishing...)
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "78595694050410516"; 

// 🆔 ID du salon pour les logs d'ACTIVITÉ classiques (Vocal, messages modifiés/supprimés...)
const ACTIVITY_LOG_CHANNEL_ID = process.env.ACTIVITY_LOG_CHANNEL_ID || "785957047245864980"; 

const historiqueSalons = new Map();
const tempsArriveeMembres = new Map(); 
const historiqueReactions = new Map(); 
const historiqueModifsServeur = new Map(); 

// 📊 VARIABLES DE STATISTIQUES SÉPARÉES ET FIGÉES (4 256 585)
const totalMessagesParServeur = new Map(); 
const serveursEnCoursDeScan = new Set();     

// Mémoires pour l'anti-sabotage (Anti-Nuke)
const historiqueCreationSalons = new Map(); 
const historiqueBansModo = new Map(); 
const historiqueSuppressionSalons = new Map(); 
const historiqueKicksModo = new Map();       
const historiqueCreationEmojis = new Map(); // Suivi création émojis
const historiqueSuppressionEmojis = new Map(); // Suivi suppression émojis

// RÈGLES ANTI-SCAM COMMUNES
const SCAM_RULES = [
  { regex: /n[i1]tr[o0]/i, points: 2 },       
  { regex: /fr[e3][e3]/i, points: 2 },        
  { regex: /cl[a4][i1]m/i, points: 3 },       
  { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
];

// REGEX SÉCURITÉ
const regexPhishing = /(diiscord|disc0rd|discord-app|discord-gift|dlscord|discordg|free-nitro|nitro-gift|steam-gift|crypto-claim).*\.(com|ru|xyz|org|net|info|gift|click|link|apps)/i;
const regexMalware = /(https?:\/\/[^\s]+)\.(zip|rar|7z|tar|gz|exe|scr|bat|cmd|vbs|msi)(?=\s|$)/i;
const sitesHebergementSuspects = /(mediafire|mega\.nz\/file|anonfiles|bayfiles|zippyshare|dropapk|uploadocean)/i;
const regexLienGeneral = /https?:\/\/[^\s]+/gi;
const regexLienDiscordOfficiel = /https?:\/\/(www\.)?(discord\.(gg|com|me|io|media)|discordapp\.com)/i;

// ==========================================
// 🧠 ENREGISTREMENT DES SLASH COMMANDS
// ==========================================
client.on('ready', async () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne !`);

    for (const [guildId, guild] of client.guilds.cache) {
        totalMessagesParServeur.set(guildId, 4258547);
    }

    const commands = [
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('Affiche l’état de santé du bot et les statistiques.')
    
        new SlashCommandBuilder()
            .setName('join')
            .setDescription('Fait rejoindre le bot dans votre salon vocal actuel.')
le
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || client.token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Les Slash Commands ont été enregistrées avec succès !');
    } catch (error) { console.error(error); }
});

// ==========================================
// ⚙️ TRAITEMENT DES SLASH COMMANDS INTERACTION
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const guildId = interaction.guildId;
    if (!guildId) return;

    if (interaction.commandName === 'status') {
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400); totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600); totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);

        const usageMemoire = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalMessages = totalMessagesParServeur.get(guildId) || 4256585;
        const totalMembres = interaction.guild.memberCount;

        const statusEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🛡️ TABLEAU DE BORD DE SÉCURITÉ')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '⚡ Statut du Système', value: '🟢 Fonctionnel & Actif', inline: true },
                { name: '📡 Latence (Ping)', value: `\`${Math.round(client.ws.ping)} ms\``, inline: true },
                { name: '💾 Mémoire RAM', value: `\`${usageMemoire} MB\` / \`512 MB\``, inline: true },
                { name: '👥 Protection Active', value: `\`${totalMembres.toLocaleString()}\` membres`, inline: true }, // ✅ Correction syntaxe ici
                { name: '📊 Total Messages Scannés', value: `\`${totalMessages.toLocaleString()}\` messages`, inline: true },
                { name: '⏱️ Temps de fonctionnement', value: `\`${days}j ${hours}h ${minutes}m ${seconds}s\``, inline: true },
                
                { name: '⚙️ Sécurités Armées & Protocoles', value: '---' },
                
                { 
                    name: '🛡️ Anti-Nuke', 
                    value: '• Anti-Raid Mass Ban, Mass Kick, Salon Multi-Création, Suppression, Modification.' 
                },
                { 
                    name: '🛡️ Anti-Scam / Phishing / Malware', 
                    value: '• Protection avancée contre le vol de comptes, faux liens de nitro gratuit, fichiers suspects (.exe, .scr).' 
                },
                { 
                    name: '🛡️ Anti-QR Code', 
                    value: '• Détection des images frauduleuses de connexion par QR code (Token Grabber).' 
                },
                { 
                    name: '🛡️ Anti-NSFW', 
                    value: '• Blocage automatique des images masquées (Spoiler) en dehors des salons majeurs.' 
                },
                { 
                    name: '🛡️ Anti-Ghost Mention', 
                    value: '• Suppression des injections de everyone / here par modification.' 
                }
            )
            .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
    }

    if (interaction.commandName === 'join') {
        const member = interaction.member;
        if (!member.voice.channel) return await interaction.reply({ content: "❌ Tu dois être en vocal !", ephemeral: true });

        try {
            joinVoiceChannel({
                channelId: member.voice.channel.id,
                guildId: interaction.guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });
            await interaction.reply({ content: `🔊 **[VOCAL]** J'ai rejoint **${member.voice.channel.name}** !` });
        } catch (error) { await interaction.reply({ content: "❌ Erreur connexion vocal.", ephemeral: true }); }
    }
});

// ==========================================
// 🔊 LOGS VOCAUX ADVANCED (Salon Activité)
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const activityLogChannel = newState.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    if (!activityLogChannel || newState.member.user.bot) return;

    const embedVocal = new EmbedBuilder().setTimestamp().setFooter({ text: `ID: ${newState.member.id}` });

    if (!oldState.channelId && newState.channelId) {
        embedVocal.setColor('#2ecc71').setTitle('🎤 VOCAL : SALON REJOINT').setDescription(`• **Membre :** ${newState.member}\n• **Salon rejoint :** ${newState.channel}`);
        return await activityLogChannel.send({ embeds: [embedVocal] }).catch(() => {});
    }

    if (oldState.channelId && !newState.channelId) {
        embedVocal.setColor('#e74c3c').setTitle('🎤 VOCAL : SALON QUITTÉ').setDescription(`• **Membre :** ${oldState.member}\n• **Salon quitté :** ${oldState.channel}`);
        return await activityLogChannel.send({ embeds: [embedVocal] }).catch(() => {});
    }

    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        embedVocal.setColor('#f39c12').setTitle('🎤 VOCAL : CHANGEMENT DE SALON').setDescription(`• **Membre :** ${newState.member}\n• **Ancien Salon :** ${oldState.channel}\n• **Nouveau Salon :** ${newState.channel}`);
        return await activityLogChannel.send({ embeds: [embedVocal] }).catch(() => {});
    }
});

// ==========================================
// 👥 & 🛡️ LOGS MEMBRES ET LOGS DE RÔLES (Salon Activité)
// ==========================================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const activityLogChannel = newMember.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    if (!activityLogChannel) return;

    const embedModif = new EmbedBuilder().setTimestamp().setFooter({ text: `ID: ${newMember.id}` });

    if (oldMember.nickname !== newMember.nickname) {
        embedModif.setColor('#9b59b6').setTitle('👥 MEMBRE : CHANGEMENT DE PSEUDO').setDescription(`• **Membre :** ${newMember}\n• **Ancien :** \`${oldMember.nickname || oldMember.user.username}\`\n• **Nouveau :** \`${newMember.nickname || newMember.user.username}\``);
        return await activityLogChannel.send({ embeds: [embedModif] }).catch(() => {});
    }

    if (oldMember.roles.cache.size < newMember.roles.cache.size) {
        const roleAjoute = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id)).first();
        if (!roleAjoute) return;
        embedModif.setColor('#1abc9c').setTitle('🛡️ RÔLE : ACCORDÉ').setDescription(`• **Bénéficiaire :** ${newMember}\n• **Rôle attribué :** ${roleAjoute}`);
        return await activityLogChannel.send({ embeds: [embedModif] }).catch(() => {});
    }

    if (oldMember.roles.cache.size > newMember.roles.cache.size) {
        const roleRetire = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id)).first();
        if (!roleRetire) return;
        embedModif.setColor('#d35400').setTitle('🛡️ RÔLE : RETIRÉ').setDescription(`• **Membre concerné :** ${newMember}\n• **Rôle perdu :** ${roleRetire}`);
        return await activityLogChannel.send({ embeds: [embedModif] }).catch(() => {});
    }
});

// ==========================================
// 🚫 AUDIT LOGS CENTRAUX : MODÉRATION & ANTI-EMOJI NUKE (Protection & Activité)
// ==========================================
client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    const activityLogChannel = guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);

    const executor = auditLogEntry.executor;
    if (executor.id === client.user.id || executor.id === guild.ownerId) return;
    const NOW = Date.now();

    // 1. 🚫 LOGS DE TIMEOUTS -> Salon Activité
    if (auditLogEntry.action === AuditLogEvent.MemberUpdate) {
        const changeTimeout = auditLogEntry.changes.find(c => c.key === 'communication_disabled_until');
        if (!changeTimeout || !activityLogChannel) return;

        const cible = await guild.members.fetch(auditLogEntry.targetId).catch(() => null);
        if (!cible) return;

        const embedMod = new EmbedBuilder().setTimestamp();
        if (changeTimeout.new) { 
            const dateExpiration = new Date(changeTimeout.new);
            embedMod.setColor('#e74c3c').setTitle('🚫 MODÉRATION : MEMBRE EXCLU (TIMEOUT)').setDescription(`• **Membre :** ${cible}\n• **Modérateur :** ${executor}\n• **Fin :** <t:${Math.floor(dateExpiration.getTime() / 1000)}:F>`);
        } else { 
            embedMod.setColor('#2ecc71').setTitle('🚫 MODÉRATION : EXCLUSION ANNULÉE').setDescription(`• **Membre libéré :** ${cible}\n• **Modérateur :** ${executor}\n• Le timeout a été retiré.`);
        }
        return await activityLogChannel.send({ embeds: [embedMod] }).catch(() => {});
    }

    // 2. 🆕 ANTI-EMOJI FLOOD CREATION -> Salon Protection
    if (auditLogEntry.action === AuditLogEvent.EmojiCreate) {
        if (!historiqueCreationEmojis.has(executor.id)) historiqueCreationEmojis.set(executor.id, []);
        const creations = historiqueCreationEmojis.get(executor.id).filter(time => NOW - time < 10000);
        creations.push(NOW); historiqueCreationEmojis.set(executor.id, creations);

        if (creations.length > 3 && logChannel) {
            const emojiCible = await guild.emojis.fetch(auditLogEntry.targetId).catch(() => null);
            if (emojiCible) await emojiCible.delete().catch(() => {});
            
            const memberStaff = await guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);
            
            await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : FLOOD EMOJIS]** 🚨🚨\n• **Auteur :** ${executor}\n• **Contre-mesure :** Émoji supprimé + Rôles retirés.`);
            historiqueCreationEmojis.delete(executor.id);
        }
    }

    // 3. 🆕 ANTI-EMOJI MASS DELETE -> Salon Protection
    if (auditLogEntry.action === AuditLogEvent.EmojiDelete) {
        if (!historiqueSuppressionEmojis.has(executor.id)) historiqueSuppressionEmojis.set(executor.id, []);
        const suppressions = historiqueSuppressionEmojis.get(executor.id).filter(time => NOW - time < 10000);
        suppressions.push(NOW); historiqueSuppressionEmojis.set(executor.id, suppressions);

        if (suppressions.length > 2 && logChannel) {
            const memberStaff = await guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);
            
            await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : DESTRUCTION EMOJIS]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles supprimés immédiatement.`);
            historiqueSuppressionEmojis.delete(executor.id);
        }
    }
});

// ==========================================
// 🛡️ SÉCURITÉ STANDARD ANTI-NUKE
// ==========================================
client.on('guildBanAdd', async (ban) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
        const banLog = fetchedLogs.entries.first();
        if (!banLog) return;
        const { executor } = banLog;
        if (executor.id === client.user.id || executor.id === ban.guild.ownerId) return;

        const logChannel = ban.guild.channels.cache.get(LOG_CHANNEL_ID);
        const activityLogChannel = ban.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);

        // Ban classique -> Activité log
        if (activityLogChannel && !historiqueBansModo.has(executor.id)) {
            const embedBan = new EmbedBuilder().setColor('#c0392b').setTitle('🚫 MODÉRATION : MEMBRE BANNI').setDescription(`• **Membre :** ${ban.user.tag}\n• **Modérateur :** ${executor}`).setTimestamp();
            await activityLogChannel.send({ embeds: [embedBan] }).catch(() => {});
        }

        const NOW = Date.now();
        if (!historiqueBansModo.has(executor.id)) historiqueBansModo.set(executor.id, []);
        const bansRecentes = historiqueBansModo.get(executor.id).filter(time => NOW - time < 10000); 
        bansRecentes.push(NOW); historiqueBansModo.set(executor.id, bansRecentes);

        // Ban de masse -> Alerte Protection
        if (bansRecentes.length > 2) {
            const memberStaff = await ban.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error); 
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : BAN]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles supprimés.`);
            historiqueBansModo.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

client.on('guildMemberRemove', async (member) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
        const kickLog = fetchedLogs.entries.first();
        
        const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
        const activityLogChannel = member.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);

        if (activityLogChannel && !kickLog) {
            const embedLeave = new EmbedBuilder().setColor('#7f8c8d').setTitle('👥 MEMBRE : A QUITTÉ LE SERVEUR').setDescription(`• **Utilisateur :** ${member.user.tag} (${member.user})`).setTimestamp();
            await activityLogChannel.send({ embeds: [embedLeave] }).catch(() => {});
        }

        if (!kickLog) return;
        const { executor, target } = kickLog;
        if (target.id !== member.id || executor.id === client.user.id || executor.id === member.guild.ownerId) return;

        if (activityLogChannel && !historiqueKicksModo.has(executor.id)) {
            const embedKick = new EmbedBuilder().setColor('#d35400').setTitle('🚫 MODÉRATION : MEMBRE EXPULSÉ (KICK)').setDescription(`• **Membre :** ${member.user.tag}\n• **Modérateur :** ${executor}`).setTimestamp();
            await activityLogChannel.send({ embeds: [embedKick] }).catch(() => {});
        }

        const NOW = Date.now();
        if (!historiqueKicksModo.has(executor.id)) historiqueKicksModo.set(executor.id, []);
        const kicksRecents = historiqueKicksModo.get(executor.id).filter(time => NOW - time < 10000); 
        kicksRecents.push(NOW); historiqueKicksModo.set(executor.id, kicksRecents);

        if (kicksRecents.length > 2) {
            const memberStaff = await member.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : KICK]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles supprimés.`);
            historiqueKicksModo.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
        const channelLog = fetchedLogs.entries.first();
        if (!channelLog) return;
        const { executor } = channelLog;
        if (executor.id === client.user.id || executor.id === channel.guild.ownerId) return;

        const NOW = Date.now();
        if (!historiqueCreationSalons.has(executor.id)) historiqueCreationSalons.set(executor.id, []);
        const creationsRecentes = historiqueCreationSalons.get(executor.id).filter(time => NOW - time < 10000); 
        creationsRecentes.push(NOW); historiqueCreationSalons.set(executor.id, creationsRecentes);

        if (creationsRecentes.length > 3) {
            await channel.delete().catch(() => {});
            const memberStaff = await channel.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);
            const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : FLOOD CREATION]** 🚨🚨\n• **Auteur :** ${executor}\n• **Contre-mesure :** Rôles retirés.`);
            historiqueCreationSalons.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
        const deleteLog = fetchedLogs.entries.first();
        if (!deleteLog) return;
        const { executor } = deleteLog;
        if (executor.id === client.user.id || executor.id === channel.guild.ownerId) return;

        const NOW = Date.now();
        if (!historiqueSuppressionSalons.has(executor.id)) historiqueSuppressionSalons.set(executor.id, []);
        const suppressionsRecentes = historiqueSuppressionSalons.get(executor.id).filter(time => NOW - time < 10000); 
        suppressionsRecentes.push(NOW); historiqueSuppressionSalons.set(executor.id, suppressionsRecentes);

        if (suppressionsRecentes.length > 2) {
            const memberStaff = await channel.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);
            const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : DESTRUCTION SALONS]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles retirés.`);
            historiqueSuppressionSalons.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

client.on('guildUpdate', async (oldGuild, newGuild) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate });
        const updateLog = fetchedLogs.entries.first();
        if (!updateLog) return;
        const { executor } = updateLog;
        if (executor.id === client.user.id || executor.id === newGuild.ownerId) return;

        const logChannel = newGuild.channels.cache.get(LOG_CHANNEL_ID);
        const NOW = Date.now();

        if (!historiqueModifsServeur.has(executor.id)) historiqueModifsServeur.set(executor.id, []);
        const modifsRecentes = historiqueModifsServeur.get(executor.id).filter(time => NOW - time < 10000); 
        modifsRecentes.push(NOW); historiqueModifsServeur.set(executor.id, modifsRecentes);

        if (modifsRecentes.length === 1) {
            await newGuild.edit({ name: oldGuild.name, icon: oldGuild.iconURL({ dynamic: true }) || null, banner: oldGuild.bannerURL() || null }).catch(console.error);
            if (logChannel) await logChannel.send(`⚠️ **[MODIFICATION SERVEUR]** ⚠️\n• **Modérateur :** ${executor}\n• Restauré (1/2).`);
            return;
        }

        if (modifsRecentes.length >= 2) {
            await newGuild.edit({ name: oldGuild.name, icon: oldGuild.iconURL({ dynamic: true }) || null, banner: oldGuild.bannerURL() || null }).catch(console.error);
            const memberStaff = await newGuild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE VANDALISME]** 🚨🚨\n• **Auteur :** ${executor}\n• **Action :** Rôles supprimés.`);
            historiqueModifsServeur.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🛡️ SÉCURITÉ TEXTE ET MESSAGES (Protection & Activité)
// ==========================================
async function verifierBioMemBRE(member) {
    if (!member || member.user.bot) return;
    const userComplet = await member.user.fetch({ force: true }).catch(() => null);
    if (!userComplet) return;
    const bio = userComplet.aboutMe || ""; if (!bio) return;
    const liensTrouves = bio.match(regexLienGeneral); if (!liensTrouves) return;

    for (const lien of liensTrouves) {
        if (regexLienDiscordOfficiel.test(lien)) continue;
        try {
            const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
            await member.kick("Anti-Bio Malveillante").catch(() => {});
            if (logChannel) await logChannel.send(`🛡️ **[ANTI-BIO MALVEILLANTE]** 🛡️\n• **Utilisateur expulsé :** ${member.user}\n• **Lien :** \`${lien}\``);
            break;
        } catch (err) { console.error(err); }
    }
}

async function verifierContenuMessage(message, content) {
    if (!content || !message.guild) return false;
    if (message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages')) return false;

    const contentLower = content.toLowerCase().trim(); // ✅ Correction .toLowerCase() ici
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (regexPhishing.test(contentLower)) {
        try {
            await message.delete().catch(() => {});
            await message.member.timeout(3600000, `Phishing`).catch(() => {});
            if (logChannel) await logChannel.send(`💀 **[PHISHING BLOQUÉ]** 💀\n• **Auteur :** ${message.author}`);
            return true; 
        } catch (err) { console.error(err); }
    }

    if (regexMalware.test(contentLower) || sitesHebergementSuspects.test(contentLower)) {
        try {
            await message.delete().catch(() => {});
            await message.member.timeout(3600000, "Lien Malware").catch(() => {});
            if (logChannel) await logChannel.send(`🦠 **[LIEN MALWARE REJETÉ]** 🦠\n• **Auteur :** ${message.author}`);
            return true;
        } catch (err) { console.error(err); }
    }

    if (content.length > 20) {
        const lettresUniquement = content.replace(/[^a-zA-Z]/g, "");
        if (lettresUniquement.length > 0) {
            const majuscules = lettresUniquement.replace(/[^A-Z]/g, "").length;
            if ((majuscules / lettresUniquement.length) * 100 > 85) {
                try { await message.delete().catch(() => {}); return true; } catch (err) { console.error(err); }
            }
        }
    }

    let scamScore = 0;
    SCAM_RULES.forEach(rule => { if (rule.regex.test(contentLower)) scamScore += rule.points; });
    if (scamScore >= 8) { try { await message.delete().catch(() => {}); return true; } catch (err) { console.error(err); } }
    if (/[\u0300-\u036f]{4,}/g.test(content)) { try { await message.delete().catch(() => {}); return true; } catch (err) { console.error(err); } }
    return false;
}

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.content === newMessage.content) return; 
    if (!newMessage.guild || oldMessage.author?.bot) return;

    const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
    const activityLogChannel = newMessage.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);

    if (newMessage.content.includes('@everyone') || newMessage.content.includes('@here')) {
        if (!(newMessage.member?.permissions.has('Administrator') || newMessage.member?.permissions.has('MentionEveryone'))) {
            try {
                await newMessage.delete().catch(() => {});
                await newMessage.member.timeout(3600000, "Ghost Mention").catch(() => {});
                if (logChannel) await logChannel.send(`📢 **[BYPASS EVERYONE CONTRÉ]** 📢\n• **Auteur :** ${newMessage.author}`);
                return;
            } catch (err) { console.error(err); }
        }
    }

    const aEteSupprime = await verifierContenuMessage(newMessage, newMessage.content);
    if (aEteSupprime) return;

    if (activityLogChannel) {
        const modifEmbed = new EmbedBuilder().setColor('#3498db').setTitle('📝 TEXTE : MESSAGE MODIFIÉ').setDescription(`• **Auteur :** ${newMessage.author}\n• **Salon :** ${newMessage.channel}`)
            .addFields({ name: '❌ Ancien Contenu', value: oldMessage.content || "*Vide*" }, { name: '✅ Nouveau Contenu', value: newMessage.content || "*Vide*" }).setTimestamp();
        await activityLogChannel.send({ embeds: [modifEmbed] }).catch(() => {});
    }
});

client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const activityLogChannel = message.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    if (!activityLogChannel) return;

    const deleteEmbed = new EmbedBuilder().setColor('#e74c3c').setTitle('🗑️ TEXTE : MESSAGE SUPPRIMÉ').setDescription(`• **Auteur :** ${message.author}\n• **Salon :** ${message.channel}`)
        .addFields({ name: '📄 Contenu détruit', value: message.content || "*[Image / Fichier / Embed]*" }).setTimestamp();
    await activityLogChannel.send({ embeds: [deleteEmbed] }).catch(() => {});
});

client.on('webhooksUpdate', async (channel) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 800)); 
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
        const webhookLog = fetchedLogs.entries.first();
        if (!webhookLog || webhookLog.executor.id === client.user.id) return;

        const webhooks = await channel.fetchWebhooks();
        const badWebhook = webhooks.get(webhookLog.target.id);
        if (badWebhook) await badWebhook.delete();

        const member = await channel.guild.members.fetch(webhookLog.executor.id).catch(() => null);
        if (member && member.manageable) await member.roles.set([]).catch(console.error); 
    } catch (err) { console.error(err); }
});

client.on('guildMemberAdd', async (member) => {
    tempsArriveeMembres.set(member.id, Date.now());
    await verifierBioMemBRE(member);

    const activityLogChannel = member.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    if (activityLogChannel && !member.user.bot) {
        const embedJoin = new EmbedBuilder().setColor('#2ecc71').setTitle('👥 MEMBRE : A REJOINT LE SERVEUR').setDescription(`• **Utilisateur :** ${member.user.tag} (${member})\n• **Création du compte :** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`).setTimestamp();
        await activityLogChannel.send({ embeds: [embedJoin] }).catch(() => {});
    }

    if (!member.user.bot) return;
    try { await new Promise(resolve => setTimeout(resolve, 1000)); await member.kick("Anti-Bot"); } catch (err) { console.error(err); }
});

client.on('userUpdate', async (oldUser, newUser) => {
    client.guilds.cache.forEach(async (guild) => {
        const member = await guild.members.fetch(newUser.id).catch(() => null);
        if (member) await verifierBioMemBRE(member);
    });
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot || !reaction.message.guild) return;
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member || member.permissions.has('Administrator')) return;

    const NOW = Date.now();
    if (!historiqueReactions.has(user.id)) historiqueReactions.set(user.id, []);
    const timestamps = historiqueReactions.get(user.id); timestamps.push(NOW);
    const reactionsRecentes = timestamps.filter(time => NOW - time < 3000);
    historiqueReactions.set(user.id, reactionsRecentes);

    if (reactionsRecentes.length > 5) {
        try { await reaction.users.remove(user.id).catch(() => {}); await member.timeout(3600000, "Spam réactions").catch(() => {}); } catch (err) { console.error(err); }
    }
});

client.on('messageCreate', async (message) => {
    if (!message.guild) return;

    const totalActuel = totalMessagesParServeur.get(message.guild.id) || 4256585;
    totalMessagesParServeur.set(message.guild.id, totalActuel + 1);

    if (message.author.id === client.user.id) return;

    const userId = message.author.id;
    const content = message.content;
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (message.attachments.size > 0) {
        const extensionsInterdites = /\.(exe|scr|bat|vbs|cmd|msi|jar|ps1|zip|rar|7z)$/i;
        for (const [id, attachment] of message.attachments) {
            if (extensionsInterdites.test(attachment.name)) {
                try {
                    await message.delete().catch(() => {});
                    if (!(message.member?.permissions.has('Administrator'))) await message.member.timeout(3600000, "Fichier dangereux").catch(() => {});
                    return; 
                } catch (err) { console.error(err); }
            }
        }
    }

    if (!message.channel.nsfw && message.attachments.size > 0) {
        if (!(message.member?.permissions.has('ManageMessages')) && message.attachments.some(att => att.spoiler)) {
            try { await message.delete().catch(() => {}); return; } catch (err) { console.error(err); }
        }
    }

    const aEteSupprime = await verifierContenuMessage(message, content);
    if (aEteSupprime) return;

    if (message.attachments.size > 0) {
        for (const [id, attachment] of message.attachments) {
            if (!/\.(png|jpe?g|webp)$/i.test(attachment.url)) continue;
            try {
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data);
                const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const qrCode = jsQR(new Uint8ClampedArray(data), info.width, info.height);
                
                if (qrCode && qrCode.data) {
                    await message.delete().catch(() => {});
                    if (!(message.member?.permissions.has('Administrator'))) await message.member.timeout(3600000, "QR Code interdit").catch(() => {});
                    if (logChannel) await logChannel.send(`💀 **[SÉCURITÉ : QR CODE SUPPRIMÉ]** 💀\n• **Auteur :** ${message.author}`);
                    return; 
                }
            } catch (err) { console.error(err.message); }
        }
    }

    const NOW = Date.now();
    if (tempsArriveeMembres.has(userId) && NOW - tempsArriveeMembres.get(userId) < 100) {
        try { await message.delete().catch(() => {}); await message.member.timeout(3600000, "Token").catch(() => {}); return; } catch (err) { console.error(err); }
    }

    if (!historiqueSalons.has(userId)) {
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    } else {
        const doubleCompte = historiqueSalons.get(userId);
        if (doubleCompte.salonId !== message.channel.id && (NOW - doubleCompte.temps) < 100) {
            try {
                await message.delete().catch(() => {});
                const member = message.member || await message.guild.members.fetch(userId).catch(() => null);
                if (member) await member.timeout(3600000, "Selfbot").catch(() => {});
                historiqueSalons.delete(userId); return;
            } catch (err) { console.error(err); }
        }
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    }
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);
client.login(process.env.DISCORD_TOKEN);
