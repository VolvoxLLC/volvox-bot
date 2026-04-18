/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS user_id TEXT
  `);
};

exports.down = (pgm) => {
  pgm.dropColumn('conversations', 'user_id');
};
