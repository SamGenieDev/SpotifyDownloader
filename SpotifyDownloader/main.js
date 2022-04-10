const config = require("./config.json")

const SpotifyWebAPI = require("spotify-web-api-node");

var spotify = new SpotifyWebAPI({
	clientId: config.spotify.clientId,
	clientSecret: config.spotify.clientSecret
});

const https = require("https");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

const ytSearch = require("yt-search");
const ytdl = require("ytdl-core");

const ffmpeg = require("fluent-ffmpeg");

async function requestSpotifyAccessToken() {
	let data = await spotify.clientCredentialsGrant();
	spotify.setAccessToken(data.body.access_token);
}

function wait(amount) {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, amount);
	});
}

async function getSpotifySong(songLink) {
	let songId = songLink.split("/").pop();

	// If ratelimited by Spotify, recursively retry after delay
	try {
		var data = await spotify.getTrack(songId)
	} catch (error) {
		await wait(config.rateLimitRetryDelay);
		return getSpotifySong(songLink);
	}

	// Use lower quality album cover to reduce file size
	// Choose from 3 resolutions: 640x640, 300x300, 64x64
	let albumCoverIndex = config.lowQualityMode ? 1 : 0;

	return {
		id: songId,
		name: data.body.name,
		artists: data.body.artists.map(artist => artist.name).join(", "),
		duration: Math.floor(data.body.duration_ms / 1000),
		album: data.body.album.name,
		albumCoverUrl: data.body.album.images[albumCoverIndex].url,
		date: data.body.album.release_date
	};
}

// Remove illegal characters from file name
function formatFileName(fileName) {
	return fileName.replace(/[/\\?%*:|"<>]/g, "");
}

function searchYouTubeForSpotifySong(song) {
	return new Promise(async (resolve, reject) => {
		let options = {
			query: `${song.name} ${song.artists}`,
			category: "music"
		};

		ytSearch(options, (error, data) => {
			if (error)
				throw error;

			for (const video of data.videos) {
				// Check if video is within duration tolerance percentage
				// If so, use video for download

				let ratio = video.seconds / song.duration;
				let tolerance = config.videoDurationTolerance;

				if ((ratio > 1 - tolerance) && (ratio < 1 + tolerance))
					resolve(video.videoId);
			}
		});
	});
}

function ensureDirectoryExists(directory) {
	// Recursively create directories if they do not exist
	if (!fs.existsSync(directory))
		fs.mkdirSync(directory, { recursive: true });
}

async function downloadAlbumCover(url, directory, songId) {
	return new Promise((resolve, reject) => {
		let filePath = directory + songId + ".jpg";

		const file = fs.createWriteStream(filePath);

		https.get(url, response => {
			response.pipe(file);

			file.on("finish", () => {
				file.close();
				resolve(filePath);
			});
		});
	});
}

function downloadYouTubeVideo(videoId, directory, filePath, song) {
	return new Promise(async (resolve, reject) => {
		ensureDirectoryExists(directory);

		let temporaryPath = filePath + ".temp";

		// Download audio from YouTube
		let stream = ytdl(videoId, {
			filter: "audioonly",
			quality: config.lowQualityMode ? "lowestaudio" : "highestaudio",
			requestOptions: {
				headers: {
					Cookie: config.youtube.cookies
				}
			}
		}).on("error", () => {
			resolve(null);
		});

		// Write the stream to a temporary file
		ffmpeg(stream)
			.on("error", () => {
				resolve(null);
			})
			.outputFormat("mp3")
			// Set bitrate to 128 kbps
			.audioBitrate(128)
			// Set metadata
			.outputOptions(
				"-metadata", `title=${song.name}`,
				"-metadata", `artist=${song.artists}`,
				"-metadata", `album=${song.album}`,
				"-metadata", `date=${song.date}`
			)
			.save(temporaryPath)
			.on("end", async () => {
				// Download the album cover to a temporary file
				let albumCoverPath = await downloadAlbumCover(song.albumCoverUrl, directory, song.id);

				// Rewrite temporary file to output file
				ffmpeg(temporaryPath)
					.on("error", () => {
						resolve(null);
					})
					// Copy album cover
					.outputOptions("-i", albumCoverPath, "-map", "0:0", "-map", "1:0", "-c", "copy", "-id3v2_version", "3")
					.save(filePath)
					.on("end", () => {
						// Delete temporary files
						fs.unlinkSync(temporaryPath);
						fs.unlinkSync(albumCoverPath);

						resolve(filePath);
					});
			});
	});
}

async function downloadSpotifySong(playlistName, songLink) {
	let song = await getSpotifySong(songLink);

	let outputDirectory = `${config.outputPath}/${playlistName}/`;
	let outputFileName = `${song.name} - ${song.artists}`;
	let outputFilePath = outputDirectory + formatFileName(outputFileName) + ".mp3";

	if (fs.existsSync(outputFilePath)) {
		console.log(`Song has already been downloaded, skipping: ${outputFileName}`);
		return;
	}

	console.log("Beginning downloading...");

	let videoId = await searchYouTubeForSpotifySong(song);

	let path = await downloadYouTubeVideo(videoId, outputDirectory, outputFilePath, song);

	if (!path) {
		console.log(`Song failed to download: ${outputFileName}`);
		return;
	}

	console.log(`Download complete: ${song.name} | ${song.artists} | ${song.duration} s | ${song.album} | ${song.albumCoverUrl} | ${song.date} | ${videoId} | ${path}`);
}

let isCurrentPlaylistDownloaded = false;

async function createDownloader() {
	while (playlist.songLinks.length > 0) {
		await downloadSpotifySong(playlist.name, playlist.songLinks.shift());
	}

	isCurrentPlaylistDownloaded = true;
}

async function parseDownloadList(path) {
	// Parsing rules:
	//   If the first character is '-', then it's the name of a new playlist
	//   Otherwise, it's a Spotify song link
	//   Ignore empty lines

	const lineReader = readline.createInterface({
		input: fs.createReadStream(path),
		crlfDelay: Infinity
	});

	let playlists = [];

	for await (let line of lineReader) {
		line = line.trim();

		if (line[0] === "-") {
			// Create a new playlist
			playlists.push({
				name: line.slice(1).trim(),
				songLinks: []
			});
		} else if (line)
			// Add the song link to the playlist
			playlists[playlists.length - 1].songLinks.push(line);
	}

	return playlists;
}

(async () => {
	if (!config.clientId || config.clientId === "<clientId>")
		return console.log("Error: Missing Spotify clientId");

	if (!config.clientSecret || config.clientSecret === "<clientSecret>")
		return console.log("Error: Invalid Spotify clientSecret");

	await requestSpotifyAccessToken();

	let playlists = await parseDownloadList(config.downloadListFileName);

	for (playlist of playlists) {
		// Ensure playlist name can be the name of a file
		playlist.name = formatFileName(playlist.name);

		for (let i = 0; i < config.poolSize; i++) {
			createDownloader(playlist);
		}

		// Download each playlist individually
		while (!isCurrentPlaylistDownloaded)
			await wait(100);
	}

	console.log("Queue finished");
})();
