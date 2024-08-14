import fs from 'fs';
import ytdl from '@distube/ytdl-core';
import express from 'express';
import bodyParser from 'body-parser';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeID3 from 'node-id3';
import Ffmpeg from 'fluent-ffmpeg';
import { configDotenv } from 'dotenv';

configDotenv();

// Create __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const downloadsDir = path.join(__dirname, './downloads');

if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

const app = express();
const host = process.env.APP_HOST
const port = process.env.APP_PORT;

app.use(bodyParser.json());

app.get('/getInfo', async (req, res) => {
    const videoURL = req.query.url;
    if (!videoURL) {
        return res.status(400).send('URL parameter is required.');
    }

    const info = await ytdl.getInfo(videoURL);
    const videoDetails = info.videoDetails;

    const author = videoDetails.author.name.replace(' - Topic', '');
    const title = videoDetails.title;
    const thumb = videoDetails.thumbnails[videoDetails.thumbnails.length - 2]?.url || null

    res.json({ title: `${author} - ${title}`, thumb: thumb });
});

app.post('/download', async (req, res) => {
    const videoURL = req.body.url;
    console.log(videoURL)

    if (!videoURL) {
        return res.status(400).send('URL parameter is required.');
    }

    const options = {
        quality: 'highestaudio',
    };

    const info = await ytdl.getInfo(videoURL);
    const videoDetails = info.videoDetails;
    const author = videoDetails.author.name.replace(' - Topic', '').toLowerCase().replace(/\s+/g, '_');
    const title = videoDetails.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_').replace(/\s+/g, '_');
    const outputFileName = `${author}_${title}.mp4`;
    const outputFilePath = path.join(downloadsDir, outputFileName);

    const outputFileName2 = `${author}_${title}.mp3`;
    const outputFilePath2 = path.join(downloadsDir, outputFileName2);

    ytdl(videoURL, options)
        .pipe(fs.createWriteStream(outputFilePath))
        .on('finish', async () => {
            console.log('Done');

            Ffmpeg(outputFilePath)
                .toFormat('mp3')
                .on('end', async () => {
                    const tags = {
                        title: videoDetails.title,
                        artist: videoDetails.author.name.replace(' - Topic', ''),
                    };

                    const success = NodeID3.write(tags, outputFilePath2);

                    if (success) {
                        console.log('Tags written successfully');
                    } else {
                        console.log('Error writing tags');
                    }

                    fs.unlink(outputFilePath, (err) => {
                        if (err) console.error(`Error deleting file: ${err.message}`);
                    });

                    res.json({ downloadLink: `${host}/download/${outputFileName2}`, filename: outputFileName2 });
                })
                .on('error', (err) => {
                    console.error('Error converting file:', err);
                })
                .save(outputFilePath2);
        })
        .on('error', (e) => {
            res.status(500).send(e.message);
        });
});

app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(downloadsDir, filename);

    res.download(filepath, (err) => {
        if (err) {
            res.status(500).send(err.message);
        } else {
            fs.unlink(filepath, (err) => {
                if (err) console.error(`Error deleting file: ${err.message}`);
            });
        }
    });
});

// Replace these paths with the path to your SSL certificate and key
const options = {
    key: fs.readFileSync('./certs/priv.pem'),
    cert: fs.readFileSync('./certs/cert.pem'),
};

https.createServer(options, app).listen(port, () => {
    console.log(`HTTPS server listening on port ${port}`);
});
