import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime';
import bunyan from 'bunyan';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
const __dirname = import.meta.dirname;

var log = bunyan.createLogger({ name: 'myapp', src: true });


async function init(argv) {
  if (argv.debug) {
    log.level(bunyan.DEBUG);
  }
  if (argv.trace) {
    log.level(bunyan.TRACE);
  }
}

async function main(folder) {
    log.info({ folder }, 'Starting server')
    const app = express();
    const videosDir = path.join(folder);
    await fs.access(videosDir, fs.constants.R_OK)
      .catch(() => {
        log.error(`Cannot read directory ${videosDir}`);
        process.exit(1);
      });
      // Serve the HTML page
    app.get('/', (req, res) => {
      log.info({ req }, 'Serving index.html');
      res.sendFile(path.join(__dirname, 'index.html'));
    });
    app.get('/videos', async (req, res) => {
      log.info({ req, videosDir }, 'Listing videos');
      const files = await fs.readdir(videosDir);
      res.json(files);
    });
    app.get('/video/:filename', async (req, res) => {
      log.info({ req, videosDir }, 'Serving video');
      const filePath = path.join(folder, req.params.filename);
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      if (range) {
        log.trace({ range }, 'Range header');
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        log.trace({ start, end, chunksize }, 'Range values');
        const fd = await fs.open(filePath, 'r');
        const stream = fd.createReadStream({ start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mime.getType(filePath),
        };
        log.trace({ head }, 'Response headers');
        res.writeHead(206, head);
        stream.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': mime.getType(filePath),
        };
        res.writeHead(200, head);
        const fd = await fs.open(filePath, 'r')
        const stream = fd.createReadStream();
        stream.pipe(res);
      }
    });
    app.listen(3000, () => {
      console.log('HTTP Server running on port 3000');
    });
}

const y = yargs(hideBin(process.argv));
y.usage('Usage: $0 <command> [options]');
y.option(
  'trace',
  {
    alias: 't',
    description: 'Enable trace level logging',
    type: 'boolean',
  },
)
y.option(
  'debug',
  {
    alias: 'd',
    description: 'Enable debug level logging',
    type: 'boolean',
  },
)
y.command(
  'start',
  'Start the server',
  (yargs) => {
    yargs.option('videosDir', {
        alias: 'v',
        description: 'Directory containing videos',
        type: 'string',
        default: 'videos',
    })
  },
  async (argv) => {
    await init(argv);
    await main(argv.videosDir);
  }
);
y.demandCommand(1);
y.help();
y.parse();
