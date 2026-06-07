/**
 * 🧪 PermissionChecker Unit Tests v5.0
 * - Tests permission checks, role checks, admin/mod detection
 * - Tests command requirements and bot permissions
 * - Mocks Discord.js guild, member, role, channel objects
 */
const { PermissionsBitField } = require('discord.js');
const PermissionChecker = require('../../../tools/discord/permissionChecker');

// Mock PermissionsBitField.Flags
jest.mock('discord.js', () => {
  const original = jest.requireActual('discord.js');
  return {
    ...original,
    PermissionsBitField: {
      Flags: {
        Administrator: 'Administrator',
        KickMembers: 'KickMembers',
        BanMembers: 'BanMembers',
        ManageMessages: 'ManageMessages',
        SendMessages: 'SendMessages',
        ManageRoles: 'ManageRoles',
        ModerateMembers: 'ModerateMembers',
      },
    },
  };
});

describe('PermissionChecker', () => {
  let permChecker;
  let mockMember;
  let mockGuild;
  let mockRole;
  let mockChannel;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock role
    mockRole = {
      id: 'role123',
      name: 'Moderator',
      position: 5,
    };

    // Mock guild
    mockGuild = {
      id: 'guild123',
      name: 'Test Guild',
      roles: {
        cache: new Map([
          ['role123', mockRole],
          ['adminRole', { id: 'adminRole', name: 'Admin', position: 10 }],
        ]),
        fetch: jest.fn(),
      },
      members: { me: { roles: { highest: { position: 15 } } } },
    };

    // Mock member with roles
    mockMember = {
      id: 'user123',
      user: { id: 'user123', tag: 'TestUser' },
      guild: mockGuild,
      permissions: {
        has: jest.fn().mockReturnValue(false),
        toArray: jest.fn().mockReturnValue([]),
      },
      roles: {
        cache: new Map([
          ['role123', mockRole],
        ]),
        has: jest.fn((id) => id === 'role123'),
      },
    };

    // Mock channel
    mockChannel = {
      id: 'channel123',
      guild: mockGuild,
      isTextBased: jest.fn(() => true),
    };

    permChecker = new PermissionChecker({ logger: console });
  });

  describe('hasPermission', () => {
    it('should return true if member has permission', () => {
      mockMember.permissions.has.mockReturnValue(true);
      expect(permChecker.hasPermission(mockMember, 'KickMembers')).toBe(true);
      expect(mockMember.permissions.has).toHaveBeenCalledWith('KickMembers');
    });
    it('should return false if member does not have permission', () => {
      expect(permChecker.hasPermission(mockMember, 'BanMembers')).toBe(false);
    });
    it('should handle unknown permission flag', () => {
      const result = permChecker.hasPermission(mockMember, 'InvalidPermission');
      expect(result).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true if member has Administrator', () => {
      mockMember.permissions.has.mockReturnValue(true);
      expect(permChecker.isAdmin(mockMember)).toBe(true);
    });
    it('should return false otherwise', () => {
      expect(permChecker.isAdmin(mockMember)).toBe(false);
    });
  });

  describe('isModerator', () => {
    it('should return true if member has KickMembers', () => {
      mockMember.permissions.has.mockImplementation((perm) => perm === 'KickMembers');
      expect(permChecker.isModerator(mockMember)).toBe(true);
    });
    it('should return true if member has BanMembers', () => {
      mockMember.permissions.has.mockImplementation((perm) => perm === 'BanMembers');
      expect(permChecker.isModerator(mockMember)).toBe(true);
    });
    it('should return true if member has ManageMessages', () => {
      mockMember.permissions.has.mockImplementation((perm) => perm === 'ManageMessages');
      expect(permChecker.isModerator(mockMember)).toBe(true);
    });
    it('should return false if none', () => {
      expect(permChecker.isModerator(mockMember)).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true if member has role by ID', () => {
      expect(permChecker.hasRole(mockMember, 'role123')).toBe(true);
    });
    it('should return true if member has role by name', () => {
      expect(permChecker.hasRole(mockMember, 'Moderator')).toBe(true);
    });
    it('should return false if role not found', () => {
      expect(permChecker.hasRole(mockMember, 'nonexistent')).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true if member has at least one role', () => {
      expect(permChecker.hasAnyRole(mockMember, ['role123', 'adminRole'])).toBe(true);
    });
    it('should return false if member has none', () => {
      expect(permChecker.hasAnyRole(mockMember, ['adminRole'])).toBe(false);
    });
  });

  describe('hasAllRoles', () => {
    beforeEach(() => {
      // Add admin role to member
      mockMember.roles.cache.set('adminRole', { id: 'adminRole', name: 'Admin' });
    });
    it('should return true if member has all roles', () => {
      expect(permChecker.hasAllRoles(mockMember, ['role123', 'adminRole'])).toBe(true);
    });
    it('should return false if member missing any', () => {
      expect(permChecker.hasAllRoles(mockMember, ['role123', 'nonexistent'])).toBe(false);
    });
  });

  describe('getHighestRolePosition', () => {
    it('should return highest role position', () => {
      expect(permChecker.getHighestRolePosition(mockMember)).toBe(5);
    });
    it('should return 0 if no roles', () => {
      const emptyMember = { roles: { cache: new Map() } };
      expect(permChecker.getHighestRolePosition(emptyMember)).toBe(0);
    });
  });

  describe('botHasPermission', () => {
    it('should check bot permissions in a channel', () => {
      mockGuild.members.me = { permissions: { has: jest.fn().mockReturnValue(true) } };
      expect(permChecker.botHasPermission(mockChannel, 'SendMessages')).toBe(true);
    });
    it('should return false if bot not found', () => {
      mockGuild.members.me = null;
      expect(permChecker.botHasPermission(mockChannel, 'SendMessages')).toBe(false);
    });
  });

  describe('botCanSend / botCanDelete', () => {
    it('botCanSend should call botHasPermission with SendMessages', () => {
      const spy = jest.spyOn(permChecker, 'botHasPermission').mockReturnValue(true);
      expect(permChecker.botCanSend(mockChannel)).toBe(true);
      expect(spy).toHaveBeenCalledWith(mockChannel, 'SendMessages');
    });
    it('botCanDelete should call botHasPermission with ManageMessages', () => {
      const spy = jest.spyOn(permChecker, 'botHasPermission').mockReturnValue(true);
      expect(permChecker.botCanDelete(mockChannel)).toBe(true);
      expect(spy).toHaveBeenCalledWith(mockChannel, 'ManageMessages');
    });
  });

  describe('canUseCommand', () => {
    it('should allow if no requirements', () => {
      const result = permChecker.canUseCommand(mockMember, {});
      expect(result.allowed).toBe(true);
    });
    it('should require admin permission', () => {
      const result = permChecker.canUseCommand(mockMember, { adminOnly: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('administrator');
    });
    it('should require mod permission', () => {
      const result = permChecker.canUseCommand(mockMember, { modOnly: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('moderator');
    });
    it('should require specific permissions', () => {
      const result = permChecker.canUseCommand(mockMember, { permissions: ['KickMembers'] });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Missing permission: KickMembers');
    });
    it('should require roles', () => {
      const result = permChecker.canUseCommand(mockMember, { roles: ['adminRole'] });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Requires one of the following roles: adminRole');
    });
  });

  describe('canAssignRole', () => {
    it('should return assignable if role exists and bot higher', () => {
      // bot highest position = 15, role position = 5
      const result = permChecker.canAssignRole(mockGuild, 'role123');
      expect(result.exists).toBe(true);
      expect(result.assignable).toBe(true);
    });
    it('should return not assignable if role is above bot', () => {
      // create role with position higher than bot (20)
      mockGuild.roles.cache.set('highRole', { id: 'highRole', position: 20 });
      const result = permChecker.canAssignRole(mockGuild, 'highRole');
      expect(result.exists).toBe(true);
      expect(result.assignable).toBe(false);
    });
    it('should return exists false if role not found', () => {
      const result = permChecker.canAssignRole(mockGuild, 'nonexistent');
      expect(result.exists).toBe(false);
      expect(result.assignable).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear role cache for specific guild', () => {
      permChecker.roleCache.set('guild123', { roles: new Map(), timestamp: Date.now() });
      permChecker.clearCache('guild123');
      expect(permChecker.roleCache.has('guild123')).toBe(false);
    });
    it('should clear all if no guildId', () => {
      permChecker.roleCache.set('guild1', {});
      permChecker.roleCache.set('guild2', {});
      permChecker.clearCache();
      expect(permChecker.roleCache.size).toBe(0);
    });
  });
});