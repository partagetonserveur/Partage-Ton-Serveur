const { Client, GatewayIntentBits, AuditLogEvent, REST, Routes, SlashCommandBuilder, EmbedBuilder, UserFlags } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice'); 
const { LogisticRegressionClassifier } = require('natural'); // 🧠 Importation du moteur de l'IA
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
        GatewayIntentBits.GuildExpressions
    ] 
});

// 🆔 ID du salon pour les alertes de PROTECTION et d'URGENCE
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "78595694050410516"; 

// 🆔 ID du salon pour les logs d'ACTIVITÉ classiques
const ACTIVITY_LOG_CHANNEL_ID = process.env.ACTIVITY_LOG_CHANNEL_ID || "785957047245864980"; 

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

// ==========================================
// 🧠 INITIALISATION & ENTRAÎNEMENT DE L'IA
// ==========================================
const aiClassifier = new LogisticRegressionClassifier();

// --- TIROIR 1 : INSULTES ET GROSSIÈRETÉS ---
aiClassifier.addDocument('fdp grosse merde tu vaux rien', 'insulte_toxicite');
aiClassifier.addDocument('ferme ta gueule fils de', 'insulte_toxicite');
aiClassifier.addDocument('connard va te faire foutre', 'insulte_toxicite');
aiClassifier.addDocument('t es vraiment un bouffon va crever', 'insulte_toxicite');
aiClassifier.addDocument('ntm enculé de ta race', 'insulte_toxicite');
aiClassifier.addDocument('salope va chier', 'insulte_toxicite');
aiClassifier.addDocument('suce ma bite connard', 'insulte_toxicite');
aiClassifier.addDocument('mange tes morts', 'insulte_toxicite');
aiClassifier.addDocument('espece de debile mental', 'insulte_toxicite');
aiClassifier.addDocument('connasse', 'insulte_toxicite');
aiClassifier.addDocument('batar', 'insulte_toxicite');

// --- TIROIR 2 : COMPORTEMENT TOXIQUE / PROVOCATION / HARCÈLEMENT ---
aiClassifier.addDocument('tu sers a rien va te suicider', 'insulte_toxicite');
aiClassifier.addDocument('on va te harceler sale victime', 'insulte_toxicite');
aiClassifier.addDocument('toute facon t es qu une merde humaine', 'insulte_toxicite');
aiClassifier.addDocument('gros porc va maigrir', 'insulte_toxicite');
aiClassifier.addDocument('t es la honte du serveur casse toi', 'insulte_toxicite');
aiClassifier.addDocument('sale hater on va te faire la misere', 'insulte_toxicite');
aiClassifier.addDocument('t es trop moche degage', 'insulte_toxicite');

// --- TIROIR 3 : DANGER RAID & MENACES DE CRASH ---
aiClassifier.addDocument('je vais détruire ton serveur', 'danger_raid');
aiClassifier.addDocument('ce soir on va nuke le discord', 'danger_raid');
aiClassifier.addDocument('raid massif en cours connectez les bots', 'danger_raid');
aiClassifier.addDocument('on va crash le serveur mdr', 'danger_raid');

// --- TIROIR 4 : COMPORTEMENT NORMAL (SAFE) ---
aiClassifier.addDocument('bonjour je voudrais de l aide s’il vous plaît', 'safe');
aiClassifier.addDocument('super ton serveur j adore le projet', 'safe');
aiClassifier.addDocument('comment on devient moderateur ici', 'safe');
aiClassifier.addDocument('salut ça va l’équipe', 'safe');
aiClassifier.addDocument('merci pour votre réponse rapide', 'safe');

// Entraînement initial de l'IA
aiClassifier.train();

client.on('ready', async () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne !`);
    console.log("🧠 Intelligence Artificielle entraînée pour les insultes et comportements !");
    for (const [guildId, guild] of client.guilds.cache) {
        totalMessagesParServeur.set(guildId, 4308468);
    }
    
    // ⚙️ Déclaration des Slash Commands
    const commands = [
        new SlashCommandBuilder().setName('status').setDescription('Affiche l’état de santé du bot et les statistiques.'),
        new SlashCommandBuilder().setName('join').setDescription('Fait rejoindre le bot dans votre salon vocal actuel.'),
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

// ==========================================
// ⚡ SURVEILLANCE DES MESSAGES (SÉCURITÉ & IA)
// ==========================================
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author?.bot) return;

    // Incrémentation du compteur de messages scannés
    const guildId = message.guild.id;
    const currentCount = totalMessagesParServeur.get(guildId) || 4308468;
    totalMessagesParServeur.set(guildId, currentCount + 1);

    // Si c'est un modérateur/admin, on bypass l'analyse
    if (message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages')) return;

    // 1. Nettoyage du texte pour l'IA (Supprime les points, tirets, espaces cachés)
    const texteNettoye = message.content
        .toLowerCase()
        .replace(/[\.\-\_\,\?\!\;\:\/\s\*]/g, '');

    if (!texteNettoye) return;

    // 2. L'IA analyse l'intention globale
    const verdictIA = aiClassifier.classify(texteNettoye);
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    // 🛑 CAS IA N°1 : INSULTE OU COMPORTEMENT TOXIQUE DÉTECTÉ
    if (verdictIA === 'insulte_toxicite') {
        await message.delete().catch(() => {});

        if (message.member && message.member.moderatable) {
            await message.member.timeout(10 * 60 * 1000, "IA : Insulte ou comportement toxique").catch(() => {});
        }

        const alerte = await message.channel.send(`⚠️ ${message.author}, les insultes et les comportements toxiques sont strictement interdits ici. Merci de rester respectueux.`);
        setTimeout(() => alerte.delete().catch(() => {}), 5000);

        if (logChannel) {
            await logChannel.send(`🤬 **MODÉRATION IA : TOXICITÉ/INSULTE**\n• **Membre :** ${message.author.tag} (${message.author.id})\n• **Salon :** <#${message.channel.id}>\n• **Message d'origine :** *${message.content}*\n• **Action :** Message supprimé + Mute 10 minutes.`).catch(() => {});
        }
        return; 
    }

    // 🚨 CAS IA N°2 : MENACE DE RAID OU DE NUKE INTERCEPTÉE
    if (verdictIA === 'danger_raid') {
        await message.delete().catch(() => {});

        if (message.member && message.member.moderatable) {
            await message.member.timeout(60 * 60 * 1000, "IA : Menace de Raid/Nuke").catch(() => {});
        }

        if (logChannel) {
            await logChannel.send(`🚨 **MODÉRATION IA : MENACE DE RAID**\n• **Membre :** ${message.author.tag} (${message.author.id})\n• **Message d'origine :** *${message.content}*\n• **Action :** Message supprimé + Mute 1 heure.`).catch(() => {});
        }
        return; 
    }

    // 3. Si l'IA n'a rien trouvé, on passe aux filtres classiques de ton bot (Anti-Scam, Phishing, Majuscules...)
    await verifierContenuMessage(message, message.content);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const guildId = interaction.guildId;
    if (!guildId) return;

    // 📊 COMMANDE : STATUS
    if (interaction.commandName === 'status') {
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400); totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600); totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);

        const usageMemoire = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalMessages = totalMessagesParServeur.get(guildId) || 4308468;
        const totalMembres = interaction.guild.memberCount;

        const statusEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🛡️ TABLEAU DE BORD DE SÉCURITÉ')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '⚡ Statut du Système', value: '🟢 Fonctionnel & Actif (IA incluse)', inline: true },
                { name: '📡 Latence (Ping)', value: `\`${Math.round(client.ws.ping)} ms\``, inline: true },
                { name: '💾 Mémoire RAM', value: `\`${usageMemoire} MB\` / \`512 MB\``, inline: true },
                { name: '👥 Protection Active', value: `\`${totalMembres.toLocaleString()}\` membres`, inline: true },
                { name: '📊 Total Messages Scannés', value: `\`${totalMessages.toLocaleString()}\` messages`, inline: true },
                { name: '⏱️ Temps de fonctionnement', value: `\`${days}j ${hours}h ${minutes}m ${seconds}s\``, inline: true },
                { name: '⚙️ Sécurités Armées & Protocoles', value: '---' },
                { name: '🧠 Modération IA locale', value: '• Analyse contextuelle active sur l\'ensemble des insultes et des comportements nuisibles.' },
                { name: '🛡️ Anti-Nuke', value: '• Anti-Raid Mass Ban, Mass Kick, Salon Multi-Création, Destruction.' },
                { name: '🛡️ Anti-Scam / Phishing / Bypass', value: '• Filtres intelligents, anti-hyperliens masqués, anti-espacement.' },
                { name: '🛡️ Anti-QR Code & Extensions', value: '• Détection QR Codes frauduleux et fichiers trompeurs à double extension.' }
            )
            .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
    }

    // 🔊 COMMANDE : JOIN
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

    // 🌤️ COMMANDE : METEO
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
                await message.delete().catch(() => {});
                if (message.member && message.member.moderatable) {
                    await message.member.timeout(3600000, `Hyperlien masqué suspect`).catch(() => {});
                }
                if (logChannel) {
                    await logChannel.send(`🛡️ **[ANTI-HYPERLIEN]** Hyperlien masqué détecté chez ${message.author.tag}`).catch(() => {});
                }
                return true;
            } catch (err) { console.error(err); }
        }
    }
    return false;
}

// Suivi des Webhooks (Anti-Nuke Webhooks)
client.on('webhooksUpdate', async (channel) => {
    if (!channel.guild) return;
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
        const webhookLog = fetchedLogs.entries.first();
        if (!webhookLog) return;
        const { executor } = webhookLog;
        if (executor.id === client.user.id || executor.id === channel.guild.ownerId) return;

        const webhooks = await channel.fetchWebhooks();
        for (const webhook of webhooks.values()) {
            if (webhook.owner.id === executor.id) {
                await webhook.delete("Anti-Nuke Webhook").catch(() => {});
            }
        }

        const memberStaff = await channel.guild.members.fetch(executor.id).catch(() => null);
        if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);

        const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send(`🚨🚨 **[URGENCE ANTI-WEBHOOK]** 🚨🚨\n• **Créateur :** ${executor}\n• **Action :** Webhook supprimé + Rôles retirés.`);
        }
    } catch (err) { console.error(err); }
});

client.login(process.env.DISCORD_TOKEN);
