const { Client, GatewayIntentBits, AuditLogEvent, REST, Routes, SlashCommandBuilder, EmbedBuilder, UserFlags, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
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
        GatewayIntentBits.GuildExpressions,
        GatewayIntentBits.DirectMessages // 🔥 INDISPENSABLE pour détecter les MPs reçus
    ] 
});

// 🆔 ID du salon pour les alertes de PROTECTION et d'URGENCE
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "78595694050410516"; 

// 🆔 ID du salon pour les logs d'ACTIVITÉ classiques
const ACTIVITY_LOG_CHANNEL_ID = process.env.ACTIVITY_LOG_CHANNEL_ID || "785957047245864980"; 

// 🆕 CONFIGURATION DU SYSTÈME DE SUPPORT EN MP (AIGUILLAGE)
const GUILD_ID = process.env.GUILD_ID || "78595694050410516"; // ID de ton serveur principal
const SUPPORT_CATEGORY_ID = process.env.SUPPORT_CATEGORY_ID || "828174120956461066"; // ID de la catégorie des salons tickets

// 🆕 MAPS DU SYSTÈME DE SUPPORT
const ticketsMembres = new Map(); // Clé: ID Salon Ticket <-> Valeur: ID Membre
const ticketsSalons = new Map();  // Clé: ID Membre <-> Valeur: ID Salon Ticket

const historiqueSalons = new Map();
const tempsArriveeMembres = new Map(); 
const historiqueReactions = new Map(); 
const historiqueModifsServeur = new Map(); 

const totalMessagesParServeur = new Map(); 
const serveursEnCoursDeScan = new Set();     

const historiqueCreationSalons = new Map(); 
const historiqueBansModo = new Map(); 
const historiqueSuppressionSalons = new Map(); 
const historiqueKicksModo = new Map();       
const historiqueCreationEmojis = new Map(); 
const historiqueSuppressionEmojis = new Map(); 

// 🧠 TRACKERS POUR L'ANTI-SELFBOT ET LE COPIER-COLLER PARFAIT
const precisionTracker = new Map();
const tempsFrappeTracker = new Map();

// 📩 FONCTION CENTRALISÉE D'ALERTE EN MESSAGE PRIVÉ
async function envoyerAlerteMP(user, guildName, raison, sanction) {
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🛡️ SYSTÈME DE SÉCURITÉ : ALERTE')
            .setDescription(`Bonjour **${user.username}**,\n\nUne action anormale ou interdite a été détectée avec votre compte sur le serveur **${guildName}**.`)
            .addFields(
                { name: '⚠️ Motif de détection', value: `\`${raison}\``, inline: false },
                { name: '⏳ Sanction appliquée', value: `\`${sanction}\``, inline: false }
            )
            .setFooter({ text: 'Si vous pensez qu\'il s\'agit d\'une erreur de lag, veuillez contacter un administrateur.' })
            .setTimestamp();

        await user.send({ embeds: [dmEmbed] });
    } catch (err) {
        console.log(`[MP Bloqué] Impossible d'avertir ${user.tag} (DMs fermés).`);
    }
}

const SCAM_RULES = [
  { regex: /n[i1]tr[o0]/i, points: 2 },       
  { regex: /fr[e3][e3]/i, points: 2 },        
  { regex: /cl[a4][i1]m/i, points: 3 },       
  { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
];

const regexPhishing = /(diiscord|disc0rd|discord-app|discord-gift|dlscord|discordg|free-nitro|nitro-gift|steam-gift|crypto-claim).*\.(com|ru|xyz|org|net|info|gift|click|link|apps)/i;
const regexMalware = /(https?:\/\/[^\s]+)\.(zip|rar|7z|tar|gz|exe|scr|bat|cmd|vbs|msi)(?=\s|$)/i;
const sitesHebergementSuspects = /(mediafire|mega\.nz\/file|anonfiles|bayfiles|zippyshare|dropapk|uploadocean)/i;
const regexLienGeneral = /https?:\/\/[^\s]+/gi;
const regexLienDiscordOfficiel = /https?:\/\/(www\.)?(discord\.(gg|com|me|io|media)|discordapp\.com)/i;

client.on('ready', async () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne !`);
    for (const [guildId, guild] of client.guilds.cache) {
        totalMessagesParServeur.set(guildId, 4308500);
    }
    
    const commands = [
        new SlashCommandBuilder().setName('status').setDescription('Affiche l’état de santé du bot et les statistiques.'),
        new SlashCommandBuilder().setName('join').setDescription('Fait rejoindre le bot dans votre salon vocal actuel.'),
        // 🆕 COMMANDE /CLOSE AJOUTÉE AU REGISTRE
        new SlashCommandBuilder().setName('close').setDescription('Ferme le ticket de support actuel et supprime le salon.'),
        new SlashCommandBuilder()
            .setName('meteo')
            .setDescription('Affiche la météo en temps réel pour une ville donnée.')
            .addStringOption(option => 
                option.setName('ville')
                    .setDescription('Le nom de la ville')
                    .setRequired(true))
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || client.token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Les Slash Commands ont été enregistrées avec succès !');
    } catch (error) { console.error(error); }
});

client.on('interactionCreate', async (interaction) => {
    // 🆕 INTERCEPTION DU MENU DÉROULANT D'AIGUILLAGE EN MP
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_category') {
        await interaction.deferUpdate(); 

        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;

        const categorieChoisie = interaction.values[0];
        const userId = interaction.user.id;

        const infoMessage = client.messagesTemporairesTickets?.get(userId) || { content: "*Aucun texte*", attachments: [] };

        const ticketChannel = await guild.channels.create({
            name: `🎫-${interaction.user.username}`,
            type: 0,
            parent: SUPPORT_CATEGORY_ID,
            topic: `Ticket [${categorieChoisie}] pour ${interaction.user.tag}`,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: ['ViewChannel'] }
            ]
        }).catch(console.error);

        if (!ticketChannel) {
            client.enTrainDeChoisirCategory?.delete(userId);
            return await interaction.followUp({ content: "❌ Erreur lors de la création du ticket sur le serveur.", ephemeral: true });
        }

        ticketsSalons.set(userId, ticketChannel.id);
        ticketsMembres.set(ticketChannel.id, userId);

        const staffWelcomeEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🎫 NOUVEAU TICKET OUVERT')
            .setDescription(`Un ticket vient d'être initié par ${interaction.user}.\nPour lui répondre, parlez directement dans ce salon.`)
            .addFields(
                { name: '👤 Utilisateur', value: `\`${interaction.user.tag}\` (ID: ${userId})`, inline: true },
                { name: '📌 Type de demande', value: `🛑 **${categorieChoisie}**`, inline: true }
            )
            .setTimestamp();

        await ticketChannel.send({ embeds: [staffWelcomeEmbed] });

        const userFirstMsgEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(infoMessage.content || "*[Fichier/Image]*")
            .setTimestamp();

        await ticketChannel.send({ embeds: [userFirstMsgEmbed] });
        if (infoMessage.attachments.length > 0) {
            await ticketChannel.send({ files: infoMessage.attachments });
        }

        const validationEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('✅ TICKET ENREGISTRÉ')
            .setDescription(`Votre ticket a été ouvert dans la catégorie **${categorieChoisie}**.\nLe staff a reçu votre demande et va vous répondre sous peu !`)
            .setTimestamp();

        await interaction.editReply({ embeds: [validationEmbed], components: [] });

        client.enTrainDeChoisirCategory?.delete(userId);
        client.messagesTemporairesTickets?.delete(userId);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    // 🆕 GESTION DE LA COMMANDE /CLOSE
    if (interaction.commandName === 'close') {
        if (interaction.guildId) {
            if (!interaction.member.permissions.has('ManageChannels')) {
                return await interaction.reply({ content: "❌ Tu n'as pas la permission de fermer ce ticket.", ephemeral: true });
            }

            const userId = ticketsMembres.get(interaction.channelId);
            if (!userId) return await interaction.reply({ content: "❌ Ce salon n'est pas un ticket de support actif.", ephemeral: true });

            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const closeEmbed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setTitle('🎫 TICKET SUPPORT FERMÉ')
                    .setDescription(`Votre ticket sur le serveur a été clôturé par un modérateur.\nSi vous avez une nouvelle question, renvoyez simplement un message ici !`)
                    .setTimestamp();
                await user.send({ embeds: [closeEmbed] }).catch(() => {});
            }

            ticketsMembres.delete(interaction.channelId);
            ticketsSalons.delete(userId);

            await interaction.reply("🔒 Fermeture du ticket dans 5 secondes...");
            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
            return;
        }
    }

    const guildId = interaction.guildId;
    if (!guildId) return;

    if (interaction.commandName === 'status') {
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400); totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600); totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);

        const usageMemoire = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalMessages = totalMessagesParServeur.get(guildId) || 4308500;
        const totalMembres = interaction.guild.memberCount;

        const statusEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🛡️ TABLEAU DE BORD DE SÉCURITÉ')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '⚡ Statut du Système', value: '🟢 Fonctionnel & Actif', inline: true },
                { name: '📡 Latence (Ping)', value: `\`${Math.round(client.ws.ping)} ms\``, inline: true },
                { name: '💾 Mémoire RAM', value: `\`${usageMemoire} MB\` / \`512 MB\``, inline: true },
                { name: '👥 Protection Active', value: `\`${totalMembres.toLocaleString()}\` membres`, inline: true },
                { name: '📊 Total Messages Scannés', value: `\`${totalMessages.toLocaleString()}\` messages`, inline: true },
                { name: '⏱️ Temps de fonctionnement', value: `\`${days}j ${hours}h ${minutes}m ${seconds}s\``, inline: true },
                { name: '⚙️ Sécurités Armées & Protocoles', value: '---' },
                { name: '🛡️ Anti-Nuke', value: '• Anti-Raid Mass Ban, Mass Kick, Salon Multi-Création, Destruction.' },
                { name: '🛡️ Anti-Scam / Phishing / Bypass', value: '• Filtres intelligents, anti-hyperliens masqués, anti-espacement.' },
                { name: '🛡️ Anti-QR Code & Extensions', value: '• Détection QR Codes frauduleux et fichiers trompeurs à double extension.' },
                { name: '🛡️ Anti-Raid Infrastructure Cloud', value: '• Analyse des flags d\'automatisation et blocage des réseaux de bots (VPN/Hosts).' }
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

    if (interaction.commandName === 'meteo') {
        const ville = interaction.options.getString('ville');
        await interaction.deferReply(); 

        try {
            const response = await axios.get(`https://wttr.in/${encodeURIComponent(ville)}?format=j1`);
            const data = response.data;

            if (!data || !data.current_condition || data.current_condition.length === 0) {
                return await interaction.editReply({ content: `❌ Impossible de trouver les données météo pour **${ville}**.` });
            }

            const condition = data.current_condition[0];
            const tempC = condition.temp_C;
            const ressentie = condition.FeelsLikeC;
            const humidite = condition.humidity;
            const vent = condition.windspeedKmph;
            
            let desc = condition.weatherDesc[0].value;
            if (desc.toLowerCase() === "sunny") desc = "☀️ Ensoleillé";
            else if (desc.toLowerCase() === "partly cloudy") desc = "⛅ Partiellement nuageux";
            else if (desc.toLowerCase() === "cloudy") desc = "☁️ Nuageux";
            else if (desc.toLowerCase() === "overcast") desc = "☁️ Couvert";
            else if (desc.toLowerCase().includes("rain")) desc = "🌧️ Pluvieux";
            else if (desc.toLowerCase().includes("snow")) desc = "❄️ Enneigé";

            const meteoEmbed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle(`🌤️ Météo actuelle à ${ville.toUpperCase()}`)
                .addFields(
                    { name: '🌡️ Température', value: `\`${tempC}°C\` (Ressentie : \`${ressentie}°C\`)`, inline: true },
                    { name: '💧 Humidité', value: `\`${humidite}%\``, inline: true },
                    { name: '💨 Vent', value: `\`${vent} km/h\``, inline: true },
                    { name: '📊 Condition', value: desc, inline: false }
                )
                .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [meteoEmbed] });

        } catch (error) {
            console.error("Erreur API Météo:", error.message);
            await interaction.editReply({ content: "❌ Une erreur est survenue lors de la récupération de la météo. Vérifie le nom de la ville." });
        }
    }
});

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

client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    const activityLogChannel = guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    const executor = auditLogEntry.executor;
    if (executor.id === client.user.id || executor.id === guild.ownerId) return;
    const NOW = Date.now();

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

        if (activityLogChannel && !historiqueBansModo.has(executor.id)) {
            const embedBan = new EmbedBuilder().setColor('#c0392b').setTitle('🚫 MODÉRATION : MEMBRE BANNI').setDescription(`• **Membre :** ${ban.user.tag}\n• **Modérateur :** ${executor}`).setTimestamp();
            await activityLogChannel.send({ embeds: [embedBan] }).catch(() => {});
        }

        const NOW = Date.now();
        if (!historiqueBansModo.has(executor.id)) historiqueBansModo.set(executor.id, []);
        const bansRecentes = historiqueBansModo.get(executor.id).filter(time => NOW - time < 10000); 
        bansRecentes.push(NOW); historiqueBansModo.set(executor.id, bansRecentes);

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
            await envoyerAlerteMP(member.user, member.guild.name, "Lien malveillant ou publicitaire détecté dans votre bio Discord.", "Expulsion immédiate du serveur (Kick).");

            await member.kick("Anti-Bio Malveillante").catch(() => {});
            if (logChannel) await logChannel.send(`🛡️ **[ANTI-BIO MALVEILLANTE]** 🛡️\n• **Utilisateur expulsé :** ${member.user}\n• **Lien :** \`${lien}\``);
            break;
        } catch (err) { console.error(err); }
    }
}

async function verifierContenuMessage(message, content) {
    if (!content || !message.guild) return false;
    if (message.author?.bot) return false;
    if (message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages')) return false;

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    const contentLower = content.toLowerCase().trim();

    const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
    let matchMarkdown;
    while ((matchMarkdown = markdownLinkRegex.exec(content)) !== null) {
        const texteAffiche = matchMarkdown[1].toLowerCase().replace(/\s+/g, '');
        const lienCache = matchMarkdown[2].toLowerCase();

        if ((texteAffiche.includes('discord.com') || texteAffiche.includes('discord.gg') || texteAffiche.includes('http')) && !lienCache.includes('discord.com') && !lienCache.includes('discord.gg')) {
            try {
                await envoyerAlerteMP(message.author, message.guild.name, "Utilisation d'un hyperlien masqué trompeur (texte affiché différent du lien réel).", "Message supprimé + Exclusion temporaire d'une heure.");

                await message.delete().catch(() => {});
                await message.member.timeout(3600000, `Hyperlien masqué trompeur`).catch(() => {});
                if (logChannel) await logChannel.send(`🕵️ **[HYPERLIEN MASQUÉ INTERCEPTÉ]** 🕵️\n• **Auteur :** ${message.author}\n• **Action :** Message supprimé + Mute 1h.\n• **Contenu camouflé :** \`${matchMarkdown[0]}\``);
                return true;
            } catch (err) { console.error(err); }
        }
    }

    const versionAligneExplicite = contentLower.replace(/[\s\.]+/g, '');

    if (regexPhishing.test(contentLower) || regexPhishing.test(versionAligneExplicite)) {
        try {
            await envoyerAlerteMP(message.author, message.guild.name, "Envoi d'un lien de Phishing ou d'une fausse offre Nitro.", "Message supprimé + Exclusion temporaire d'une heure.");

            await message.delete().catch(() => {});
            await message.member.timeout(3600000, `Phishing`).catch(() => {});
            if (logChannel) await logChannel.send(`💀 **[PHISHING BLOQUÉ]** 💀\n• **Auteur :** ${message.author}\n• **Action :** Détection standard ou par espacement contourné.`);
            return true; 
        } catch (err) { console.error(err); }
    }

    if (regexMalware.test(contentLower) || sitesHebergementSuspects.test(contentLower) || regexMalware.test(versionAligneExplicite)) {
        try {
            await envoyerAlerteMP(message.author, message.guild.name, "Envoi d'un lien suspect menant vers un fichier exécutable ou une archive potentiellement dangereuse (Malware).", "Message supprimé + Exclusion temporaire d'une heure.");

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
                try { 
                    await envoyerAlerteMP(message.author, message.guild.name, "Spam excessif de majuscules dans vos messages.", "Message supprimé uniquement.");

                    await message.delete().catch(() => {}); 
                    if (logChannel) await logChannel.send(`⚠️ **[SPAM MAJUSCULES]** ⚠️\n• **Auteur :** ${message.author}\n• **Action :** Message supprimé.`);
                    return true; 
                } catch (err) { console.error(err); }
            }
        }
    }

    let scamScore = 0;
    SCAM_RULES.forEach(rule => { 
        if (rule.regex.test(contentLower) || rule.regex.test(versionAligneExplicite)) scamScore += rule.points; 
    });
    if (scamScore >= 8) { 
        try { 
            await envoyerAlerteMP(message.author, message.guild.name, "Contenu à forte suspicion d'arnaque (Scam).", "Message supprimé automatiquement.");
            await message.delete().catch(() => {}); 
            return true; 
        } catch (err) { console.error(err); } 
    }
    
    if (/[\u0300-\u036f]{4,}/g.test(content)) { 
        try { 
            await envoyerAlerteMP(message.author, message.guild.name, "Utilisation de caractères invisibles ou d'émojis modifiés abusifs (Zalgo/Flood).", "Message supprimé automatiquement.");
            await message.delete().catch(() => {}); 
            return true; 
        } catch (err) { console.error(err); } 
    }
    return false;
}

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.content === newMessage.content) return; 
    if (!newMessage.guild || newMessage.author?.bot || oldMessage.author?.bot) return;

    const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
    const activityLogChannel = newMessage.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);

    if (newMessage.content.includes('@everyone') || newMessage.content.includes('@here')) {
        if (!(newMessage.member?.permissions.has('Administrator') || newMessage.member?.permissions.has('MentionEveryone'))) {
            try {
                await envoyerAlerteMP(newMessage.author, newMessage.guild.name, "Tentative de mention @everyone ou @here via la modification d'un message.", "Message supprimé + Exclusion temporaire d'une heure.");

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
    if (!message.guild || (message.author && message.author.bot)) return;
    const activityLogChannel = message.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    if (!activityLogChannel) return;

    const deleteEmbed = new EmbedBuilder().setColor('#e74c3c').setTitle('🗑️ TEXTE : MESSAGE SUPPRIMÉ').setDescription(`• **Auteur :** ${message.author || "*Auteur inconnu (Cache vidé)*"}\n• **Salon :** ${message.channel}`)
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
    
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    const activityLogChannel = member.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);

    if (!member.user.bot) {
        const userFetched = await member.user.fetch({ force: true }).catch(() => null);
        if (userFetched) {
            const flags = userFetched.flags;
            
            const signatureAutomation = flags.has(UserFlags.Quarantined) || 
                                         flags.has(UserFlags.SpamDismissed) ||
                                         (member.user.username.match(/(bot|raid|scam|claim|nitro|drop)[0-9_\.]+/i) && (Date.now() - member.user.createdTimestamp < 86400000 * 2));

            if (signatureAutomation) {
                try {
                    await envoyerAlerteMP(member.user, member.guild.name, "Votre profil possède une signature système identifiée comme un compte automatisé cloud/VPN ou un token de raid.", "Expulsion automatique (Kick).");

                    await member.kick("Sécurité : Signature Infrastructure / Proxy suspect détecté").catch(() => {});
                    if (logChannel) {
                        await logChannel.send(`🌐 **[ANTI-RAID INFRASTRUCTURE / VPN]** 🌐\n• **Profil exclu :** ${member.user.tag} (${member.id})\n• **Raison :** Signature d'automatisation Cloud/Hoster détectée.\n• **Action :** Expulsion automatique immédiate (Kick).`);
                    }
                    return; 
                } catch (err) { console.error(err); }
            }
        }
    }

    await verifierBioMemBRE(member);

    if (activityLogChannel && !member.user.bot) {
        const embedJoin = new EmbedBuilder().setColor('#2ecc71').setTitle('👥 MEMBRE : A REJOINT LE SERVEUR').setDescription(`• **Utilisateur :** ${member.user.tag} (${member})\n• **Création du compte :** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`).setTimestamp();
        await activityLogChannel.send({ embeds: [embedJoin] }).catch(() => {});
    }
    
    if (member.user.bot) {
        try { await new Promise(resolve => setTimeout(resolve, 1000)); await member.kick("Anti-Bot non autorisé"); } catch (err) { console.error(err); }
    }
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
        try { 
            await envoyerAlerteMP(user, reaction.message.guild.name, "Spam d'émojis et de réactions en rafale sur un ou plusieurs messages.", "Retrait des réactions + Exclusion temporaire d'une heure.");

            await reaction.users.remove(user.id).catch(() => {}); 
            await member.timeout(3600000, "Spam reactions").catch(() => {}); 
        } catch (err) { console.error(err); }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.author.id === client.user.id) return;

    // ==========================================
    // 🆕 BLOC SÉCURISÉ DU SYSTÈME DE TICKET MP (AIGUILLAGE)
    // ==========================================
    if (!message.guild) {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;

        let ticketChannelId = ticketsSalons.get(message.author.id);

        if (!ticketChannelId) {
            if (client.enTrainDeChoisirCategory?.has(message.author.id)) return;
            if (!client.enTrainDeChoisirCategory) client.enTrainDeChoisirCategory = new Set();
            client.enTrainDeChoisirCategory.add(message.author.id);

            if (!client.messagesTemporairesTickets) client.messagesTemporairesTickets = new Map();
            client.messagesTemporairesTickets.set(message.author.id, {
                content: message.content,
                attachments: message.attachments.size > 0 ? Array.from(message.attachments.values()) : []
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_ticket_category')
                .setPlaceholder('Sélectionnez la raison de votre demande...')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('🆘 Besoin d\'aide / Support')
                        .setDescription('Pour un problème technique ou une question sur le serveur.')
                        .setValue('Besoin d\'aide'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('🤝 Partenariat')
                        .setDescription('Pour proposer une collaboration ou un partenariat.')
                        .setValue('Partenariat'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('📝 Recrutement')
                        .setDescription('Pour postuler ou suivre votre candidature dans l\'équipe.')
                        .setValue('Recrutement')
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const welcomeEmbed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('🎫 OUVERTURE DE TICKET')
                .setDescription(`Bonjour **${message.author.username}**,\n\nPour que l'équipe puisse vous répondre au mieux, veuillez sélectionner la raison de votre contact via le menu ci-dessous.`)
                .setFooter({ text: 'Votre message initial sera transmis juste après votre choix.' })
                .setTimestamp();

            await message.author.send({ embeds: [welcomeEmbed], components: [row] }).catch(() => {
                client.enTrainDeChoisirCategory.delete(message.author.id);
            });
            return;
        } else {
            const ticketChannel = guild.channels.cache.get(ticketChannelId);
            if (!ticketChannel) return;

            const msgEmbed = new EmbedBuilder()
                .setColor('#ffa500')
                .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                .setDescription(message.content || "*[Fichier / Image]*")
                .setTimestamp();

            await ticketChannel.send({ embeds: [msgEmbed] });
            if (message.attachments.size > 0) {
                await ticketChannel.send({ files: Array.from(message.attachments.values()) });
            }
            return;
        }
    }

    // 🆕 REDIRECTION DES RÉPONSES DU STAFF DANS LE SALON DU TICKET VERS LE MP DE L'UTILISATEUR
    if (message.guild && message.channel.parentId === SUPPORT_CATEGORY_ID) {
        const userId = ticketsMembres.get(message.channel.id);
        if (!userId) return; 

        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) return message.reply("❌ Impossible de trouver l'utilisateur en MP (Compte introuvable ou bloqué).");

        if (message.content.startsWith('/')) return; 

        const responseEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setAuthor({ name: `Support - ${message.guild.name}`, iconURL: message.guild.iconURL() })
            .setDescription(message.content || "*[Fichier / Image]*")
            .setFooter({ text: "Répondez directement à ce MP pour écrire au staff." })
            .setTimestamp();

        try {
            await user.send({ embeds: [responseEmbed] });
            if (message.attachments.size > 0) {
                await user.send({ files: Array.from(message.attachments.values()) });
            }
            await message.react('✉️').catch(() => {});
        } catch (err) {
            await message.reply("❌ Le message n'a pas pu être envoyé. L'utilisateur a probablement fermé ses messages privés.");
        }
        return;
    }
    // ==========================================

    const totalActuel = totalMessagesParServeur.get(message.guild.id) || 4308500;
    totalMessagesParServeur.set(message.guild.id, totalActuel + 1);

    const userId = message.author.id;
    const maintenant = Date.now();
    const longueurTexte = message.content.length;
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (!message.member?.permissions.has('Administrator')) {
        
        if (longueurTexte > 150) {
            const derniereAction = tempsFrappeTracker.get(userId);
            if (derniereAction && (maintenant - derniereAction) < 1500) {
                try {
                    await envoyerAlerteMP(message.author, message.guild.name, "Envoi instantané d'un pavé de texte (Détection Copier-Coller mécanique).", "Message supprimé + Exclusion temporaire d'une heure.");

                    await message.delete().catch(() => {});
                    await message.member.timeout(3600000, "Selfbot suspect : Envoi instantané d'un pavé de texte").catch(() => {});
                    if (logChannel) {
                        await logChannel.send(`📋 **[SÉCURITÉ : COPIER-COLLER MACHINE]**\n• **Auteur :** ${message.author}\n• **Taille du texte :** \`${longueurTexte} caractères\`\n• **Action :** Message supprimé + Mute 1h.`);
                    }
                    return; 
                } catch (err) { console.error("Erreur Anti-CopierColler :", err.message); }
            }
        }
        tempsFrappeTracker.set(userId, maintenant);

        let dataCredits = precisionTracker.get(userId);
        if (!dataCredits) dataCredits = { dernierMessage: maintenant, credits: 3 };

        const intervalleMs = maintenant - dataCredits.dernierMessage;

        if (intervalleMs < 250) {
            dataCredits.credits--; 
        } else {
            if (dataCredits.credits < 3) dataCredits.credits++; 
        }

        if (dataCredits.credits <= 0) {
            try {
                await envoyerAlerteMP(message.author, message.guild.name, "Vitesse d'envoi de messages surhumaine et répétée (Analyse milliseconde positive).", "Messages supprimés + Exclusion temporaire d'une heure.");

                await message.delete().catch(() => {});
                await message.member.timeout(3600000, "Selfbot détecté (Analyse milliseconde positive)").catch(() => {});
                if (logChannel) {
                    await logChannel.send(`💀 **[SÉCURITÉ : SELFBOT EXTERMINÉ]** ${message.author}\n• **Raison :** Vitesse d'envoi mécanique répétée.\n• **Dernier intervalle :** \`${intervalleMs}ms\``);
                }
                precisionTracker.delete(userId);
                return;
            } catch (err) { console.error("Erreur Anti-Selfbot Millisec :", err.message); }
        } else {
            dataCredits.dernierMessage = maintenant;
            precisionTracker.set(userId, dataCredits);
        }
    }

    const content = message.content;

    if (message.attachments.size > 0) {
        const extensionsInterdites = /\.(exe|scr|bat|vbs|cmd|msi|jar|ps1|zip|rar|7z)$/i;
        const doubleExtensionRegex = /\.(png|jpe?g|webp|gif|pdf|txt|docx?|xlsx?)\.(exe|scr|bat|vbs|cmd|msi|sh|js)$/i;

        for (const [id, attachment] of message.attachments) {
            const fileName = attachment.name;

            if (doubleExtensionRegex.test(fileName)) {
                try {
                    await envoyerAlerteMP(message.author, message.guild.name, `Envoi d'un fichier à double extension trompeuse (\`${fileName}\`).`, "Fichier supprimé + Exclusion temporaire d'une heure.");

                    await message.delete().catch(() => {});
                    if (!(message.member?.permissions.has('Administrator'))) await message.member.timeout(3600000, "Fichier double extension frauduleux").catch(() => {});
                    if (logChannel) await logChannel.send(`📁 **[FICHIER À DOUBLE EXTENSION REJETÉ]** 📁\n• **Auteur :** ${message.author}\n• **Fichier bloqué :** \`${fileName}\` (Mute 1h).`);
                    return;
                } catch (err) { console.error(err); }
            }

            if (extensionsInterdites.test(fileName)) {
                try {
                    await envoyerAlerteMP(message.author, message.guild.name, `Envoi d'un fichier exécutable ou script interdit mettant en danger les membres (\`${fileName}\`).`, "Fichier supprimé + Exclusion temporaire d'une heure.");

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
                    await envoyerAlerteMP(message.author, message.guild.name, "Envoi d'une image contenant un QR Code frauduleux (Technique de vol de token Discord).", "Image supprimée + Exclusion temporaire d'une heure.");

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
        try { 
            await envoyerAlerteMP(message.author, message.guild.name, "Message envoyé immédiatement après la connexion au serveur (Comportement de bot de raid de type User-Token).", "Message supprimé + Exclusion temporaire d'une heure.");

            await message.delete().catch(() => {}); 
            await message.member.timeout(3600000, "Token").catch(() => {}); 
            if (logChannel) await logChannel.send(`🤖 **[TOKEN DE RAID DÉTECTÉ]** 🤖\n• **Auteur :** ${message.author}\n• **Action :** Message supprimé + Mute 1h.`);
            return; 
        } catch (err) { console.error(err); }
    }

    if (!historiqueSalons.has(userId)) {
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    } else {
        const doubleCompte = historiqueSalons.get(userId);
        if (doubleCompte.salonId !== message.channel.id && (NOW - doubleCompte.temps) < 100) {
            try {
                const member = message.member || await message.guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await envoyerAlerteMP(message.author, message.guild.name, "Envoi simultané de messages dans plusieurs salons textuels différents à la même milliseconde (Selfbot de Raid).", "Messages supprimés + Exclusion temporaire d'une heure.");
                    
                    await message.delete().catch(() => {});
                    await member.timeout(3600000, "Selfbot").catch(() => {});
                    if (logChannel) await logChannel.send(`📱 **[SELFBOT / MULTI-SALON DÉTECTÉ]** 📱\n• **Auteur :** ${message.author}\n• **Action :** Message supprimé + Mute 1h.`);
                }
                historiqueSalons.delete(userId); return;
            } catch (err) { console.error(err); }
        }
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    }
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);
client.login(process.env.DISCORD_TOKEN);
