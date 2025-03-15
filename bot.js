const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const TOKEN = 'MTM0OTA1ODAyODg1ODY0MjU2Ng.GMSgC1.tqQTXGrvdbipf8kBTdVKgIqXCLmhVKk21FSyNM';
const CLIENT_ID = '1349058028858642566'; // Replace with your client ID

// Allowed servers for file access
const ALLOWED_GUILDS = ['1259592689473818645']; // Replace with your allowed guild IDs

// Allowed channels for bot usage
const ALLOWED_CHANNEL_IDS = ['1349644842648604733']; // Replace with your allowed channel IDs

// Blacklisted user IDs
const BLACKLISTED_USERS = ['696830313963192371', '1231616277626359858']; // Replace with the blacklisted user IDs

// Directory path for downloadable content
const FILES_DIRECTORY = path.join('C:', 'Users', 'Admin', 'Downloads', '6kluas', 'gamedb', 'gamedb');

// User or channel ID to send log messages
const LOG_USER_ID = '1297957381724176437'; // Replace with the user ID or channel ID for logging

// User or channel ID to send request messages
const REQUEST_USER_ID = '1297957381724176437'; // Replace with the user ID or channel ID for request notifications

// Initialize the FILES object with files from the directory
const FILES = {};

function loadFilesFromDirectory(directoryPath) {
    const files = fs.readdirSync(directoryPath);
    files.forEach(file => {
        const filePath = path.join(directoryPath, file);
        const fileNameWithoutExt = path.parse(file).name; // Get the file name without extension
        FILES[fileNameWithoutExt] = filePath;
    });
}

// Load files from the directory
loadFilesFromDirectory(FILES_DIRECTORY);

// Initialize the bot
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Slash command data
const commands = [
    new SlashCommandBuilder()
        .setName('get_file')
        .setDescription('Retrieve a file based on its App ID.')
        .addStringOption(option => option.setName('appid').setDescription('The App ID of the file you want').setRequired(true)),
    new SlashCommandBuilder()
        .setName('gamelist')
        .setDescription('List all the games added.'),
    new SlashCommandBuilder()
        .setName('request')
        .setDescription('Request a game by providing the App ID and game name.')
        .addStringOption(option => option.setName('appid').setDescription('The App ID of the game you want to request').setRequired(true))
        .addStringOption(option => option.setName('gamename').setDescription('The name of the game you want to request').setRequired(true))
].map(command => command.toJSON());

// Register the slash commands for every server the bot is in
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        // Register commands for all servers the bot is in
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully registered application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();

// Fetch game data from the Steam Store API
async function getGameData(appId) {
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
        const response = await axios.get(url);
        const data = response.data[appId];

        if (data.success) {
            const game = data.data;
            const name = game.name;
            const description = game.short_description || 'No description available.';
            const releaseDate = game.release_date ? game.release_date.date : 'Unknown';
            const appId = game.steam_appid;
            const imageUrl = game.header_image || 'https://via.placeholder.com/300x150.png?text=No+Image+Available'; // Default image if none is available

            return {
                name,
                description,
                releaseDate,
                appId,
                imageUrl
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error fetching game data from Steam Store API:', error);
        return null;
    }
}

// Fetch App ID from Steam Store API using game name
async function fetchAppIdByName(gameName) {
    try {
        const url = `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(gameName)}&cc=us&l=en&v=1`;
        const response = await axios.get(url);
        const apps = response.data.items;

        if (apps.length > 0) {
            return apps[0].id; // Return the first result's App ID
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error fetching App ID from Steam Store API:', error);
        return null;
    }
}

// Upload file to Gofile and get the download link
async function uploadToGofile(filePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
        const response = await axios.post('https://api.gofile.io/uploadFile', form, {
            headers: {
                ...form.getHeaders()
            }
        });

        if (response.data.status === 'ok') {
            return response.data.data.downloadPage; // Return the download link
        } else {
            console.error('Error uploading file to Gofile:', response.data.message);
            return null;
        }
    } catch (error) {
        console.error('Error uploading file to Gofile:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Cooldown system
const cooldowns = new Map();

function getCooldown(userId) {
    const now = Date.now();
    const cooldown = cooldowns.get(userId);

    if (!cooldown) {
        cooldowns.set(userId, { count: 0, lastUsed: now });
        return 0;
    }

    if (now - cooldown.lastUsed > 24 * 60 * 60 * 1000) {
        cooldown.count = 0;
    }

    return cooldown.count;
}

function updateCooldown(userId) {
    const cooldown = cooldowns.get(userId);
    cooldown.count += 1;
    cooldown.lastUsed = Date.now();
    cooldowns.set(userId, cooldown);
}

// Send log message to the specified user or channel
async function sendLogMessage(interaction, commandName) {
    try {
        const logUser = await client.users.fetch(LOG_USER_ID);
        const logMessage = `User **${interaction.user.tag}** used the **${commandName}** command in guild **${interaction.guild.name}**.`;
        await logUser.send(logMessage);
    } catch (error) {
        console.error('Error sending log message:', error);
    }
}

// Send request message to the specified user or channel
async function sendRequestMessage(interaction, appId, gameName) {
    try {
        const requestUser = await client.users.fetch(REQUEST_USER_ID);
        const requestMessage = `User **${interaction.user.tag}** requested the game **${gameName}** with App ID **${appId}**.`;
        await requestUser.send(requestMessage);
    } catch (error) {
        console.error('Error sending request message:', error);
    }
}

// Slash command handling
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    console.log(`Received command in guild: ${interaction.guildId}`);

    // Check if the server is an allowed one
    if (!ALLOWED_GUILDS.includes(interaction.guildId)) {
        const redirectEmbed = new EmbedBuilder()
            .setTitle('❌ Access Denied')
            .setDescription('Please join one of these servers to use the bot:\n\n' +
                '[AlinaHub](https://discord.gg/HdJnNDHkPd)\n[GameTube](https://discord.gg/game-tube-1259592689473818645)')
            .setColor(0xFF0000);

        await interaction.reply({ embeds: [redirectEmbed], ephemeral: true });
        return;
    }

    // Check if the interaction is in one of the allowed channels
    if (!ALLOWED_CHANNEL_IDS.includes(interaction.channelId)) {
        await interaction.reply({ content: '❌ This bot can only be used in the allowed channels.', ephemeral: true });
        return;
    }

    // Check if the user is blacklisted
    if (BLACKLISTED_USERS.includes(interaction.user.id)) {
        await interaction.reply({ content: '❌ You are blacklisted from using this bot.', ephemeral: true });
        return;
    }

    // Send log message to the specified user or channel
    await sendLogMessage(interaction, interaction.commandName);

    if (interaction.commandName === 'get_file') {
        await interaction.reply({ content: 'Processing your request...', ephemeral: true }); // Instant response

        try {
            const appId = interaction.options.getString('appid');
            const filePath = FILES[appId];

            console.log(`Received appId: ${appId}`);

            if (!filePath || !fs.existsSync(filePath)) {
                console.error(`File not found for App ID: ${appId}`);
                await interaction.followUp({ content: `Game Not Found In GameTube's DataBase`, ephemeral: false });
                return;
            }

            // Fetch game data from Steam Store API
            const gameData = await getGameData(appId);

            if (!gameData) {
                await interaction.followUp({ content: `❌ Could not fetch game data for App ID: **${appId}**`, ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(`✨ **${gameData.name}** ✨`)
                .setImage(gameData.imageUrl)
                .setColor(0xFFB6C1) // Light pink color
                .setFooter({ text: '✨ Best bot! ✨' })
                .addFields({
                    name: '___🎮 Name 🎮___',  // Simulate underlined title for Name
                    value: `**${gameData.name}**`,
                    inline: false
                })
                .addFields({
                    name: '___📜 Description 📜___',  // Simulate underlined title for Description
                    value: gameData.description,
                    inline: false
                })
                .addFields({
                    name: '___📅 Game Information 📅___',  // Simulate underlined title for Game Info
                    value: `**Release Date**: ${gameData.releaseDate}\n**App ID**: ${gameData.appId}`,
                    inline: false
                })
                .addFields({
                    name: '\u200B',  // Empty field for spacing
                    value: '\u200B',
                    inline: false
                })
                .addFields({
                    name: '___👩‍💻 Creator 👩‍💻___',  // Simulate underlined title for Creator
                    value: 'Made by Alina💓💓',
                    inline: false
                })
                .addFields({
                    name: '\u200B',  // Empty field for spacing
                    value: 'Enjoy the game and file download!',
                    inline: false
                });

            // Send the embed first
            await interaction.followUp({
                embeds: [embed],  // Embed containing the game data
                ephemeral: true
            });

            // Check file size and decide whether to upload to Gofile
            const fileSizeInBytes = fs.statSync(filePath).size;
            const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

            // Check user roles and cooldown
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isBooster = member.roles.cache.some(role => role.name === 'BOOSTERS');
            const isMember = member.roles.cache.some(role => role.name === 'MEMBERS');

            if (!isBooster && isMember) {
                const currentCount = getCooldown(interaction.user.id);
                if (currentCount >= 5) {
                    await interaction.followUp({
                        content: '❌ You have reached the daily limit of 5 files. Please try again later.',
                        ephemeral: true
                    });
                    return;
                }
            }

            if (fileSizeInMB > 8) { // Discord file size limit is 8MB
                const gofileLink = await uploadToGofile(filePath);
                if (gofileLink) {
                    await interaction.followUp({
                        content: `File is too large. Download it from Gofile: ${gofileLink}`,
                        ephemeral: true
                    });
                    await interaction.followUp({ content: `Game Found In GameTube's DataBase`, ephemeral: false });
                    if (!isBooster && isMember) {
                        updateCooldown(interaction.user.id);
                    }
                } else {
                    await interaction.followUp({
                        content: '❌ Failed to upload the file to Gofile.',
                        ephemeral: true
                    });
                }
            } else {
                // Send the file directly
                await interaction.followUp({
                    files: [{ attachment: filePath, name: path.basename(filePath) }],  // File attachment
                    ephemeral: true
                });
                await interaction.followUp({ content: `Game Found In GameTube's DataBase`, ephemeral: false });
                if (!isBooster && isMember) {
                    updateCooldown(interaction.user.id);
                }
            }

        } catch (err) {
            console.error(`Failed to send file for App ID: ${appId}, error: ${err}`);
            await interaction.followUp({ content: '❌ Failed to retrieve the file.', ephemeral: true });
        }
    } else if (interaction.commandName === 'gamelist') {
        await interaction.reply({ content: 'Fetching game list...', ephemeral: true }); // Instant response

        try {
            const gameIds = Object.keys(FILES);
            const gameEmbeds = [];

            console.log(`Processing game list for ${gameIds.length} games.`);

            for (const appId of gameIds) {
                let gameAppId = appId;
                if (isNaN(appId)) {
                    // Extract game name and fetch App ID
                    const gameNameMatch = appId.match(/(.+)\s*\(\d+\)/);
                    const gameName = gameNameMatch ? gameNameMatch[1] : appId;
                    gameAppId = await fetchAppIdByName(gameName);
                }

                const gameData = await getGameData(gameAppId);
                if (gameData) {
                    const embed = new EmbedBuilder()
                        .setTitle(`${gameData.name} (${gameAppId})`)
                        .setThumbnail(gameData.imageUrl) // Set the game's image as the thumbnail
                        .setColor(0xFFB6C1); // Light pink color

                    gameEmbeds.push(embed);
                }
            }

            console.log(`Finished processing game list. Sending ${gameEmbeds.length} embeds.`);

            // Send all game embeds in one message
            await interaction.followUp({ embeds: gameEmbeds });
        } catch (err) {
            console.error('Error processing gamelist command:', err);
            await interaction.followUp({ content: '❌ Failed to retrieve the game list.', ephemeral: true });
        }
    } else if (interaction.commandName === 'request') {
        const appId = interaction.options.getString('appid');
        const gameName = interaction.options.getString('gamename');

        // Send request message to the specified user or channel
        await sendRequestMessage(interaction, appId, gameName);

        await interaction.reply({ content: `Request for the game **${gameName}** with App ID **${appId}** has been sent.`, ephemeral: true });
    }
});

// Handle button interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'search_game') {
        const modal = new ModalBuilder()
            .setCustomId('game_search_modal')
            .setTitle('Search for a Game');

        const gameNameInput = new TextInputBuilder()
            .setCustomId('gameNameInput')
            .setLabel('Enter the name of the game')
            .setStyle(TextInputStyle.Short);

        const actionRow = new ActionRowBuilder().addComponents(gameNameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    }
});

// Handle modal submissions
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId === 'game_search_modal') {
        await interaction.reply({ content: 'Searching for games...', ephemeral: true }); // Instant response

        try {
            const gameName = interaction.fields.getTextInputValue('gameNameInput');
            const gameIds = Object.keys(FILES);
            const matchingGames = [];

            for (const appId of gameIds) {
                let gameAppId = appId;
                if (isNaN(appId)) {
                    // Extract game name and fetch App ID
                    const gameNameMatch = appId.match(/(.+)\s*\(\d+\)/);
                    const gameNameFromFile = gameNameMatch ? gameNameMatch[1] : appId;
                    gameAppId = await fetchAppIdByName(gameNameFromFile);
                }

                const gameData = await getGameData(gameAppId);
                if (gameData && gameData.name.toLowerCase().includes(gameName.toLowerCase())) {
                    matchingGames.push(gameData.name);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('✨ Search Results ✨')
                .setDescription(matchingGames.length > 0 ? matchingGames.join('\n') : 'No matching games found.')
                .setColor(0xFFB6C1) // Light pink color
                .setFooter({ text: '✨ Best Bot! ✨' });

            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error('Error processing game search:', err);
            await interaction.followUp({ content: '❌ Failed to search for games.', ephemeral: true });
        }
    }
});

// Login the bot
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
});

client.login(TOKEN);
