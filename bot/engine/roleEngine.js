const ROLE_MAP = {
    5: "Rookie",
    10: "Trader",
    20: "Elite",
    35: "Whale",
    50: "Legend"
};

async function handleRoleRewards(member, level) {

    const guild = member.guild;

    for (const [lvl, roleName] of Object.entries(ROLE_MAP)) {

        if (level >= lvl) {

            const role = guild.roles.cache.find(r => r.name === roleName);

            if (role && !member.roles.cache.has(role.id)) {
                await member.roles.add(role);
            }
        }
    }
}

module.exports = {
    handleRoleRewards
};