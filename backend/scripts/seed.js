const fs = require("fs");
const { DB_PATH, initialize } = require("../database/db");

for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

initialize();

console.log(`Base de datos de ejemplo creada en: ${DB_PATH}`);
console.log("El servidor generará datos de demostración al iniciarse.");
process.exit(0);