/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS target_tag VARCHAR(255) NOT NULL DEFAULT ''
  `);
};

exports.down = (pgm) => {
  pgm.dropColumn('audit_logs', 'target_tag');
};
