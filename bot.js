const { Client, GatewayIntentBits } = require('discord.js');

// Création du bot avec les accès aux messages
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ] 
});

// Système de score "Intelligent"
const SCAM_RULES = [
    { regex: /(?i)n[i1]tr[o0]/, points: 2 },           // Nitro
    { regex: /(?i)fr[e3][e3]/, points: 2 },            // Free
    { regex: /(?i)cl[a4][i1]m/, points: 3 },           // Claim
    { regex: /(?i)@everyone|@here/, points: 4 },       // Mentions
    { regex: /(?i)st[e3][a4]m|gift|card|robux/, points: 2 },
    { regex: /(?i)http[s]?:\/\/(?!discord\.com|discord\.gg|spotify\.com)/, points: 3 } // Liens suspects
];

client.on('messageCreate', async (message) => {
    // On ignore les bots et les messages privés
    if (message.author.bot || !message.guild) return;

    let scamScore = 0;
    const content = message.content;

    // Calcul du score de danger
    SCAM_RULES.forEach(rule => {
        if (rule.regex.test(content)) {
            scamScore += rule.points;
        }
    });

    // Détection des majuscules excessives (+2 points)
    const upperCase = content.replace(/[^A-Z]/g, "").length;
    if (upperCase > content.length * 0.7 && content.length > 15) {
        scamScore += 2;
    }

    // Seuil de sanction (8 points = suppression, 12 points = timeout)
    if (scamScore >= 8) {
        try {
            await message.delete();
            const logChannel = message.channel; 
            const warn = await logChannel.send(`⚠️ **Anti-Scam :** Message suspect de ${message.author} supprimé (Score: ${scamScore}).`);
            setTimeout(() => warn.delete(), 5000);

            if (scamScore >= 12) {
                await message.member.timeout(600000, "Tentative de scam automatique"); // 10 min
            }
        } catch (err) {
            console.error("Erreur modération :", err);
        }
    }
});

// Connexion sécurisée via GitHub Secrets
client.login(process.env.DISCORD_TOKEN);

