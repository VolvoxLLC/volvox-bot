/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('audit_logs', 'target_tag', { type: 'VARCHAR(255)', nullable: true });
};

exports.down = (pgm) => {
  pgm.dropColumn('audit_logs', 'target_tag');
};
