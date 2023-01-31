const confFile = process.argv[2] || process.env.CONF_FILE;

if (!confFile || !fs.existsSync(confFile)) {
    console.error('Usage: asset-system-consumer /path/to/config.js');
    process.exit(1);
}
const config = require(fs.realpathSync(confFile));
