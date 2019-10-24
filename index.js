const http = require("http");
const https = require("https");
const process = require("process");
const spawn = require("child_process").spawn;
const readline = require("readline");
const fs = require("fs");
const os = require("os");

function readStream(stream) {
	return new Promise((resolve, reject) => {
		let body = "";
		stream.on("data", chunk => body += chunk);
		stream.on("end", () => resolve(body));
		stream.on("error", error => reject(error));
	});
}

function makeRequest(options) {
	return new Promise((resolve, reject) => {
		options.headers = options.headers || {};
		options.headers["User-Agent"] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:70.0) Gecko/20100101 Firefox/70.0";

		const request = https.request(options, response => {
			readStream(response)
				.then(body => resolve(body))
				.catch(error => reject(error));
		});
		request.on("error", error => reject(error));
		request.end();
	});
}

function parseMessage(message) {
	const state = message.split("\n").reduce((map, line) => {
		const tokens = line.split("=");
		map[tokens[0]] = tokens[1];
		return map;
	}, {});

	if (!("track" in state && "artist" in state && "album" in state && "playing" in state)) {
		return null;
	}

	state.playing = state.playing === "true";

	return state;
}

function processMessage(message) {
	const state = parseMessage(message);

	if (!state) {
		console.error("invalid message format");
		return;
	}

	if (!state.playing) {
		console.log(`stopped playing: ${state.artist} - ${state.track}`);
		return;
	}

	const path = "/lite?q=" + encodeURIComponent(`歌詞 ${state.artist} ${state.track}`);
	console.log(`making ddg request: https://duckduckgo.com${path}`);
    
	makeRequest({
		host: "duckduckgo.com",
		path: path
	}).then(response => {
		const results = parseResults(response);
		console.log(`got ${results.length} ddg results`);
		requestResultSelection(results, state);
	}).catch(error => {
		console.error(`ddg error: ${error}`);
	});
}

function parseResults(response) {
	const results = [];
	const regexp = new RegExp("<a rel=\"nofollow\" href=\"([^\"]+)\" class='result-link'>(.+)</a>", "g");
	let match;

	while (match = regexp.exec(response)) {
		results.push({
			url: match[1],
			description: match[2].replace(/(<b>|<\/b>)/g, "")
		});
	}

	return results;
}

function printResults(results) {
	const fd = fs.openSync(os.homedir() + "/.local/tracks.psf", "w");
	let buffer = "";

	for (let i = results.length - 1; i >= 0; i--) {
		const result = results[i];
		console.log(`${i + 1}. ${result.url}\n\t ${result.description}`);
		buffer = result.url + "\n" + buffer;
	}

	fs.writeFileSync(fd, buffer);
	fs.closeSync(fd);
}

function open(url) {
	console.log(`opening ${url} in browser`);
	
	switch (process.platform) {
	case "linux":
		spawn("xdg-open", [url]);
		break;
	case "darwin":
		spawn("open", [url]);
		break;
	default:
		console.error(`cannot open ${url} for plaftorm: ${process.platform}`);
		break;
	}
}

const requestResultSelection = (function() {
	let reader;

	return function(results, state) {
		if (reader) reader.close(); 
		reader = readline.createInterface({input: process.stdin, output: process.stdout});
		
		printResults(results);
    
		function prompt() {
			reader.question(`Choose a result (${state.artist} - ${state.track}): `, answer => {
				if (answer === "") answer = "1";
				const selection = results[parseInt(answer) - 1];

				if (selection) {
					open(selection.url);
				} else {
					console.error(`Invalid selection: ${answer}`);
				}

				prompt();
			});
		}
    
		prompt();
	};
}());

function startServer(port) {
	http.createServer((request, response) => {
		console.log(`\ngot request, content-length: ${request.headers["content-length"]}`);

		if (request.method !== "POST") {
			response.writeHead(405);
			return;
		}
    
		readStream(request).then(function(body) {
			console.log(`request body:\n${body}`);
			response.writeHead(200);
			response.end();
			processMessage(body);
		}).catch(error => {
			console.error(`error reading request: ${error}`);
			response.writeHead(400);
			response.end();
		});
	}).listen(port);

	console.log(`started server in port ${port}`);
}

startServer(parseInt(process.argv[2]) || 12321);
