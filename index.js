const http = require("http");
const https = require("https");
const process = require("process");
const spawn = require("child_process").spawn;
const readline = require("readline");

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

function processMessage(message) {
	const state = message.split("\n").reduce((map, line) => {
		const tokens = line.split("=");
		map[tokens[0]] = tokens[1];
		return map;
	}, {});
    
	if (!state.artist || !state.track) {
		console.error("invalid message format");
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
		requestResultSelection(results);
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

const requestResultSelection = (function() {
	let reader;

	return function(results) {
		if (reader) reader.close(); 
		reader = readline.createInterface({input: process.stdin, output: process.stdout});

		for (let i = results.length - 1; i >= 0; i--) {
			const result = results[i];
			console.log(`${i + 1}. ${result.url}\n\t ${result.description}`);
		}
    
		function prompt() {
			reader.question("Choose a result: ", answer => {
				const selection = results[parseInt(answer) - 1];

				if (!selection) {
					console.error(`Invalid selection: ${answer}`);
					prompt();
					return;
				}

				console.log(`executing: open ${selection.url}`);
				spawn("open", [selection.url]);
			});
		}
    
		prompt();
	};
}());

function startServer(port) {
	http.createServer((request, response) => {
		console.log(`got request, content-length: ${request.headers["content-length"]}`);

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