// Import required packages
const { Telegraf } = require('telegraf');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
require('dotenv').config();

// Initialize bot with your Telegram token (stored in .env file)
const bot = new Telegraf(process.env.BOT_TOKEN);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Database simulation (in a production environment, use a real database)
let users = {};
let teams = {};
let pendingVerifications = {};

// File paths for data storage
const usersFilePath = path.join(dataDir, 'users.json');
const teamsFilePath = path.join(dataDir, 'teams.json');

// Function to save data to files
function saveData() {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Function to load data from files
function loadData() {
  try {
    // Load users data if file exists
    if (fs.existsSync(usersFilePath)) {
      const usersData = fs.readFileSync(usersFilePath, 'utf8');
      users = JSON.parse(usersData);
      console.log(`Loaded ${Object.keys(users).length} users from file`);
    }
    
    // Load teams data if file exists
    if (fs.existsSync(teamsFilePath)) {
      const teamsData = fs.readFileSync(teamsFilePath, 'utf8');
      teams = JSON.parse(teamsData);
      console.log(`Loaded ${Object.keys(teams).length} teams from file`);
    }
  } catch (error) {
    console.error('Error loading data:', error);
    // Initialize empty objects if loading fails
    users = {};
    teams = {};
  }
}

// Load data at startup
loadData();

// Save data at periodic intervals (every 5 minutes)
setInterval(saveData, 5 * 60 * 1000);

// Available skills for Salesforce hackathon
const availableSkills = [
  'Apex', 'Lightning Components', 'Visualforce', 
  'SOQL', 'JavaScript', 'HTML/CSS', 'React', 
  'Node.js', 'Integration', 'Einstein Analytics',
  'Admin Configuration', 'Flow Builder'
];

// Bot commands
bot.start((ctx) => {
  ctx.reply(
    `Welcome to the Salesforce TDX25 Hackathon - Hack Buddy Agent! 🚀\n\n` +
    `This bot will help you find the perfect teammates based on skills.\n\n` +
    `Commands:\n` +
    `/register - Create your profile\n` +
    `/skills - Update your skills\n` +
    `/findteammates - Find people with complementary skills\n` +
    `/viewprofile - See your current profile\n` +
    `/createteam - Create a new team\n` +
    `/jointeam - Join an existing team\n` +
    `/verify - Optional: Verify your TDX Registration with a screenshot`
  );
});

// User registration
bot.command('register', (ctx) => {
  const userId = ctx.from.id;
  
  if (users[userId]) {
    return ctx.reply('You are already registered! Use /viewprofile to see your information.');
  }
  
  // Check if user has a username
  if (!ctx.from.username) {
    return ctx.reply(
      `You need to set a Telegram username before registering.\n\n` +
      `To set a username:\n` +
      `1. Go to your Telegram Settings\n` +
      `2. Tap on your profile\n` +
      `3. Tap "Username" and set a username\n` +
      `4. Come back and try /register again`
    );
  }
  
  users[userId] = {
    id: userId,
    name: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ''),
    username: ctx.from.username,
    skills: [],
    teamId: null,
    chatId: ctx.chat.id,
    verified: false,
    verificationBadges: []
  };
  
  // Save data after registration
  saveData();
  
  ctx.reply(
    `Thanks for registering, ${users[userId].name}! 🎉\n\n` +
    `Please add your skills with /skills to complete your profile.\n\n` +
    `You can optionally verify your Salesforce TDX25 Registration later using /verify.`
  );
});

// Screenshot verification process
bot.command('verify', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  pendingVerifications[userId] = true;
  
  ctx.reply(
    `Please send a screenshot of your TDX25 event confirmation email. \n\n` +
    `Please Note:\n` +
    `- Try to capture screenshot right from congratulations keyword. \n` +
    `- Any issues? get in touch with @ArcForceBot for manual verification \n` +
    `The image will be analyzed to verify your Salesforce TDX Registration.\n\n` +
    `Note: Verification is optional but gives you a verification badge that may help you find teammates.`
  );
});

// Handle photo uploads for verification
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId] || !pendingVerifications[userId]) {
    return;
  }
  
  try {
    // Get the highest quality photo
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const fileLink = await ctx.telegram.getFileLink(photoId);
    
    // Download photo
    const response = await axios({
      method: 'GET',
      url: fileLink.href,
      responseType: 'stream'
    });
    
    const fileName = `${userId}_${Date.now()}.jpg`;
    const filePath = path.join(uploadsDir, fileName);
    const writer = fs.createWriteStream(filePath);
    
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    ctx.reply('Processing your verification image... Please wait.');
    
    // Use Tesseract.js for OCR
    const result = await Tesseract.recognize(filePath, 'eng');
    const text = result.data.text.toLowerCase();
    
    // Check for Salesforce-related keywords
    const salesforceKeywords = ['Congratulations,', 'TDX Bengaluru', 'Bangalore International Exhibition Center', 'Madavara', 'Agentblazer', 
                              'Agentforce'];
    
    const foundKeywords = salesforceKeywords.filter(keyword => text.includes(keyword));
    
    if (foundKeywords.length >= 2) {
      users[userId].verified = true;
      users[userId].verificationBadges = foundKeywords;
      
      // Update team verification count if user is in a team
      if (users[userId].teamId) {
        teams[users[userId].teamId].verifiedMembers = 
          (teams[users[userId].teamId].verifiedMembers || 0) + 1;
      }
      
      // Save data after verification
      saveData();
      
      ctx.reply(
        `✅ Verification successful! Thank you for your patience.\n\n` +
        `We detected: ${foundKeywords.join(', ')}\n\n` +
        `Your profile now has a verification badge.`
      );
    } else {
      ctx.reply(
        `❌ Verification unsuccessful. We couldn't detect enough Salesforce-related elements in your image.\n\n` +
        `Try uploading a clearer image with your TDX25 email confirmation details.\n\n` +
        `Use /verify to try again. Remember that verification is optional.`
      );
    }
    
    // Clean up
    delete pendingVerifications[userId];
    fs.unlinkSync(filePath);
    
  } catch (error) {
    console.error('Error processing verification image:', error);
    ctx.reply('There was an error processing your verification image. Please try again with /verify.');
    delete pendingVerifications[userId];
  }
});

// Update skills
bot.command('skills', async (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  // Create inline keyboard with skill options
  const skillButtons = availableSkills.map(skill => ({
    text: users[userId].skills.includes(skill) ? `✅ ${skill}` : skill,
    callback_data: `skill:${skill}`
  }));
  
  // Split buttons into rows of 2
  const keyboard = [];
  for (let i = 0; i < skillButtons.length; i += 2) {
    keyboard.push(skillButtons.slice(i, i + 2));
  }
  
  // Add Done button
  keyboard.push([{ text: 'Done ✓', callback_data: 'skills:done' }]);
  
  await ctx.reply(
    'Select your skills (click again to toggle):', 
    { reply_markup: { inline_keyboard: keyboard } }
  );
});

// Handle skill selection
bot.action(/skill:(.+)/, (ctx) => {
  const userId = ctx.from.id;
  const skill = ctx.match[1];
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  if (users[userId].skills.includes(skill)) {
    // Remove skill if already selected
    users[userId].skills = users[userId].skills.filter(s => s !== skill);
  } else {
    // Add skill if not selected
    users[userId].skills.push(skill);
  }
  
  // Update inline keyboard
  const skillButtons = availableSkills.map(s => ({
    text: users[userId].skills.includes(s) ? `✅ ${s}` : s,
    callback_data: `skill:${s}`
  }));
  
  const keyboard = [];
  for (let i = 0; i < skillButtons.length; i += 2) {
    keyboard.push(skillButtons.slice(i, i + 2));
  }
  
  keyboard.push([{ text: 'Done ✓', callback_data: 'skills:done' }]);
  
  ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
  return ctx.answerCbQuery(`${skill} ${users[userId].skills.includes(skill) ? 'added' : 'removed'}`);
});

// Handle skills done button
bot.action('skills:done', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  // Save data after updating skills
  saveData();
  
  ctx.editMessageText(
    `Skills updated! You selected: ${users[userId].skills.join(', ') || 'None'}\n\n` +
    `Use /findteammates to find potential teammates.`
  );
  
  return ctx.answerCbQuery('Skills saved!');
});

// View profile
bot.command('viewprofile', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  const user = users[userId];
  const teamInfo = user.teamId ? `\nTeam: ${teams[user.teamId].name}` : '\nTeam: Not in a team yet';
  const verificationStatus = user.verified 
    ? `✅ Verified Salesforce User\nExpertise: ${user.verificationBadges.join(', ')}`
    : '❌ Not verified - use /verify if you wish to verify your Salesforce expertise (optional)';
  
  ctx.reply(
    `Your Profile:\n\n` +
    `Name: ${user.name}\n` +
    `Username: @${user.username}\n` +
    `${verificationStatus}\n` +
    `Skills: ${user.skills.join(', ') || 'None added yet'}` +
    teamInfo
  );
});

// Find teammates based on complementary skills
bot.command('findteammates', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  const currentUser = users[userId];
  
  if (currentUser.skills.length === 0) {
    return ctx.reply('Please add your skills first using /skills');
  }
  
  let matches = [];
  
  // Find other users with complementary skills
  Object.values(users).forEach(user => {
    if (user.id === userId) return; // Skip current user
    
    // Skip users already in a full team
    if (user.teamId && teams[user.teamId].members.length >= teams[user.teamId].maxMembers) return;
    
    // Calculate complementary skills (skills the other user has that current user doesn't)
    const complementarySkills = user.skills.filter(skill => !currentUser.skills.includes(skill));
    
    // Enhanced match score that includes verification bonus
    let matchScore = complementarySkills.length * 2;
    
    // Bonus points for verified users
    if (user.verified) matchScore += 3;
    
    if (matchScore > 0) {
      matches.push({
        user,
        complementarySkills,
        matchScore
      });
    }
  });
  
  // Sort matches by score (highest first)
  matches.sort((a, b) => b.matchScore - a.matchScore);
  
  if (matches.length === 0) {
    return ctx.reply('No matching teammates found. Try updating your skills!');
  }
  
  // Display top 5 matches
  let response = 'Top teammate matches for you:\n\n';
  
  matches.slice(0, 5).forEach((match, index) => {
    response += `${index + 1}. ${match.user.name} (@${match.user.username}) ${match.user.verified ? '✅' : ''}\n`;
    response += `   Match score: ${match.matchScore}\n`;
    response += `   Complementary skills: ${match.complementarySkills.join(', ')}\n`;
    
    if (match.user.teamId) {
      response += `   Team: ${teams[match.user.teamId].name}\n`;
    } else {
      response += `   Not in a team yet\n`;
    }
    
    response += '\n';
  });
  
  ctx.reply(response);
});

// Create a team
bot.command('createteam', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  if (users[userId].teamId) {
    return ctx.reply(`You're already in a team (${teams[users[userId].teamId].name}). Leave it first with /leaveteam.`);
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    return ctx.reply('Please specify a team name: /createteam [team name]');
  }
  
  const teamName = args.join(' ');
  const teamId = uuidv4();
  
  teams[teamId] = {
    id: teamId,
    name: teamName,
    founder: userId,
    members: [userId],
    skills: [...users[userId].skills],
    maxMembers: 5,
    created: new Date().toISOString(),
    verifiedMembers: users[userId].verified ? 1 : 0
  };
  
  users[userId].teamId = teamId;
  
  // Save data after team creation
  saveData();
  
  ctx.reply(
    `Team "${teamName}" created successfully! 🎉\n\n` +
    `Team ID: ${teamId}\n\n` +
    `Share this ID with others so they can join using /jointeam ${teamId}\n\n` +
    `Current members: 1/${teams[teamId].maxMembers}`
  );
});

// Join a team
bot.command('jointeam', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  if (users[userId].teamId) {
    return ctx.reply(`You're already in a team (${teams[users[userId].teamId].name}). Leave it first with /leaveteam.`);
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    return ctx.reply('Please specify a team ID: /jointeam [team ID]');
  }
  
  const teamId = args[0];
  
  if (!teams[teamId]) {
    return ctx.reply(`Team with ID ${teamId} not found.`);
  }
  
  if (teams[teamId].members.length >= teams[teamId].maxMembers) {
    return ctx.reply(`Team "${teams[teamId].name}" is already full (${teams[teamId].members.length}/${teams[teamId].maxMembers} members).`);
  }
  
  // Add user to team
  teams[teamId].members.push(userId);
  users[userId].teamId = teamId;
  
  // Update team verification count
  if (users[userId].verified) {
    teams[teamId].verifiedMembers = (teams[teamId].verifiedMembers || 0) + 1;
  }
  
  // Update team skills
  users[userId].skills.forEach(skill => {
    if (!teams[teamId].skills.includes(skill)) {
      teams[teamId].skills.push(skill);
    }
  });
  
  // Save data after joining team
  saveData();
  
  // Notify team founder
  if (userId !== teams[teamId].founder) {
    bot.telegram.sendMessage(
      users[teams[teamId].founder].chatId,
      `${users[userId].name} (@${users[userId].username}) ${users[userId].verified ? '✅' : ''} has joined your team "${teams[teamId].name}"!`
    );
  }
  
  ctx.reply(
    `You've successfully joined team "${teams[teamId].name}"! 🎉\n\n` +
    `Current members: ${teams[teamId].members.length}/${teams[teamId].maxMembers}\n\n` +
    `Use /teaminfo to see details about your team.`
  );
});

// Leave a team
bot.command('leaveteam', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  if (!users[userId].teamId) {
    return ctx.reply(`You're not in a team yet.`);
  }
  
  const teamId = users[userId].teamId;
  const teamName = teams[teamId].name;
  
  // Remove user from team
  teams[teamId].members = teams[teamId].members.filter(memberId => memberId !== userId);
  
  // Update verified members count
  if (users[userId].verified) {
    teams[teamId].verifiedMembers = Math.max(0, (teams[teamId].verifiedMembers || 0) - 1);
  }
  
  // Update team skills
  teams[teamId].skills = [];
  
  teams[teamId].members.forEach(memberId => {
    users[memberId].skills.forEach(skill => {
      if (!teams[teamId].skills.includes(skill)) {
        teams[teamId].skills.push(skill);
      }
    });
  });
  
  // If team is now empty, delete it
  if (teams[teamId].members.length === 0) {
    delete teams[teamId];
    users[userId].teamId = null;
    
    // Save data after team changes
    saveData();
    
    return ctx.reply(`You've left team "${teamName}" and since it's now empty, the team has been disbanded.`);
  }
  
  // If user was founder, transfer ownership
  if (teams[teamId].founder === userId) {
    teams[teamId].founder = teams[teamId].members[0];
    
    // Notify new founder
    bot.telegram.sendMessage(
      users[teams[teamId].founder].chatId,
      `${users[userId].name} has left the team "${teamName}" and you are now the team founder!`
    );
  } else {
    // Notify team founder
    bot.telegram.sendMessage(
      users[teams[teamId].founder].chatId,
      `${users[userId].name} has left your team "${teamName}".`
    );
  }
  
  users[userId].teamId = null;
  
  // Save data after team changes
  saveData();
  
  ctx.reply(`You've successfully left team "${teamName}".`);
});

// List all teams
bot.command('listteams', (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  if (Object.keys(teams).length === 0) {
    return ctx.reply('No teams have been created yet. Be the first with /createteam [team name]!');
  }
  
  let response = 'Available teams:\n\n';
  
  Object.values(teams).forEach((team, index) => {
    response += `${index + 1}. ${team.name} ${team.verifiedMembers > 0 ? '✅' : ''}\n`;
    response += `   ID: ${team.id}\n`;
    response += `   Members: ${team.members.length}/${team.maxMembers}\n`;
    response += `   Verified members: ${team.verifiedMembers || 0}/${team.members.length}\n`;
    response += `   Skills: ${team.skills.join(', ')}\n\n`;
  });
  
  response += `Use /teaminfo [team ID] for more details or /jointeam [team ID] to join.`;
  
  ctx.reply(response);
});

// Get team info
bot.command('teaminfo', async (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  let teamId;
  
  if (args.length === 0) {
    if (!users[userId].teamId) {
      return ctx.reply(`You're not in a team. Use /teaminfo [team ID] to see info about a specific team.`);
    }
    teamId = users[userId].teamId;
  } else {
    teamId = args[0];
  }
  
  if (!teams[teamId]) {
    return ctx.reply(`Team with ID ${teamId} not found.`);
  }
  
  const team = teams[teamId];
  let membersList = '';
  
  team.members.forEach(memberId => {
    const member = users[memberId];
    membersList += `- ${member.name} (@${member.username}) ${member.verified ? '✅' : ''}`;
    if (memberId === team.founder) {
      membersList += ' (Founder)';
    }
    membersList += '\n';
  });
  
  const response = `Team: ${team.name}\n\n` +
    `ID: ${team.id}\n` +
    `Created: ${new Date(team.created).toLocaleString()}\n` +
    `Members (${team.members.length}/${team.maxMembers}):\n${membersList}\n` +
    `Verified members: ${team.verifiedMembers || 0}/${team.members.length}\n` +
    `Skills: ${team.skills.join(', ')}`;
  
  ctx.reply(response);
});

// Export team data as CSV
bot.command('exportteam', async (ctx) => {
  const userId = ctx.from.id;
  
  if (!users[userId]) {
    return ctx.reply('Please register first using /register');
  }
  
  if (!users[userId].teamId) {
    return ctx.reply('You need to be in a team to export team data.');
  }
  
  const teamId = users[userId].teamId;
  const team = teams[teamId];
  
  if (userId !== team.founder) {
    return ctx.reply('Only the team founder can export team data.');
  }
  
  // Create CSV header
  let csv = 'Name,Username,Verified,Skills\n';
  
  // Add team members to CSV
  team.members.forEach(memberId => {
    const member = users[memberId];
    csv += `"${member.name}",@${member.username},${member.verified ? 'Yes' : 'No'},"${member.skills.join('; ')}"\n`;
  });
  
  // Generate CSV file
  const fileName = `team_${team.name.replace(/\s+/g, '_')}_${Date.now()}.csv`;
  const filePath = path.join(uploadsDir, fileName);
  
  fs.writeFileSync(filePath, csv);
  
  // Send CSV file
  await ctx.replyWithDocument({ source: filePath, filename: fileName });
  
  // Clean up
  fs.unlinkSync(filePath);
});

// Start the bot
bot.launch();

// Enable graceful stop with data saving
process.once('SIGINT', () => {
  console.log('Saving data before shutdown...');
  saveData();
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('Saving data before shutdown...');
  saveData();
  bot.stop('SIGTERM');
});

const express = require("express");
const { Telegraf } = require("telegraf");

const app = express();
const port = 3000;

// Keep-Alive Route for UptimeRobot
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(port, () => {
  console.log(`Keep-alive server running on port ${port}`);
});

// Telegram Bot Setup
const bot = new Telegraf("8157582725:AAFlDjpLEmtJEph_O5PIj3adMJZI5KeSftQ");

bot.start((ctx) => ctx.reply("Hello! Bot is alive!"));
bot.launch();
