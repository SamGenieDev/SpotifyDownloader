# SpotifyDownloader

A tool for downloading Spotify songs from YouTube.

## Usage

- Install [FFmpeg](https://www.ffmpeg.org/download.html) and add it to the `PATH`
- Create a Spotify web API application
	- Login to the [developer dashboard](https://developer.spotify.com/dashboard/login)
	- Click 'Create an App'
	- Enter in an app name and description, and agree to Spotify's terms
	- Click 'Create' and open your newly created application
	- Copy the client ID and client secret, these will be needed in the configuration
- Download the [latest release](https://github.com/SamGenieBoi/SpotifyDownloader/releases) of SpotifyDownloader
- Open `config.json` to edit the configuration
	- Replace `<clientId>` and `<clientSecret>` with your client ID and client secret
	- If you would like to download explicit songs, look at the [limitations](#limitations) to see how
	```jsonc
	{
		"spotify": {
			"clientId": "<clientId>", // Put your client ID here, this is required
			"clientSecret": "<clientSecret>" // Put your client secret here, this is required
		},
		"youtube": {
			"cookies": "<cookies>" // Put your YouTube cookies here, this is optional
		},
		"poolSize": 5, // Maximum amount of concurrent downloads, between 5 and 10 is recommended
		"downloadListFileName": "download_list.txt",
		"outputPath": "output",
		"lowQualityMode": false, // If this is set to 'true', the audio will be lower quality and lower resolution album covers will be used
		"videoDurationTolerance": 0.1, // The tolerance of the song duration that is acceptable when selecting a YouTube video
		"rateLimitRetryDelay": 2500 // How long to wait (in ms) after being rate limited by Spotify before retrying
	}
	```
- Edit `download_list.txt` to contain your playlist name and a list of Spotify song links, for example:
	```
	-My playlist 👍
	https://open.spotify.com/track/0eO7SWs88desmou6tFqW36
	https://open.spotify.com/track/7lN8gxXPRs3c7Un4PZLyQH
	https://open.spotify.com/track/4LKbjcFdwbqvSPEOwpXrCD
	```
- Run `SpotifyDownloader.exe`

## Limitations

- There are some YouTube videos that cannot be downloaded, there is no way around this
- Explicit Spotify songs (age-restricted YouTube videos) cannot be downloaded unless cookies are set
	- To do this, go to [YouTube](https://youtube.com)
	- Press <kbd>F12</kbd> or <kbd>CTRL</kbd>+<kbd>SHIFT</kbd>+<kbd>I</kbd> to open the developer tools
	- Open the 'Console' tab and type `document.cookie`, then press <kbd>ENTER</kbd>
	- Copy the resulting text and paste it into `config.json` where it says `"<cookies>"`
	- Do not share the value of the cookies, it is unique to your account and should be kept secret
