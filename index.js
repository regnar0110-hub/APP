const { GatewayIntentBits } = require('discord.js');
const {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputStyle,
  TextInputBuilder,
  ApplicationCommandOptionType
} = require('discord.js');
const { PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const ms = require('ms');
const config = require('./config.json');
const express = require("express");
require('dotenv').config();

// Initialize Express server for 24/7 uptime
const app = express();
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.get('/', (_, res) => {
  res.send('<center><h1>Bot 24H ON!</h1></center>');
});

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Connect to MongoDB
mongoose.connect(process.env.DB, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Define Mongoose schemas and models
const serverSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  staffroom: { type: String, default: "" },
  roles: { type: [String], default: [] },
  staffid: { type: [String], default: [] },
  logChannelId: { type: String, default: "" }
});

const statsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  totalApplications: { type: Number, default: 0 },
  acceptedApplications: { type: Number, default: 0 },
  rejectedApplications: { type: Number, default: 0 },
  blockedUsers: { type: Number, default: 0 }
});

const applicationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  applications: [{
    timestamp: { type: Date, default: Date.now },
    q1: String,
    q2: String,
    q3: String,
    q4: String,
    q5: String
  }],
  lastApplicationTime: { type: Date, default: Date.now },
  lastStatus: { type: String, default: null }
});

const blocklistSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true }
});
const tempSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  staffroom: { type: String, default: "" },
  roles: { type: [String], default: [] },
  staffid: { type: [String], default: [] },
  logChannelId: { type: String, default: "" }
});
const ServerSettings = mongoose.model('ServerSettings', serverSettingsSchema);
const Stats = mongoose.model('Stats', statsSchema);
const Application = mongoose.model('Application', applicationSchema);
const Blocklist = mongoose.model('Blocklist', blocklistSchema);
const TempSettings = mongoose.model('TempSettings', tempSettingsSchema);

// Log system utility
const logSystem = {
  sendLog: async (guild, content, color = '#0099ff') => {
    try {
      const serverSettings = await ServerSettings.findOne({ guildId: guild.id });
      if (!serverSettings || !serverSettings.logChannelId) return;
      
      const logChannel = guild.channels.cache.get(serverSettings.logChannelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setDescription(content)
        .setColor(color)
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error sending log:', error);
    }
  }
};

// Permission checker utility
const hasPermission = async (member) => {
  try {
    const serverSettings = await ServerSettings.findOne({ guildId: member.guild.id });
    
    // If no settings or roles, only allow administrators
    if (!serverSettings || !serverSettings.roles || serverSettings.roles.length === 0) {
      return member.permissions.has(PermissionsBitField.Flags.Administrator);
    }

    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.roles.cache.some(role => serverSettings.roles.includes(role.id));
  } catch (error) {
    console.error('Error checking permissions:', error);
    // Fallback to admin only
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  }
};

// Helper to check if user is blocked
const isUserBlocked = async (guildId, userId) => {
  const blockedUser = await Blocklist.findOne({ guildId, userId });
  return !!blockedUser;
};

// Stats utility functions
const updateStats = async (guildId, field, increment = 1) => {
  await Stats.findOneAndUpdate(
    { guildId },
    { $inc: { [field]: increment } },
    { upsert: true, new: true }
  );
};

// Bot ready event
client.on('ready', async () => {
  const { REST, Routes } = require('discord.js');
  const commands = [
    {
      name: 'setup',
      description: 'إعداد نظام التقديم',
    },
    {
      name: "block",
      description: "حظر مستخدم من استخدام نظام التقديم",
      options: [
        {
          name: "user",
          description: "المستخدم المراد حظره",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
    {
      name: "remove-block",
      description: "إزالة الحظر عن مستخدم",
      options: [
        {
          name: "user",
          description: "المستخدم المراد إزالة الحظر عنه",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
    {
      name: "stats",
      description: "عرض إحصائيات التقديمات",
    },
    {
      name: "check-user",
      description: "التحقق من معلومات تقديم مستخدم",
      options: [
        {
          name: "user",
          description: "المستخدم المراد التحقق منه",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
    {
      name: "clear-cooldown",
      description: "إزالة وقت الانتظار عن مستخدم للتقديم مرة أخرى",
      options: [
        {
          name: "user",
          description: "المستخدم المراد إزالة وقت الانتظار عنه",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
  ];

  try {
    console.log('بدء تحديث أوامر التطبيق (/)');
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('تم تحديث أوامر التطبيق بنجاح');
    
    console.log(`تم تسجيل الدخول كـ ${client.user.tag}!`);
    
    // Send startup log to all guilds
    for (const guild of client.guilds.cache.values()) {
      logSystem.sendLog(guild, `تم تشغيل البوت بنجاح! ${client.user.tag}`, '#00ff00');
    }
  } catch (error) {
    console.error('Error during startup:', error);
  }
});

// Command handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case 'block': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const member = interaction.options.getMember('user');
      if (!member) {
        return interaction.reply({ content: 'منشن شخص لـ حظره من الامر', ephemeral: true });
      }

      const isBlocked = await isUserBlocked(interaction.guild.id, member.id);
      if (isBlocked) {
        return interaction.reply({ content: 'هذا الشخص محظور بالفعل!', ephemeral: true });
      }

      const newBlock = new Blocklist({ guildId: interaction.guild.id, userId: member.id });
      await newBlock.save();
      
      await updateStats(interaction.guild.id, 'blockedUsers');

      await interaction.reply({ content: `تم حظر ${member.user.tag} من استخدام نظام التقديم.`, ephemeral: true });
      await logSystem.sendLog(interaction.guild, `تم حظر ${member.user.tag} (${member.id}) من نظام التقديم بواسطة ${interaction.user.tag}`, '#ff0000');
      break;
    }

    case 'remove-block': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const userToRemove = interaction.options.getMember('user');
      if (!userToRemove) {
        return interaction.reply({ content: 'منشن شخص لإزالة الحظر منه', ephemeral: true });
      }

      const removed = await Blocklist.findOneAndDelete({ 
        guildId: interaction.guild.id, 
        userId: userToRemove.id 
      });

      if (removed) {
        await interaction.reply({ content: `تم إزالة الحظر عن ${userToRemove.user.tag} بنجاح.`, ephemeral: true });
        await logSystem.sendLog(interaction.guild, `تم إزالة الحظر عن ${userToRemove.user.tag} (${userToRemove.id}) بواسطة ${interaction.user.tag}`, '#00ff00');
      } else {
        await interaction.reply({ content: `${userToRemove.user.tag} ليس محظورًا.`, ephemeral: true });
      }
      break;
    }

    case 'stats': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      let stats = await Stats.findOne({ guildId: interaction.guild.id }) || { 
        totalApplications: 0, 
        acceptedApplications: 0, 
        rejectedApplications: 0, 
        blockedUsers: 0 
      };

      const blockedCount = await Blocklist.countDocuments({ guildId: interaction.guild.id });

      const statsEmbed = new EmbedBuilder()
        .setTitle('📊 إحصائيات نظام التقديم')
        .setColor(config.embedcolor)
        .addFields(
          { name: 'إجمالي التقديمات', value: `${stats.totalApplications || 0}`, inline: true },
          { name: 'التقديمات المقبولة', value: `${stats.acceptedApplications || 0}`, inline: true },
          { name: 'التقديمات المرفوضة', value: `${stats.rejectedApplications || 0}`, inline: true },
          { name: 'المستخدمين المحظورين', value: `${blockedCount || 0}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
      break;
    }

    case 'check-user': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const user = interaction.options.getUser('user');
      if (!user) {
        return interaction.reply({ content: 'يرجى تحديد مستخدم للتحقق من معلوماته', ephemeral: true });
      }

      const userInfo = await Application.findOne({ userId: user.id });
      const isBlocked = await isUserBlocked(interaction.guild.id, user.id);

      const infoEmbed = new EmbedBuilder()
        .setTitle(`معلومات المستخدم: ${user.tag}`)
        .setColor(config.embedcolor)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'الحالة', value: isBlocked ? '🚫 محظور من التقديم' : '✅ غير محظور', inline: true }
        )
        .setTimestamp();

      if (userInfo) {
        infoEmbed.addFields(
          { name: 'عدد التقديمات', value: `${userInfo.applications.length}`, inline: true },
          { name: 'آخر تقديم', value: `<t:${Math.floor(userInfo.lastApplicationTime.getTime() / 1000)}:R>`, inline: true },
          { name: 'الحالة الأخيرة', value: userInfo.lastStatus || 'غير معروفة', inline: true }
        );
      } else {
        infoEmbed.addFields(
          { name: 'التقديمات', value: 'لم يقم بالتقديم من قبل', inline: true }
        );
      }

      await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      break;
    }

    case 'clear-cooldown': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const user = interaction.options.getUser('user');
      if (!user) {
        return interaction.reply({ content: 'يرجى تحديد مستخدم لإزالة وقت الانتظار عنه', ephemeral: true });
      }

      const result = await Application.findOneAndUpdate(
        { userId: user.id },
        { $set: { lastApplicationTime: new Date(0) } },
        { new: true }
      );

      if (result) {
        await interaction.reply({ content: `تم إزالة وقت الانتظار عن ${user.tag} بنجاح. يمكنه التقديم مرة أخرى الآن.`, ephemeral: true });
        await logSystem.sendLog(interaction.guild, `تم إزالة وقت الانتظار عن ${user.tag} (${user.id}) بواسطة ${interaction.user.tag}`, '#00ffff');
      } else {
        await interaction.reply({ content: `${user.tag} لم يقم بالتقديم من قبل.`, ephemeral: true });
      }
      break;
    }

    case 'setup': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true});
      }
      
      const setupRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('setup_channel_select')
            .setLabel('تحديد روم الإدارة')
            .setStyle(ButtonStyle.Primary)
        );
      
      await interaction.reply({
        content: 'مرحبًا بك في إعداد نظام التقديم. يرجى النقر على الزر أدناه لبدء عملية الإعداد.',
        components: [setupRow],
        ephemeral: true
      });
      break;
    }
  }
});

// Setup process handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  if (interaction.customId === 'setup_channel_select') {
      const modal = new ModalBuilder()
        .setCustomId('setup_admin_channel_modal')
        .setTitle('تحديد روم الإدارة');
      
      const channelInput = new TextInputBuilder()
        .setCustomId('admin_channel_id')
        .setLabel('أدخل معرف روم الإدارة (ID)')
        .setPlaceholder('مثال: 123456789012345678')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'setup_next_admin_roles') {

      const modal = new ModalBuilder()
        .setCustomId('setup_admin_roles_modal')
        .setTitle('تحديد الرتب الإدارية');
      
      const rolesInput = new TextInputBuilder()
        .setCustomId('admin_roles_ids')
        .setLabel('أدخل معرفات الرتب مفصولة بفواصل')
        .setPlaceholder('مثال: 123456789,987654321')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'setup_next_staff_roles') {

      const modal = new ModalBuilder()
        .setCustomId('setup_staff_roles_modal')
        .setTitle('تحديد رتب المقبولين');
      
      const rolesInput = new TextInputBuilder()
        .setCustomId('staff_roles_ids')
        .setLabel('أدخل معرفات الرتب مفصولة بفواصل')
        .setPlaceholder('مثال: 123456789,987654321')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'setup_next_log_channel') {

      const modal = new ModalBuilder()
        .setCustomId('setup_log_channel_modal')
        .setTitle('تحديد روم اللوق');
      
      const channelInput = new TextInputBuilder()
        .setCustomId('log_channel_id')
        .setLabel('أدخل معرف روم اللوق (ID)')
        .setPlaceholder('مثال: 123456789012345678')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'complete_setup') {
      try {
        // Retrieve temporary settings from MongoDB
        const tempSettings = await TempSettings.findOne({ guildId: interaction.guild.id });

        
        if (!tempSettings) {
          return interaction.update({
            content: 'لم يتم العثور على إعدادات مؤقتة. يرجى إعادة بدء عملية الإعداد.',
            components: []
          });
        }
        
        // Save to permanent settings
        await ServerSettings.findOneAndUpdate(
          { guildId: interaction.guild.id },
          {
            staffroom: tempSettings.staffroom,
            roles: tempSettings.roles,
            staffid: tempSettings.staffid,
            logChannelId: tempSettings.logChannelId
          },
          { upsert: true }
        );
        
        // Create application button
        const embed = new EmbedBuilder()
          .setTitle(config.title)
          .setDescription('أضـغـط فـي الاسـفـل للتقـديـم')
          .setColor(config.embedcolor);
        
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Success)
              .setLabel(config.title)
              .setCustomId('apply')
          );
        
        await interaction.channel.send({
          embeds: [embed],
          components: [row]
        });
        
        await interaction.update({
          content: 'تم إعداد نظام التقديم بنجاح! تم حفظ جميع الإعدادات وإنشاء زر التقديم.',
          components: []
        });
        
        // Send log
        const logChannel = interaction.guild.channels.cache.get(tempSettings.logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setDescription(`تم إعداد نظام التقديم في القناة ${interaction.channel} بواسطة ${interaction.user.tag}`)
            .setColor('#00ff00')
            .setTimestamp();
          
          await logChannel.send({ embeds: [logEmbed] });
        }
        
        await TempSettings.deleteOne({ guildId: interaction.guild.id });
      } catch (error) {
        console.error('Error completing setup:', error);
        await interaction.update({
          content: 'حدث خطأ أثناء إكمال الإعداد. يرجى المحاولة مرة أخرى.',
          components: []
        });
      }
    }
    if (interaction.customId === 'apply') {

      const isBlocked = await isUserBlocked(interaction.guild.id, interaction.user.id);
      if (isBlocked) {
        await interaction.reply({ content: 'أنت محظور من التقديم ولا يمكنك التقديم أبدًا.', ephemeral: true });
        return;
      }

      const userInfo = await Application.findOne({ userId: interaction.user.id }) || 
        { applications: [], lastApplicationTime: new Date(0), lastStatus: null };
      
      const cooldownTime = ms(config.applicationCooldown) || 86400000;
      const timeRemaining = new Date(userInfo.lastApplicationTime).getTime() + cooldownTime - Date.now();

      if (timeRemaining > 0) {
        const hours = Math.floor(timeRemaining / 3600000);
        const minutes = Math.floor((timeRemaining % 3600000) / 60000);
        await interaction.reply({
          content: `لا يمكنك التقديم الآن. يجب الانتظار ${hours} ساعة و ${minutes} دقيقة قبل التقديم مرة أخرى.`,
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setTitle('التـقديـم لللأدارة')
        .setCustomId('staff_apply');

      const nameComponent = new TextInputBuilder()
        .setCustomId('q1')
        .setLabel(`${config.q1}`)
        .setMinLength(2)
        .setMaxLength(25)
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const ageComponent = new TextInputBuilder()
        .setCustomId('q2')
        .setLabel(`${config.q2}`)
        .setMinLength(1)
        .setMaxLength(2)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const whyYou = new TextInputBuilder()
        .setCustomId(`q3`)
        .setLabel(`${config.q3}`)
        .setMinLength(2)
        .setMaxLength(120)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const q4 = new TextInputBuilder()
        .setCustomId('q4')
        .setLabel(`${config.q4}`)
        .setMaxLength(400)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const q5 = new TextInputBuilder()
        .setCustomId('q5')
        .setLabel(`${config.q5}`)
        .setMaxLength(400)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const rows = [nameComponent, ageComponent, whyYou, q4, q5].map(
        (component) => new ActionRowBuilder().addComponents(component)
      );

      modal.addComponents(...rows);
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'staff_accept') {

      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const getIdFromFooter = interaction.message.embeds[0].footer.text;
      const getMember = await interaction.guild.members.fetch(getIdFromFooter);

      try {
        await getMember.send('ألف مبروك! تمت الموافقة على تقديمك.');

        // Update application status
        await Application.findOneAndUpdate(
          { userId: getMember.id },
          { 
            $set: { lastStatus: 'مقبول' },
            $setOnInsert: { 
              applications: [],
              lastApplicationTime: new Date()
            }
          },
          { upsert: true }
        );

        // Update stats
        await updateStats(interaction.guild.id, 'acceptedApplications');

        // Add roles
        const serverSettings = await ServerSettings.findOne({ guildId: interaction.guild.id });
        if (serverSettings && serverSettings.staffid) {
          for (const roleId of serverSettings.staffid) {
            await getMember.roles.add(roleId).catch(console.error);
          }
        }

        await interaction.reply({
          content: `${config.yesmessage} ${getMember.user.tag}`
        });
        
        // Disable buttons
        const newDisabledRow = new ActionRowBuilder()
          .setComponents(
            new ButtonBuilder()
              .setCustomId('staff_accept_ended')
              .setDisabled(true)
              .setStyle(ButtonStyle.Success)
              .setEmoji("✅")
              .setLabel('قبول')
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId('staff_deny_ended')
              .setDisabled(true)
              .setEmoji("❌")
              .setStyle(ButtonStyle.Secondary)
              .setLabel('رفض')
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId('staff_block_ended')
              .setDisabled(true)
              .setEmoji("🚫")
              .setStyle(ButtonStyle.Danger)
              .setLabel('حظر')
          );

        await interaction.message.edit({ components: [newDisabledRow] });
        await logSystem.sendLog(
          interaction.guild,
          `✅ تم قبول تقديم ${getMember.user} (${getMember.id}) بواسطة ${interaction.user}`,
          '#00ff00'
        );
      } catch (error) {
        console.error('Error:', error);
        await interaction.reply({
          content: "حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى لاحقًا.",
          ephemeral: true
        });
      }
    }
    if (interaction.customId === 'staff_deny') {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const getIdFromFooter = interaction.message.embeds[0].footer?.text;
      const getMember = await interaction.guild.members.fetch(getIdFromFooter);

      try {
        await getMember.send('للأسف، تم رفض طلبك. نتمنى لك حظًا أفضل في المرة القادمة.');

        // Update application status
        await Application.findOneAndUpdate(
          { userId: getMember.id },
          { 
            $set: { lastStatus: 'مرفوض' },
            $setOnInsert: { 
              applications: [],
              lastApplicationTime: new Date()
            }
          },
          { upsert: true }
        );

        // Update stats
        await updateStats(interaction.guild.id, 'rejectedApplications');

        await interaction.reply({
          content: `${config.nomessage} ${getMember.user}`
        });

        // Disable buttons
        const newDisabledRow = new ActionRowBuilder()
          .setComponents(
            new ButtonBuilder()
              .setCustomId('staff_accept_ended')
              .setDisabled(true)
              .setStyle(ButtonStyle.Success)
              .setEmoji("✅")
              .setLabel('قبول')
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId('staff_deny_ended')
              .setDisabled(true)
              .setEmoji("❌")
              .setStyle(ButtonStyle.Secondary)
              .setLabel('رفض')
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId('staff_block_ended')
              .setDisabled(true)
              .setEmoji("🚫")
              .setStyle(ButtonStyle.Danger)
              .setLabel('حظر')
          );

        await interaction.message.edit({ components: [newDisabledRow] });

        await logSystem.sendLog(
          interaction.guild,
          `❌ تم رفض تقديم ${getMember.user} (${getMember.id}) بواسطة ${interaction.user}`,
          '#ff0000'
        );
      } catch (error) {
        console.error('Error:', error);
        await interaction.reply({
          content: "حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى لاحقًا.",
          ephemeral: true
        });
      }
      }
      if (interaction.customId === 'staff_block') {
        if (!await hasPermission(interaction.member)) {
    return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
  }
  
  const getIdFromFooter = interaction.message.embeds[0].footer?.text;
  const getMember = await interaction.guild.members.fetch(getIdFromFooter);

  // Check if user is already blocked
  const isBlocked = await isUserBlocked(interaction.guild.id, getMember.id);
  if (isBlocked) {
    return interaction.reply({ content: 'هذا المستخدم موجود بالفعل في قائمة الحظر.', ephemeral: true });
  }

  try {
    // Add user to blocklist
    const newBlock = new Blocklist({ guildId: interaction.guild.id, userId: getMember.id });
    await newBlock.save();

    // Update application status
    await Application.findOneAndUpdate(
      { userId: getMember.id },
      { 
        $set: { lastStatus: 'محظور' },
        $setOnInsert: { 
          applications: [],
          lastApplicationTime: new Date()
        }
      },
      { upsert: true }
    );

    // Update stats
    await updateStats(interaction.guild.id, 'blockedUsers');

    await interaction.reply({
      content: `تم حظر ${getMember.user} من التقديم بشكل كامل`
    });

    // Disable buttons
    const newDisabledRow = new ActionRowBuilder()
      .setComponents(
        new ButtonBuilder()
          .setCustomId('staff_accept_ended')
          .setDisabled(true)
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅")
          .setLabel('قبول')
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId('staff_deny_ended')
          .setDisabled(true)
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary)
          .setLabel('رفض')
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId('staff_block_ended')
          .setDisabled(true)
          .setEmoji("🚫")
          .setStyle(ButtonStyle.Danger)
          .setLabel('حظر')
      );

    await interaction.message.edit({ components: [newDisabledRow] });

    await logSystem.sendLog(
      interaction.guild,
      `🚫 تم حظر ${getMember.user} (${getMember.id}) من نظام التقديم بواسطة ${interaction.user.tag}`,
      '#ff0000'
    );

    try {
      await getMember.send('تم حظرك من نظام التقديم بسبب مخالفة القوانين.');
    } catch (dmError) {
      console.log(`لم يتمكن من إرسال رسالة إلى ${getMember.user.tag}`);
    }
  } catch (error) {
    console.error('Error:', error);
    await interaction.reply({
      content: "حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى لاحقًا.",
      ephemeral: true
    });
  }
  }
});

// Modal submit handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  switch (interaction.customId) {
    case 'setup_admin_channel_modal': {
      try {
        const channelId = interaction.fields.getTextInputValue('admin_channel_id');
        const channel = interaction.guild.channels.cache.get(channelId);
        
        if (!channel) {
          return interaction.reply({
            content: 'لم يتم العثور على الروم المحدد. يرجى التأكد من المعرف وإعادة المحاولة.',
            ephemeral: true
          });
        }
        
        // Save to temporary settings
        await TempSettings.findOneAndUpdate(
          { guildId: interaction.guild.id },
          { $set: { staffroom: channelId } },
          { upsert: true, new: true }
        );
        
        const nextRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('setup_next_admin_roles')
              .setLabel('تعيين الرتب الإدارية')
              .setStyle(ButtonStyle.Primary)
          );
        
        await interaction.reply({
          content: `تم تعيين روم الإدارة: ${channel}. الآن، قم بتعيين الرتب الإدارية.`,
          components: [nextRow],
          ephemeral: true
        });
      } catch (error) {
        console.error('Error in setup modal:', error);
        await interaction.reply({
          content: 'حدث خطأ أثناء معالجة البيانات. يرجى المحاولة مرة أخرى.',
          ephemeral: true
        });
      }
      break;
    }
    
    case 'setup_admin_roles_modal': {
      try {
        const rolesInput = interaction.fields.getTextInputValue('admin_roles_ids');
        const roleIds = rolesInput.split(',').map(id => id.trim());
        
        // Validate roles
        const invalidRoles = [];
        const validRoles = [];
        
        for (const roleId of roleIds) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (!role && roleId) {
            invalidRoles.push(roleId);
          } else if (role) {
            validRoles.push(roleId);
          }
        }
        
        if (invalidRoles.length > 0) {
          await interaction.reply({
            content: `تحذير: بعض الرتب غير موجودة: ${invalidRoles.join(', ')}. تم حفظ الرتب الصالحة فقط.`,
            ephemeral: true
          });
        }
        
        // Save to temporary settings
        await TempSettings.findOneAndUpdate(
          { guildId: interaction.guild.id },
          { $set: { roles: validRoles } },
          { upsert: true, new: true }
        );
        
        const nextRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('setup_next_staff_roles')
              .setLabel('تعيين رتب المقبولين')
              .setStyle(ButtonStyle.Primary)
          );
        
        await interaction.reply({
          content: `تم تعيين ${validRoles.length} رتبة إدارية بنجاح. الآن، قم بتعيين رتب المقبولين.`,
          components: [nextRow],
          ephemeral: true
        });
      } catch (error) {
        console.error('Error in setup modal:', error);
        await interaction.reply({
          content: 'حدث خطأ أثناء معالجة البيانات. يرجى المحاولة مرة أخرى.',
          ephemeral: true
        });
      }
      break;
    }
    
    case 'setup_staff_roles_modal': {
      try {
        const rolesInput = interaction.fields.getTextInputValue('staff_roles_ids');
        const roleIds = rolesInput.split(',').map(id => id.trim());
        
        // Validate roles
        const invalidRoles = [];
        const validRoles = [];
        
        for (const roleId of roleIds) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (!role && roleId) {
            invalidRoles.push(roleId);
          } else if (role) {
            validRoles.push(roleId);
          }
        }
        
        if (invalidRoles.length > 0) {
          await interaction.reply({
            content: `تحذير: بعض الرتب غير موجودة: ${invalidRoles.join(', ')}. تم حفظ الرتب الصالحة فقط.`,
            ephemeral: true
          });
        }
        
        // Save to temporary settings
        await TempSettings.findOneAndUpdate(
          { guildId: interaction.guild.id },
          { $set: { staffid: validRoles } },
          { upsert: true, new: true }
        );
        
        const nextRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('setup_next_log_channel')
              .setLabel('تعيين روم اللوق')
              .setStyle(ButtonStyle.Primary)
          );
        
        await interaction.reply({
          content: `تم تعيين ${validRoles.length} رتبة للمقبولين بنجاح. الآن، قم بتعيين روم اللوق.`,
          components: [nextRow],
          ephemeral: true
        });
      } catch (error) {
        console.error('Error in setup modal:', error);
        await interaction.reply({
          content: 'حدث خطأ أثناء معالجة البيانات. يرجى المحاولة مرة أخرى.',
          ephemeral: true
        });
      }
      break;
    }
    
    case 'setup_log_channel_modal': {
      try {
        const channelId = interaction.fields.getTextInputValue('log_channel_id');
        const channel = interaction.guild.channels.cache.get(channelId);
        
        if (!channel) {
          return interaction.reply({
            content: 'لم يتم العثور على الروم المحدد. يرجى التأكد من المعرف وإعادة المحاولة.',
            ephemeral: true
          });
        }
        
        // Save to temporary settings
        await TempSettings.findOneAndUpdate(
          { guildId: interaction.guild.id },
          { $set: { logChannelId: channelId } },
          { upsert: true, new: true }
        );
        
        const finalRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('complete_setup')
              .setLabel('إكمال الإعداد')
              .setStyle(ButtonStyle.Success)
          );
        
        await interaction.reply({
          content: `تم تعيين روم اللوق: ${channel}. انقر على الزر أدناه لإكمال الإعداد.`,
          components: [finalRow],
          ephemeral: true
        });
      } catch (error) {
        console.error('Error in setup modal:', error);
        await interaction.reply({
          content: 'حدث خطأ أثناء معالجة البيانات. يرجى المحاولة مرة أخرى.',
          ephemeral: true
        });
      }
      break;
    }
    
    case 'staff_apply': {
      const q1 = interaction.fields.getTextInputValue('q1');
      const q2 = interaction.fields.getTextInputValue('q2');
      const q3 = interaction.fields.getTextInputValue('q3');
      const q4 = interaction.fields.getTextInputValue('q4');
      const q5 = interaction.fields.getTextInputValue('q5');

      try {
        // Add to applications collection
        await Application.findOneAndUpdate(
          { userId: interaction.user.id },
          { 
            $push: { 
              applications: {
                timestamp: new Date(),
                q1, q2, q3, q4, q5
              }
            },
            $set: { 
              lastApplicationTime: new Date(),
              lastStatus: 'قيد المراجعة'
            }
          },
          { upsert: true }
        );

        // Update stats
        await updateStats(interaction.guild.id, 'totalApplications');

        await interaction.reply({
          content: `${config.donesend}`,
          ephemeral: true
        });

        // Get server settings for staff submit channel
        const serverSettings = await ServerSettings.findOne({ guildId: interaction.guild.id });
        if (!serverSettings || !serverSettings.staffroom) {
          console.error('لم يتم العثور على روم المراجعة المحدد في الإعدادات!');
          return;
        }

        const staffSubmitChannel = interaction.guild.channels.cache.get(serverSettings.staffroom);
        if (!staffSubmitChannel) {
          console.error('لم يتم العثور على روم المراجعة المحدد في الإعدادات!');
          return;
        }

        const embed = new EmbedBuilder()
          .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
          .setColor(config.embedcolor)
          .setFooter({ text: interaction.user.id })
          .setTimestamp()
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: `${config.q1}`, value: q1, inline: true },
            { name: `${config.q2}`, value: q2, inline: true },
            { name: `${config.q3}`, value: q3, inline: true },
            { name: `${config.q4}`, value: q4, inline: true },
            { name: `${config.q5}`, value: q5, inline: true }
          );

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('staff_accept')
              .setLabel('قبول')
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success)
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId('staff_deny')
              .setLabel('رفض')
              .setEmoji("❌")
              .setStyle(ButtonStyle.Secondary)
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId('staff_block')
              .setEmoji("🚫")
              .setStyle(ButtonStyle.Danger)
              .setLabel('حظر')
          );

        await staffSubmitChannel.send({
          embeds: [embed],
          components: [row]
        });

        await logSystem.sendLog(
          interaction.guild,
          `📝 تم استلام تقديم جديد من ${interaction.user} (${interaction.user.id})`,
          '#0099ff'
        );
      } catch (error) {
        console.error('Error processing application:', error);
        await interaction.reply({
          content: "حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى لاحقًا.",
          ephemeral: true
        });
      }
      break;
    }
  }
});

client.login(process.env.TOKEN);
