/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS user_tag VARCHAR(100)
  `);
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE audit_logs
    DROP COLUMN IF EXISTS user_tag
  `);
};
