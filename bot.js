const { Client, GatewayIntentBits, AuditLogEvent, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
        GatewayIntentBits.GuildPresences 
    ] 
});

// 🆔 ID de ton salon de logs secret
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "78595694050410516"; 

const historiqueSalons = new Map();
const tempsArriveeMembres = new Map(); 
const historiqueReactions = new Map(); 
const historiqueModifsServeur = new Map(); 

// Variables pour les statistiques de messages
let totalMessagesServeur = 0;
let scanEnCours = false;

// Mémoires pour l'anti-sabotage
const historiqueCreationSalons = new Map(); 
const historiqueBansModo = new Map(); 
const historiqueSuppressionSalons = new Map(); 
const historiqueKicksModo = new Map();       

// RÈGLES ANTI-SCAM COMMUNES
const SCAM_RULES = [
  { regex: /n[i1]tr[o0]/i, points: 2 },       
  { regex: /fr[e3][e3]/i, points: 2 },        
  { regex: /cl[a4][i1]m/i, points: 3 },       
  { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
];

// REGEX ANTI-PHISHING & MALWARE
const regexPhishing = /(diiscord|disc0rd|discord-app|discord-gift|dlscord|discordg|free-nitro|nitro-gift|steam-gift|crypto-claim).*\.(com|ru|xyz|org|net|info|gift|click|link|apps)/i;
const regexMalware = /(https?:\/\/[^\s]+)\.(zip|rar|7z|tar|gz|exe|scr|bat|cmd|vbs|msi)(?=\s|$)/i;
const sitesHebergementSuspects = /(mediafire|mega\.nz\/file|anonfiles|bayfiles|zippyshare|dropapk|uploadocean)/i;

// REGEX POUR SCANNER LES BIOS
const regexLienGeneral = /https?:\/\/[^\s]+/gi;
const regexLienDiscordOfficiel = /https?:\/\/(www\.)?(discord\.(gg|com|me|io|media)|discordapp\.com)/i;

// ==========================================
// 🔄 FONCTION DE SCAN DE L'HISTORIQUE
// ==========================================
async function scannerHistoriqueMessages() {
    if (scanEnCours) return;
    scanEnCours = true;
    console.log("⏳ [STATISTIQUES] Début du scan de l'historique des messages du serveur...");
    
    let compteurLocal = 0;

    for (const [channelId, channel] of client.channels.cache) {
        if (!channel.isTextBased() || channel.isThread()) continue;

        try {
            let lastId = null;
            let options = { limit: 100 };

            while (true) {
                if (lastId) options.before = lastId;

                const messages = await channel.messages.fetch(options).catch(() => null);
                if (!messages || messages.size === 0) break;

                compteurLocal += messages.size;
                lastId = messages.last().id;

                await new Promise(resolve => setTimeout(resolve, 200));

                if (messages.size < 100 || compteurLocal > 500000) break;
            }
        } catch (err) {
            console.error(`Impossible de scanner le salon ${channel.name}:`, err.message);
        }
    }

    totalMessagesServeur = compteurLocal;
    scanEnCours = false;
    console.log(`✅ [STATISTIQUES] Scan terminé ! ${totalMessagesServeur} messages trouvés dans l'historique.`);
}

// ==========================================
// 🧠 ENREGISTREMENT DE LA SLASH COMMAND
// ==========================================
client.on('ready', async () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne !`);
    console.log(`🛡️ PROTECTION MAXIMALE ACCÈS SÉCURISÉ`);

    scannerHistoriqueMessages();

    const commands = [
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('Affiche l’état de santé du bot et les statistiques de la forteresse Railway.')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || client.token);

    try {
        console.log('⏳ Enregistrement de la commande Slash /status...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ La Slash Command /status a été enregistrée avec succès au niveau global !');
    } catch (error) {
        console.error("Erreur lors de l'enregistrement de la Slash Command :", error);
    }
});

// ==========================================
// 📊 LOGIQUE DE LA SLASH COMMAND /status
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'status') {
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);
        const uptimeString = `${days}j ${hours}h ${minutes}m ${seconds}s`;

        const usageMemoire = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalMembres = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

        const affichageMessages = scanEnCours 
            ? `🔄 Calcul en cours... (~${totalMessagesServeur})` 
            : `\`${totalMessagesServeur.toLocaleString()}\` messages`;

        // Texte ultra propre avec les boucliers rouges pour chaque protection
        const texteProtections = 
            `🛡️ **Anti-Nuke & Staff Corrompu :**\n` +
            `• Protection Mass Ban, Kick, Salons & Webhooks\n\n` +
            `🛡️ **Anti-Phishing & Malware :**\n` +
            `• Liens suspects, faux Nitro, fichiers exécutables & bios malveillantes\n\n` +
            `🛡️ **Anti-QR Code :**\n` +
            `• Scan brut et suppression immédiate de tous les QR Codes\n\n` +
            `🛡️ **Anti-NSFW en Public :**\n` +
            `• Blocage des pièces jointes en Spoilers hors salons majeurs\n\n` +
            `🛡️ **Anti-Ghost Mention :**\n` +
            `• Suppression des injections de \`@everyone\` / \`@here\` par modification`;

        const statusEmbed = new EmbedBuilder()
            .setColor('#2f3136')
            .setTitle('🛡️ FORTERESSE RAILWAY - TABLEAU DE BORD')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '⚡ Statut du Système', value: '🟢 Fonctionnel & Actif', inline: true },
                { name: '📡 Latence (Ping)', value: `\`${Math.round(client.ws.ping)} ms\``, inline: true },
                { name: '💾 Mémoire RAM (Railway)', value: `\`${usageMemoire} MB\` / 512 MB`, inline: true },
                { name: '👥 Protection Active', value: `\`${totalMembres} membres\``, inline: true },
                { name: '📊 Total Messages Scannés', value: affichageMessages, inline: true },
                { name: '⏱️ Temps de fonctionnement', value: `\`${uptimeString}\``, inline: false },
                { name: '⚙️ Sécurités Armées & Protocoles', value: texteProtections }
            )
            .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
    }
});

// ==========================================
// 🛡️ PROTECTION ANTI-BAN EN MASSE
// ==========================================
client.on('guildBanAdd', async (ban) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
        const banLog = fetchedLogs.entries.first();
        if (!banLog) return;

        const { executor } = banLog;
        if (executor.id === client.user.id || executor.id === ban.guild.ownerId) return;

        const NOW = Date.now();
        if (!historiqueBansModo.has(executor.id)) historiqueBansModo.set(executor.id, []);

        const bansRecentes = historiqueBansModo.get(executor.id).filter(time => NOW - time < 10000); 
        bansRecentes.push(NOW);
        historiqueBansModo.set(executor.id, bansRecentes);

        if (bansRecentes.length > 2) {
            const memberStaff = await ban.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error); 

            const logChannel = ban.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : BAN]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Action :** Sabotage par bans.\n• **Contre-mesure :** Rôles supprimés.`);
            historiqueBansModo.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🛡️ PROTECTION ANTI-KICK EN MASSE
// ==========================================
client.on('guildMemberRemove', async (member) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
        const kickLog = fetchedLogs.entries.first();
        if (!kickLog) return;

        const { executor, target } = kickLog;
        if (target.id !== member.id || executor.id === client.user.id || executor.id === member.guild.ownerId) return;

        const NOW = Date.now();
        if (!historiqueKicksModo.has(executor.id)) historiqueKicksModo.set(executor.id, []);

        const kicksRecents = historiqueKicksModo.get(executor.id).filter(time => NOW - time < 10000); 
        kicksRecents.push(NOW);
        historiqueKicksModo.set(executor.id, kicksRecents);

        if (kicksRecents.length > 2) {
            const memberStaff = await member.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);

            const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : KICK]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Action :** Sabotage par kicks.\n• **Contre-mesure :** Rôles supprimés.`);
            historiqueKicksModo.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🛡️ PROTECTION ANTI-CHANNEL FLOOD (CREATION)
// ==========================================
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
        creationsRecentes.push(NOW);
        historiqueCreationSalons.set(executor.id, creationsRecentes);

        if (creationsRecentes.length > 3) {
            await channel.delete("Anti-Channel-Flood").catch(() => {});
            const memberStaff = await channel.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);

            const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : FLOOD CREATION]** 🚨🚨\n• **Auteur :** ${executor}\n• **Contre-mesure :** Salon supprimé + Rôles retirés.`);
            historiqueCreationSalons.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🛡️ PROTECTION ANTI-MASS DELETE (SUPPRESSION DE SALONS)
// ==========================================
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
        suppressionsRecentes.push(NOW);
        historiqueSuppressionSalons.set(executor.id, suppressionsRecentes);

        if (suppressionsRecentes.length > 2) {
            const memberStaff = await channel.guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);

            const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : DESTRUCTION SALONS]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles retirés.`);
            historiqueSuppressionSalons.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🛡️ PROTECTION ANTI-MODIFICATION DE SERVEUR
// ==========================================
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
        modifsRecentes.push(NOW);
        historiqueModifsServeur.set(executor.id, modifsRecentes);

        if (modifsRecentes.length === 1) {
            await newGuild.edit({
                name: oldGuild.name,
                icon: oldGuild.iconURL({ dynamic: true }) || null,
                banner: oldGuild.bannerURL() || null,
                reason: "Restauration de sécurité"
            }).catch(console.error);
            if (logChannel) await logChannel.send(`⚠️ **[MODIFICATION SERVEUR]** ⚠️\n• **Modérateur :** ${executor}\n• **Action :** Restauré (Avertissement 1/2).`);
            return;
        }

        if (modifsRecentes.length >= 2) {
            await newGuild.edit({
                name: oldGuild.name,
                icon: oldGuild.iconURL({ dynamic: true }) || null,
                banner: oldGuild.bannerURL() || null,
                reason: "Raid détecté"
            }).catch(console.error);

            const memberStaff = await newGuild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);

            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE VANDALISME]** 🚨🚨\n• **Auteur :** ${executor}\n• **Action :** Rôles supprimés.`);
            historiqueModifsServeur.delete(executor.id);
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🛡️ PROTECTION SÉCURITÉ : BIOS DES MEMBRES
// ==========================================
async function verifierBioMemBRE(member) {
    if (!member || member.user.bot) return;
    const userComplet = await member.user.fetch({ force: true }).catch(() => null);
    if (!userComplet) return;
    
    const bio = userComplet.aboutMe || ""; 
    if (!bio) return;

    const liensTrouves = bio.match(regexLienGeneral);
    if (!liensTrouves) return;

    for (const lien of liensTrouves) {
        if (regexLienDiscordOfficiel.test(lien)) continue;
        try {
            const guild = member.guild;
            const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
            await member.kick("Anti-Bio Malveillante").catch(() => {});
            if (logChannel) await logChannel.send(`🛡️ **[ANTI-BIO MALVEILLANTE]** 🛡️\n• **Utilisateur expulsé :** ${member.user}\n• **Lien :** \`${lien}\``);
            break;
        } catch (err) { console.error(err); }
    }
}

// ==========================================
// FONCTION DE SÉCURITÉ POUR ANALYSER LE TEXTE
// ==========================================
async function verifierContenuMessage(message, content, typeAction = "ENVOI") {
    if (!content || message.author.bot || !message.guild) return false;

    const isAdminOuMod = message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages');
    if (isAdminOuMod) return false;

    const contentLower = content.toLowerCase().trim();
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
            const pourcentageMaj = (majuscules / lettresUniquement.length) * 100;
            if (pourcentageMaj > 85) {
                try { await message.delete().catch(() => {}); return true; } catch (err) { console.error(err); }
            }
        }
    }

    let scamScore = 0;
    SCAM_RULES.forEach(rule => { if (rule.regex.test(contentLower)) scamScore += rule.points; });
    if (scamScore >= 8) {
        try { await message.delete().catch(() => {}); return true; } catch (err) { console.error(err); }
    }

    if (/[\u0300-\u036f]{4,}/g.test(content)) {
        try { await message.delete().catch(() => {}); return true; } catch (err) { console.error(err); }
    }

    return false;
}

// ==========================================
// 🛡️ PROTECTION : MODIFICATION DE MESSAGE
// ==========================================
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.content === newMessage.content) return; 

    if (newMessage.content.includes('@everyone') || newMessage.content.includes('@here')) {
        const isAdminOuMod = newMessage.member?.permissions.has('Administrator') || newMessage.member?.permissions.has('MentionEveryone');
        if (!isAdminOuMod && newMessage.guild) {
            try {
                await newMessage.delete().catch(() => {});
                await newMessage.member.timeout(3600000, "Ghost Mention Bypass").catch(() => {});
                const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) await logChannel.send(`📢 **[BYPASS EVERYONE CONTRÉ]** 📢\n• **Auteur :** ${newMessage.author}`);
                return;
            } catch (err) { console.error(err); }
        }
    }
    await verifierContenuMessage(newMessage, newMessage.content, "MODIFICATION");
});

// ==========================================
// 🛡️ PROTECTIONS TECHNIQUES STANDARDS
// ==========================================
client.on('webhooksUpdate', async (channel) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 800)); 
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
        const webhookLog = fetchedLogs.entries.first();
        if (!webhookLog || webhookLog.executor.id === client.user.id) return;

        const webhooks = await channel.fetchWebhooks();
        const badWebhook = webhooks.get(webhookLog.target.id);
        if (badWebhook) await badWebhook.delete("Anti-Webhook");

        const member = await channel.guild.members.fetch(webhookLog.executor.id).catch(() => null);
        if (member && member.manageable) await member.roles.set([]).catch(console.error); 
    } catch (err) { console.error(err); }
});

client.on('guildMemberAdd', async (member) => {
    tempsArriveeMembres.set(member.id, Date.now());
    await verifierBioMemBRE(member);

    if (!member.user.bot) return;
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await member.kick("Anti-Bot");
    } catch (err) { console.error(err); }
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
    const timestamps = historiqueReactions.get(user.id);
    timestamps.push(NOW);
    const reactionsRecentes = timestamps.filter(time => NOW - time < 3000);
    historiqueReactions.set(user.id, reactionsRecentes);

    if (reactionsRecentes.length > 5) {
        try {
            await reaction.users.remove(user.id).catch(() => {});
            await member.timeout(3600000, "Spam réactions").catch(() => {});
        } catch (err) { console.error(err); }
    }
});

// ==========================================
// PROTECTIONS PAR MESSAGE CRÉÉ + STATS DIRECT
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Compteur en temps réel
    totalMessagesServeur++;

    const userId = message.author.id;
    const content = message.content;
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (message.attachments.size > 0) {
        const extensionsInterdites = /\.(exe|scr|bat|vbs|cmd|msi|jar|ps1|zip|rar|7z)$/i;
        for (const [id, attachment] of message.attachments) {
            if (extensionsInterdites.test(attachment.name)) {
                try {
                    await message.delete().catch(() => {});
                    if (!(message.member?.permissions.has('Administrator'))) {
                        await message.member.timeout(3600000, "Fichier dangereux").catch(() => {});
                    }
                    return; 
                } catch (err) { console.error(err); }
            }
        }
    }

    if (!message.channel.nsfw && message.attachments.size > 0) {
        if (!(message.member?.permissions.has('ManageMessages'))) {
            if (message.attachments.some(att => att.spoiler)) {
                try { await message.delete().catch(() => {}); return; } catch (err) { console.error(err); }
            }
        }
    }

    const aEteSupprime = await verifierContenuMessage(message, content, "ENVOI");
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
                    await message.member.timeout(3600000, "Envoi de QR Code interdit (Sécurité maximale)").catch(() => {});

                    if (logChannel) {
                        await logChannel.send(
                            `💀 **[SÉCURITÉ INTERDITE : QR CODE SUPPRIMÉ]** 💀\n` +
                            `• **Auteur :** ${message.author} (\`${message.author.id}\`)\n` +
                            `• **Action :** Un QR Code a été détecté et détruit immédiatement.\n` +
                            `• **Sanction :** Membre isolé 1 heure.`
                        );
                    }
                    return; 
                }
            } catch (err) { console.error(err.message); }
        }
    }

    // Anti-Token (100ms)
    const NOW = Date.now();
    if (tempsArriveeMembres.has(userId)) {
        if (NOW - tempsArriveeMembres.get(userId) < 100) {
            try {
                await message.delete().catch(() => {});
                await message.member.timeout(3600000, "Token").catch(() => {});
                return;
            } catch (err) { console.error(err); }
        }
    }

    // Anti-Selfbot Multi-Salons
    if (!historiqueSalons.has(userId)) {
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    } else {
        const doubleCompte = historiqueSalons.get(userId);
        if (doubleCompte.salonId !== message.channel.id && (NOW - doubleCompte.temps) < 100) {
            try {
                await message.delete().catch(() => {});
                await member.timeout(3600000, "Selfbot").catch(() => {});
                historiqueSalons.delete(userId);
                return;
            } catch (err) { console.error(err); }
        }
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    }
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);

client.login(process.env.DISCORD_TOKEN);
