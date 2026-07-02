/** @type {import('pm2').StartOptions[]} */
const path = require("node:path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "metapostgui-api",
      script: path.join(root, "scripts/pm2-api.sh"),
      interpreter: "bash",
      cwd: root,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env_development: {
        METAPOSTGUI_RELOAD: "1",
      },
      env_production: {
        METAPOSTGUI_RELOAD: "0",
      },
    },
    {
      name: "metapostgui-web",
      script: path.join(root, "scripts/pm2-web.sh"),
      interpreter: "bash",
      cwd: root,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env_development: {
        METAPOSTGUI_WEB_MODE: "dev",
      },
      env_production: {
        METAPOSTGUI_WEB_MODE: "preview",
        METAPOSTGUI_WEB_HOST: "0.0.0.0",
      },
    },
  ],
};
