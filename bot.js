const { Client, GatewayIntentBits, AuditLogEvent } = require('discord.js');
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
        GatewayIntentBits.GuildMessageReactions // 🔍 Requis pour l'Anti-Spam de Réactions
    ] 
});

// 🆔 ID de ton salon de logs secret
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "78595694050410516"; 

const historiqueSalons = new Map();
const tempsArriveeMembres = new Map(); 
const historiqueReactions = new Map(); 

// RÈGLES ANTI-SCAM COMMUNES (Utilisées pour les nouveaux messages ET les modifications)
const SCAM_RULES = [
  { regex: /n[i1]tr[o0]/i, points: 2 },       
  { regex: /fr[e3][e3]/i, points: 2 },        
  { regex: /cl[a4][i1]m/i, points: 3 },       
  { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
];

// REGEX ANTI-PHISHING COMMUNE (Détection des faux liens)
const regexPhishing = /(diiscord|disc0rd|discord-app|discord-gift|dlscord|discordg|free-nitro|nitro-gift|steam-gift|crypto-claim).*\.(com|ru|xyz|org|net|info|gift|click|link|apps)/i;

client.on('ready', () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne !`);
    console.log(`🛡️ Sécurité active : Anti-Phishing, Anti-Modification, Fichiers, Zalgo, Réactions, Webhooks, Raid...`);
});

// ==========================================
// FONCTION DE SÉCURITÉ COMMUNE POUR ANALYSER LE TEXTE
// ==========================================
async function verifierContenuMessage(message, content, typeAction = "ENVOI") {
    if (!content || message.author.bot || !message.guild) return false;

    const isAdminOuMod = message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages');
    if (isAdminOuMod) return false;

    const contentLower = content.toLowerCase().trim();
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    // 1. Protection Anti-Phishing
    if (regexPhishing.test(contentLower)) {
        try {
            await message.delete().catch(() => {});
            await message.member.timeout(3600000, `Phishing détecté lors d'un(e) ${typeAction}`).catch(() => {});

            if (logChannel) {
                await logChannel.send(
                    `💀 **[ALERTE CYBER-SÉCURITÉ : PHISHING BLOQUÉ (${typeAction})]** 💀\n` +
                    `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                    `• **Contenu intercepté :** \`${content}\`\n` +
                    `• **Action :** Message supprimé + Timeout 1h.`
                );
            }
            return true; 
        } catch (err) { console.error(err); }
    }

    // 2. Protection Anti-Scam (Calcul de Score)
    let scamScore = 0;
    SCAM_RULES.forEach(rule => { if (rule.regex.test(contentLower)) scamScore += rule.points; });
    const upperCase = content.replace(/[^A-Z]/g, "").length;
    if (upperCase > content.length * 0.7 && content.length > 15) scamScore += 2;

    if (scamScore >= 8) {
        try {
            await message.delete().catch(() => {});
            if (logChannel) {
                await logChannel.send(
                    `⚠️ **[LOG ANTI-SCAM (${typeAction})]** ⚠️\n` +
                    `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                    `• **Score :** \`${scamScore}/10\`\n` +
                    `• **Action :** Message effacé automatiquement.`
                );
            }
            return true; 
        } catch (err) { console.error(err); }
    }

    // 3. Protection Anti-Zalgo (Texte Crash)
    const regexZalgo = /[\u0300-\u036f]{4,}/g; 
    if (regexZalgo.test(content)) {
        try {
            await message.delete().catch(() => {});
            if (logChannel) {
                await logChannel.send(
                    `💥 **[LOG ANTI-ZALGO (${typeAction})]** 💥\n` +
                    `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                    `• **Action :** Message de caractères crash supprimé.`
                );
            }
            return true;
        } catch (err) { console.error(err); }
    }

    return false;
}

// ==========================================
// 🛡️ PROTECTION : ANTI-MODIFICATION DE MESSAGE
// ==========================================
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.content === newMessage.content) return; // Ignore si pas de changement de texte
    await verifierContenuMessage(newMessage, newMessage.content, "MODIFICATION");
});

// ==========================================
// 🛡️ PROTECTION : ANTI-WEBHOOK
// ==========================================
client.on('webhooksUpdate', async (channel) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 800)); 
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
        const webhookLog = fetchedLogs.entries.first();
        if (!webhookLog) return;
        
        const { executor, target } = webhookLog;
        if (executor.id === client.user.id) return;

        const webhooks = await channel.fetchWebhooks();
        const badWebhook = webhooks.get(target.id);
        if (badWebhook) {
            await badWebhook.delete("Anti-Webhook : Création non autorisée.");
        }

        const member = await channel.guild.members.fetch(executor.id).catch(() => null);
        if (member && member.manageable) {
            await member.roles.set([]).catch(console.error); 
        }

        const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send(
                `🚨 **[ALERTE ANTI-WEBHOOK]** 🚨\n` +
                `• **Salon :** ${channel}\n` +
                `• **Créateur suspect :** ${executor} (\`${executor.tag}\`)\n` +
                `• **Action :** Webhook supprimé + Rôles retirés.`
            );
        }
    } catch (err) {
        console.error("Erreur Anti-Webhook :", err);
    }
});

// ==========================================
// 🛡️ PROTECTION : ANTI-BOT / ANTI-RAID
// ==========================================
client.on('guildMemberAdd', async (member) => {
    tempsArriveeMembres.set(member.id, Date.now());
    if (!member.user.bot) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
        const botLog = fetchedLogs.entries.first();
        
        let executorInfo = "Inconnu";
        if (botLog) {
            const { executor } = botLog;
            executorInfo = `${executor} (\`${executor.tag}\`)`;
        }

        await member.kick("Anti-Bot : Ajout non autorisé.");

        const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send(
                `🛡️ **[LOG ANTI-RAID]** 🛡️\n` +
                `• **Bot bloqué :** \`${member.user.tag}\`\n` +
                `• **Ajouté par :** ${executorInfo}\n` +
                `• **Action :** Expulsé instantanément.`
            );
        }
    } catch (err) {
        console.error("Erreur Anti-Bot :", err);
    }
});

client.on('guildMemberRemove', (member) => {
    tempsArriveeMembres.delete(member.id);
});

// ==========================================
// 🛡️ PROTECTION : ANTI-SPAM DE RÉACTIONS (ÉMOJIS)
// ==========================================
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot || !reaction.message.guild) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (member.permissions.has('Administrator') || member.permissions.has('ManageMessages')) return;

    const userId = user.id;
    const NOW = Date.now();

    if (!historiqueReactions.has(userId)) {
        historiqueReactions.set(userId, []);
    }

    const timestamps = historiqueReactions.get(userId);
    timestamps.push(NOW);

    const reactionsRecentes = timestamps.filter(time => NOW - time < 3000);
    historiqueReactions.set(userId, reactionsRecentes);

    if (reactionsRecentes.length > 5) {
        try {
            await reaction.users.remove(userId).catch(() => {});
            await member.timeout(3600000, "Spam intensif de réactions").catch(() => {});

            const logChannel = reaction.message.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                await logChannel.send(
                    `🛡️ **[LOG ANTI-SPAM RÉACTIONS]** 🛡️\n` +
                    `• **Auteur :** ${user} (\`${user.tag}\`)\n` +
                    `• **Action :** Réaction retirée + Timeout 1h.`
                );
            }
            historiqueReactions.set(userId, []);
        } catch (err) {
            console.error("Erreur Anti-Spam Réactions :", err);
        }
    }
});

// ==========================================
// PROTECTIONS PAR MESSAGE CRÉÉ
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const content = message.content;
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    // --- 🛡️ DÉTECTEUR D'INJECTIONS DE FICHIERS DANGEREUX ---
    if (message.attachments.size > 0) {
        const extensionsInterdites = /\.(exe|scr|bat|vbs|cmd|msi|jar|ps1)$/i;
        for (const [id, attachment] of message.attachments) {
            if (extensionsInterdites.test(attachment.name)) {
                try {
                    await message.delete().catch(() => {});
                    const isAdminOuMod = message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages');
                    if (!isAdminOuMod) {
                        await message.member.timeout(3600000, "Envoi de fichier exécutable suspect").catch(() => {});
                    }
                    
                    if (logChannel) {
                        await logChannel.send(
                            `💀 **[ALERTE CYBER-SÉCURITÉ : FICHIER BLOQUÉ]** 💀\n` +
                            `• **Auteur :** ${message.author} (${message.author.tag})\n` +
                            `• **Fichier détruit :** \`${attachment.name}\`\n` +
                            `• **Action :** Supprimé + Timeout 1h.`
                        );
                    }
                    return; 
                } catch (err) { console.error(err); }
            }
        }
    }

    // --- ANALYSE DU TEXTE (Phishing, Scam, Zalgo) ---
    const aEteSupprime = await verifierContenuMessage(message, content, "ENVOI");
    if (aEteSupprime) return;

    // --- 🛡️ DÉTECTION ANTI-QR CODE ---
    if (message.attachments.size > 0) {
        for (const [id, attachment] of message.attachments) {
            const isImage = /\.(png|jpe?g|webp)$/i.test(attachment.url);
            if (!isImage) continue;

            try {
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data);
                const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const qrCode = jsQR(new Uint8ClampedArray(data), info.width, info.height);

                if (qrCode && qrCode.data) {
                    await message.delete().catch(() => {});
                    await message.member.timeout(3600000, "Envoi de QR Code suspect").catch(() => {});

                    if (logChannel) {
                        await logChannel.send(
                            `🖼️ **[LOG ANTI-QR CODE]** 🖼️\n` +
                            `• **Auteur :** ${message.author}\n` +
                            `• **Action :** Image supprimée + Timeout 1h.`
                        );
                    }
                    return; 
                }
            } catch (err) {
                console.error("Erreur scan QR Code :", err.message);
            }
        }
    }

    // --- 🛡️ ANTI-TOKEN PAR COMPORTEMENT D'ENTRÉE (100ms) ---
    const NOW = Date.now();
    if (tempsArriveeMembres.has(userId)) {
        const tempsDepuisArrivee = NOW - tempsArriveeMembres.get(userId);
        if (tempsDepuisArrivee < 100) {
            try {
                await message.delete().catch(() => {});
                await message.member.timeout(3600000, "Token au join").catch(() => {});
                if (logChannel) {
                    await logChannel.send(
                        `🤖 **[ANTI-TOKEN COMPORTEMENTAL]** 🤖\n` +
                        `• **Utilisateur :** ${message.author}\n` +
                        `• **Action :** Message supprimé + Timeout 1h.`
                    );
                }
                return;
            } catch (err) { console.error(err); }
        }
    }

    // --- 🛡️ DETECTEUR SELFBOT MULTI-SALONS (100ms) ---
    if (!historiqueSalons.has(userId)) {
        historiqueSalons.set(userId, { temps: NOW, salonId: message.channel.id });
    } else {
        const doubleCompte = historiqueSalons.get(userId);
        const differenceTemps = NOW - doubleCompte.temps;

        if (doubleCompte.salonId !== message.channel.id && differenceTemps < 100) {
            try {
                await message.delete().catch(() => {});
                await message.member.timeout(3600000, "Selfbot détecté").catch(() => {});

                if (logChannel) {
                    await logChannel.send(
                        `🚨 **[SELFBOT MULTI-SALONS CONTRÉ]** 🚨\n` +
                        `• **Utilisateur :** ${message.author}\n` +
                        `• **Action :** Message supprimé + Timeout 1h.`
                    );
                }
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
