const { Collection } = require("discord.js");
const { handleReferral } = require("./referralEngine");

const inviteCache = new Collection();

// ================= CACHE INVITES =================
async function cacheInvites(guild) {

const invites = await guild.invites.fetch();

const map = new Map();

invites.forEach(inv => {
    map.set(inv.code, inv.uses);
});

inviteCache.set(guild.id, map);

}

// ================= TRACK NEW MEMBER =================
async function trackMember(member) {

const guild = member.guild;

const newInvites = await guild.invites.fetch();

const oldInvites = inviteCache.get(guild.id);

if (!oldInvites) {
    await cacheInvites(guild);
    return;
}

let usedInvite = null;

newInvites.forEach(inv => {

    const oldUses = oldInvites.get(inv.code) || 0;

    if (inv.uses > oldUses) {
        usedInvite = inv;
    }
});

// update cache
await cacheInvites(guild);

if (!usedInvite) return;

const inviterId = usedInvite.inviter?.id;

if (!inviterId) return;

console.log(`🔗 Invite detected: ${inviterId} invited ${member.id}`);

handleReferral(inviterId, member.id);

}

module.exports = {
cacheInvites,
trackMember
};