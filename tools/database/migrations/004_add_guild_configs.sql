CREATE TABLE IF NOT EXISTS guild_configs (
  guildId TEXT,
  configKey TEXT,
  config TEXT,
  PRIMARY KEY (guildId, configKey)
);