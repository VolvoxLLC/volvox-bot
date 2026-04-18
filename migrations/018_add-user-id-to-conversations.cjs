/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('conversations', {
    user_id: { type: 'TEXT' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('conversations', 'user_id');
};
