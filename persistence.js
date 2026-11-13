'use strict';

const { Pool } = require('pg');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS game_characters (
    character_id VARCHAR(80) PRIMARY KEY, character_name VARCHAR(40) NOT NULL,
    class_key VARCHAR(30) NOT NULL, character_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS eldoria_heroes (
    id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS eldoria_campaigns (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS eldoria_participations (
    hero_id TEXT REFERENCES eldoria_heroes(id), campaign_id TEXT REFERENCES eldoria_campaigns(id),
    data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (hero_id, campaign_id)
  );
`;

class Conflict extends Error {
  constructor() {
    super('O progresso mudou em outra sessão. Volte à tela de entrada para sincronizar.');
    this.code = 'SAVE_CONFLICT';
  }
}

function createStorage({ connectionString, ssl } = {}) {
  const pool = connectionString ? new Pool({
    connectionString, ssl, connectionTimeoutMillis: 3000, query_timeout: 5000,
    statement_timeout: 4500, max: 8, idleTimeoutMillis: 30000
  }) : null;
  const heroes = new Map();
  const campaigns = new Map();
  const memberships = new Map();
  const memberKey = (campaign, hero) => JSON.stringify([campaign, hero]);
  let schema;

  pool?.on('error', error => console.error('PostgreSQL:', error.message));

  async function init() {
    if (!pool) return;
    if (!schema) schema = pool.query(SCHEMA).catch(error => { schema = null; throw error; });
    await schema;
  }

  async function check() {
    await init();
    if (pool) await pool.query('SELECT 1');
  }

  async function readHero(id) {
    if (!pool) return structuredClone(heroes.get(id) || null);
    await init();
    const { rows } = await pool.query('SELECT id, key_hash AS "keyHash", data, revision FROM eldoria_heroes WHERE id=$1', [id]);
    return rows[0] || null;
  }

  async function readLegacy(id) {
    if (!pool) return null;
    await init();
    const { rows } = await pool.query('SELECT character_data FROM game_characters WHERE character_id=$1', [id]);
    return rows[0]?.character_data || null;
  }

  async function readCampaign({ id, code }) {
    if (!pool) {
      const value = id ? campaigns.get(id) : Array.from(campaigns.values()).find(row => row.code === code);
      return structuredClone(value || null);
    }
    await init();
    const query = id
      ? 'SELECT id, code, data, revision FROM eldoria_campaigns WHERE id=$1'
      : 'SELECT id, code, data, revision FROM eldoria_campaigns WHERE code=$1';
    const { rows } = await pool.query(query, [id || code]);
    return rows[0] || null;
  }

  async function readMember(campaign, hero) {
    if (!pool) return structuredClone(memberships.get(memberKey(campaign, hero)) || null);
    await init();
    const { rows } = await pool.query(
      'SELECT hero_id AS "heroId", campaign_id AS "campaignId", data, revision FROM eldoria_participations WHERE campaign_id=$1 AND hero_id=$2',
      [campaign, hero]
    );
    return rows[0] || null;
  }

  async function lastCampaign(hero) {
    if (!pool) {
      return Array.from(memberships.values()).filter(row => row.heroId === hero)
        .sort((a, b) => b.updated - a.updated)[0]?.campaignId || null;
    }
    await init();
    const { rows } = await pool.query(
      'SELECT campaign_id FROM eldoria_participations WHERE hero_id=$1 ORDER BY updated_at DESC LIMIT 1', [hero]
    );
    return rows[0]?.campaign_id || null;
  }

  async function save({ campaign, players = [], members = [] }) {
    if (!pool) {
      const entries = [
        ...(campaign ? [[campaigns, campaign.id, campaign, { id:campaign.id, code:campaign.code, data:campaign.data }]] : []),
        ...players.map(row => [heroes, row.id, row, { id:row.id, keyHash:row.keyHash, data:row.data }]),
        ...members.map(row => [memberships, memberKey(row.campaignId, row.heroId), row, { heroId:row.heroId, campaignId:row.campaignId, data:row.data }])
      ];
      if (entries.some(([map, key, row]) => (map.get(key)?.revision || 0) !== row.revision)) throw new Conflict();
      for (const [map, key, row, value] of entries) {
        row.revision++;
        map.set(key, structuredClone({ ...value, revision:row.revision, updated:Date.now() }));
      }
      return;
    }
    await init();
    const client = await pool.connect();
    const updated = [];
    async function write(row, create, update, values) {
      const { rowCount } = row.revision === 0
        ? await client.query(create, values)
        : await client.query(update, [...values, row.revision]);
      if (!rowCount) throw new Conflict();
      updated.push(row);
    }
    try {
      await client.query('BEGIN');
      if (campaign) await write(campaign,
        'INSERT INTO eldoria_campaigns(id, code, data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        'UPDATE eldoria_campaigns SET code=$2,data=$3,revision=revision+1 WHERE id=$1 AND revision=$4',
        [campaign.id, campaign.code, campaign.data]);
      for (const row of players) await write(row,
        'INSERT INTO eldoria_heroes(id,key_hash,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        'UPDATE eldoria_heroes SET key_hash=$2,data=$3,revision=revision+1 WHERE id=$1 AND revision=$4',
        [row.id, row.keyHash, row.data]);
      for (const row of members) await write(row,
        'INSERT INTO eldoria_participations(hero_id,campaign_id,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        'UPDATE eldoria_participations SET data=$3,revision=revision+1,updated_at=now() WHERE hero_id=$1 AND campaign_id=$2 AND revision=$4',
        [row.heroId, row.campaignId, row.data]);
      await client.query('COMMIT');
      updated.forEach(row => { row.revision++; });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return { init, check, readHero, readLegacy, readCampaign, readMember, lastCampaign, save,
    durable: Boolean(pool), close: () => pool?.end() };
}

module.exports = { createStorage };
