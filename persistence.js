'use strict';
const { Pool } = require('pg');
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });
  pool.on('error', error => {
    console.error('Erro inesperado na conexão ociosa do PostgreSQL:', error.message);
  });
  pool.query(`CREATE TABLE IF NOT EXISTS game_characters (
    character_id VARCHAR(80) PRIMARY KEY,
    character_name VARCHAR(40) NOT NULL,
    class_key VARCHAR(30) NOT NULL,
    character_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(error => console.error('Falha ao preparar banco de personagens:', error.message));
}
async function loadCharacter(id) {
  if (!pool || !id) return null;
  try {
    const result = await pool.query('SELECT character_data FROM game_characters WHERE character_id = $1', [id]);
    return result.rows[0]?.character_data || null;
  } catch (error) { console.error('Falha ao carregar personagem:', error.message); return null; }
}
async function saveCharacter(player, campaign = null) {
  if (!pool || !player?.characterId) return;
  const { id, ready, lastMoveAt, x, y, facing, campaign: _oldCampaign, ...data } = player;
  if (campaign) data.campaign = campaign;
  try {
    await pool.query(
      `INSERT INTO game_characters(character_id,character_name,class_key,character_data,updated_at)
       VALUES($1,$2,$3,$4,NOW())
       ON CONFLICT(character_id) DO UPDATE SET character_name=EXCLUDED.character_name,class_key=EXCLUDED.class_key,character_data=EXCLUDED.character_data,updated_at=NOW()`,
      [player.characterId, player.name, player.classKey, JSON.stringify(data)]
    );
  } catch (error) { console.error('Falha ao salvar personagem:', error.message); }
}
module.exports={loadCharacter,saveCharacter,hasDatabase:()=>!!pool};
