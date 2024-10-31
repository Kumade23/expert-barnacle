const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
app.use(express.json());

const TMDB_API_KEY = '3a0a2828ee87871788df6cff0138a5ee';

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Search route for TMDb API
app.get('/search', async (req, res) => {
    const query = req.query.query;
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'it-IT',
                query,
            },
        });

        const movies = await Promise.all(response.data.results.map(async movie => {
            let imdb_id = null;
            try {
                // Make a request to get the movie details, which includes the IMDb ID
                const movieDetails = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}`, {
                    params: { api_key: TMDB_API_KEY },
                });
                imdb_id = movieDetails.data.imdb_id;
            } catch (error) {
                console.error(`Errore durante il recupero dell'ID IMDb per ${movie.title}:`, error);
            }

            return {
                title: movie.title,
                poster_path: movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : null,
                imdb_id, // Include the IMDb ID in the response
            };
        }));

        res.json(movies);
    } catch (error) {
        console.error('Error searching movies:', error);
        res.status(500).json({ error: "Errore durante la ricerca del film." });
    }
});

// Scraping route to retrieve video link
app.post('/scrape', async (req, res) => {
    const imdbId = req.body.imdbId;
    const mostraguardaUrl = `https://mostraguarda.stream/movie/${imdbId}`;

    try {
        const response = await axios.get(mostraguardaUrl);
        const $ = cheerio.load(response.data);

        $('iframe, .ad, .popup, .overlay').remove();

        const videoUrls = [];
        $('ul._player-mirrors li').each((_, el) => {
            const url = $(el).attr('data-link');
            if (url && url.includes('supervideo.cc')) {
                videoUrls.push(url.startsWith('http') ? url : `https:${url}`);
            }
        });

        let m3u8Url = null;

        for (const videoUrl of videoUrls) {
            try {
                const videoResponse = await axios.get(videoUrl);
                const videoHtml = videoResponse.data;

                const hfsMatch = videoHtml.match(/serversicuro\|hfs(\d+)\|/);
                const urlMatch = videoHtml.match(/urlset\|(.+?)\|hls/);

                if (hfsMatch && urlMatch) {
                    const hfsNumber = hfsMatch[1];
                    const codeSegment = urlMatch[1];
                    const segments = codeSegment.split('|');

                    let finalCode;
                    if (segments.length === 1) {
                        finalCode = segments[0];
                    } else if (segments.length >= 2) {
                        finalCode = segments[segments.length - 1] + segments[0];
                    }

                    m3u8Url = `https://hfs${hfsNumber}.serversicuro.cc/hls/${finalCode}/index-v1-a1.m3u8`;
                    console.log("Constructed M3U8 URL:", m3u8Url);
                    break;
                }
            } catch (innerError) {
                console.error(`Failed to load ${videoUrl}:`, innerError);
            }
        }

        if (m3u8Url) {
            res.json({ m3u8Url, message: "M3U8 URL constructed successfully." });
        } else {
            res.status(404).json({ error: "Failed to extract M3U8 URL." });
        }
    } catch (error) {
        console.error('Error during scraping:', error);
        res.status(500).json({ error: "Error during scraping" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
