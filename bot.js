const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    AuditLogEvent, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice'); 
const axios = require('axios');
const sharp = require('sharp');
const jsQR = require('jsqr');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ==========================================
// ⚙️ CONFIGURATION ET VARIABLES GLOBALES
// ==========================================
const GUILD_ID = process.env.GUILD_ID || "674632850775212033"; 
const SUPPORT_CATEGORY_ID = process.env.SUPPORT_CATEGORY_ID || "828174120956461066"; 
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "78595694050410516"; 
const ACTIVITY_LOG_CHANNEL_ID = process.env.ACTIVITY_LOG_CHANNEL_ID || "785957047245864980"; 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDs6VkzkX_Eb-GCkbxLxs18UiRSNXCoa-g";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Mémoires vives globales
const ticketsMembres = new Map(); 
const ticketsSalons = new Map();  
const totalMessagesParServeur = new Map(); 

const historiqueSalons = new Map();
const tempsArriveeMembres = new Map(); 
const historiqueReactions = new Map(); 
const historiqueModifsServeur = new Map(); 
const historiqueCreationSalons = new Map(); 
const historiqueBansModo = new Map(); 
const historiqueSuppressionSalons = new Map(); 
const historiqueKicksModo = new Map();        
const historiqueCreationEmojis = new Map(); 
const historiqueSuppressionEmojis = new Map(); 

const precisionTracker = new Map();
const dernierCheckToxicite = new Map();

// 🏆 SYSTÈME DE RÉPUTATION
const reputationPath = './reputation.json';
let reputationData = {};
if (fs.existsSync(reputationPath)) {
    try { 
        reputationData = JSON.parse(fs.readFileSync(reputationPath, 'utf-8')); 
        console.log("📊 Données de réputation chargées !"); 
    } catch (e) {
        console.error("Erreur lecture reputation.json");
    }
}

function sauvegarderReputation() { 
    fs.promises.writeFile(reputationPath, JSON.stringify(reputationData, null, 2)).catch(() => {}); 
}

function getReputation(userId) { 
    if (!reputationData[userId]) {
        reputationData[userId] = { score: 0, historique: [], username: '' }; 
    }
    return reputationData[userId]; 
}

function addReputation(userId, points, raison, username) { 
    const rep = getReputation(userId); 
    rep.score += points; 
    rep.username = username; 
    rep.historique.push({ 
        date: new Date().toISOString(), 
        action: `${points > 0 ? '+' : ''}${points} points : ${raison}` 
    }); 
    if (rep.historique.length > 50) rep.historique.shift(); 
    sauvegarderReputation(); 
    return rep; 
}

function getNiveauReputation(score) { 
    if (score >= 20) return { nom: 'Fiable', emoji: '🟢', slowmode: 0, bloqueLiens: false, bloqueImages: false, validation: false }; 
    if (score >= 5) return { nom: 'Bon', emoji: '🔵', slowmode: 0, bloqueLiens: false, bloqueImages: false, validation: false }; 
    if (score >= 0) return { nom: 'Neutre', emoji: '🟡', slowmode: 0, bloqueLiens: false, bloqueImages: false, validation: false }; 
    if (score >= -9) return { nom: 'Suspect', emoji: '🟠', slowmode: 10000, bloqueLiens: true, bloqueImages: false, validation: false }; 
    if (score >= -19) return { nom: 'Dangereux', emoji: '🔴', slowmode: 30000, bloqueLiens: true, bloqueImages: true, validation: true }; 
    return { nom: 'Banni', emoji: '⛔', slowmode: 0, bloqueLiens: true, bloqueImages: true, banni: true }; 
}

// 🤖 INITIALISATION DU CLIENT
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildWebhooks, GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.messagesTemporairesTickets = new Map();
client.enTrainDeChoisirCategory = new Map();

// 📩 FONCTION CENTRALISÉE D'ALERTE EN MESSAGE PRIVÉ
async function envoyerAlerteMP(user, guildName, raison, sanction) { 
    try { 
        const dmEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🛡️ SYSTÈME DE SÉCURITÉ : ALERTE')
            .setDescription(`Bonjour **${user.username}**,\n\nUne action anormale ou interdite a été détectée avec votre compte sur le serveur **${guildName}** Extrême.`)
            .addFields(
                { name: '⚠️ Motif de détection', value: `\`${raison}\``, inline: false },
                { name: '⏳ Sanction appliquée', value: `\`${sanction}\``, inline: false }
            )
            .setFooter({ text: 'Si vous pensez qu\'il s\'agit d\'une erreur, veuillez contacter un administrateur.' })
            .setTimestamp();
        await user.send({ embeds: [dmEmbed] }); 
    } catch (err) { 
        console.log(`[MP Bloqué] Impossible d'avertir ${user.tag}`); 
    } 
}

// 🧠 FONCTION ANTI-TOXICITÉ GEMINI
async function verifierToxiciteGemini(texte, auteur, salon) { 
    try { 
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
        const prompt = `Analyse ce message Discord en français. Le serveur est un serveur de PUBLICITÉ, donc les liens, invitations et promotions de serveurs/chaînes/réseaux sont AUTORISÉS. Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour, sans markdown.\n\nMessage : "${texte}"\nAuteur : "${auteur}"\nSalon : "${salon}"\n\nFormat exact attendu :\n{"estToxique":true,"categorie":"insulte","raison":"explication courte","gravite":1}\n\nCatégories à détecter :\n- "insulte" : insultes directes ou déguisées\n- "menace" : menaces physiques, hacking, dox, chantage\n- "haine" : racisme, homophobie, sexisme, discrimination\n- "harcelement" : s'en prendre personnellement à quelqu'un\n- "sexuel" : contenu à caractère sexuel non désiré\n- "dox" : partage d'informations personnelles\n- "arnaque" : vente de nitro, vente de comptes, liens de phishing, demandes d'argent suspectes, crypto douteuse\n- "usurpation" : se faire passer pour un membre du staff ou le fondateur\n- "suicide" : contenu évoquant le suicide ou l'automutilation\n- "violence" : descriptions extrêmement violentes ou gore\n- "aucune" : message normal\n\nGravité :\n- 1 = avertissement\n- 2 = suppression du message\n- 3 = sanction lourde\n\nRÈGLES IMPORTANTES :\n- Les liens d'invitation Discord, pubs YouTube/Twitch/Instagram sont NORMAUX et AUTORISÉS\n- La promotion de serveurs et chaînes est AUTORISÉE\n- BLOQUER : vente de nitro, vente de comptes, "nitro pas cher", "j'achète/vends des comptes"\n- BLOQUER : liens suspects type phishing, "clique pour nitro gratuit"\n- BLOQUER : demandes d'argent, crypto douteuse, "investissement" suspect\n- estToxique=true UNIQUEMENT pour les catégories ci-dessus`; 
        const result = await model.generateContent(prompt); 
        const response = result.response.text(); 
        const jsonStr = response.replace(/```json|```/g, '').trim(); 
        return JSON.parse(jsonStr); 
    } catch (err) { 
        console.error("Erreur Gemini :", err.message); 
        return { estToxique: false, categorie: "erreur", raison: "Analyse impossible", gravite: 0 }; 
    } 
}

// 🔞 FONCTION ANTI-NSFW IMAGES
async function verifierImageNSFW(urlImage) { 
    try { 
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
        const prompt = `Analyse cette image. Contient-elle du contenu NSFW (nudité, pornographie, contenu sexuel explicite) ?\nRéponds UNIQUEMENT par un objet JSON valide, sans markdown :\n{"estNSFW":true,"raison":"explication courte"}\nou\n{"estNSFW":false,"raison":""}\n\nRègles :\n- estNSFW=true si nudité, pornographie, contenu sexuel explicite\n- estNSFW=false si image normale, même avec personnes en maillot ou tenues légères\n- Sois strict sur le contenu pornographique uniquement`; 
        const imageResponse = await axios.get(urlImage, { responseType: 'arraybuffer' }); 
        const base64Image = Buffer.from(imageResponse.data).toString('base64'); 
        const result = await model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]); 
        const response = result.response.text(); 
        const jsonStr = response.replace(/```json|```/g, '').trim(); 
        return JSON.parse(jsonStr); 
    } catch (err) { 
        console.error("Erreur analyse NSFW :", err.message); 
        return { estNSFW: false, raison: "" }; 
    } 
}

// 🔞 FONCTION ANTI-NSFW SERVEUR
async function verifierServeurNSFW(guild) { 
    try { 
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
        const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID); 
        if (!logChannel) return false; 
        if (guild.iconURL()) { 
            const imageResponse = await axios.get(guild.iconURL({ size: 512 }), { responseType: 'arraybuffer' }); 
            const base64Icon = Buffer.from(imageResponse.data).toString('base64'); 
            const resultIcone = await model.generateContent([
                { text: `Cette image est-elle NSFW (contenu sexuel explicite, pornographie) ? Réponds UNIQUEMENT par : {"estNSFW":true,"raison":"..."} ou {"estNSFW":false,"raison":""}` },
                { inlineData: { mimeType: "image/png", data: base64Icon } }
            ]); 
            const reponseIcone = JSON.parse(resultIcone.response.text().replace(/```json|```/g, '').trim()); 
            if (reponseIcone.estNSFW) { 
                await logChannel.send(`🔞 **[ANTI-NSFW SERVEUR - ICÔNE]** 🔞\n• **Serveur :** ${guild.name}\n• **Raison :** ${reponseIcone.raison}\n• **Action :** ⚠️ Alerte staff - Icône suspecte détectée.`); 
                return true; 
            } 
        } 
        if (guild.bannerURL()) { 
            const imageResponse = await axios.get(guild.bannerURL({ size: 512 }), { responseType: 'arraybuffer' }); 
            const base64Banner = Buffer.from(imageResponse.data).toString('base64'); 
            const resultBanner = await model.generateContent([
                { text: `Cette image est-elle NSFW (contenu sexuel explicite, pornographie) ? Réponds UNIQUEMENT par : {"estNSFW":true,"raison":"..."} ou {"estNSFW":false,"raison":""}` },
                { inlineData: { mimeType: "image/png", data: base64Banner } }
            ]); 
            const reponseBanner = JSON.parse(resultBanner.response.text().replace(/```json|```/g, '').trim()); 
            if (reponseBanner.estNSFW) { 
                await logChannel.send(`🔞 **[ANTI-NSFW SERVEUR - BANNIÈRE]** 🔞\n• **Serveur :** ${guild.name}\n• **Raison :** ${reponseBanner.raison}\n• **Action :** ⚠️ Alerte staff - Bannière suspecte détectée.`); 
                return true; 
            } 
        } 
        return false; 
    } catch (err) { 
        console.error("Erreur vérification NSFW serveur :", err.message); 
        return false; 
    } 
}

// 🌤️ TRADUCTION MÉTÉO EN FRANÇAIS
function traduireMeteoEnFrancais(etat) { 
    const e = etat.toLowerCase(); 
    if (e.includes('ensoleillé') || e.includes('sunny') || e.includes('clear')) return 'Ensoleillé'; 
    if (e.includes('partiellement nuageux') || e.includes('partly cloudy')) return 'Partiellement nuageux'; 
    if (e.includes('nuageux') || e.includes('couvert') || e.includes('cloudy') || e.includes('overcast')) return 'Nuageux'; 
    if (e.includes('pluie') || e.includes('averse') || e.includes('bruine') || e.includes('rain') || e.includes('drizzle') || e.includes('shower')) return 'Pluvieux'; 
    if (e.includes('orage') || e.includes('thunder')) return 'Orageux'; 
    if (e.includes('neige') || e.includes('snow')) return 'Neigeux'; 
    if (e.includes('brouillard') || e.includes('brume') || e.includes('fog') || e.includes('mist')) return 'Brumeux'; 
    return etat; 
}

// 🌤️ EMOJI MÉTÉO
function obtenirEmojiMeteo(etat) { 
    const e = etat.toLowerCase(); 
    if (e.includes('ensoleillé') || e.includes('sunny') || e.includes('clear')) return '☀️'; 
    if (e.includes('partiellement nuageux') || e.includes('partly cloudy')) return '⛅'; 
    if (e.includes('nuageux') || e.includes('couvert') || e.includes('cloudy') || e.includes('overcast')) return '☁️'; 
    if (e.includes('pluie') || e.includes('averse') || e.includes('bruine') || e.includes('rain') || e.includes('drizzle') || e.includes('shower')) return '🌧️'; 
    if (e.includes('orage') || e.includes('thunder')) return '⛈️'; 
    if (e.includes('neige') || e.includes('snow')) return '🌨️'; 
    if (e.includes('brouillard') || e.includes('brume') || e.includes('fog') || e.includes('mist')) return '🌫️'; 
    return '🌤️'; 
}

// Expressions régulières de sécurité
const SCAM_RULES = [
    { regex: /n[i1]tr[o0]/i, points: 2 },       
    { regex: /fr[e3][e3]/i, points: 2 },        
    { regex: /cl[a4][i1]m/i, points: 3 },       
    { regex: /g[i1]v[e3][a4]w[a4]y/i, points: 3 } 
];
const regexPhishing = /(diiscord|disc0rd|discord-app|discord-gift|dlscord|discordg|free-nitro|nitro-gift|steam-gift|crypto-claim).*\.(com|ru|xyz|org|net|info|gift|click|link|apps)/i;
const regexLienGeneral = /https?:\/\/[^\s]+/gi;
const regexLienDiscordOfficiel = /https?:\/\/(www\.)?(discord\.(gg|com|me|io|media)|discordapp\.com)/i;
const regexTokenDiscord = /[\w-]{24,26}\.[\w-]{6}\.[\w-]{25,110}/;

// ==========================================
// 🚀 ÉVÉNEMENT : READY
// ==========================================
client.on('ready', async () => {
    console.log(`🤖 Le bot de protection ${client.user.tag} est en ligne !`);
    console.log(`🧠 Anti-Toxicité Gemini : ACTIVÉ`);
    console.log(`🔞 Anti-NSFW Messages : ACTIVÉ`);
    console.log(`🔞 Anti-NSFW Serveur : ACTIVÉ`);
    console.log(`🔤 Anti-Majuscules : ACTIVÉ`);
    console.log(`🏆 Système de Réputation : ACTIVÉ`);
    
    if (fs.existsSync('compteur.json')) {
        try {
            const data = fs.readFileSync('compteur.json', 'utf-8');
            const sauvegardes = JSON.parse(data);
            for (const [guildId, valeur] of Object.entries(sauvegardes)) {
                totalMessagesParServeur.set(guildId, valeur);
            }
            console.log("📊 Compteurs de messages chargés avec succès !");
        } catch (e) {
            console.error("Erreur de lecture compteur.json, réinitialisation.", e);
        }
    } else {
        for (const [guildId] of client.guilds.cache) {
            totalMessagesParServeur.set(guildId, 4340960);
        }
    }
    
    const commands = [
        new SlashCommandBuilder().setName('status').setDescription('Affiche l\'état de santé du bot et les statistiques.'),
        new SlashCommandBuilder().setName('join').setDescription('Fait rejoindre le bot dans votre salon vocal actuel.'),
        new SlashCommandBuilder().setName('close').setDescription('Ferme le ticket de support actuel et supprime le salon.'),
        new SlashCommandBuilder()
            .setName('meteo')
            .setDescription('Affiche la météo en temps réel pour une ville donnée.')
            .addStringOption(option => 
                option.setName('ville')
                    .setDescription('Le nom de la ville')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('reputation')
            .setDescription('Voir la réputation d\'un membre')
            .addUserOption(option => 
                option.setName('membre')
                    .setDescription('Le membre à vérifier')
                    .setRequired(false))
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || client.token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Les Slash Commands ont été enregistrées avec succès !');
    } catch (error) { console.error(error); }

    // 🔞 Vérification NSFW du serveur au démarrage
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        verifierServeurNSFW(guild);
        console.log("🔞 Vérification NSFW du serveur effectuée au démarrage.");
    }

    // 🏆 Bonus journalier de réputation
    setInterval(() => {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;
        guild.members.cache.forEach(member => {
            if (!member.user.bot) {
                const rep = getReputation(member.user.id);
                if (rep.score > -20) {
                    addReputation(member.user.id, 1, 'Bonus journalier', member.user.username);
                }
            }
        });
        console.log("🏆 Bonus journalier de réputation distribué !");
    }, 86400000);

    // ⭐ Rôle Fiable automatique (toutes les semaines)
    setInterval(() => {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;
        const roleFiable = guild.roles.cache.find(r => r.name === '⭐ Membre de Confiance');
        if (!roleFiable) return;
        
        guild.members.cache.forEach(member => {
            const rep = getReputation(member.user.id);
            if (rep.score >= 20 && !member.roles.cache.has(roleFiable.id)) {
                member.roles.add(roleFiable).catch(() => {});
            }
            if (rep.score < 20 && member.roles.cache.has(roleFiable.id)) {
                member.roles.remove(roleFiable).catch(() => {});
            }
        });
        console.log("⭐ Rôles de confiance mis à jour !");
    }, 604800000);
});

// ==========================================
// 📩 ÉVÉNEMENT : INTERACTION CREATE
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_category') {
        await interaction.deferUpdate(); 

        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return console.log("❌ Serveur introuvable. Vérifie ton GUILD_ID.");

        const categorieChoisie = interaction.values[0];
        const userId = interaction.user.id;

        const infoMessage = client.messagesTemporairesTickets.get(userId) || { content: "*Aucun texte*", attachments: [] };

        const ticketChannel = await guild.channels.create({
            name: `🎫-${interaction.user.username}`,
            type: 0,
            parent: SUPPORT_CATEGORY_ID,
            topic: `Ticket Modmail | ID Membre: ${userId} | Catégorie: ${categorieChoisie}`, 
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
            ]
        }).catch((err) => {
            console.error("❌ Erreur lors de la création du salon textuel :", err);
        });

        if (!ticketChannel) {
            client.enTrainDeChoisirCategory.delete(userId);
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

        client.enTrainDeChoisirCategory.delete(userId);
        client.messagesTemporairesTickets.delete(userId);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'close') {
        if (interaction.guildId) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
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

    if (interaction.commandName === 'reputation') {
        const membre = interaction.options.getUser('membre') || interaction.user;
        const rep = getReputation(membre.id);
        const niveau = getNiveauReputation(rep.score);
        
        const embed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle(`🏆 Réputation de ${membre.username}`)
            .addFields(
                { name: 'Score', value: `\`${rep.score}\` points`, inline: true },
                { name: 'Niveau', value: `${niveau.emoji} **${niveau.nom}**`, inline: true },
                { name: 'Dernières actions', value: rep.historique.slice(-5).map(h => `• ${h.action}`).join('\n') || 'Aucune activité' }
            )
            .setFooter({ text: `ID: ${membre.id}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        return;
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
        const totalMessages = totalMessagesParServeur.get(guildId) || 4340960;
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
                { name: '🧠 Anti-Toxicité IA (Gemini)', value: '• Insultes, menaces, haine, arnaques.\n• Pub de serveurs et chaînes autorisée.' },
                { name: '🔞 Anti-NSFW Messages', value: '• Détection des images à caractère sexuel explicite.' },
                { name: '🔞 Anti-NSFW Serveur', value: '• Vérification de l\'icône et bannière du serveur.' },
                { name: '🔤 Anti-Majuscules', value: '• Suppression des messages en majuscules abusives.' },
                { name: '🏆 Système de Réputation', value: '• Score automatique selon comportement.\n• Sanctions auto si score négatif.' },
                { name: '🛡️ Anti-Nuke & Anti-Token', value: '• Protection contre la fuite de jetons Discord et le saccage.' },
                { name: '🛡️ Anti-Scam & Anti-Selfbot', value: '• Filtres intelligents et analyse comportementale.' },
                { name: '🛡️ Anti-QR Code', value: '• Détection des QR codes frauduleux et phishing.' },
                { name: '🛡️ Anti-Raid Cloud & VPN', value: '• Analyse des flags d\'automatisation et blocage de bots.' }
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
            const reponse = await axios.get(`https://wttr.in/${encodeURIComponent(ville)}?format=j1`, { timeout: 8000 });
            const donnees = reponse.data;

            if (!donnees || !donnees.current_condition || donnees.current_condition.length === 0) {
                return await interaction.editReply({ content: `❌ Aucune donnée météo trouvée pour **${ville}**. Vérifiez l'orthographe.` });
            }

            const condition = donnees.current_condition[0];
            const etatMeteoBrut = condition.lang_fr?.[0]?.value || condition.weatherDesc?.[0]?.value || 'Inconnu';
            const etatMeteo = traduireMeteoEnFrancais(etatMeteoBrut);
            const emojiMeteo = obtenirEmojiMeteo(etatMeteoBrut);
            const temperature = condition.temp_C;
            const ressentie = condition.FeelsLikeC;
            const humidite = condition.humidity;
            const vent = condition.windspeedKmph;

            const meteoEmbed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle(`🌤️ Météo actuelle à ${ville.toUpperCase()}`)
                .addFields(
                    { name: '🌡️ Température', value: `\`${temperature}°C\` (Ressentie : \`${ressentie}°C\`)`, inline: true },
                    { name: '💧 Humidité', value: `\`${humidite}%\``, inline: true },
                    { name: '💨 Vent', value: `\`${vent} km/h\``, inline: true },
                    { name: '☁️ Conditions', value: `${emojiMeteo} \`${etatMeteo}\``, inline: false }
                )
                .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [meteoEmbed] });

        } catch (erreur) {
            console.error('Erreur météo :', erreur.message);
            await interaction.editReply({ content: "❌ Impossible de récupérer la météo. L'API est peut-être indisponible. Réessayez plus tard." });
        }
    }
});

// ==========================================
// 🔄 ÉVÉNEMENT : MESSAGE CREATE
// ==========================================
client.on('messageCreate', async (message) => {
    const targetGuildId = message.guild ? message.guild.id : GUILD_ID;

    if (!totalMessagesParServeur.has(targetGuildId)) {
        totalMessagesParServeur.set(targetGuildId, 4340960);
    }
    const cumulActuel = totalMessagesParServeur.get(targetGuildId);
    totalMessagesParServeur.set(targetGuildId, cumulActuel + 1);

    const objetASauvegarder = Object.fromEntries(totalMessagesParServeur);
    fs.promises.writeFile('compteur.json', JSON.stringify(objetASauvegarder, null, 2)).catch(() => {});

    // 📩 BRANCHE 1 : MESSAGES PRIVÉS
    if (!message.guild) {
        if (message.author.bot) return;
        const userId = message.author.id;

        if (ticketsSalons.has(userId)) {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) return;
            const ticketChannel = guild.channels.cache.get(ticketsSalons.get(userId));
            if (ticketChannel) {
                const relayEmbed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setDescription(message.content || "*[Fichier/Image]*")
                    .setTimestamp();
                await ticketChannel.send({ embeds: [relayEmbed] });
                if (message.attachments.size > 0) {
                    await ticketChannel.send({ files: Array.from(message.attachments.values()) });
                }
                await message.react('✅').catch(() => {});
            }
            return;
        }

        if (client.enTrainDeChoisirCategory.get(userId)) return;

        client.messagesTemporairesTickets.set(userId, {
            content: message.content,
            attachments: message.attachments.size > 0 ? Array.from(message.attachments.values()) : []
        });
        client.enTrainDeChoisirCategory.set(userId, true);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_ticket_category')
            .setPlaceholder('Sélectionnez le motif de votre demande...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Signaler un joueur / Problème').setValue('Signalement').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('Demande de Partenariat').setValue('Partenariat').setEmoji('🤝'),
                new StringSelectMenuOptionBuilder().setLabel('Autre Demande / Questions').setValue('Autre').setEmoji('❓')
            );

        const row = new ActionRowBuilder().addComponents(menu);
        const menuEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🎫 BIENVENUE SUR LE SUPPORT')
            .setDescription(`Bonjour ${message.author},\n\nVeuillez sélectionner une **catégorie** ci-dessous pour joindre notre équipe :`);

        await message.author.send({ embeds: [menuEmbed], components: [row] }).catch(() => {
            client.enTrainDeChoisirCategory.delete(userId);
        });
    } 
    // 🛡️ BRANCHE 2 : SUR SERVEUR
    else {
        if (message.author.bot) return;

        let userId = ticketsMembres.get(message.channel.id);

        if (!userId && (message.channel.parentId === SUPPORT_CATEGORY_ID || message.channel.name.startsWith('🎫-'))) {
            const targetOverwrite = message.channel.permissionOverwrites.cache.find(o => o.type === 1 && o.id !== client.user.id);
            if (targetOverwrite) {
                userId = targetOverwrite.id;
                ticketsMembres.set(message.channel.id, userId);
                ticketsSalons.set(userId, message.channel.id);
            }
        }

        if (userId) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const staffEmbed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setAuthor({ name: `Support - ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                    .setDescription(message.content || "*[Fichier/Image]*")
                    .setTimestamp();
                await user.send({ embeds: [staffEmbed] }).then(() => {
                    message.react('📩').catch(() => {});
                }).catch(() => {
                    message.channel.send("❌ Impossible d'envoyer le message (DMs fermés).");
                });
                if (message.attachments.size > 0) {
                    await user.send({ files: Array.from(message.attachments.values()) }).catch(() => {});
                }
            }
            return; 
        }

        // 🏆 Vérification réputation
        const rep = getReputation(message.author.id);
        const niveau = getNiveauReputation(rep.score);
        
        if (niveau.banni) {
            await message.member.kick('Score de réputation trop bas (-20)').catch(() => {});
            return;
        }
        
        if (niveau.validation && !message.member.permissions.has('Administrator')) {
            await message.delete().catch(() => {});
            await envoyerAlerteMP(message.author, message.guild.name, 'Votre score de réputation est trop bas.', 'Message en attente de validation par le staff.').catch(() => {});
            const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                await logChannel.send(`🔴 **[VALIDATION REQUISE]** ${message.author} (\`${message.author.id}\`) : ||${message.content.slice(0, 500)}||`);
            }
            return;
        }
        
        if (niveau.bloqueLiens && regexLienGeneral.test(message.content) && !message.member.permissions.has('Administrator')) {
            await message.delete().catch(() => {});
            await envoyerAlerteMP(message.author, message.guild.name, 'Votre niveau de réputation ne permet pas d\'envoyer des liens.', 'Message supprimé.').catch(() => {});
            return;
        }
        
        if (niveau.bloqueImages && message.attachments.size > 0 && !message.member.permissions.has('Administrator')) {
            await message.delete().catch(() => {});
            await envoyerAlerteMP(message.author, message.guild.name, 'Votre niveau de réputation ne permet pas d\'envoyer des images.', 'Message supprimé.').catch(() => {});
            return;
        }
        
        if (niveau.slowmode > 0 && !message.member.permissions.has('Administrator')) {
            const dernierMsg = precisionTracker.get('slowmode_' + message.author.id) || 0;
            if (Date.now() - dernierMsg < niveau.slowmode) {
                await message.delete().catch(() => {});
                return;
            }
            precisionTracker.set('slowmode_' + message.author.id, Date.now());
        }

        // ==========================================
        // 🔥 SÉCURITÉ MESSAGE
        // ==========================================

        // 0️⃣ ANTI-NSFW IMAGES
        if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                const estImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(attachment.name);
                if (estImage) {
                    const analyseNSFW = await verifierImageNSFW(attachment.url);
                    if (analyseNSFW.estNSFW) {
                        await message.delete().catch(() => {});
                        addReputation(message.author.id, -10, 'Image NSFW', message.author.username);
                        const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                        if (logChannel) {
                            await logChannel.send(`🔞 **[ANTI-NSFW]** 🔞\n• **Auteur :** ${message.author} (\`${message.author.id}\`)\n• **Salon :** ${message.channel}\n• **Raison :** ${analyseNSFW.raison}\n• **Score :** ${rep.score} → ${rep.score - 10}`);
                        }
                        await envoyerAlerteMP(message.author, message.guild.name, "Image à caractère sexuel explicite détectée.", `Message supprimé. Score de réputation : ${rep.score}.`);
                        return;
                    }
                }
            }
        }

        // 1️⃣ ANTI-MAJUSCULES ABUSIVES
        if (message.content.length > 10) {
            const lettres = message.content.replace(/[^A-Za-zÀ-ÿ]/g, '');
            if (lettres.length > 0) {
                const majuscules = lettres.replace(/[^A-Z]/g, '').length;
                const pourcentage = (majuscules / lettres.length) * 100;
                if (pourcentage > 70) {
                    await message.delete().catch(() => {});
                    addReputation(message.author.id, -2, 'Majuscules abusives', message.author.username);
                    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel) {
                        await logChannel.send(`🔤 **[ANTI-MAJUSCULES]** 🔤\n• **Auteur :** ${message.author} (\`${message.author.id}\`)\n• **Salon :** ${message.channel}\n• **Taux :** ${pourcentage.toFixed(0)}% de majuscules\n• **Score :** ${rep.score} → ${rep.score - 2}`);
                    }
                    await envoyerAlerteMP(message.author, message.guild.name, "Utilisation abusive de majuscules détectée.", `Message supprimé. Score de réputation : ${rep.score}.`);
                    return;
                }
            }
        }

        // 2️⃣ ANTI-TOXICITÉ GEMINI
        if (message.content.length > 3) {
            const dernierCheck = dernierCheckToxicite.get(message.author.id) || 0;
            if (Date.now() - dernierCheck > 3000) {
                dernierCheckToxicite.set(message.author.id, Date.now());
                
                const analyseToxicite = await verifierToxiciteGemini(message.content, message.author.username, message.channel.name);
                if (analyseToxicite.estToxique) {
                    await message.delete().catch(() => {});
                    
                    let pointsRetires = 0;
                    if (analyseToxicite.gravite === 1) pointsRetires = -2;
                    else if (analyseToxicite.gravite === 2) pointsRetires = -5;
                    else if (analyseToxicite.gravite === 3) pointsRetires = -15;
                    
                    addReputation(message.author.id, pointsRetires, analyseToxicite.categorie, message.author.username);
                    
                    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                    const emojiGravite = analyseToxicite.gravite === 3 ? '🔴' : analyseToxicite.gravite === 2 ? '🟠' : '🟡';
                    
                    if (logChannel) {
                        await logChannel.send(`${emojiGravite} **[ANTI-TOXICITÉ IA - ${analyseToxicite.categorie.toUpperCase()}]** ${emojiGravite}\n• **Auteur :** ${message.author} (\`${message.author.id}\`)\n• **Salon :** ${message.channel}\n• **Gravité :** Niveau ${analyseToxicite.gravite}/3\n• **Raison :** ${analyseToxicite.raison}\n• **Score :** ${rep.score} → ${rep.score + pointsRetires}\n• **Message :** ||${message.content.slice(0, 500)}||`);
                    }
                    
                    await envoyerAlerteMP(message.author, message.guild.name, `Message toxique détecté par l'IA : ${analyseToxicite.raison}`, `Message supprimé. Score de réputation : ${rep.score + pointsRetires}.`);
                    
                    if (analyseToxicite.gravite >= 3) {
                        try {
                            await message.member.timeout(3600000, `Anti-toxicité IA : ${analyseToxicite.categorie}`).catch(() => {});
                            addReputation(message.author.id, -20, 'Timeout reçu', message.author.username);
                            if (logChannel) {
                                await logChannel.send(`⏱️ **Timeout automatique de 1h** appliqué à ${message.author} pour ${analyseToxicite.categorie}.\n• **Score :** ${rep.score + pointsRetires - 20}`);
                            }
                        } catch (err) {
                            console.error("Impossible d'appliquer le timeout :", err.message);
                        }
                    }
                    
                    return;
                }
            }
        }

        // 3️⃣ ANTI-TOKEN DISCORD
        if (regexTokenDiscord.test(message.content)) {
            await message.delete().catch(() => {});
            addReputation(message.author.id, -10, 'Fuite de token', message.author.username);
            const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                await logChannel.send(`🚨 **[ALERTE SECURITE : FUITE DE TOKEN]** 🚨\n• **Auteur :** ${message.author} (\`${message.author.id}\`)\n• **Salon :** ${message.channel}\n• **Action :** Message supprimé d'urgence.\n• **Score :** ${rep.score} → ${rep.score - 10}`);
            }
            await envoyerAlerteMP(message.author, message.guild.name, "Fuite de jeton d'authentification (Token Discord) détectée dans votre message.", `Suppression immédiate. Score de réputation : ${rep.score - 10}.`);
            return;
        }

        // 4️⃣ ANTI-SELFBOT & ANTI-COPIER-COLLER
        const tempsActuel = Date.now();
        if (precisionTracker.has(message.author.id)) {
            const dernierTempsMessage = precisionTracker.get(message.author.id);
            const intervalle = tempsActuel - dernierTempsMessage; 
            const longueurTexte = message.content.length;

            if (longueurTexte > 30 && intervalle < 500) {
                const vitesseInhumaine = (longueurTexte / (intervalle / 1000)).toFixed(0);
                
                await message.delete().catch(() => {});
                addReputation(message.author.id, -5, 'Copier-coller massif', message.author.username);
                const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    await logChannel.send(`🛡️ **[ANTI-COPIL : COPIER-COLLER DETECTÉ]** 🛡️\n• **Auteur :** ${message.author}\n• **Salon :** ${message.channel}\n• **Détails :** ${longueurTexte} caractères envoyés en \`${intervalle}ms\` (Vitesse : ~${vitesseInhumaine} char/sec).\n• **Score :** ${rep.score} → ${rep.score - 5}`);
                }
                await envoyerAlerteMP(message.author, message.guild.name, "Détection d'un copier-coller massif ou instantané (Comportement de Selfbot/Macro).", `Message supprimé. Score de réputation : ${rep.score - 5}.`);
                return;
            }

            // Anti-Spam flood
            if (intervalle < 200) {
                await message.delete().catch(() => {});
                await envoyerAlerteMP(message.author, message.guild.name, "Flood détecté (messages envoyés trop rapidement).", `Message supprimé. Score de réputation : ${rep.score}.`).catch(() => {});
                return;
            }
        }
        precisionTracker.set(message.author.id, tempsActuel);

        await verifierContenuMessage(message, message.content, rep);
    }
});

// ==========================================
// 🛡️ INFRASTRUCTURE DES LOGS ET COMPORTEMENTS
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const activityLogChannel = newState.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    if (!activityLogChannel || newState.member.user.bot) return;
    const embedVocal = new EmbedBuilder().setTimestamp().setFooter({ text: `ID: ${newState.member.id}` });

    if (!oldState.channelId && newState.channelId) {
        embedVocal.setColor('#ffa500').setTitle('🎤 VOCAL : SALON REJOINT').setDescription(`• **Membre :** ${newState.member}\n• **Salon rejoint :** ${newState.channel}`);
        return await activityLogChannel.send({ embeds: [embedVocal] }).catch(() => {});
    }
    if (oldState.channelId && !newState.channelId) {
        embedVocal.setColor('#ffa500').setTitle('🎤 VOCAL : SALON QUITTÉ').setDescription(`• **Membre :** ${oldState.member}\n• **Salon quitté :** ${oldState.channel}`);
        return await activityLogChannel.send({ embeds: [embedVocal] }).catch(() => {});
    }
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        embedVocal.setColor('#ffa500').setTitle('🎤 VOCAL : CHANGEMENT DE SALON').setDescription(`• **Membre :** ${newState.member}\n• **Ancien Salon :** ${oldState.channel}\n• **Nouveau Salon :** ${newState.channel}`);
        return await activityLogChannel.send({ embeds: [embedVocal] }).catch(() => {});
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const activityLogChannel = newMember.guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    if (!activityLogChannel) return;
    const embedModif = new EmbedBuilder().setTimestamp().setFooter({ text: `ID: ${newMember.id}` });

    if (oldMember.nickname !== newMember.nickname) {
        embedModif.setColor('#ffa500').setTitle('👥 MEMBRE : CHANGEMENT DE PSEUDO').setDescription(`• **Membre :** ${newMember}\n• **Ancien :** \`${oldMember.nickname || oldMember.user.username}\`\n• **Nouveau :** \`${newMember.nickname || newMember.user.username}\``);
        return await activityLogChannel.send({ embeds: [embedModif] }).catch(() => {});
    }
    if (oldMember.roles.cache.size < newMember.roles.cache.size) {
        const roleAjoute = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id)).first();
        if (!roleAjoute) return;
        embedModif.setColor('#ffa500').setTitle('🛡️ RÔLE : ACCORDÉ').setDescription(`• **Bénéficiaire :** ${newMember}\n• **Rôle attribué :** ${roleAjoute}`);
        return await activityLogChannel.send({ embeds: [embedModif] }).catch(() => {});
    }
    if (oldMember.roles.cache.size > newMember.roles.cache.size) {
        const roleRetire = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id)).first();
        if (!roleRetire) return;
        embedModif.setColor('#ffa500').setTitle('🛡️ RÔLE : RETIRÉ').setDescription(`• **Membre concerné :** ${newMember}\n• **Rôle perdu :** ${roleRetire}`);
        return await activityLogChannel.send({ embeds: [embedModif] }).catch(() => {});
    }
});

client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    const activityLogChannel = guild.channels.cache.get(ACTIVITY_LOG_CHANNEL_ID);
    const executor = auditLogEntry.executor;
    if (!executor || executor.id === client.user.id || executor.id === guild.ownerId) return;
    const NOW = Date.now();

    if (auditLogEntry.action === AuditLogEvent.MemberUpdate) {
        const changeTimeout = auditLogEntry.changes.find(c => c.key === 'communication_disabled_until');
        if (!changeTimeout || !activityLogChannel) return;
        const cible = await guild.members.fetch(auditLogEntry.targetId).catch(() => null);
        if (!cible) return;

        const embedMod = new EmbedBuilder().setTimestamp();
        if (changeTimeout.new) { 
            const dateExpiration = new Date(changeTimeout.new);
            embedMod.setColor('#ffa500').setTitle('🚫 MODÉRATION : MEMBRE EXCLU (TIMEOUT)').setDescription(`• **Membre :** ${cible}\n• **Modérateur :** ${executor}\n• **Fin :** <t:${Math.floor(dateExpiration.getTime() / 1000)}:F>`);
        } else { 
            embedMod.setColor('#ffa500').setTitle('🚫 MODÉRATION : EXCLUSION ANNULÉE').setDescription(`• **Membre libéré :** ${cible}\n• **Modérateur :** ${executor}\n• Le timeout a été retiré.`);
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
            addReputation(executor.id, -15, 'Tentative de Nuke (flood emojis)', executor.username);
            await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : FLOOD EMOJIS]** 🚨🚨\n• **Auteur :** ${executor}\n• **Contre-mesure :** Émoji supprimé + Rôles retirés.\n• **Score :** ${getReputation(executor.id).score}`);
            historiqueCreationEmojis.delete(executor.id);
            await envoyerAlerteMP(executor, guild.name, "Création massive d'emojis détectée (Tentative de Nuke).", "Émojis supprimés + Rôles réinitialisés.").catch(() => {});
        }
    }

    if (auditLogEntry.action === AuditLogEvent.EmojiDelete) {
        if (!historiqueSuppressionEmojis.has(executor.id)) historiqueSuppressionEmojis.set(executor.id, []);
        const suppressions = historiqueSuppressionEmojis.get(executor.id).filter(time => NOW - time < 10000);
        suppressions.push(NOW); historiqueSuppressionEmojis.set(executor.id, suppressions);

        if (suppressions.length > 2 && logChannel) {
            const memberStaff = await guild.members.fetch(executor.id).catch(() => null);
            if (memberStaff && memberStaff.manageable) await memberStaff.roles.set([]).catch(console.error);
            addReputation(executor.id, -15, 'Tentative de Nuke (destruction emojis)', executor.username);
            await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : DESTRUCTION EMOJIS]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles supprimés immédiatement.\n• **Score :** ${getReputation(executor.id).score}`);
            historiqueSuppressionEmojis.delete(executor.id);
            await envoyerAlerteMP(executor, guild.name, "Suppression massive d'emojis détectée (Tentative de Nuke).", "Rôles réinitialisés.").catch(() => {});
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
            addReputation(executor.id, -15, 'Tentative de Nuke (bans massifs)', executor.username);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : BAN]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles supprimés.\n• **Score :** ${getReputation(executor.id).score}`);
            historiqueBansModo.delete(executor.id);
            await envoyerAlerteMP(executor, ban.guild.name, "Bannissement massif de membres détecté (Tentative de Nuke).", "Rôles réinitialisés.").catch(() => {});
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
            const embedLeave = new EmbedBuilder().setColor('#7f8c8d').setTitle('👥 MEMBRE : A QUITTÉ LE SERVEUR').setDescription(`• **Utilisateur :** ${member.user.tag}`).setTimestamp();
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
            addReputation(executor.id, -15, 'Tentative de Nuke (kicks massifs)', executor.username);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : KICK]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles supprimés.\n• **Score :** ${getReputation(executor.id).score}`);
            historiqueKicksModo.delete(executor.id);
            await envoyerAlerteMP(executor, member.guild.name, "Expulsion massive de membres détectée (Tentative de Nuke).", "Rôles réinitialisés.").catch(() => {});
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
            addReputation(executor.id, -15, 'Tentative de Nuke (flood salons)', executor.username);
            const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : FLOOD CREATION]** 🚨🚨\n• **Auteur :** ${executor}\n• **Contre-mesure :** Rôles retirés.\n• **Score :** ${getReputation(executor.id).score}`);
            historiqueCreationSalons.delete(executor.id);
            await envoyerAlerteMP(executor, channel.guild.name, "Création massive de salons détectée (Tentative de Nuke).", "Salons supprimés + Rôles réinitialisés.").catch(() => {});
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
            addReputation(executor.id, -15, 'Tentative de Nuke (destruction salons)', executor.username);
            const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE ANTI-NUKE : DESTRUCTION SALONS]** 🚨🚨\n• **Modérateur :** ${executor}\n• **Contre-mesure :** Rôles retirés.\n• **Score :** ${getReputation(executor.id).score}`);
            historiqueSuppressionSalons.delete(executor.id);
            await envoyerAlerteMP(executor, channel.guild.name, "Suppression massive de salons détectée (Tentative de Nuke).", "Rôles réinitialisés.").catch(() => {});
        }
    } catch (err) { console.error(err); }
});

client.on('guildUpdate', async (oldGuild, newGuild) => {
    // 🔞 Vérification NSFW du serveur
    await verifierServeurNSFW(newGuild);
    
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
            addReputation(executor.id, -15, 'Tentative de vandalisme (modifications serveur)', executor.username);
            if (logChannel) await logChannel.send(`🚨🚨 **[URGENCE VANDALISME]** 🚨🚨\n• **Auteur :** ${executor}\n• **Action :** Rôles supprimés.\n• **Score :** ${getReputation(executor.id).score}`);
            historiqueModifsServeur.delete(executor.id);
            await envoyerAlerteMP(executor, newGuild.name, "Modifications répétées du serveur détectées (Tentative de vandalisme).", "Modifications annulées + Rôles réinitialisés.").catch(() => {});
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🛡️ SÉCURITÉ ENTRÉE : ANTI-BOT STRICT & PROTECTION INFRASTRUCTURE CLOUD
// ==========================================
client.on('guildMemberAdd', async (member) => {
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);

    // PARTIE A : BLOCAGE INTRUSION DE BOTS ÉTRANGERS
    if (member.user.bot) {
        try {
            await new Promise(resolve => setTimeout(resolve, 1500)); 
            const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
            const botAddLog = fetchedLogs.entries.first();

            if (!botAddLog) {
                await member.kick("Anti-Bot : Impossible de vérifier l'inviteur.").catch(() => {});
                return;
            }

            const { executor } = botAddLog;

            if (executor.id !== member.guild.ownerId) {
                await member.ban({ reason: `Anti-Bot : Tentative d'intrusion. Invité par ${executor.username} au lieu du Fonda.` }).catch(() => {});
                
                const staffMalveillant = await member.guild.members.fetch(executor.id).catch(() => null);
                if (staffMalveillant && staffMalveillant.manageable) {
                    await staffMalveillant.roles.set([]).catch(console.error);
                }

                addReputation(executor.id, -15, 'Tentative d\'intrusion de bot', executor.username);

                if (logChannel) {
                    const embedIntrusion = new EmbedBuilder()
                        .setColor('#ffa500')
                        .setTitle('🚨 ALERTE SÉCURITÉ : INTRUSION DE BOT BLOQUÉE')
                        .setDescription(`Un membre du staff ou un utilisateur a tenté d'ajouter un bot de force.`)
                        .addFields(
                            { name: '🤖 Bot bloqué', value: `${member.user} (\`${member.user.id}\`)`, inline: true },
                            { name: '👤 Inviteur', value: `${executor} (\`${executor.id}\`)`, inline: true },
                            { name: '🛡️ Sanction', value: `\`Bot banni à vie\` + \`Rôles de l'inviteur réinitialisés\``, inline: false },
                            { name: '🏆 Score', value: `\`${getReputation(executor.id).score}\``, inline: false }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [embedIntrusion] });
                }
                await envoyerAlerteMP(executor, member.guild.name, "Tentative d'ajout non autorisé d'un bot sur le serveur.", "Bot banni + Vos rôles ont été réinitialisés.").catch(() => {});
            } else {
                if (logChannel) {
                    await logChannel.send(`🟢 **[ANTI-BOT]** Le bot ${member.user} a été autorisé (invité par le propriétaire).`);
                }
            }
        } catch (error) {
            console.error("Erreur dans le module strict Anti-Bot :", error);
        }
        return; 
    }

    // PARTIE B : ANTI-RAID CLOUD & FLAGS AUTOMATISATION
    try {
        const aUnAvatar = member.user.avatar !== null;
        const compteUltraRecent = (Date.now() - member.user.createdTimestamp) < 24 * 60 * 60 * 1000;

        if (compteUltraRecent && !aUnAvatar) {
            await member.kick("Sécurité Anti-Raid Cloud : Profil suspect (Flags d'automatisation/VPN).").catch(() => {});
            
            if (logChannel) {
                const embedVPN = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setTitle('🛡️ ANTI-RAID INFRASTRUCTURE CLOUD')
                    .setDescription(`Une tentative de connexion automatisée (via Proxy/VPN/Cloud) a été rejetée.`)
                    .addFields(
                        { name: '👤 Compte intercepté', value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
                        { name: '⚠️ Motif détecté', value: `\`Flag d'automatisation (No-Avatar + Compte < 24h)\``, inline: true }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embedVPN] });
            }
            await envoyerAlerteMP(member.user, member.guild.name, "Votre compte a été détecté comme suspect (Profil sans avatar + Compte créé il y a moins de 24h).", "Expulsion du serveur.").catch(() => {});
        }
    } catch (error) {
        console.error("Erreur dans l'Analyseur de Flags/VPN :", error);
    }
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
            addReputation(member.user.id, -5, 'Lien malveillant dans la bio', member.user.username);
            await envoyerAlerteMP(member.user, member.guild.name, "Lien malveillant ou publicitaire détecté dans votre bio Discord.", "Expulsion immédiate du serveur (Kick).");
            await member.kick("Anti-Bio Malveillante").catch(() => {});
            if (logChannel) await logChannel.send(`🛡️ **[ANTI-BIO MALVEILLANTE]** 🛡️\n• **Utilisateur expulsé :** ${member.user}\n• **Lien :** \`${lien}\`\n• **Score :** ${getReputation(member.user.id).score}`);
            break;
        } catch (err) { console.error(err); }
    }
}

async function verifierContenuMessage(message, content, rep) {
    if (!message.guild || message.author?.bot) return false;

    if (message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
            const estImage = /\.(png|jpg|jpeg|webp)$/i.test(attachment.name);
            if (!estImage) continue;

            try {
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);

                const { data, info } = await sharp(buffer)
                    .ensureAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

                if (code && code.data) {
                    const qrText = code.data;
                    if (regexPhishing.test(qrText) || SCAM_RULES.some(rule => rule.regex.test(qrText))) {
                        await message.delete().catch(() => {});
                        addReputation(message.author.id, -10, 'QR code frauduleux', message.author.username);
                        const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                        if (logChannel) {
                            await logChannel.send(`🛡️ **[ANTI-QR CODE FRAUDULEUX]** 🛡️\n• **Auteur :** ${message.author}\n• **Salon :** ${message.channel}\n• **Lien masqué :** \`${qrText}\`\n• **Score :** ${rep.score} → ${rep.score - 10}`);
                        }
                        await envoyerAlerteMP(message.author, message.guild.name, "Envoi d'un QR Code contenant un lien suspect.", "Suppression immédiate du message.");
                        return true; 
                    }
                }
            } catch (err) {
                console.error("Erreur lors de l'analyse du QR code :", err.message);
            }
        }
    }
    return false;
}

client.login(process.env.DISCORD_TOKEN);
