/**
 * 🛡️ PermissionChecker v5.0
 * - Check if a member has specific Discord permissions
 * - Check roles (by ID or name) with caching
 * - Check if a member is admin, moderator, or has a specific role
 * - Validate channel permissions for the bot
 * - Integrated with logger and eventBus
 */
const { PermissionsBitField } = require('discord.js');

class PermissionChecker {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.eventBus = options.eventBus || null;
    this.roleCache = options.roleCache || new Map(); // guildId -> { roleId -> name, timestamp }
    this.cacheTtl = options.cacheTtl || 60000; // 1 minute
  }

  // 📡 Emit event (if eventBus provided)
  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  // 🔄 Get fresh role cache for a guild
  async _refreshRoleCache(guild) {
    if (!guild) return;
    const roles = guild.roles.cache;
    const cacheMap = new Map();
    roles.forEach(role => {
      cacheMap.set(role.id, { name: role.name, position: role.position });
    });
    this.roleCache.set(guild.id, {
      roles: cacheMap,
      timestamp: Date.now(),
    });
    return cacheMap;
  }

  // 🔍 Get role cache for guild (lazy load)
  async _getRoleCache(guild) {
    if (!guild) return null;
    const cached = this.roleCache.get(guild.id);
    if (!cached || Date.now() - cached.timestamp > this.cacheTtl) {
      return await this._refreshRoleCache(guild);
    }
    return cached.roles;
  }

  /**
   * ✅ Check if a member has a specific Discord permission
   * @param {GuildMember} member - The Discord member
   * @param {bigint|string} permission - Permission flag (e.g., 'Administrator', PermissionsBitField.Flags.KickMembers)
   * @returns {boolean}
   */
  hasPermission(member, permission) {
    if (!member) return false;
    const perms = member.permissions;
    if (!perms) return false;
    const flag = typeof permission === 'string' ? PermissionsBitField.Flags[permission] : permission;
    if (!flag) {
      this.logger.warn(`⚠️ Unknown permission flag: ${permission}`);
      return false;
    }
    return perms.has(flag);
  }

  /**
   * 👑 Check if member is a server administrator (has Administrator permission)
   * @param {GuildMember} member
   * @returns {boolean}
   */
  isAdmin(member) {
    return this.hasPermission(member, 'Administrator');
  }

  /**
   * 🛡️ Check if member is a moderator (has KickMembers, BanMembers, or ManageMessages)
   * @param {GuildMember} member
   * @returns {boolean}
   */
  isModerator(member) {
    if (!member) return false;
    return this.hasPermission(member, 'KickMembers') ||
           this.hasPermission(member, 'BanMembers') ||
           this.hasPermission(member, 'ManageMessages');
  }

  /**
   * 🎭 Check if member has a specific role by ID or name
   * @param {GuildMember} member
   * @param {string} roleIdOrName - Role ID or role name (case‑sensitive)
   * @returns {boolean}
   */
  hasRole(member, roleIdOrName) {
    if (!member || !member.roles) return false;
    // Check by ID
    if (member.roles.cache.has(roleIdOrName)) return true;
    // Check by name
    return member.roles.cache.some(role => role.name === roleIdOrName);
  }

  /**
   * 🎭 Check if member has any of the given roles (by ID or name)
   * @param {GuildMember} member
   * @param {string[]} roleIdsOrNames - Array of role IDs or names
   * @returns {boolean}
   */
  hasAnyRole(member, roleIdsOrNames) {
    if (!member) return false;
    return roleIdsOrNames.some(role => this.hasRole(member, role));
  }

  /**
   * 🎭 Check if member has all of the given roles (by ID or name)
   * @param {GuildMember} member
   * @param {string[]} roleIdsOrNames
   * @returns {boolean}
   */
  hasAllRoles(member, roleIdsOrNames) {
    if (!member) return false;
    return roleIdsOrNames.every(role => this.hasRole(member, role));
  }

  /**
   * 📈 Get highest role position for member (useful for hierarchy checks)
   * @param {GuildMember} member
   * @returns {number} Highest role position (0 = lowest, higher = higher)
   */
  getHighestRolePosition(member) {
    if (!member) return -1;
    const roles = member.roles.cache;
    if (roles.size === 0) return 0;
    const highest = roles.reduce((max, role) => (role.position > max ? role.position : max), 0);
    return highest;
  }

  /**
   * 🤖 Check if bot has a specific permission in a channel
   * @param {GuildChannel|TextChannel} channel - Discord channel
   * @param {bigint|string} permission - Permission flag
   * @returns {boolean}
   */
  botHasPermission(channel, permission) {
    if (!channel || !channel.guild) return false;
    const botMember = channel.guild.members.me;
    if (!botMember) return false;
    return this.hasPermission(botMember, permission);
  }

  /**
   * 📢 Check if bot can send messages in a channel
   * @param {GuildChannel|TextChannel} channel
   * @returns {boolean}
   */
  botCanSend(channel) {
    if (!channel || !channel.isTextBased?.()) return false;
    return this.botHasPermission(channel, 'SendMessages');
  }

  /**
   * 🗑️ Check if bot can delete messages in a channel
   * @param {GuildChannel|TextChannel} channel
   * @returns {boolean}
   */
  botCanDelete(channel) {
    return this.botHasPermission(channel, 'ManageMessages');
  }

  /**
   * 🔗 Check if bot can manage roles in a guild
   * @param {Guild} guild
   * @returns {boolean}
   */
  botCanManageRoles(guild) {
    const botMember = guild?.members.me;
    return this.hasPermission(botMember, 'ManageRoles');
  }

  /**
   * 💬 Check if member can use a specific command based on permission + role requirements
   * @param {GuildMember} member
   * @param {Object} requirements - { permissions: string[], roles: string[], adminOnly: boolean, modOnly: boolean }
   * @returns {Object} { allowed: boolean, reason: string|null }
   */
  canUseCommand(member, requirements = {}) {
    if (!member) return { allowed: false, reason: 'Member not found' };
    const { permissions = [], roles = [], adminOnly = false, modOnly = false } = requirements;

    // Admin only
    if (adminOnly && !this.isAdmin(member)) {
      return { allowed: false, reason: 'This command requires administrator privileges.' };
    }
    // Moderator only
    if (modOnly && !this.isModerator(member)) {
      return { allowed: false, reason: 'This command requires moderator privileges.' };
    }
    // Permission checks
    for (const perm of permissions) {
      if (!this.hasPermission(member, perm)) {
        return { allowed: false, reason: `Missing permission: ${perm}` };
      }
    }
    // Role checks
    if (roles.length > 0) {
      if (!this.hasAnyRole(member, roles)) {
        return { allowed: false, reason: `Requires one of the following roles: ${roles.join(', ')}` };
      }
    }
    return { allowed: true, reason: null };
  }

  /**
   * 📋 Get member's effective permissions as a human-readable string list
   * @param {GuildMember} member
   * @returns {string[]} List of permission names
   */
  getMemberPermissions(member) {
    if (!member) return [];
    const perms = member.permissions.toArray();
    return perms;
  }

  /**
   * 🔐 Check if a role (by ID) exists and is below bot's highest role (safe for assignment)
   * @param {Guild} guild
   * @param {string} roleId
   * @returns {Object} { exists: boolean, assignable: boolean, reason: string }
   */
  canAssignRole(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return { exists: false, assignable: false, reason: 'Role not found' };
    const botMember = guild.members.me;
    const botHighest = botMember?.roles.highest.position || 0;
    const assignable = role.position < botHighest;
    return {
      exists: true,
      assignable,
      reason: assignable ? null : 'Bot role is lower than target role',
    };
  }

  /**
   * 🧹 Clear role cache for a guild (or all)
   * @param {string} [guildId] - Optional guild ID
   */
  clearCache(guildId) {
    if (guildId) {
      this.roleCache.delete(guildId);
      this.logger.debug(`🗑️ PermissionChecker cache cleared for guild ${guildId}`);
    } else {
      this.roleCache.clear();
      this.logger.debug('🗑️ PermissionChecker cache cleared for all guilds');
    }
  }
}

module.exports = PermissionChecker;