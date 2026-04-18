/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('conversations', {
    user_id: { type: 'TEXT' },
  });
  pgm.createIndex('conversations', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('conversations', 'user_id');
};
