module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,        // Ganache default port used in this project
      network_id: "*",
    },
  },
  compilers: {
    solc: {
      // SOLC_LOCAL can point to a local soljson.js (offline use); normally "0.8.19" is downloaded.
      version: process.env.SOLC_LOCAL || "0.8.19",
    },
  },
};
